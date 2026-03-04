/**
 * Pages Function: /api/*
 * 处理所有 /api/ 路由请求
 */

import {
  AI_CONFIG, chunkText, generateEmbeddings, semanticSearch,
  retrieveDocuments, ragAnswer, generateSummary,
  checkRateLimit, cleanupRateLimits, timingSafeCompare,
} from '../lib/ai-utils.js';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // CORS — 限制允许的来源
  const ALLOWED_ORIGINS = (env.ALLOWED_ORIGINS || 'https://foyue.org,https://amituofo.pages.dev').split(',');
  const origin = request.headers.get('Origin') || '';
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : '';
  const cors = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
  };

  if (method === 'OPTIONS') {
    return new Response(null, { headers: { ...cors, 'Access-Control-Max-Age': '86400' } });
  }

  try {
    const db = env.DB;

    // ==================== 原有路由 ====================

    // GET /api/categories
    if (path === '/api/categories' && method === 'GET') {
      return json(await getCategories(db), cors);
    }

    // GET /api/series/:id
    const sm = path.match(/^\/api\/series\/([^/]+)$/);
    if (sm && method === 'GET') {
      return json(await getSeriesDetail(db, sm[1]), cors);
    }

    // GET /api/series/:id/episodes
    const em = path.match(/^\/api\/series\/([^/]+)\/episodes$/);
    if (em && method === 'GET') {
      return json(await getEpisodes(db, em[1]), cors);
    }

    // POST /api/play-count
    if (path === '/api/play-count' && method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, cors, 400); }
      return json(await recordPlay(db, body, request), cors, 200, 'no-store');
    }

    // GET /api/play-count/:id
    const pm = path.match(/^\/api\/play-count\/([^/]+)$/);
    if (pm && method === 'GET') {
      return json(await getPlayCount(db, pm[1]), cors);
    }

    // POST /api/appreciate/:id
    const am = path.match(/^\/api\/appreciate\/([^/]+)$/);
    if (am && method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch { /* empty body ok */ }
      return json(await appreciate(db, am[1], body, request), cors, 200, 'no-store');
    }

    // GET /api/appreciate/:id — get total appreciate count
    if (am && method === 'GET') {
      return json(await getAppreciateCount(db, am[1]), cors);
    }

    // GET /api/stats
    if (path === '/api/stats' && method === 'GET') {
      const origin = url.searchParams.get('origin') || '';
      return json(await getStats(db, origin), cors, 200, 'private, no-cache');
    }

    // ==================== 文稿路由 ====================

    // GET /api/transcript/available/:seriesId — 批量查询有文稿的集数
    const ta = path.match(/^\/api\/transcript\/available\/([^/]+)$/);
    if (ta && method === 'GET') {
      return await handleTranscriptAvailability(db, ta[1], cors);
    }

    // GET /api/transcript/:seriesId/:episodeNum — 获取文稿内容
    const tm = path.match(/^\/api\/transcript\/([^/]+)\/(\d+)$/);
    if (tm && method === 'GET') {
      return await handleGetTranscript(db, tm[1], tm[2], cors);
    }

    // POST /api/admin/transcript/populate — 填充音频-文稿映射
    if (path === '/api/admin/transcript/populate' && method === 'POST') {
      return await handlePopulateTranscriptMapping(env, request, cors);
    }

    // POST /api/admin/transcript/auto-match — 自动匹配音频与文稿
    if (path === '/api/admin/transcript/auto-match' && method === 'POST') {
      return await handleAutoMatchTranscripts(env, request, cors);
    }

    // POST /api/admin/transcript/transcribe — 增量 Whisper 转写
    if (path === '/api/admin/transcript/transcribe' && method === 'POST') {
      return await handleIncrementalTranscribe(env, request, cors);
    }

    // ==================== AI 路由 ====================

    // POST /api/ai/ask — RAG 问答
    if (path === '/api/ai/ask' && method === 'POST') {
      return await handleAiAsk(env, request, cors);
    }

    // GET /api/ai/summary/:id — 获取/生成集摘要
    const sumMatch = path.match(/^\/api\/ai\/summary\/([^/]+)$/);
    if (sumMatch && method === 'GET') {
      return await handleAiSummary(env, sumMatch[1], request, cors);
    }

    // GET /api/ai/search?q= — 语义搜索
    if (path === '/api/ai/search' && method === 'GET') {
      const q = url.searchParams.get('q');
      return await handleAiSearch(env, request, q, cors);
    }

    // ==================== 留言墙路由 ====================

    // GET /api/messages — 获取留言列表
    if (path === '/api/messages' && method === 'GET') {
      return await handleGetMessages(db, url, cors);
    }

    // POST /api/messages — 发布留言
    if (path === '/api/messages' && method === 'POST') {
      return await handlePostMessage(db, request, cors);
    }

    // ==================== 管理员路由 ====================

    // POST /api/admin/embeddings/build — 批量构建向量
    if (path === '/api/admin/embeddings/build' && method === 'POST') {
      return await handleBuildEmbeddings(env, request, cors);
    }

    // POST /api/admin/cleanup — 清理过期限流记录
    if (path === '/api/admin/cleanup' && method === 'POST') {
      return await handleAdminCleanup(env, request, cors);
    }

    // GET /api/admin/test-embedding — 诊断 embedding 模型
    if (path === '/api/admin/test-embedding' && method === 'GET') {
      const tk = url.searchParams.get('token');
      if (!tk || !env.ADMIN_TOKEN || !timingSafeCompare(tk, env.ADMIN_TOKEN)) {
        return json({ error: 'Unauthorized' }, cors, 401);
      }
      try {
        // mode=chunk: 从 D1 读文档并切块后测试
        const mode = url.searchParams.get('mode') || 'simple';
        if (mode === 'chunk') {
          const doc = await env.DB.prepare(
            `SELECT id, title, content FROM documents
             WHERE content IS NOT NULL AND content != ''
             ORDER BY id LIMIT 1`
          ).first();
          if (!doc) return json({ error: 'No documents found' }, cors);
          const chunks = chunkText(doc.content, doc.id, { title: doc.title });
          const firstChunk = chunks[0];
          const resp = await env.AI.run('@cf/baai/bge-m3', { text: [firstChunk.text] });
          return json({
            success: true,
            docId: doc.id,
            contentLength: doc.content.length,
            totalChunks: chunks.length,
            chunkTextLength: firstChunk.text.length,
            chunkTextPreview: firstChunk.text.slice(0, 100),
            dimensions: resp.data?.[0]?.length || 'unknown',
          }, cors);
        }
        // mode=simple: 简单文本测试
        const testText = '南无阿弥陀佛';
        const resp = await env.AI.run('@cf/baai/bge-m3', { text: [testText] });
        return json({
          success: true,
          model: '@cf/baai/bge-m3',
          inputText: testText,
          dimensions: resp.data?.[0]?.length || 'unknown',
          firstValues: resp.data?.[0]?.slice(0, 5) || null,
        }, cors);
      } catch (err) {
        return json({ success: false, error: err.message }, cors);
      }
    }

    // GET /api/admin/test-chat — 诊断 chat 模型
    if (path === '/api/admin/test-chat' && method === 'GET') {
      const tk = url.searchParams.get('token');
      if (!tk || !env.ADMIN_TOKEN || !timingSafeCompare(tk, env.ADMIN_TOKEN)) {
        return json({ error: 'Unauthorized' }, cors, 401);
      }
      const testPrompt = url.searchParams.get('q') || '请用一句话解释什么是净土宗。';
      const model = url.searchParams.get('model') || AI_CONFIG.models.chat;
      try {
        const rawResponse = await env.AI.run(
          model,
          {
            messages: [
              { role: 'system', content: '你是一个佛学助手。' },
              { role: 'user', content: testPrompt },
            ],
            max_tokens: 200,
            temperature: 0.3,
          },
          { gateway: { ...AI_CONFIG.gateway, skipCache: true } }
        );
        return json({
          success: true,
          model,
          prompt: testPrompt,
          rawResponseType: typeof rawResponse,
          rawResponseKeys: rawResponse ? Object.keys(rawResponse) : null,
          response: rawResponse?.response ?? null,
          fullRaw: JSON.stringify(rawResponse).slice(0, 500),
        }, cors);
      } catch (err) {
        return json({
          success: false,
          model,
          error: err.message,
          stack: err.stack?.slice(0, 300),
        }, cors);
      }
    }

    // ==================== 管理后台路由 ====================

    // Admin auth helper — all admin dashboard routes below require this
    function requireAdmin() {
      const tk = request.headers.get('X-Admin-Token');
      if (!tk || !env.ADMIN_TOKEN || !timingSafeCompare(tk, env.ADMIN_TOKEN)) {
        return json({ error: 'Unauthorized' }, cors, 401);
      }
      return null;
    }

    // GET /api/admin/verify — validate token
    if (path === '/api/admin/verify' && method === 'GET') {
      return requireAdmin() || json({ ok: true }, cors, 200, 'no-store');
    }

    // GET /api/admin/stats — dashboard statistics
    if (path === '/api/admin/stats' && method === 'GET') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      return await handleAdminStats(db, cors);
    }

    // GET /api/admin/messages — list messages (all statuses)
    if (path === '/api/admin/messages' && method === 'GET') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      return await handleAdminGetMessages(db, url, cors);
    }

    // PUT /api/admin/messages/:id — update message status/pin
    const admMsgPut = path.match(/^\/api\/admin\/messages\/(\d+)$/);
    if (admMsgPut && method === 'PUT') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      let body; try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, cors, 400); }
      return await handleAdminUpdateMessage(db, parseInt(admMsgPut[1]), body, cors);
    }

    // DELETE /api/admin/messages/:id
    const admMsgDel = path.match(/^\/api\/admin\/messages\/(\d+)$/);
    if (admMsgDel && method === 'DELETE') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      return await handleAdminDeleteMessage(db, parseInt(admMsgDel[1]), cors);
    }

    // GET /api/admin/categories — list categories with series count
    if (path === '/api/admin/categories' && method === 'GET') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      return await handleAdminGetCategories(db, cors);
    }

    // PUT /api/admin/categories/:id
    const admCatPut = path.match(/^\/api\/admin\/categories\/([^/]+)$/);
    if (admCatPut && method === 'PUT') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      let body; try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, cors, 400); }
      return await handleAdminUpdateCategory(db, admCatPut[1], body, cors);
    }

    // GET /api/admin/series — list series
    if (path === '/api/admin/series' && method === 'GET') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      return await handleAdminGetSeries(db, url, cors);
    }

    // POST /api/admin/series — create series
    if (path === '/api/admin/series' && method === 'POST') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      let body; try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, cors, 400); }
      return await handleAdminCreateSeries(db, body, cors);
    }

    // PUT /api/admin/series/:id
    const admSerPut = path.match(/^\/api\/admin\/series\/([^/]+)$/);
    if (admSerPut && method === 'PUT') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      let body; try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, cors, 400); }
      return await handleAdminUpdateSeries(db, admSerPut[1], body, cors);
    }

    // DELETE /api/admin/series/:id
    const admSerDel = path.match(/^\/api\/admin\/series\/([^/]+)$/);
    if (admSerDel && method === 'DELETE') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      return await handleAdminDeleteSeries(db, admSerDel[1], cors);
    }

    // GET /api/admin/episodes/:seriesId
    const admEpGet = path.match(/^\/api\/admin\/episodes\/([^/]+)$/);
    if (admEpGet && method === 'GET') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      return await handleAdminGetEpisodes(db, admEpGet[1], cors);
    }

    // POST /api/admin/episodes
    if (path === '/api/admin/episodes' && method === 'POST') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      let body; try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, cors, 400); }
      return await handleAdminCreateEpisode(db, body, cors);
    }

    // PUT /api/admin/episodes/:id
    const admEpPut = path.match(/^\/api\/admin\/episodes\/(\d+)$/);
    if (admEpPut && method === 'PUT') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      let body; try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, cors, 400); }
      return await handleAdminUpdateEpisode(db, parseInt(admEpPut[1]), body, cors);
    }

    // DELETE /api/admin/episodes/:id
    const admEpDel = path.match(/^\/api\/admin\/episodes\/(\d+)$/);
    if (admEpDel && method === 'DELETE') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      return await handleAdminDeleteEpisode(db, parseInt(admEpDel[1]), cors);
    }

    return json({ error: 'Not Found' }, cors, 404);

  } catch (err) {
    console.error('API Error:', err);
    return json({ error: 'Internal Server Error' }, cors, 500);
  }
}

