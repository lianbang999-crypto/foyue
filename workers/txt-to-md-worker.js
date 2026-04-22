/**
 * txt-to-md-worker.js
 *
 * 临时 Worker：将 R2 桶 jingdianwendang 中的 .txt 文件转换为 .md 格式，
 * 以便 Cloudflare AI Search 能够解析和索引。
 *
 * 使用方式：
 *   GET  /              → 查看状态（统计 .txt 和 .md 文件数量）
 *   POST /              → 执行转换（默认处理 20 个文件）
 *   POST /?limit=N      → 处理 N 个文件
 *   POST /?dry=1        → 仅预览，不实际上传
 *   POST /?prefix=X     → 仅处理指定前缀下的文件
 *   POST /reindex       → 默认从头开始，全量将 .md 文件上传到 AI Search 实例
 *   POST /reindex?limit=N&offset=M → 按窗口索引指定范围，便于断点续跑
 *   POST /cleanup        → 删除已有 .md 对应的旧 .txt 文件
 *   POST /cleanup?limit=N → 删除 N 个 .txt 文件
 *   POST /cleanup?dry=1  → 仅预览，不实际删除
 *   GET  /test-search?q=X → 测试 AI Search 搜索
 */

const R2_BASE = '大安法师/大安法师（讲法集）TXT/';
const MAX_CONTENT_SIZE = 2 * 1024 * 1024; // 2MB，跳过过大的文件

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;

    // CORS
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const bucket = env.R2_WENKU;
    if (!bucket) {
      return json({ error: 'R2_WENKU binding not available' }, 500, cors);
    }

    // GET /test-search?q=X — 测试 AI Search
    if (method === 'GET' && url.pathname === '/test-search') {
      const query = url.searchParams.get('q') || '净土法门';
      return handleTestSearch(env, query, cors);
    }

    // GET: 统计状态
    if (method === 'GET') {
      return handleStatus(bucket, env, cors);
    }

    // POST /reindex — 将 .md 文件上传到 AI Search
    if (method === 'POST' && url.pathname === '/reindex') {
      const limitParam = url.searchParams.get('limit');
      const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);
      const processAll = !limitParam || limitParam === 'all';
      const parsedLimit = parseInt(limitParam || '0', 10);
      const limit = processAll ? Number.MAX_SAFE_INTEGER : Math.min(parsedLimit > 0 ? parsedLimit : 20, 200);
      const dryRun = url.searchParams.has('dry');
      return handleReindex(bucket, env, { limit, offset, dryRun, processAll }, cors);
    }

    // POST /cleanup — 删除已有 .md 对应的旧 .txt 文件
    if (method === 'POST' && url.pathname === '/cleanup') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
      const dryRun = url.searchParams.has('dry');
      return handleCleanup(bucket, { limit, dryRun }, cors);
    }

    // POST: 执行转换
    if (method === 'POST') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
      const dryRun = url.searchParams.has('dry');
      const prefix = url.searchParams.get('prefix') || R2_BASE;
      const skipExisting = !url.searchParams.has('overwrite');
      return handleConvert(bucket, { limit, dryRun, prefix, skipExisting }, cors);
    }

    return json({ error: 'Method not allowed' }, 405, cors);
  },
};

function json(data, status = 200, cors = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  });
}

/**
 * 列出 R2 桶中指定前缀下的所有对象
 */
async function listAllObjects(bucket, prefix) {
  const objects = [];
  let cursor;
  let hasMore = true;
  while (hasMore) {
    const opts = { prefix, limit: 1000 };
    if (cursor) opts.cursor = cursor;
    const result = await bucket.list(opts);
    objects.push(...result.objects);
    hasMore = result.truncated;
    cursor = result.truncated ? result.cursor : undefined;
  }
  return objects;
}

/**
 * GET / — 统计 .txt 和 .md 文件数量
 */
async function handleStatus(bucket, env, cors) {
  const allObjects = await listAllObjects(bucket, R2_BASE);

  let txtCount = 0;
  let mdCount = 0;
  let otherCount = 0;
  const txtFiles = [];
  const mdFiles = [];

  for (const obj of allObjects) {
    if (obj.key.endsWith('/')) continue;
    if (obj.key.endsWith('.txt')) {
      txtCount++;
      txtFiles.push(obj.key);
    } else if (obj.key.endsWith('.md')) {
      mdCount++;
      mdFiles.push(obj.key);
    } else {
      otherCount++;
    }
  }

  return json({
    totalObjects: allObjects.length,
    txtFiles: txtCount,
    mdFiles: mdCount,
    otherFiles: otherCount,
    needsConversion: txtCount,
    alreadyConverted: mdCount,
    aiSearchBinding: !!env?.DHARMA_SEARCH,
    sampleTxtFiles: txtFiles.slice(0, 5),
    sampleMdFiles: mdFiles.slice(0, 5),
  }, 200, cors);
}

