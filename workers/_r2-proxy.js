/**
 * 临时 Worker：从 R2 读取文件内容，通过 POST Upload 推送到 AI Search
 * 使用 multipart/form-data 上传，绕过 R2 中文路径编码问题
 */

const ACCOUNT_ID = "26421038b798983a846d930404453652";
const AI_SEARCH_INSTANCE = "foyue-wenku";
const AI_SEARCH_BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai-search/instances/${AI_SEARCH_INSTANCE}`;

/** 全角标点 → ASCII 标准化（修复 AI Search file_content_empty 错误的关键） */
function normalizePunctuation(text) {
    const map = {
        '，': ',', '。': '.', '、': ',', '：': ':', '；': ';',
        '！': '!', '？': '?', '（': '(', '）': ')',
        '「': '"', '」': '"', '『': '"', '』': '"',
        '\u201c': '"', '\u201d': '"', '\u2018': "'", '\u2019': "'",
        '—': '-', '…': '...', '～': '~', '·': '.'
    };
    for (const [old, rep] of Object.entries(map)) {
        text = text.replaceAll(old, rep);
    }
    return text;
}

/** 通过 POST Upload 上传文件内容到 AI Search (source_id=builtin)
 *  直接用原始文本内容作为 text/markdown Blob 上传
 */
async function uploadToAISearch(token, key, content) {
    const blob = new Blob([content], { type: 'text/markdown' });
    const formData = new FormData();
    formData.append('file', blob, key);

    const resp = await fetch(`${AI_SEARCH_BASE}/items`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
    });
    return await resp.json();
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const cors = { 'Content-Type': 'application/json' };

        // 简单的 Bearer token 认证
        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) {
            return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors });
        }
        const token = auth.replace('Bearer ', '');

        // GET /read?key=xxx — 读取 R2 文件内容（返回原始文本）
        if (url.pathname === '/read') {
            const key = url.searchParams.get('key');
            if (!key) return new Response(JSON.stringify({ error: 'missing key' }), { headers: cors });

            const obj = await env.R2_WENKU.get(key);
            if (!obj) return new Response(JSON.stringify({ error: 'not found', key }), { status: 404, headers: cors });

            const text = await obj.text();
            // 返回原始文本内容（非 JSON）
            return new Response(text, {
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
        }

        // GET /test-upload — 诊断 Worker 的 FormData 上传是否正常
        if (url.pathname === '/test-upload') {
            const testContent = '# 测试文件\n\n这是一个从 Worker 上传的测试文件。\n\n阿弥陀佛。';
            const testKey = '_worker_test_upload.md';
            const data = await uploadToAISearch(token, testKey, testContent);
            return new Response(JSON.stringify({ testKey, contentLength: testContent.length, apiResponse: data }), { headers: cors });
        }

        // GET /list?prefix=xxx — 列出 R2 对象
        if (url.pathname === '/list') {
            const prefix = url.searchParams.get('prefix') || '';
            const limit = parseInt(url.searchParams.get('limit') || '100');
            const result = await env.R2_WENKU.list({ prefix, limit });
            const objects = result.objects.map(o => ({ key: o.key, size: o.size }));
            return new Response(JSON.stringify({ count: objects.length, objects }), { headers: cors });
        }

        // POST /fix — 批量修复：从 R2 读取 → POST Upload 到 AI Search
        if (url.pathname === '/fix' && request.method === 'POST') {
            const body = await request.json();
            const keys = body.keys || [];
            const results = [];

            for (const key of keys) {
                try {
                    // 从 R2 读取
                    const obj = await env.R2_WENKU.get(key);
                    if (!obj) {
                        results.push({ key, status: 'r2_not_found' });
                        continue;
                    }
                    const text = await obj.text();
                    if (!text || !text.trim()) {
                        results.push({ key, status: 'empty_content' });
                        continue;
                    }

                    // POST Upload 到 AI Search
                    const uploadData = await uploadToAISearch(token, key, text);
                    if (uploadData.success) {
                        results.push({ key, status: 'fixed', size: text.length, source_id: uploadData.result?.source_id });
                    } else {
                        results.push({ key, status: 'upload_failed', error: JSON.stringify(uploadData.errors || uploadData) });
                    }
                } catch (e) {
                    results.push({ key, status: 'error', error: e.message });
                }
            }

            const fixed = results.filter(r => r.status === 'fixed').length;
            const failed = results.filter(r => r.status !== 'fixed').length;
            return new Response(JSON.stringify({ fixed, failed, results }), { headers: cors });
        }

        // GET /stats — 获取 AI Search 统计
        if (url.pathname === '/stats') {
            const statsResp = await fetch(`${AI_SEARCH_BASE}/stats`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const statsData = await statsResp.json();
            return new Response(JSON.stringify(statsData), { headers: cors });
        }

        // GET /error-items — 获取错误 items（分页）
        if (url.pathname === '/error-items') {
            const page = url.searchParams.get('page') || '1';
            const perPage = url.searchParams.get('per_page') || '50';
            const itemsResp = await fetch(`${AI_SEARCH_BASE}/items?status=error&per_page=${perPage}&page=${page}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const itemsData = await itemsResp.json();
            return new Response(JSON.stringify(itemsData), { headers: cors });
        }

        // POST /fix-all — 自动获取 error items 并批量修复
        // Workers free plan: max 50 subrequests per invocation
        // Each pagination fetch = 1 subrequest, each upload = 1 subrequest
        // R2 source items cannot be deleted (managed by R2 connector)
        if (url.pathname === '/fix-all' && request.method === 'POST') {
            const body = await request.json().catch(() => ({}));
            const maxItems = body.max_items || 45; // each item = 1 subrequest (upload only)
            const startPage = body.start_page || 1;
            const maxPages = body.max_pages || 4;

            // 1. 收集 file_content_empty 的 .md 错误
            const errorItems = [];
            let fetchCount = 0;
            for (let page = startPage; page < startPage + maxPages && errorItems.length < maxItems; page++) {
                const resp = await fetch(`${AI_SEARCH_BASE}/items?status=error&per_page=50&page=${page}`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                fetchCount++;
                const data = await resp.json();
                const items = data.result || [];
                if (!items.length) break;

                for (const item of items) {
                    if (item.key.endsWith('.md') && item.error === 'file_content_empty'
                        && item.source_id !== 'builtin' && errorItems.length < maxItems) {
                        errorItems.push({ key: item.key });
                    }
                }
                if (items.length < 50) break;
            }

            // 2. 逐个修复：upload only (1 subrequest per item)
            let subreqUsed = fetchCount;
            const allResults = [];
            for (const { key } of errorItems) {
                if (subreqUsed + 1 > 49) {
                    allResults.push({ key, status: 'skipped_subrequest_limit' });
                    continue;
                }
                try {
                    const obj = await env.R2_WENKU.get(key);
                    if (!obj) {
                        allResults.push({ key, status: 'r2_not_found' });
                        continue;
                    }
                    const text = await obj.text();
                    if (!text || !text.trim()) {
                        allResults.push({ key, status: 'empty_content' });
                        continue;
                    }

                    const uploadData = await uploadToAISearch(token, key, text);
                    subreqUsed++;
                    allResults.push({
                        key,
                        status: uploadData.success ? 'fixed' : 'upload_failed',
                        size: text.length,
                        ...(uploadData.success ? {} : { error: JSON.stringify(uploadData.errors || uploadData) }),
                    });
                } catch (e) {
                    allResults.push({ key, status: 'error', error: e.message });
                }
            }

            const fixed = allResults.filter(r => r.status === 'fixed').length;
            const failed = allResults.filter(r => r.status !== 'fixed').length;
            return new Response(JSON.stringify({
                total_errors_found: errorItems.length,
                pagination_fetches: fetchCount,
                fixed,
                failed,
                results: allResults,
            }), { headers: cors });
        }

        // POST /fix-normalized — 自动修复：R2读取 → 标点标准化 → POST Upload
        // 每次最多处理 45 个（Workers free plan 50 subrequest 限制）
        if (url.pathname === '/fix-normalized' && request.method === 'POST') {
            const body = await request.json().catch(() => ({}));
            const maxItems = body.max_items || 45;
            const startPage = body.start_page || 1;
            const maxPages = body.max_pages || 10;

            // 1. 收集 file_content_empty 的 .md R2 错误
            const errorItems = [];
            let fetchCount = 0;
            for (let page = startPage; page < startPage + maxPages && errorItems.length < maxItems; page++) {
                const resp = await fetch(`${AI_SEARCH_BASE}/items?status=error&per_page=50&page=${page}`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                fetchCount++;
                const data = await resp.json();
                const items = data.result || [];
                if (!items.length) break;

                for (const item of items) {
                    if (item.key.endsWith('.md') && item.error === 'file_content_empty'
                        && item.source_id !== 'builtin' && errorItems.length < maxItems) {
                        errorItems.push({ key: item.key });
                    }
                }
                if (items.length < 50) break;
            }

            // 2. 逐个修复：R2 读取 → 标点标准化 → 上传
            let subreqUsed = fetchCount;
            const allResults = [];
            for (const { key } of errorItems) {
                if (subreqUsed + 1 > 49) {
                    allResults.push({ key, status: 'skipped_subrequest_limit' });
                    continue;
                }
                try {
                    const obj = await env.R2_WENKU.get(key);
                    if (!obj) {
                        allResults.push({ key, status: 'r2_not_found' });
                        continue;
                    }
                    let text = await obj.text();
                    if (!text || !text.trim()) {
                        allResults.push({ key, status: 'empty_content' });
                        continue;
                    }

                    // 关键：标准化全角标点
                    text = normalizePunctuation(text);

                    const uploadData = await uploadToAISearch(token, key, text);
                    subreqUsed++;
                    allResults.push({
                        key,
                        status: uploadData.success ? 'fixed' : 'upload_failed',
                        size: text.length,
                        ...(uploadData.success ? {} : { error: JSON.stringify(uploadData.errors || uploadData) }),
                    });
                } catch (e) {
                    allResults.push({ key, status: 'error', error: e.message });
                }
            }

            const fixed = allResults.filter(r => r.status === 'fixed').length;
            const failed = allResults.filter(r => r.status !== 'fixed').length;
            return new Response(JSON.stringify({
                total_errors_found: errorItems.length,
                pagination_fetches: fetchCount,
                subrequest_used: subreqUsed,
                fixed,
                failed,
                results: allResults,
            }), { headers: cors });
        }

        // POST /cleanup-builtin — 删除损坏的 builtin 源 error items
        if (url.pathname === '/cleanup-builtin' && request.method === 'POST') {
            const body = await request.json().catch(() => ({}));
            const maxDelete = body.max_delete || 45;
            const maxPages = body.max_pages || 4;

            const toDelete = [];
            let fetchCount = 0;
            for (let page = 1; page <= maxPages && toDelete.length < maxDelete; page++) {
                const resp = await fetch(`${AI_SEARCH_BASE}/items?status=error&per_page=50&page=${page}&source_id=builtin`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                fetchCount++;
                const data = await resp.json();
                const items = data.result || [];
                if (!items.length) break;

                for (const item of items) {
                    if (item.source_id === 'builtin' && item.status === 'error' && toDelete.length < maxDelete) {
                        toDelete.push({ id: item.id, key: item.key });
                    }
                }
                if (items.length < 50) break;
            }

            const results = [];
            for (const { id, key } of toDelete) {
                if (fetchCount + results.length >= 48) {
                    results.push({ key, status: 'skipped_limit' });
                    continue;
                }
                try {
                    const resp = await fetch(`${AI_SEARCH_BASE}/items/${id}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` },
                    });
                    const data = await resp.json();
                    results.push({ key, status: data.success ? 'deleted' : 'delete_failed', error: data.errors?.[0]?.message });
                } catch (e) {
                    results.push({ key, status: 'error', error: e.message });
                }
            }

            const deleted = results.filter(r => r.status === 'deleted').length;
            return new Response(JSON.stringify({
                total_found: toDelete.length,
                deleted,
                failed: results.length - deleted,
                results,
            }), { headers: cors });
        }

        return new Response(JSON.stringify({
            routes: [
                'GET /read?key=xxx',
                'GET /list?prefix=xxx',
                'GET /stats',
                'GET /error-items?page=1',
                'POST /fix {keys: [...]}',
                'POST /fix-all {max_items: 45}',
                'POST /fix-normalized {max_items: 45} — 标点标准化修复',
                'POST /cleanup-builtin {max_delete: 45}',
            ]
        }), { headers: cors });
    }
};