// ============================================================
function json(data, cors, status = 200, cacheControl) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl || (status === 200 ? 'public, max-age=300' : 'no-cache'),
      ...cors,
    },
  });
}

// ============================================================
async function getCategories(db) {
  // ✅ 优化：使用 JOIN 一次性获取所有数据，避免 N+1 查询问题
  const result = await db.prepare(`
    SELECT
      c.id as cat_id, c.title as cat_title, c.title_en as cat_title_en, c.sort_order as cat_sort,
      s.id as series_id, s.title, s.title_en, s.speaker, s.speaker_en,
      s.bucket, s.folder, s.total_episodes, s.intro, s.play_count, s.sort_order
    FROM categories c
    LEFT JOIN series s ON c.id = s.category_id
    ORDER BY c.sort_order, s.sort_order
  `).all();

  // 在内存中组装结果
  const categories = new Map();
  for (const row of result.results) {
    if (!categories.has(row.cat_id)) {
      categories.set(row.cat_id, {
        id: row.cat_id,
        title: row.cat_title,
        titleEn: row.cat_title_en,
        series: []
      });
    }
    if (row.series_id) {
      categories.get(row.cat_id).series.push({
        id: row.series_id,
        title: row.title,
        titleEn: row.title_en,
        speaker: row.speaker,
        speakerEn: row.speaker_en,
        bucket: row.bucket,
        folder: row.folder,
        totalEpisodes: row.total_episodes,
        intro: row.intro,
        playCount: row.play_count,
      });
    }
  }

  return { categories: [...categories.values()] };
}