/**
 * 从 R2 key 推断文档元信息
 *
 * 注意：doc_id 不在此处生成，而是由 handleReindex 从 D1 查询获取，
 * 避免与 wenku-routes.js 的 syncGenId 逻辑重复导致不一致。
 */
function parseMetadataFromKey(key) {
  // key 格式: 大安法师/大安法师（讲法集）TXT/01 佛说阿弥陀经 30讲/第01讲 佛说阿弥陀经（第一讲）.txt
  const parts = key.split('/');
  const fileName = parts[parts.length - 1] || '';
  const folderName = parts.length >= 2 ? parts[parts.length - 2] : '';

  // 解析系列名
  let seriesName = folderName.replace(/^\d+\s+/, '').replace(/\s+\d+[讲辑]$/, '').trim();
  if (!seriesName) seriesName = '净土法音文库';

  // 解析讲次
  const epMatch = fileName.match(/第(\d+)[讲辑]/);
  const episodeNum = epMatch ? parseInt(epMatch[1], 10) : null;

  // 解析标题
  let title = fileName.replace(/\.txt$/i, '').replace(/\.md$/i, '').trim();
  if (!title) title = fileName;

  return { seriesName, episodeNum, title, folderName };
}

/**
 * 将纯文本内容包装为 Markdown 格式
 */
function textToMarkdown(text, metadata) {
  const { seriesName, episodeNum, title } = metadata;

  // 构建 YAML frontmatter
  const frontmatter = [
    '---',
    `title: "${title.replace(/"/g, '\\"')}"`,
    `series: "${seriesName.replace(/"/g, '\\"')}"`,
    `category: "大安法师"`,
  ];
  if (episodeNum) {
    frontmatter.push(`episode: ${episodeNum}`);
  }
  frontmatter.push('---');

  // 清理文本内容：移除 BOM、规范化换行
  let cleanText = text;
  if (cleanText.charCodeAt(0) === 0xFEFF) {
    cleanText = cleanText.slice(1);
  }
  cleanText = cleanText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  // 如果文本本身没有 Markdown 标题，添加一个
  if (!cleanText.startsWith('#')) {
    cleanText = `# ${title}\n\n${cleanText}`;
  }

  return frontmatter.join('\n') + '\n\n' + cleanText;
}

/**
 * POST / — 执行转换
 */
async function handleConvert(bucket, options, cors) {
  const { limit, dryRun, prefix, skipExisting } = options;

  const allObjects = await listAllObjects(bucket, prefix);

  // 筛选 .txt 文件
  const txtFiles = allObjects.filter(obj => !obj.key.endsWith('/') && obj.key.endsWith('.txt'));

  // 检查哪些已经有对应的 .md 文件
  const allKeys = new Set(allObjects.map(obj => obj.key));
  const pendingFiles = [];

  for (const obj of txtFiles) {
    const mdKey = obj.key.replace(/\.txt$/i, '.md');
    if (skipExisting && allKeys.has(mdKey)) {
      continue; // 已有 .md 版本，跳过
    }
    pendingFiles.push(obj);
  }

  const toProcess = pendingFiles.slice(0, limit);

  const results = {
    dryRun,
    totalTxtFiles: txtFiles.length,
    alreadyHaveMd: txtFiles.length - pendingFiles.length,
    pendingConversion: pendingFiles.length,
    processingNow: toProcess.length,
    remaining: pendingFiles.length - toProcess.length,
    converted: [],
    skipped: [],
    errors: [],
  };

  for (const obj of toProcess) {
    const mdKey = obj.key.replace(/\.txt$/i, '.md');
    const metadata = parseMetadataFromKey(obj.key);

    try {
      // 读取 .txt 文件内容
      const r2Obj = await bucket.get(obj.key);
      if (!r2Obj) {
        results.errors.push({ key: obj.key, error: 'Object not found in R2' });
        continue;
      }

      const text = await r2Obj.text();
      if (!text || !text.trim()) {
        results.skipped.push({ key: obj.key, reason: 'empty_content' });
        continue;
      }

      if (text.length > MAX_CONTENT_SIZE) {
        results.skipped.push({ key: obj.key, reason: 'too_large', size: text.length });
        continue;
      }

      // 转换为 Markdown
      const mdContent = textToMarkdown(text, metadata);

      if (dryRun) {
        results.converted.push({
          originalKey: obj.key,
          newKey: mdKey,
          metadata,
          originalSize: text.length,
          newSize: mdContent.length,
          preview: mdContent.slice(0, 200),
        });
      } else {
        // 上传 .md 文件到 R2
        await bucket.put(mdKey, mdContent, {
          httpMetadata: {
            contentType: 'text/markdown; charset=utf-8',
          },
          customMetadata: {
            source: obj.key,
            series: metadata.seriesName,
            title: metadata.title,
            episode: metadata.episodeNum ? String(metadata.episodeNum) : '',
          },
        });

        results.converted.push({
          originalKey: obj.key,
          newKey: mdKey,
          metadata,
          originalSize: text.length,
          newSize: mdContent.length,
        });
      }
    } catch (err) {
      results.errors.push({ key: obj.key, error: err.message });
    }
  }

  return json(results, 200, cors);
}

