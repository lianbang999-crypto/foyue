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
  const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  const cors = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
      return json(await appreciate(db, am[1], request), cors, 200, 'no-store');
    }

    // GET /api/stats
    if (path === '/api/stats' && method === 'GET') {
      const origin = url.searchParams.get('origin') || '';
      return json(await getStats(db, origin), cors, 200, 'private, no-cache');
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

    // ==================== 管理员路由 ====================

    // POST /api/admin/embeddings/build — 批量构建向量
    if (path === '/api/admin/embeddings/build' && method === 'POST') {
      return await handleBuildEmbeddings(env, request, cors);
    }

    // POST /api/admin/cleanup — 清理过期限流记录
    if (path === '/api/admin/cleanup' && method === 'POST') {
      return await handleAdminCleanup(env, request, cors);
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
  const categories = await db.prepare(
    'SELECT id, title, title_en, sort_order FROM categories ORDER BY sort_order'
  ).all();
  const result = [];
  for (const cat of categories.results) {
    const series = await db.prepare(
      `SELECT id, title, title_en, speaker, speaker_en, bucket, folder,
              total_episodes, intro, play_count, sort_order
       FROM series WHERE category_id = ? ORDER BY sort_order`
    ).bind(cat.id).all();
    result.push({
      id: cat.id, title: cat.title, titleEn: cat.title_en,
      series: series.results.map(s => ({
        id: s.id, title: s.title, titleEn: s.title_en,
        speaker: s.speaker, speakerEn: s.speaker_en,
        bucket: s.bucket, folder: s.folder,
        totalEpisodes: s.total_episodes, intro: s.intro,
        playCount: s.play_count,
      })),
    });
  }
  return { categories: result };
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

async function appreciate(db, seriesId, request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const clientHash = await hashString(ip);
  const today = new Date().toISOString().split('T')[0];
  const origin = new URL(request.url).hostname;

  const existing = await db.prepare(
    'SELECT id FROM appreciations WHERE series_id = ? AND client_hash = ? AND created_at >= ?'
  ).bind(seriesId, clientHash, today).first();

  if (existing) {
    const count = await db.prepare('SELECT COUNT(*) as total FROM appreciations WHERE series_id = ?').bind(seriesId).first();
    return { success: false, message: 'already_appreciated_today', total: count.total };
  }

  await db.prepare('INSERT INTO appreciations (series_id, client_hash, origin) VALUES (?, ?, ?)').bind(seriesId, clientHash, origin).run();
  const count = await db.prepare('SELECT COUNT(*) as total FROM appreciations WHERE series_id = ?').bind(seriesId).first();
  return { success: true, total: count.total };
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
  const { question, series_id } = body;

  if (!question || typeof question !== 'string' || question.length > 500) {
    return json({ error: '问题不能为空且不超过500字' }, cors, 400);
  }

  // 构建 Vectorize 过滤条件
  const filter = {};
  if (series_id && typeof series_id === 'string') filter.series_id = series_id.slice(0, 100);

  // 语义搜索
  const matches = await semanticSearch(env, question, {
    topK: 5,
    filter: Object.keys(filter).length > 0 ? filter : undefined,
  });

  // 从 D1 检索源文档
  const docs = await retrieveDocuments(env, matches);

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
    result = await ragAnswer(env, question, docs);
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

  const sources = matches.slice(0, 3).map(m => ({
    title: m.metadata.title || '',
    doc_id: m.metadata.doc_id || '',
    score: Math.round(m.score * 100) / 100,
  }));

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

  // 查找对应文档
  const doc = await env.DB.prepare(
    'SELECT id, title, content FROM documents WHERE id = ?'
  ).bind(documentId).first();

  if (!doc || !doc.content) {
    return json({ error: '未找到该文档或文档无文本内容' }, cors, 404);
  }

  // 生成摘要
  const summary = await generateSummary(env, doc.title, doc.content);

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

  // 获取所有有文本内容的文档
  const { results: documents } = await env.DB.prepare(
    `SELECT id, title, content, category, series_name,
            audio_series_id, audio_episode_num
     FROM documents WHERE content IS NOT NULL AND content != ''`
  ).all();

  if (!documents.length) {
    return json({ error: '没有找到可用于嵌入的文档' }, cors, 404);
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

      // 分批处理（bge-m3 每次最多 100 条）
      for (let i = 0; i < chunks.length; i += 100) {
        const batch = chunks.slice(i, i + 100);
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

      // 记录状态
      await env.DB.prepare(
        `INSERT OR REPLACE INTO ai_embedding_jobs
         (document_id, status, chunks_count, completed_at)
         VALUES (?, 'completed', ?, datetime('now'))`
      ).bind(doc.id, chunks.length).run();

      processed++;
    } catch (err) {
      errors.push({ doc_id: doc.id, error: err.message });
      await env.DB.prepare(
        `INSERT OR REPLACE INTO ai_embedding_jobs
         (document_id, status, error)
         VALUES (?, 'failed', ?)`
      ).bind(doc.id, err.message).run();
    }
  }

  return json({
    success: true,
    documentsProcessed: processed,
    totalChunks,
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