async function getSeriesDetail(db, seriesId) {
  const series = await db.prepare(
    `SELECT s.*, c.id as category_id, c.title as category_title
     FROM series s JOIN categories c ON s.category_id = c.id WHERE s.id = ?`
  ).bind(seriesId).first();
  if (!series) return { error: 'Series not found' };

  const episodes = await db.prepare(
    `SELECT episode_num as id, title, file_name as fileName, url, intro,
            story_number as storyNumber, play_count as playCount
     FROM episodes WHERE series_id = ? ORDER BY episode_num`
  ).bind(seriesId).all();

  return {
    id: series.id, title: series.title, titleEn: series.title_en,
    speaker: series.speaker, speakerEn: series.speaker_en,
    bucket: series.bucket, folder: series.folder,
    totalEpisodes: series.total_episodes, intro: series.intro,
    playCount: series.play_count,
    categoryId: series.category_id, categoryTitle: series.category_title,
    episodes: episodes.results.map(ep => {
      const obj = { id: ep.id, title: ep.title, fileName: ep.fileName, url: ep.url, playCount: ep.playCount };
      if (ep.intro) obj.intro = ep.intro;
      if (ep.storyNumber) obj.storyNumber = ep.storyNumber;
      return obj;
    }),
  };
}

async function getEpisodes(db, seriesId) {
  const episodes = await db.prepare(
    `SELECT episode_num as id, title, file_name as fileName, url, intro,
            story_number as storyNumber, play_count as playCount
     FROM episodes WHERE series_id = ? ORDER BY episode_num`
  ).bind(seriesId).all();
  return { episodes: episodes.results };
}

async function recordPlay(db, body, request) {
  const { seriesId, episodeNum } = body;
  if (!seriesId || typeof seriesId !== 'string' ||
      typeof episodeNum !== 'number' || !Number.isInteger(episodeNum) || episodeNum < 0) {
    return { error: 'Missing or invalid seriesId/episodeNum' };
  }

  const origin = new URL(request.url).hostname;
  await db.prepare('UPDATE series SET play_count = play_count + 1 WHERE id = ?').bind(seriesId).run();
  await db.prepare('UPDATE episodes SET play_count = play_count + 1 WHERE series_id = ? AND episode_num = ?').bind(seriesId, episodeNum).run();

  const ua = request.headers.get('User-Agent') || '';
  await db.prepare('INSERT INTO play_logs (series_id, episode_num, user_agent, origin) VALUES (?, ?, ?, ?)').bind(seriesId, episodeNum, ua.substring(0, 200), origin).run();

  const result = await db.prepare('SELECT play_count FROM series WHERE id = ?').bind(seriesId).first();
  return { success: true, playCount: result?.play_count || 0 };
}

async function getPlayCount(db, seriesId) {
  const series = await db.prepare('SELECT play_count FROM series WHERE id = ?').bind(seriesId).first();
  if (!series) return { error: 'Series not found' };

  const episodes = await db.prepare(
    'SELECT episode_num as id, play_count as playCount FROM episodes WHERE series_id = ? ORDER BY episode_num'
  ).bind(seriesId).all();

  return { seriesId, totalPlayCount: series.play_count, episodes: episodes.results };
}

async function appreciate(db, seriesId, body, request) {
  const origin = new URL(request.url).hostname;
  const episodeNum = (body && typeof body.episodeNum === 'number' && Number.isInteger(body.episodeNum)) ? body.episodeNum : null;

  // Backward-compatible: try with episode_num first, fall back to without if column doesn't exist yet
  try {
    await db.prepare(
      'INSERT INTO appreciations (series_id, episode_num, origin) VALUES (?, ?, ?)'
    ).bind(seriesId, episodeNum, origin).run();
  } catch (e) {
    // episode_num column may not exist yet (migration 0005 not applied)
    await db.prepare(
      'INSERT INTO appreciations (series_id, origin) VALUES (?, ?)'
    ).bind(seriesId, origin).run();
  }

  const count = await db.prepare(
    'SELECT COUNT(*) as total FROM appreciations WHERE series_id = ?'
  ).bind(seriesId).first();
  return { success: true, total: count.total };
}

async function getAppreciateCount(db, seriesId) {
  const count = await db.prepare(
    'SELECT COUNT(*) as total FROM appreciations WHERE series_id = ?'
  ).bind(seriesId).first();
  return { seriesId, total: count ? count.total : 0 };
}

async function getStats(db, origin = '') {
  const totalSeries = await db.prepare('SELECT COUNT(*) as count FROM series').first();
  const totalEpisodes = await db.prepare('SELECT COUNT(*) as count FROM episodes').first();
  const totalPlays = await db.prepare('SELECT SUM(play_count) as count FROM series').first();
  const totalAppreciations = await db.prepare('SELECT COUNT(*) as count FROM appreciations').first();

  let recentPlays;
  if (origin) {
    recentPlays = await db.prepare(
      `SELECT DATE(played_at) as date, COUNT(*) as count FROM play_logs
       WHERE played_at >= datetime('now', '-7 days') AND origin = ?
       GROUP BY DATE(played_at) ORDER BY date`
    ).bind(origin).all();
  } else {
    recentPlays = await db.prepare(
      `SELECT DATE(played_at) as date, COUNT(*) as count FROM play_logs
       WHERE played_at >= datetime('now', '-7 days')
       GROUP BY DATE(played_at) ORDER BY date`
    ).all();
  }

  const topSeries = await db.prepare(
    'SELECT s.id, s.title, s.speaker, s.play_count FROM series s ORDER BY s.play_count DESC LIMIT 5'
  ).all();

  const originStats = await db.prepare(
    `SELECT origin, COUNT(*) as count FROM play_logs WHERE origin != '' GROUP BY origin ORDER BY count DESC`
  ).all();

  return {
    totalSeries: totalSeries.count, totalEpisodes: totalEpisodes.count,
    totalPlays: totalPlays.count || 0, totalAppreciations: totalAppreciations.count,
    recentPlays: recentPlays.results, topSeries: topSeries.results,
    originStats: originStats.results, filteredBy: origin || 'all',
  };
}

async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

// ============================================================
// 文稿路由处理器
// ============================================================

/**
 * GET /api/transcript/available/:seriesId — 查询有文稿的集数列表
 */
async function handleTranscriptAvailability(db, seriesId, cors) {
  if (!seriesId || typeof seriesId !== 'string') {
    return json({ error: 'Missing seriesId' }, cors, 400);
  }

  const result = await db.prepare(
    `SELECT DISTINCT audio_episode_num FROM documents
     WHERE audio_series_id = ? AND content IS NOT NULL AND content != ''
     ORDER BY audio_episode_num`
  ).bind(seriesId).all();

  const episodes = result.results.map(r => r.audio_episode_num);
  return json({ seriesId, episodes }, cors, 200, 'public, max-age=3600');
}

/**
 * GET /api/transcript/:seriesId/:episodeNum — 获取文稿内容
 */