/**
 * POST /reindex — 将 R2 中的 .md 文件上传到 AI Search 实例
 *
 * AI Search 的 upload() API 接受文档列表，每个文档包含：
 *   - key: 唯一标识（使用 R2 key）
 *   - text: 文档文本内容
 *   - metadata: 可选元数据（含 doc_id，从 D1 查询获取）
 *
 * doc_id 从 D1 documents 表的 r2_key → id 映射获取，
 * 确保与文库阅读器使用的 ID 体系一致，单一映射源，无双源不一致风险。
 */
async function handleReindex(bucket, env, options, cors) {
  const { limit, offset = 0, dryRun, processAll = false } = options;

  if (!env?.DHARMA_SEARCH) {
    return json({ error: 'DHARMA_SEARCH binding not available' }, 500, cors);
  }

  // 列出所有 .md 文件
  const allObjects = await listAllObjects(bucket, R2_BASE);
  const mdFiles = allObjects
    .filter(obj => !obj.key.endsWith('/') && obj.key.endsWith('.md'))
    .sort((a, b) => a.key.localeCompare(b.key, 'zh-Hans-CN'));
  const end = processAll ? mdFiles.length : Math.min(offset + limit, mdFiles.length);
  const toProcess = mdFiles.slice(offset, end);

  // 从 D1 查询 r2_key → id 映射表（单一映射源）
  // 同时查 .txt 和 .md 版本的 r2_key，因为 D1 中可能存的是 .txt 的 r2_key
  const r2KeysToQuery = [...new Set(toProcess.flatMap(obj => {
    const txtKey = obj.key.replace(/\.md$/i, '.txt');
    return [obj.key, txtKey !== obj.key ? txtKey : null].filter(Boolean);
  }))];
  const r2ToD1Id = new Map();
  if (r2KeysToQuery.length > 0 && env?.DB) {
    try {
      const placeholders = r2KeysToQuery.map(() => '?').join(',');
      const { results: mapRows } = await env.DB.prepare(
        `SELECT id, r2_key FROM documents WHERE r2_key IN (${placeholders})`
      ).bind(...r2KeysToQuery).all();
      for (const row of mapRows) {
        if (row.r2_key) r2ToD1Id.set(row.r2_key, row.id);
      }
    } catch (err) {
      console.warn('D1 r2_key mapping query failed:', err.message);
    }
  }

  const results = {
    dryRun,
    processMode: processAll ? 'all' : 'window',
    totalMdFiles: mdFiles.length,
    offset,
    processingNow: toProcess.length,
    remaining: Math.max(mdFiles.length - end, 0),
    hasMore: end < mdFiles.length,
    nextOffset: end < mdFiles.length ? end : null,
    d1Mapped: 0,
    d1Unmapped: 0,
    uploaded: [],
    errors: [],
  };

  // AI Search upload 每次最多处理 10 个文档
  const batchSize = 10;
  for (let i = 0; i < toProcess.length; i += batchSize) {
    const batch = toProcess.slice(i, i + batchSize);

    // 读取文件内容
    const documents = [];
    for (const obj of batch) {
      try {
        const r2Obj = await bucket.get(obj.key);
        if (!r2Obj) {
          results.errors.push({ key: obj.key, error: 'Object not found in R2' });
          continue;
        }
        const text = await r2Obj.text();
        if (!text || !text.trim()) {
          results.errors.push({ key: obj.key, error: 'Empty content' });
          continue;
        }

        const metadata = parseMetadataFromKey(obj.key);
        // 从 D1 映射表获取 doc_id，同时尝试 .txt 版本的 r2_key
        const docId = r2ToD1Id.get(obj.key)
          || r2ToD1Id.get(obj.key.replace(/\.md$/i, '.txt'))
          || '';
        if (docId) results.d1Mapped++;
        else results.d1Unmapped++;

        documents.push({
          key: obj.key,
          text,
          metadata: {
            doc_id: docId,  // D1 格式的文档 ID，供搜索结果直接使用
            title: metadata.title,
            series_name: metadata.seriesName,
            category: '大安法师',
            audio_series_id: '',
          },
        });
      } catch (err) {
        results.errors.push({ key: obj.key, error: err.message });
      }
    }

    if (!documents.length) continue;

    if (dryRun) {
      for (const doc of documents) {
        results.uploaded.push({
          key: doc.key,
          metadata: doc.metadata,
          textSize: doc.text.length,
        });
      }
    } else {
      try {
        // 使用 AI Search 的 upload API
        const uploadResult = await env.DHARMA_SEARCH.upload(documents);
        for (const doc of documents) {
          results.uploaded.push({
            key: doc.key,
            metadata: doc.metadata,
            textSize: doc.text.length,
          });
        }
      } catch (err) {
        for (const doc of documents) {
          results.errors.push({ key: doc.key, error: `Upload failed: ${err.message}` });
        }
      }
    }
  }

  results.fullyProcessed = !results.hasMore;

  return json(results, 200, cors);
}

