/**
 * Groq Whisper 音频转文字 Worker
 * Cron 触发，每次处理一批短音频，将转录结果存入 D1
 * 
 * 优先级：有声书（短音频）→ 讲座（长音频）
 * Groq 免费额度：14,400 秒/天, 20 RPM
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-large-v3-turbo';
const MAX_FILE_SIZE = 25 * 1024 * 1024;  // Groq 25MB 限制
const MAX_EPISODES_PER_RUN = 50;         // 每次最多处理几集
const MAX_AUDIO_SECONDS_PER_RUN = 3600;  // 每次最多处理 60 分钟音频（Groq 日额度 14400sq 日额度 14400s）
const GROQ_MIN_INTERVAL = 3200;          // 20 RPM → 每次间隔 3.2 秒

function isJobEnabled(env, envKey) {
    const rawValue = env?.[envKey];
    if (rawValue === undefined || rawValue === null) return true;
    const normalized = String(rawValue).trim();
    if (!normalized) return true;
    return !/^(false|0|off|no)$/i.test(normalized);
}

// ============================================================
// 工具函数
// ============================================================

function getAudioFormat(url) {
    const lower = url.toLowerCase();
    if (lower.includes('.m4a')) return 'm4a';
    if (lower.includes('.mp3')) return 'mp3';
    if (lower.includes('.wav')) return 'wav';
    if (lower.includes('.ogg')) return 'ogg';
    if (lower.includes('.flac')) return 'flac';
    return 'mp3'; // 默认
}

function getMimeType(format) {
    const map = {
        mp3: 'audio/mpeg',
        m4a: 'audio/mp4',
        wav: 'audio/wav',
        ogg: 'audio/ogg',
        flac: 'audio/flac',
    };
    return map[format] || 'audio/mpeg';
}

// ============================================================
// Groq Whisper 调用
// ============================================================

let _lastGroqCall = 0;

async function callGroqWhisper(apiKey, audioBuffer, filename, format) {
    // 限速
    const now = Date.now();
    const wait = GROQ_MIN_INTERVAL - (now - _lastGroqCall);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    _lastGroqCall = Date.now();

    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: getMimeType(format) });
    formData.append('file', blob, filename);
    formData.append('model', WHISPER_MODEL);
    formData.append('response_format', 'verbose_json');
    formData.append('language', 'zh');

    const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
        signal: AbortSignal.timeout(120000), // 2 分钟超时
    });

    if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after') || '60';
        throw new Error(`RATE_LIMIT: retry after ${retryAfter}s`);
    }

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Groq API ${response.status}: ${errText.slice(0, 200)}`);
    }

    return await response.json();
}

// ============================================================
// 单集处理
// ============================================================

async function processEpisode(ep, db, apiKey, log) {
    const { series_id, episode_num, audio_url } = ep;
    const label = `[${series_id}:${episode_num}] ${ep.title || ''}`;

    // 标记 processing
    await db.prepare(
        `UPDATE episode_transcripts SET status='processing', updated_at=datetime('now')
     WHERE series_id=? AND episode_num=?`
    ).bind(series_id, episode_num).run();

    try {
        // 1. 检查文件大小（HEAD 请求）
        log(`  ${label}: 检查文件大小...`);
        let fileSize = 0;
        try {
            const head = await fetch(audio_url, {
                method: 'HEAD',
                signal: AbortSignal.timeout(15000),
            });
            if (!head.ok) throw new Error(`HEAD ${head.status}`);
            fileSize = parseInt(head.headers.get('content-length') || '0', 10);
        } catch (err) {
            log(`    HEAD 失败 (${err.message})，尝试直接下载`);
        }

        if (fileSize > MAX_FILE_SIZE) {
            log(`    ⏭ 文件过大 (${(fileSize / 1024 / 1024).toFixed(1)}MB > 25MB)，跳过`);
            await db.prepare(
                `UPDATE episode_transcripts SET status='skipped', file_size=?, error='File too large',
         updated_at=datetime('now') WHERE series_id=? AND episode_num=?`
            ).bind(fileSize, series_id, episode_num).run();
            return { ok: false, skipped: true, audioSeconds: 0 };
        }

        // 2. 下载音频
        log(`  ${label}: 下载音频${fileSize ? ` (${(fileSize / 1024 / 1024).toFixed(1)}MB)` : ''}...`);
        const audioResp = await fetch(audio_url, {
            signal: AbortSignal.timeout(60000),
        });
        if (!audioResp.ok) throw new Error(`Download failed: ${audioResp.status}`);
        const audioBuffer = await audioResp.arrayBuffer();
        const actualSize = audioBuffer.byteLength;

        if (actualSize > MAX_FILE_SIZE) {
            log(`    ⏭ 实际文件过大 (${(actualSize / 1024 / 1024).toFixed(1)}MB)，跳过`);
            await db.prepare(
                `UPDATE episode_transcripts SET status='skipped', file_size=?, error='File too large',
         updated_at=datetime('now') WHERE series_id=? AND episode_num=?`
            ).bind(actualSize, series_id, episode_num).run();
            return { ok: false, skipped: true, audioSeconds: 0 };
        }

        // 3. 调用 Groq Whisper
        const format = getAudioFormat(audio_url);
        const filename = `audio.${format}`;
        log(`  ${label}: 调用 Groq Whisper (${(actualSize / 1024 / 1024).toFixed(1)}MB, ${format})...`);

        const result = await callGroqWhisper(apiKey, audioBuffer, filename, format);

        // 4. 提取结果
        const fullText = result.text || '';
        const duration = result.duration || 0;
        const segments = (result.segments || []).map(seg => ({
            start: seg.start,
            end: seg.end,
            text: seg.text,
        }));

        log(`  ${label}: ✅ ${Math.round(duration)}秒, ${fullText.length}字, ${segments.length}段`);

        // 5. 存入 D1
        await db.prepare(
            `UPDATE episode_transcripts
       SET status='done', full_text=?, segments=?, language=?, duration=?,
           file_size=?, model=?, error=NULL, updated_at=datetime('now')
       WHERE series_id=? AND episode_num=?`
        ).bind(
            fullText,
            JSON.stringify(segments),
            result.language || 'zh',
            duration,
            actualSize,
            WHISPER_MODEL,
            series_id,
            episode_num
        ).run();

        return { ok: true, skipped: false, audioSeconds: duration };

    } catch (err) {
        const errMsg = String(err.message || err).slice(0, 500);
        log(`  ${label}: ❌ ${errMsg}`);
        await db.prepare(
            `UPDATE episode_transcripts SET status='failed', error=?, updated_at=datetime('now')
       WHERE series_id=? AND episode_num=?`
        ).bind(errMsg, series_id, episode_num).run();

        // 速率限制 → 停止本次运行
        if (errMsg.includes('RATE_LIMIT') || errMsg.includes('429')) {
            return { ok: false, skipped: false, audioSeconds: 0, rateLimited: true };
        }
        return { ok: false, skipped: false, audioSeconds: 0 };
    }
}

// ============================================================
// Cron 入口
// ============================================================

export default {
    async scheduled(event, env, ctx) {
        if (!isJobEnabled(env, 'ENABLE_AI_TRANSCRIPT_JOB')) {
            console.log('ENABLE_AI_TRANSCRIPT_JOB=false, skipping transcript cron');
            return;
        }

        const db = env.DB;
        const apiKey = env.GROQ_API_KEY;
        if (!apiKey) { console.log('GROQ_API_KEY not set, skipping'); return; }

        const logs = [];
        const log = (msg) => { logs.push(`[${new Date().toISOString()}] ${msg}`); };

        log('🎤 Transcript Cron 开始');

        try {
            // 1. 初始化：把没有转录的集加入队列
            const { meta } = await db.prepare(
                `INSERT OR IGNORE INTO episode_transcripts (series_id, episode_num, audio_url, status)
         SELECT e.series_id, e.episode_num, e.url, 'pending'
         FROM episodes e
         WHERE e.url IS NOT NULL AND e.url != ''
           AND NOT EXISTS (
             SELECT 1 FROM episode_transcripts t
             WHERE t.series_id = e.series_id AND t.episode_num = e.episode_num
           )`
            ).run();
            if (meta.changes > 0) log(`📥 新增 ${meta.changes} 集到转录队列`);

            // 2. 重试之前失败的（超过 1 小时的）
            await db.prepare(
                `UPDATE episode_transcripts SET status='pending', error=NULL, updated_at=datetime('now')
         WHERE status='failed' AND updated_at < datetime('now', '-1 hour')
           AND error NOT LIKE '%File too large%'`
            ).run();

            // 3. 按时长升序处理（短音频优先）
            let totalAudioSeconds = 0;
            let processed = 0;
            let succeeded = 0;
            let skipped = 0;

            for (let i = 0; i < MAX_EPISODES_PER_RUN; i++) {
                if (totalAudioSeconds >= MAX_AUDIO_SECONDS_PER_RUN) {
                    log(`⏸ 音频时长预算用完 (${Math.round(totalAudioSeconds)}s)`);
                    break;
                }

                // 优先 processing（续传），再 pending
                // 有声书/佛号/经典读诵 优先于讲座，同分类内按时长升序
                const ep = await db.prepare(
                    `SELECT t.series_id, t.episode_num, t.audio_url, e.title, e.duration
           FROM episode_transcripts t
           JOIN episodes e ON e.series_id = t.series_id AND e.episode_num = t.episode_num
           JOIN series s ON s.id = t.series_id
           WHERE t.status IN ('processing', 'pending')
           ORDER BY
             CASE t.status WHEN 'processing' THEN 0 ELSE 1 END,
             CASE s.category_id
               WHEN 'youshengshu' THEN 0
               WHEN 'fohao' THEN 1
               WHEN 'jingdiandusong' THEN 2
               ELSE 3
                         END,
             COALESCE(e.duration, 999999) ASC
           LIMIT 1`
                ).first();

                if (!ep) { log('✅ 无更多待转录音频'); break; }

                const result = await processEpisode(ep, db, apiKey, log);
                processed++;
                totalAudioSeconds += result.audioSeconds;

                if (result.ok) succeeded++;
                if (result.skipped) skipped++;
                if (result.rateLimited) {
                    log('⚠️ Groq 速率限制，停止本次运行');
                    break;
                }
            }

            // 统计
            const stats = await db.prepare(
                `SELECT status, COUNT(*) as cnt FROM episode_transcripts GROUP BY status`
            ).all();
            const statsStr = (stats.results || []).map(r => `${r.status}:${r.cnt}`).join(' ');
            log(`📊 本次: ${processed}处理 ${succeeded}成功 ${skipped}跳过 ${Math.round(totalAudioSeconds)}s音频 | 全局: ${statsStr}`);

        } catch (err) {
            log(`💥 致命错误: ${err.message}`);
        }

        log('🎤 Transcript Cron 结束');

        // 写日志到 D1
        try {
            await db.prepare(
                `INSERT INTO ai_query_log (query, response_path, created_at)
         VALUES ('__transcript_cron_log__', ?, datetime('now'))`
            ).bind(logs.join('\n')).run();
        } catch { /* ignore */ }
    },

    // HTTP 入口
    async fetch(request, env) {
        const url = new URL(request.url);
        const token = request.headers.get('X-Admin-Token') || url.searchParams.get('token');
        const enabled = isJobEnabled(env, 'ENABLE_AI_TRANSCRIPT_JOB');

        if (token !== env.ADMIN_TOKEN) {
            return new Response('Unauthorized', { status: 401 });
        }

        const db = env.DB;

        // GET /status
        if (url.pathname === '/status' || url.pathname === '/') {
            const counts = await db.prepare(
                `SELECT status, COUNT(*) as cnt FROM episode_transcripts GROUP BY status`
            ).all();
            const totalDuration = await db.prepare(
                `SELECT SUM(duration) as total_s, COUNT(*) as total FROM episode_transcripts WHERE status='done'`
            ).first();
            const recentLogs = await db.prepare(
                `SELECT response_path, created_at FROM ai_query_log
         WHERE query='__transcript_cron_log__' ORDER BY created_at DESC LIMIT 3`
            ).all();

            return Response.json({
                enabled,
                status_counts: counts.results,
                done_stats: {
                    total: totalDuration?.total || 0,
                    total_seconds: Math.round(totalDuration?.total_s || 0),
                    total_hours: Math.round((totalDuration?.total_s || 0) / 3600 * 10) / 10,
                },
                recent_logs: (recentLogs.results || []).map(r => ({
                    time: r.created_at,
                    log: r.response_path,
                })),
            });
        }

        // POST /trigger — 手动触发
        if (url.pathname === '/trigger' && request.method === 'POST') {
            if (!enabled) {
                return Response.json({
                    success: false,
                    enabled: false,
                    error: 'Transcript job is disabled by ENABLE_AI_TRANSCRIPT_JOB',
                }, { status: 409 });
            }
            try {
                await this.scheduled({ scheduledTime: Date.now() }, env, { waitUntil: () => { } });
                return Response.json({ success: true, message: '转录任务已执行' });
            } catch (err) {
                return Response.json({ error: err.message }, { status: 500 });
            }
        }

        // GET /test — 测试 Groq 连通性
        if (url.pathname === '/test') {
            if (!env.GROQ_API_KEY) {
                return Response.json({ error: 'GROQ_API_KEY not set' }, { status: 400 });
            }
            try {
                const r = await fetch('https://api.groq.com/openai/v1/models', {
                    headers: { 'Authorization': `Bearer ${env.GROQ_API_KEY}` },
                    signal: AbortSignal.timeout(10000),
                });
                const data = await r.json();
                const whisperModels = (data.data || [])
                    .filter(m => m.id.includes('whisper'))
                    .map(m => m.id);
                return Response.json({
                    http_status: r.status,
                    whisper_models: whisperModels,
                    total_models: (data.data || []).length,
                });
            } catch (err) {
                return Response.json({ error: err.message }, { status: 500 });
            }
        }

        return new Response('Not Found', { status: 404 });
    },
};