async function handleGetTranscript(db, seriesId, episodeNum, cors) {
  if (!seriesId) {
    return json({ error: 'Missing seriesId' }, cors, 400);
  }

  const epNum = parseInt(episodeNum, 10);
  if (!Number.isInteger(epNum) || epNum < 1) {
    return json({ error: 'Invalid episode number' }, cors, 400);
  }

  const doc = await db.prepare(
    `SELECT id, title, content, series_name, episode_num
     FROM documents
     WHERE audio_series_id = ? AND audio_episode_num = ?
       AND content IS NOT NULL AND content != ''
     LIMIT 1`
  ).bind(seriesId, epNum).first();

  if (!doc) {
    return json({ error: 'Transcript not found', available: false }, cors, 404);
  }

  // 更新阅读计数（fire-and-forget）
  db.prepare(
    'UPDATE documents SET read_count = read_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(doc.id).run();

  return json({
    available: true,
    documentId: doc.id,
    title: doc.title,
    seriesName: doc.series_name,
    episodeNum: doc.episode_num,
    content: doc.content,
  }, cors, 200, 'public, max-age=3600');
}

/**
 * POST /api/admin/transcript/populate — 批量填充音频-文稿映射
 * Header: X-Admin-Token
 * Body: { mappings: [{ seriesName, audioSeriesId }] }
 */
async function handlePopulateTranscriptMapping(env, request, cors) {
  const token = request.headers.get('X-Admin-Token');
  if (!token || !env.ADMIN_TOKEN || !timingSafeCompare(token, env.ADMIN_TOKEN)) {
    return json({ error: 'Unauthorized' }, cors, 401);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, cors, 400); }

  const { mappings } = body;
  if (!mappings || !Array.isArray(mappings) || mappings.length === 0) {
    return json({ error: 'Missing or empty mappings array' }, cors, 400);
  }

  let updated = 0;
  const errors = [];

  for (const mapping of mappings) {
    const { seriesName, audioSeriesId } = mapping;
    if (!seriesName || !audioSeriesId) {
      errors.push({ seriesName, error: 'Missing seriesName or audioSeriesId' });
      continue;
    }

    try {
      const result = await env.DB.prepare(
        `UPDATE documents
         SET audio_series_id = ?, audio_episode_num = episode_num,
             updated_at = CURRENT_TIMESTAMP
         WHERE series_name = ? AND episode_num IS NOT NULL
           AND type = 'transcript' AND content IS NOT NULL AND content != ''`
      ).bind(audioSeriesId, seriesName).run();

      updated += result.meta.changes || 0;
    } catch (err) {
      errors.push({ seriesName, error: err.message });
    }
  }

  return json({
    success: true,
    updated,
    errors: errors.length > 0 ? errors : undefined,
  }, cors, 200, 'no-store');
}

/**
 * POST /api/admin/transcript/auto-match — 自动匹配音频系列与文库文稿
 * 通过字符串标准化匹配，无需 AI，零成本
 *
 * 流程：
 * 1. 从 D1 读取所有 foyue series
 * 2. 从 D1 读取所有 wenku documents 的 distinct series_name
 * 3. 标准化两侧名称，自动配对
 * 4. 批量 UPDATE documents 表
 */
async function handleAutoMatchTranscripts(env, request, cors) {
  const token = request.headers.get('X-Admin-Token');
  if (!token || !env.ADMIN_TOKEN || !timingSafeCompare(token, env.ADMIN_TOKEN)) {
    return json({ error: 'Unauthorized' }, cors, 401);
  }

  const db = env.DB;

  // 1. 获取所有音频系列
  const { results: allSeries } = await db.prepare(
    'SELECT id, title FROM series'
  ).all();

  // 2. 获取所有文库系列名（有文字内容的 transcript 类型）
  const { results: wenkuSeries } = await db.prepare(
    `SELECT DISTINCT series_name FROM documents
     WHERE type = 'transcript' AND series_name IS NOT NULL
       AND content IS NOT NULL AND content != ''
       AND (audio_series_id IS NULL OR audio_series_id = '')`
  ).all();

  if (!wenkuSeries.length) {
    return json({
      success: true,
      message: 'No unmatched wenku series found',
      matched: 0,
      updated: 0,
    }, cors, 200, 'no-store');
  }

  // 3. 标准化名称用于匹配
  function normalize(str) {
    return str
      .replace(/[（）()《》【】\[\]""''「」『』]/g, '')
      .replace(/[：:，,。.、；;！!？?\s]/g, '')
      .replace(/正编|续编|上册|下册|卷上|卷下|全卷/g, '')
      .toLowerCase();
  }

  // 为每个音频系列建立标准化名称 → id 的映射
  const audioMap = new Map();
  for (const s of allSeries) {
    audioMap.set(normalize(s.title), s.id);
    // 也用 title 的子串做匹配（处理音频标题比文库标题长的情况）
  }

  // 4. 匹配并更新
  let matched = 0;
  let updated = 0;
  const matches = [];
  const unmatched = [];

  for (const ws of wenkuSeries) {
    const normWenku = normalize(ws.series_name);
    let bestMatch = null;

    // 精确匹配
    if (audioMap.has(normWenku)) {
      bestMatch = audioMap.get(normWenku);
    }

    // 子串匹配：文库名包含音频名，或反之
    if (!bestMatch) {
      for (const [normAudio, audioId] of audioMap) {
        if (normWenku.includes(normAudio) || normAudio.includes(normWenku)) {
          bestMatch = audioId;
          break;
        }
      }
    }

    if (bestMatch) {
      matched++;
      matches.push({ wenkuSeries: ws.series_name, audioSeriesId: bestMatch });

      // 批量更新该系列的所有文档
      try {
        const result = await db.prepare(
          `UPDATE documents
           SET audio_series_id = ?, audio_episode_num = episode_num,
               updated_at = CURRENT_TIMESTAMP
           WHERE series_name = ? AND episode_num IS NOT NULL
             AND type = 'transcript' AND content IS NOT NULL AND content != ''
             AND (audio_series_id IS NULL OR audio_series_id = '')`
        ).bind(bestMatch, ws.series_name).run();
        updated += result.meta.changes || 0;
      } catch (err) {
        matches[matches.length - 1].error = err.message;
      }
    } else {
      unmatched.push(ws.series_name);
    }
  }

  return json({
    success: true,
    matched,
    updated,
    matches,
    unmatched: unmatched.length > 0 ? unmatched : undefined,
  }, cors, 200, 'no-store');
}

/**
 * POST /api/admin/transcript/transcribe — 增量 Whisper 音频转文字
 * 每次处理有限数量的集数，用完每日免费额度即止
 *
 * Body: { limit?: number } — 本次最多处理几集（默认 3）
 *
 * 流程：
 * 1. 找到有音频但无文稿的集数
 * 2. 下载音频，分段送 Whisper 转写
 * 3. 将转写结果写入 documents 表
 */