/**
 * GET /test-search?q=X — 测试 AI Search 搜索
 */
async function handleTestSearch(env, query, cors) {
  if (!env?.DHARMA_SEARCH) {
    return json({ error: 'DHARMA_SEARCH binding not available' }, 500, cors);
  }

  try {
    const searchResult = await env.DHARMA_SEARCH.search(query, {
      max_num_results: 5,
      score_threshold: 0.3,
    });

    const chunks = searchResult?.chunks || searchResult?.data || [];

    return json({
      query,
      totalResults: chunks.length,
      results: chunks.map(chunk => ({
        score: chunk.score,
        text: (chunk.text || '').slice(0, 300),
        key: chunk.item?.key || '',
        metadata: chunk.item?.metadata || {},
      })),
      rawKeys: chunks.map(c => c.item?.key).filter(Boolean),
    }, 200, cors);
  } catch (err) {
    return json({
      query,
      error: err.message,
      stack: err.stack?.slice(0, 500),
    }, 500, cors);
  }
}

/**
 * POST /cleanup — 删除已有 .md 对应的旧 .txt 文件
 *
 * 只删除那些已经有 .md 版本的 .txt 文件，确保数据安全。
 */
async function handleCleanup(bucket, options, cors) {
  const { limit, dryRun } = options;

  const allObjects = await listAllObjects(bucket, R2_BASE);
  const allKeys = new Set(allObjects.map(obj => obj.key));

  // 找出有 .md 对应的 .txt 文件
  const txtFiles = allObjects.filter(obj => !obj.key.endsWith('/') && obj.key.endsWith('.txt'));
  const deletable = [];

  for (const obj of txtFiles) {
    const mdKey = obj.key.replace(/\.txt$/i, '.md');
    if (allKeys.has(mdKey)) {
      deletable.push(obj);
    }
  }

  const toDelete = deletable.slice(0, limit);

  const results = {
    dryRun,
    totalTxtFiles: txtFiles.length,
    deletableTxtFiles: deletable.length,
    deletingNow: toDelete.length,
    remaining: deletable.length - toDelete.length,
    deleted: [],
    errors: [],
  };

  for (const obj of toDelete) {
    if (dryRun) {
      results.deleted.push({ key: obj.key, size: obj.size });
    } else {
      try {
        await bucket.delete(obj.key);
        results.deleted.push({ key: obj.key, size: obj.size });
      } catch (err) {
        results.errors.push({ key: obj.key, error: err.message });
      }
    }
  }

  return json(results, 200, cors);
}