async function handleIncrementalTranscribe(env, request, cors) {
  const token = request.headers.get('X-Admin-Token');
  if (!token || !env.ADMIN_TOKEN || !timingSafeCompare(token, env.ADMIN_TOKEN)) {
    return json({ error: 'Unauthorized' }, cors, 401);
  }

  // 检查 AI 绑定
  if (!env.AI) {
    return json({ error: 'Workers AI not bound. Add [ai] binding to wrangler.toml' }, cors, 500);
  }

  let body = {};
  try { body = await request.json(); } catch { /* use defaults */ }
  const batchLimit = Math.min(body.limit || 3, 10); // 每次最多 10 集

  const db = env.DB;

  // 1. 找到有音频但无对应文稿的集数
  //    即：episodes 表中有 url，但 documents 表中没有匹配的 audio_series_id + audio_episode_num
  const { results: episodes } = await db.prepare(
    `SELECT e.series_id, e.episode_num, e.title, e.url, s.title as series_title
     FROM episodes e
     JOIN series s ON e.series_id = s.id
     WHERE e.url IS NOT NULL AND e.url != ''
       AND NOT EXISTS (
         SELECT 1 FROM documents d
         WHERE d.audio_series_id = e.series_id
           AND d.audio_episode_num = e.episode_num
           AND d.content IS NOT NULL AND d.content != ''
       )
     ORDER BY s.play_count DESC, e.episode_num ASC
     LIMIT ?`
  ).bind(batchLimit).all();

  if (!episodes.length) {
    return json({
      success: true,
      message: 'All episodes have transcripts. Nothing to transcribe.',
      processed: 0,
    }, cors, 200, 'no-store');
  }

  let processed = 0;
  const results = [];

  for (const ep of episodes) {
    const epResult = {
      seriesId: ep.series_id,
      episodeNum: ep.episode_num,
      title: ep.title,
    };

    try {
      // 2. 下载音频（只取前 10 分钟用于 Whisper，节省资源）
      //    Whisper 在 Workers AI 上限制 ~30s 输入，所以我们取一个小片段做测试
      const audioResponse = await fetch(ep.url, {
        headers: { 'Range': 'bytes=0-1048576' }, // 前 1MB（约 30-60 秒 MP3）
      });

      if (!audioResponse.ok) {
        throw new Error(`Audio download failed: ${audioResponse.status}`);
      }

      const audioBuffer = await audioResponse.arrayBuffer();

      // 3. Whisper 转写
      const transcription = await env.AI.run(
        '@cf/openai/whisper-large-v3-turbo',
        { audio: [...new Uint8Array(audioBuffer)] }
      );

      const text = transcription.text?.trim();
      if (!text) {
        throw new Error('Whisper returned empty transcription');
      }

      // 4. 写入 documents 表
      const docId = `whisper-${ep.series_id}-${String(ep.episode_num).padStart(3, '0')}`;
      const docTitle = `${ep.series_title} ${ep.title}（AI转写）`;

      await db.prepare(
        `INSERT OR REPLACE INTO documents
         (id, title, type, category, series_name, episode_num, format,
          r2_bucket, r2_key, content, audio_series_id, audio_episode_num,
          created_at, updated_at)
         VALUES (?, ?, 'transcript', '大安法师', ?, ?, 'txt',
                 'whisper', ?, ?, ?, ?,
                 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      ).bind(
        docId,
        docTitle,
        ep.series_title,
        ep.episode_num,
        `whisper/${ep.series_id}/${ep.episode_num}`,
        text,
        ep.series_id,
        ep.episode_num,
      ).run();

      epResult.status = 'completed';
      epResult.textLength = text.length;
      epResult.preview = text.slice(0, 100) + '...';
      processed++;
    } catch (err) {
      epResult.status = 'failed';
      epResult.error = err.message;

      // 如果是 AI 配额耗尽，停止处理
      if (err.message.includes('rate') || err.message.includes('limit') || err.message.includes('quota')) {
        epResult.note = 'Daily AI quota likely exhausted. Try again tomorrow.';
        results.push(epResult);
        break;
      }
    }

    results.push(epResult);
  }

  return json({
    success: true,
    processed,
    remaining: episodes.length - processed,
    results,
    hint: processed < episodes.length
      ? 'Some episodes were not processed. Run again tomorrow to continue.'
      : undefined,
  }, cors, 200, 'no-store');
}

// ============================================================
// AI 路由处理器
// ============================================================

/**
 * POST /api/ai/ask — RAG 问答
 * Body: { question, series_id?, episode_id? }
 */
async function handleAiAsk(env, request, cors) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const limit = await checkRateLimit(env, ip, 'ai_ask');
  if (!limit.allowed) {
    return json({ error: limit.reason }, cors, 429);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, cors, 400); }
  const { question, series_id, history } = body;

  if (!question || typeof question !== 'string' || question.length > 500) {
    return json({ error: '问题不能为空且不超过500字' }, cors, 400);
  }

  // 构建 Vectorize 过滤条件
  const filter = {};
  if (series_id && typeof series_id === 'string') filter.series_id = series_id.slice(0, 100);

  // 语义搜索
  let matches = [];
  try {
    matches = await semanticSearch(env, question, {
      topK: 5,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
    });
  } catch (err) {
    console.warn('Vectorize search failed, falling back to D1:', err.message);
  }

  // 从 D1 检索源文档
  let docs = await retrieveDocuments(env, matches);

  // Fallback: 如果 Vectorize 没有结果，尝试 D1 关键词搜索
  if (!docs.length) {
    try {
      const keywords = question.replace(/[？?！!，。、]/g, ' ').trim().slice(0, 50);
      let fallbackQuery;
      if (series_id) {
        fallbackQuery = env.DB.prepare(
          `SELECT id, title, content, category, series_name FROM documents
           WHERE audio_series_id = ? AND content IS NOT NULL
           ORDER BY episode_num ASC LIMIT 5`
        ).bind(series_id);
      } else {
        fallbackQuery = env.DB.prepare(
          `SELECT id, title, content, category, series_name FROM documents
           WHERE content IS NOT NULL AND (title LIKE ? OR content LIKE ?)
           LIMIT 5`
        ).bind(`%${keywords.slice(0, 20)}%`, `%${keywords.slice(0, 20)}%`);
      }
      const fallback = await fallbackQuery.all();
      if (fallback.results && fallback.results.length > 0) {
        docs = fallback.results;
      }
    } catch (err) {
      console.warn('D1 fallback search failed:', err.message);
    }
  }

  if (!docs.length) {
    return json({
      answer: '抱歉，暂未找到与您问题相关的内容。请尝试换一种方式提问。',
      sources: [],
      disclaimer: '以上回答由AI生成，仅供参考，请以原始经典为准。',
    }, cors);
  }

  // RAG 生成回答
  let result;
  try {
    result = await ragAnswer(env, question, docs, {
      history: Array.isArray(history) ? history : [],
    });
  } catch (err) {
    console.error('RAG answer failed:', err.message);
    return json({
      answer: '抱歉，AI 服务暂时不可用，请稍后再试。',
      sources: [],
      disclaimer: '以上回答由AI生成，仅供参考，请以原始经典为准。',
    }, cors, 503, 'no-store');
  }
  const answer = result?.response?.trim();

  if (!answer) {
    return json({
      answer: '抱歉，AI 暂时无法生成回答，请稍后再试。',
      sources: [],
      disclaimer: '以上回答由AI生成，仅供参考，请以原始经典为准。',
    }, cors, 200, 'no-store');
  }

  // 构建引用来源，附带文库链接信息
  const sources = matches.slice(0, 3).map(m => {
    const doc = docs.find(d => d.id === m.metadata.doc_id);
    return {
      title: m.metadata.title || '',
      doc_id: m.metadata.doc_id || '',
      score: Math.round(m.score * 100) / 100,
      category: doc?.category || m.metadata.category || '',
      series_name: doc?.series_name || m.metadata.series_name || '',
    };
  });

  return json({
    answer,
    sources,
    disclaimer: '以上回答由AI生成，仅供参考，请以原始经典为准。',
  }, cors, 200, 'no-store');
}

/**
 * GET /api/ai/summary/:documentId — 获取/生成内容摘要
 */
async function handleAiSummary(env, documentId, request, cors) {
  // 限流保护
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const limit = await checkRateLimit(env, ip, 'ai_summary');
  if (!limit.allowed) {
    return json({ error: limit.reason }, cors, 429);
  }

  // 检查缓存
  const cached = await env.DB.prepare(
    'SELECT summary FROM ai_summaries WHERE document_id = ?'
  ).bind(documentId).first();

  if (cached) {
    return json({
      summary: cached.summary,
      cached: true,
      disclaimer: 'AI生成摘要，仅供参考',
    }, cors);
  }

  // 查找对应文档：先按 id 查，再按 audio_series_id 聚合查询
  let doc = await env.DB.prepare(
    'SELECT id, title, content FROM documents WHERE id = ?'
  ).bind(documentId).first();

  if (!doc || !doc.content) {
    // 尝试按 audio_series_id 查找（音频系列摘要场景）
    const seriesDocs = await env.DB.prepare(
      `SELECT id, title, content, series_name FROM documents
       WHERE audio_series_id = ? AND content IS NOT NULL
       ORDER BY audio_episode_num ASC LIMIT 10`
    ).bind(documentId).all();

    if (seriesDocs.results && seriesDocs.results.length > 0) {
      // 聚合多个文档内容为单一摘要
      const combinedTitle = seriesDocs.results[0].series_name || documentId;
      const combinedContent = seriesDocs.results
        .map(d => `【${d.title}】\n${(d.content || '').slice(0, 2000)}`)
        .join('\n\n');
      doc = { id: documentId, title: combinedTitle, content: combinedContent };
    } else {
      return json({ error: '未找到该文档或文档无文本内容' }, cors, 404);
    }
  }

  // 生成摘要
  let summary;
  try {
    summary = await generateSummary(env, doc.title, doc.content);
  } catch (err) {
    console.error('generateSummary failed:', err.message);
    return json({ error: 'AI摘要服务暂时不可用，请稍后再试' }, cors, 503);
  }

  if (!summary || !summary.trim()) {
    return json({ error: 'AI未能生成有效摘要，请稍后再试' }, cors, 503);
  }

  // 缓存
  await env.DB.prepare(
    `INSERT OR REPLACE INTO ai_summaries (document_id, summary, model)
     VALUES (?, ?, ?)`
  ).bind(documentId, summary, AI_CONFIG.models.chat).run();

  return json({
    summary,
    cached: false,
    disclaimer: 'AI生成摘要，仅供参考',
  }, cors);
}

/**
 * GET /api/ai/search?q= — 语义搜索
 */
async function handleAiSearch(env, request, query, cors) {
  if (!query || query.length < 2 || query.length > 200) {
    return json({ error: '搜索词长度应为2-200个字符' }, cors, 400);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const limit = await checkRateLimit(env, ip, 'ai_search');
  if (!limit.allowed) {
    return json({ error: limit.reason }, cors, 429);
  }

  const matches = await semanticSearch(env, query, { topK: 10 });
  const docs = await retrieveDocuments(env, matches);

  // 构建搜索结果，包含片段
  const results = matches.map(m => {
    const doc = docs.find(d => d.id === m.metadata.doc_id);
    // 提取匹配片段
    let snippet = '';
    if (doc && doc.content) {
      const idx = doc.content.toLowerCase().indexOf(query.toLowerCase());
      if (idx >= 0) {
        const start = Math.max(0, idx - 50);
        const end = Math.min(doc.content.length, idx + query.length + 100);
        snippet = (start > 0 ? '...' : '') + doc.content.slice(start, end) + (end < doc.content.length ? '...' : '');
      } else {
        snippet = doc.content.slice(0, 150) + '...';
      }
    }
    return {
      doc_id: m.metadata.doc_id,
      title: doc ? doc.title : m.metadata.title || '',
      snippet,
      score: Math.round(m.score * 100) / 100,
      series_name: doc ? doc.series_name : '',
      audio_series_id: doc ? doc.audio_series_id : '',
    };
  });

  return json({ results, query }, cors);
}

// ============================================================
// 管理员路由处理器
// ============================================================

/**
 * POST /api/admin/embeddings/build — 批量构建向量嵌入
 * Header: X-Admin-Token
 */
async function handleBuildEmbeddings(env, request, cors) {
  const token = request.headers.get('X-Admin-Token');
  if (!token || !env.ADMIN_TOKEN || !timingSafeCompare(token, env.ADMIN_TOKEN)) {
    return json({ error: 'Unauthorized' }, cors, 401);
  }

  // 支持分批参数: ?limit=3&offset=0&retry=true
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '3', 10), 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const retryFailed = url.searchParams.get('retry') === 'true';

  // 获取待处理文档（跳过已完成的）
  let query;
  if (retryFailed) {
    // 只重试失败的
    query = env.DB.prepare(
      `SELECT d.id, d.title, d.content, d.category, d.series_name,
              d.audio_series_id, d.audio_episode_num
       FROM documents d
       INNER JOIN ai_embedding_jobs j ON j.document_id = d.id AND j.status = 'failed'
       WHERE d.content IS NOT NULL AND d.content != ''
       ORDER BY d.id LIMIT ? OFFSET ?`
    ).bind(limit, offset);
  } else {
    // 跳过已成功处理的
    query = env.DB.prepare(
      `SELECT d.id, d.title, d.content, d.category, d.series_name,
              d.audio_series_id, d.audio_episode_num
       FROM documents d
       LEFT JOIN ai_embedding_jobs j ON j.document_id = d.id AND j.status = 'completed'
       WHERE d.content IS NOT NULL AND d.content != '' AND j.id IS NULL
       ORDER BY d.id LIMIT ? OFFSET ?`
    ).bind(limit, offset);
  }

  const { results: documents } = await query.all();

  // 查询总待处理数
  const { results: [{ total }] } = retryFailed
    ? await env.DB.prepare(
        `SELECT COUNT(*) as total FROM documents d
         INNER JOIN ai_embedding_jobs j ON j.document_id = d.id AND j.status = 'failed'
         WHERE d.content IS NOT NULL AND d.content != ''`
      ).all()
    : await env.DB.prepare(
        `SELECT COUNT(*) as total FROM documents d
         LEFT JOIN ai_embedding_jobs j ON j.document_id = d.id AND j.status = 'completed'
         WHERE d.content IS NOT NULL AND d.content != '' AND j.id IS NULL`
      ).all();

  if (!documents.length) {
    return json({ success: true, message: '所有文档已处理完毕', remaining: 0 }, cors);
  }

  let totalChunks = 0;
  let processed = 0;
  const errors = [];

  for (const doc of documents) {
    try {
      const chunks = chunkText(doc.content, doc.id, {
        source: doc.audio_series_id ? 'foyue' : 'wenku',
        title: doc.title,
        category: doc.category || '',
        series_name: doc.series_name || '',
      });

      // 分批嵌入（每批最多 5 条，避免超 token 限制）
      for (let i = 0; i < chunks.length; i += 5) {
        const batch = chunks.slice(i, i + 5);
        const texts = batch.map(c => c.text);
        const embeddings = await generateEmbeddings(env, texts);

        const vectors = batch.map((chunk, idx) => ({
          id: chunk.id,
          values: embeddings[idx],
          metadata: chunk.metadata,
        }));

        await env.VECTORIZE.upsert(vectors);
        totalChunks += vectors.length;
      }

      // 记录状态（先删旧记录再插入，因为 document_id 无唯一约束）
      await env.DB.prepare(
        `DELETE FROM ai_embedding_jobs WHERE document_id = ?`
      ).bind(doc.id).run();
      await env.DB.prepare(
        `INSERT INTO ai_embedding_jobs
         (document_id, status, chunks_count, completed_at)
         VALUES (?, 'completed', ?, datetime('now'))`
      ).bind(doc.id, chunks.length).run();

      processed++;
    } catch (err) {
      const contentLen = doc.content?.length || 0;
      errors.push({ doc_id: doc.id, error: err.message, contentLength: contentLen });
      await env.DB.prepare(
        `DELETE FROM ai_embedding_jobs WHERE document_id = ?`
      ).bind(doc.id).run();
      await env.DB.prepare(
        `INSERT INTO ai_embedding_jobs
         (document_id, status, error)
         VALUES (?, 'failed', ?)`
      ).bind(doc.id, `${err.message} [contentLen=${contentLen}]`).run();
    }
  }

  const remaining = total - processed;
  return json({
    success: true,
    documentsProcessed: processed,
    totalChunks,
    remaining,
    hint: remaining > 0 ? `还有 ${remaining} 个文档待处理，请继续调用此 API` : '全部完成',
    errors: errors.length > 0 ? errors : undefined,
  }, cors);
}

/**
 * POST /api/admin/cleanup — 清理过期数据
 */
async function handleAdminCleanup(env, request, cors) {
  const token = request.headers.get('X-Admin-Token');
  if (!token || !env.ADMIN_TOKEN || !timingSafeCompare(token, env.ADMIN_TOKEN)) {
    return json({ error: 'Unauthorized' }, cors, 401);
  }

  await cleanupRateLimits(env);
  return json({ success: true, message: '过期限流记录已清理' }, cors);
}

// ============================================================
// 留言墙路由处理器
// ============================================================

/**
 * GET /api/messages — 获取留言列表（分页）
 * Query: ?page=1&limit=20
 */
async function handleGetMessages(db, url, cors) {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  const countResult = await db.prepare(
    "SELECT COUNT(*) as total FROM messages WHERE status = 'approved'"
  ).first();
  const total = countResult ? countResult.total : 0;

  const { results: messages } = await db.prepare(
    `SELECT id, nickname, content, pinned, created_at
     FROM messages WHERE status = 'approved'
     ORDER BY pinned DESC, created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();

  return json({ messages, total, page, limit }, cors, 200, 'public, max-age=30');
}

/**
 * POST /api/messages — 发布新留言
 * Body: { nickname?: string, content: string }
 */
async function handlePostMessage(db, request, cors) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, cors, 400); }

  const content = (body.content || '').trim();
  if (!content || content.length > 500) {
    return json({ error: '留言内容不能为空且不超过500字' }, cors, 400);
  }

  let nickname = (body.nickname || '').trim().slice(0, 20);
  if (!nickname) nickname = '莲友';

  // Simple IP-based rate limiting (max 5 messages per 10 minutes per IP)
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ipHash = await hashString(ip);

  const recentCount = await db.prepare(
    `SELECT COUNT(*) as cnt FROM messages
     WHERE ip_hash = ? AND created_at > datetime('now', '-10 minutes')`
  ).bind(ipHash).first();

  if (recentCount && recentCount.cnt >= 5) {
    return json({ error: '发言过于频繁，请稍后再试' }, cors, 429);
  }

  // Insert message
  const result = await db.prepare(
    `INSERT INTO messages (nickname, content, ip_hash, status, created_at, updated_at)
     VALUES (?, ?, ?, 'approved', datetime('now'), datetime('now'))`
  ).bind(nickname, content, ipHash).run();

  const newId = result.meta?.last_row_id || 0;

  return json({
    success: true,
    message: {
      id: newId,
      nickname,
      content,
      pinned: 0,
      created_at: new Date().toISOString(),
    },
  }, cors, 201, 'no-store');
}

// ============================================================
// 管理后台处理器
// ============================================================

/** GET /api/admin/stats */
async function handleAdminStats(db, cors) {
  const totalSeries = await db.prepare('SELECT COUNT(*) as c FROM series').first();
  const totalEpisodes = await db.prepare('SELECT COUNT(*) as c FROM episodes').first();
  const totalPlays = await db.prepare('SELECT COALESCE(SUM(play_count),0) as c FROM series').first();
  const totalAppreciations = await db.prepare('SELECT COUNT(*) as c FROM appreciations').first();
  const totalMessages = await db.prepare('SELECT COUNT(*) as c FROM messages').first();
  const pendingMessages = await db.prepare("SELECT COUNT(*) as c FROM messages WHERE status='pending'").first();

  const plays30 = await db.prepare(
    `SELECT DATE(played_at) as date, COUNT(*) as count FROM play_logs
     WHERE played_at >= datetime('now','-30 days')
     GROUP BY DATE(played_at) ORDER BY date`
  ).all();

  const topSeries = await db.prepare(
    'SELECT id, title, speaker, play_count FROM series ORDER BY play_count DESC LIMIT 10'
  ).all();

  const topEpisodes = await db.prepare(
    `SELECT e.series_id, e.episode_num, e.title, e.play_count, s.title as series_title
     FROM episodes e JOIN series s ON e.series_id = s.id
     ORDER BY e.play_count DESC LIMIT 10`
  ).all();

  const origins = await db.prepare(
    "SELECT origin, COUNT(*) as count FROM play_logs WHERE origin!='' GROUP BY origin ORDER BY count DESC"
  ).all();

  const msgStats = await db.prepare(
    'SELECT status, COUNT(*) as count FROM messages GROUP BY status'
  ).all();
  const msgMap = {};
  for (const r of (msgStats.results || [])) msgMap[r.status] = r.count;

  return json({
    overview: {
      totalSeries: totalSeries?.c || 0,
      totalEpisodes: totalEpisodes?.c || 0,
      totalPlays: totalPlays?.c || 0,
      totalAppreciations: totalAppreciations?.c || 0,
      totalMessages: totalMessages?.c || 0,
      pendingMessages: pendingMessages?.c || 0,
    },
    playsLast30Days: plays30.results || [],
    topSeries: topSeries.results || [],
    topEpisodes: topEpisodes.results || [],
    originStats: origins.results || [],
    messageStats: { approved: msgMap.approved || 0, pending: msgMap.pending || 0, hidden: msgMap.hidden || 0 },
  }, cors, 200, 'private, max-age=60');
}

/** GET /api/admin/messages */
async function handleAdminGetMessages(db, url, cors) {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const status = url.searchParams.get('status') || 'all';
  const offset = (page - 1) * limit;

  let countQ, listQ;
  if (status === 'all') {
    countQ = db.prepare('SELECT COUNT(*) as total FROM messages');
    listQ = db.prepare('SELECT id, nickname, content, ip_hash, status, pinned, created_at FROM messages ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(limit, offset);
  } else {
    countQ = db.prepare('SELECT COUNT(*) as total FROM messages WHERE status=?').bind(status);
    listQ = db.prepare('SELECT id, nickname, content, ip_hash, status, pinned, created_at FROM messages WHERE status=? ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(status, limit, offset);
  }

  const total = (await countQ.first())?.total || 0;
  const { results: messages } = await listQ.all();
  return json({ messages, total, page, limit }, cors, 200, 'no-store');
}

/** PUT /api/admin/messages/:id */
async function handleAdminUpdateMessage(db, id, body, cors) {
  const fields = [];
  const vals = [];
  if (body.status !== undefined) { fields.push('status=?'); vals.push(body.status); }
  if (body.pinned !== undefined) { fields.push('pinned=?'); vals.push(body.pinned ? 1 : 0); }
  if (!fields.length) return json({ error: 'No fields to update' }, cors, 400);
  fields.push("updated_at=datetime('now')");
  vals.push(id);
  await db.prepare(`UPDATE messages SET ${fields.join(',')} WHERE id=?`).bind(...vals).run();
  const updated = await db.prepare('SELECT id, nickname, content, ip_hash, status, pinned, created_at FROM messages WHERE id=?').bind(id).first();
  return json({ success: true, message: updated }, cors, 200, 'no-store');
}

/** DELETE /api/admin/messages/:id */
async function handleAdminDeleteMessage(db, id, cors) {
  await db.prepare('DELETE FROM messages WHERE id=?').bind(id).run();
  return json({ success: true }, cors, 200, 'no-store');
}

/** GET /api/admin/categories */
async function handleAdminGetCategories(db, cors) {
  const { results } = await db.prepare(
    `SELECT c.id, c.title, c.title_en, c.sort_order,
            (SELECT COUNT(*) FROM series WHERE category_id=c.id) as series_count
     FROM categories c ORDER BY c.sort_order`
  ).all();
  return json({ categories: results || [] }, cors, 200, 'no-store');
}

/** PUT /api/admin/categories/:id */
async function handleAdminUpdateCategory(db, id, body, cors) {
  const fields = [];
  const vals = [];
  if (body.title !== undefined) { fields.push('title=?'); vals.push(body.title); }
  if (body.title_en !== undefined) { fields.push('title_en=?'); vals.push(body.title_en); }
  if (body.sort_order !== undefined) { fields.push('sort_order=?'); vals.push(body.sort_order); }
  if (!fields.length) return json({ error: 'No fields to update' }, cors, 400);
  vals.push(id);
  await db.prepare(`UPDATE categories SET ${fields.join(',')} WHERE id=?`).bind(...vals).run();
  return json({ success: true }, cors, 200, 'no-store');
}

/** GET /api/admin/series */
async function handleAdminGetSeries(db, url, cors) {
  const category = url.searchParams.get('category') || '';
  let q;
  if (category && category !== 'all') {
    q = db.prepare(
      `SELECT s.id, s.title, s.title_en, s.speaker, s.speaker_en, s.category_id,
              s.bucket, s.folder, s.total_episodes, s.intro, s.sort_order, s.play_count,
              (SELECT COUNT(*) FROM episodes WHERE series_id=s.id) as episode_count
       FROM series s WHERE s.category_id=? ORDER BY s.sort_order`
    ).bind(category);
  } else {
    q = db.prepare(
      `SELECT s.id, s.title, s.title_en, s.speaker, s.speaker_en, s.category_id,
              s.bucket, s.folder, s.total_episodes, s.intro, s.sort_order, s.play_count,
              (SELECT COUNT(*) FROM episodes WHERE series_id=s.id) as episode_count
       FROM series s ORDER BY s.sort_order`
    );
  }
  const { results } = await q.all();
  return json({ series: results || [] }, cors, 200, 'no-store');
}

/** POST /api/admin/series */
async function handleAdminCreateSeries(db, body, cors) {
  const { id, category_id, title, title_en, speaker, speaker_en, bucket, folder, total_episodes, intro, sort_order } = body;
  if (!id || !category_id || !title) return json({ error: 'Missing required fields (id, category_id, title)' }, cors, 400);
  await db.prepare(
    `INSERT INTO series (id, category_id, title, title_en, speaker, speaker_en, bucket, folder, total_episodes, intro, sort_order)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(id, category_id, title || '', title_en || '', speaker || '', speaker_en || '', bucket || '', folder || '', total_episodes || 0, intro || '', sort_order || 0).run();
  return json({ success: true, id }, cors, 201, 'no-store');
}

/** PUT /api/admin/series/:id */
async function handleAdminUpdateSeries(db, id, body, cors) {
  const fields = [];
  const vals = [];
  const allowed = ['category_id','title','title_en','speaker','speaker_en','bucket','folder','total_episodes','intro','sort_order'];
  for (const k of allowed) {
    if (body[k] !== undefined) { fields.push(`${k}=?`); vals.push(body[k]); }
  }
  if (!fields.length) return json({ error: 'No fields to update' }, cors, 400);
  vals.push(id);
  await db.prepare(`UPDATE series SET ${fields.join(',')} WHERE id=?`).bind(...vals).run();
  return json({ success: true }, cors, 200, 'no-store');
}

/** DELETE /api/admin/series/:id */
async function handleAdminDeleteSeries(db, id, cors) {
  const epResult = await db.prepare('DELETE FROM episodes WHERE series_id=?').bind(id).run();
  await db.prepare('DELETE FROM series WHERE id=?').bind(id).run();
  return json({ success: true, deletedEpisodes: epResult.meta?.changes || 0 }, cors, 200, 'no-store');
}

/** GET /api/admin/episodes/:seriesId */
async function handleAdminGetEpisodes(db, seriesId, cors) {
  const series = await db.prepare('SELECT id, title FROM series WHERE id=?').bind(seriesId).first();
  const { results } = await db.prepare(
    'SELECT id, series_id, episode_num, title, file_name, url, intro, story_number, play_count FROM episodes WHERE series_id=? ORDER BY episode_num'
  ).bind(seriesId).all();
  return json({ episodes: results || [], series: series || { id: seriesId } }, cors, 200, 'no-store');
}

/** POST /api/admin/episodes */
async function handleAdminCreateEpisode(db, body, cors) {
  const { series_id, episode_num, title, file_name, url, intro, story_number } = body;
  if (!series_id || !episode_num || !title || !file_name) return json({ error: 'Missing required fields' }, cors, 400);
  await db.prepare(
    'INSERT INTO episodes (series_id, episode_num, title, file_name, url, intro, story_number) VALUES (?,?,?,?,?,?,?)'
  ).bind(series_id, episode_num, title, file_name, url || '', intro || null, story_number || null).run();
  return json({ success: true }, cors, 201, 'no-store');
}

/** PUT /api/admin/episodes/:id */
async function handleAdminUpdateEpisode(db, id, body, cors) {
  const fields = [];
  const vals = [];
  const allowed = ['episode_num','title','file_name','url','intro','story_number'];
  for (const k of allowed) {
    if (body[k] !== undefined) { fields.push(`${k}=?`); vals.push(body[k]); }
  }
  if (!fields.length) return json({ error: 'No fields to update' }, cors, 400);
  vals.push(id);
  await db.prepare(`UPDATE episodes SET ${fields.join(',')} WHERE id=?`).bind(...vals).run();
  return json({ success: true }, cors, 200, 'no-store');
}

/** DELETE /api/admin/episodes/:id */
async function handleAdminDeleteEpisode(db, id, cors) {
  await db.prepare('DELETE FROM episodes WHERE id=?').bind(id).run();
  return json({ success: true }, cors, 200, 'no-store');
}
