/**
 * Pages Function: /api/*
 * 处理所有 /api/ 路由请求
 */

import {
  AI_CONFIG, GATEWAY_PROFILES, chunkText, generateEmbeddings,
  checkRateLimit, cleanupRateLimits, timingSafeCompare,
  extractAIResponse, stripThinkTags, getAICallStats, runAIWithLogging,
} from '../lib/ai-utils.js';
import { buildAudioUrl, OPUS_CATEGORIES } from '../lib/audio-utils.js';
import {
  json,
  buildCategoriesCacheKey,
  buildCategoryCacheKey,
  getEdgeCachedJson,
} from '../lib/http-utils.js';
import {
  hashString,
  getTodayBeijing,
  hashIP,
} from '../lib/crypto-utils.js';
import {
  handleAdminGetMessages,
  handleAdminUpdateMessage,
  handleAdminDeleteMessage,
} from '../lib/admin-messages.js';
import {
  handleAdminGetCategories,
  handleAdminUpdateCategory,
  handleAdminGetSeries,
  handleAdminCreateSeries,
  handleAdminUpdateSeries,
  handleAdminDeleteSeries,
  handleAdminGetEpisodes,
  handleAdminCreateEpisode,
  handleAdminUpdateEpisode,
  handleAdminDeleteEpisode,
} from '../lib/admin-content.js';
import {
  handleTranscriptAvailability,
  handleGetTranscript,
  handlePopulateTranscriptMapping,
  handleAutoMatchTranscripts,
  handleIncrementalTranscribe,
  handleGetChapters,
  handleGenerateChapters,
} from '../lib/transcript-routes.js';
import {
  handleWenkuSeries,
  handleWenkuDocuments,
  handleWenkuDocument,
  handleWenkuSearch,
  handleWenkuReadCount,
  handleWenkuSync,
  handleWenkuSyncStatus,
} from '../lib/wenku-routes.js';
import {
  handleAiAsk,
  handleAiAskStream,
  handleAiSummary,
  handleAiSearch,
  handleDailyRecommend,
  handleVoiceToText,
  handlePersonalizedRecommend,
} from '../lib/ai-routes.js';

export async function onRequest(context) {
  const { request, env, waitUntil } = context;
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
    const opusSupported = url.searchParams.get('opus') === '1';
    const homeView = url.searchParams.get('home') === '1';
    if (path === '/api/categories' && method === 'GET') {
      return getEdgeCachedJson(
        request,
        buildCategoriesCacheKey(url, { opusSupported, homeView }),
        waitUntil,
        async () => json(
          await (homeView ? getHomeCategories(db, opusSupported) : getCategories(db, opusSupported)),
          cors,
          200,
          'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400'
        )
      );
    }

    const categoryMatch = path.match(/^\/api\/category\/([^/]+)$/);
    if (categoryMatch && method === 'GET') {
      const categoryId = decodeURIComponent(categoryMatch[1]);
      return getEdgeCachedJson(
        request,
        buildCategoryCacheKey(url, { opusSupported, categoryId }),
        waitUntil,
        async () => json(
          await getCategorySummary(db, categoryId),
          cors,
          200,
          'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400'
        )
      );
    }

    // GET /api/series/:id
    const sm = path.match(/^\/api\/series\/([^/]+)$/);
    if (sm && method === 'GET') {
      return json(await getSeriesDetail(db, sm[1], opusSupported), cors);
    }

    // GET /api/series/:id/episodes
    const em = path.match(/^\/api\/series\/([^/]+)\/episodes$/);
    if (em && method === 'GET') {
      return json(await getEpisodes(db, em[1], opusSupported), cors);
    }

    // POST /api/play-count
    if (path === '/api/play-count' && method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, cors, 400); }
      const result = await recordPlay(db, body, request);
      return json(result, cors, result?.error ? 400 : 200, 'no-store');
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
      return await handleTranscriptAvailability(db, ta[1], cors, json);
    }

    // GET /api/transcript/:seriesId/:episodeNum — 获取文稿内容
    const tm = path.match(/^\/api\/transcript\/([^/]+)\/(\d+)$/);
    if (tm && method === 'GET') {
      return await handleGetTranscript(db, tm[1], tm[2], cors, json);
    }

    // POST /api/admin/transcript/populate — 填充音频-文稿映射
    if (path === '/api/admin/transcript/populate' && method === 'POST') {
      return await handlePopulateTranscriptMapping(env, request, cors, json);
    }

    // POST /api/admin/transcript/auto-match — 自动匹配音频与文稿
    if (path === '/api/admin/transcript/auto-match' && method === 'POST') {
      return await handleAutoMatchTranscripts(env, request, cors, json);
    }

    // POST /api/admin/transcript/transcribe — 增量 Whisper 转写
    if (path === '/api/admin/transcript/transcribe' && method === 'POST') {
      return await handleIncrementalTranscribe(env, request, cors, json);
    }

    // ==================== AI 路由 ====================

    // POST /api/ai/ask — RAG 问答
    if (path === '/api/ai/ask' && method === 'POST') {
      return await handleAiAsk(env, request, cors, context, json);
    }

    // POST /api/ai/ask-stream — RAG 问答（SSE 流式）
    if (path === '/api/ai/ask-stream' && method === 'POST') {
      return await handleAiAskStream(env, request, cors, context, json);
    }

    // GET /api/ai/summary/:id — 获取/生成集摘要
    const sumMatch = path.match(/^\/api\/ai\/summary\/([^/]+)$/);
    if (sumMatch && method === 'GET') {
      return await handleAiSummary(env, sumMatch[1], request, cors, context, json);
    }

    // GET /api/ai/search?q= — 语义搜索
    if (path === '/api/ai/search' && method === 'GET') {
      const q = url.searchParams.get('q');
      return await handleAiSearch(env, request, q, cors, context, json);
    }

    // GET /api/ai/daily-recommend — AI 每日推荐
    if (path === '/api/ai/daily-recommend' && method === 'GET') {
      return await handleDailyRecommend(env, cors, context, json);
    }

    // POST /api/ai/voice-to-text — Whisper 语音识别
    if (path === '/api/ai/voice-to-text' && method === 'POST') {
      return await handleVoiceToText(env, request, cors, json);
    }

    // GET /api/ai/personalized-recommend — 个性化推荐
    if (path === '/api/ai/personalized-recommend' && method === 'GET') {
      return await handlePersonalizedRecommend(env, request, url, cors, json);
    }

    // GET /api/chapters/:seriesId/:episodeNum — 获取章节标记
    const chapMatch = path.match(/^\/api\/chapters\/([^/]+)\/(\d+)$/);
    if (chapMatch && method === 'GET') {
      return await handleGetChapters(env, chapMatch[1], parseInt(chapMatch[2], 10), cors, json);
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

    // ==================== 共修社区路由 ====================

    // GET /api/gongxiu — 获取今日共修统计 + 最新条目
    if (path === '/api/gongxiu' && method === 'GET') {
      return await handleGetGongxiu(db, url, cors);
    }

    // POST /api/gongxiu — 提交共修回向记录
    if (path === '/api/gongxiu' && method === 'POST') {
      return await handlePostGongxiu(db, request, cors);
    }

    // ==================== 管理员路由 ====================

    // POST /api/admin/embeddings/build — 批量构建向量
    if (path === '/api/admin/embeddings/build' && method === 'POST') {
      return await handleBuildEmbeddings(env, request, cors);
    }

    // GET /api/admin/embeddings/status — 查看向量构建状态
    if (path === '/api/admin/embeddings/status' && method === 'GET') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      return await handleEmbeddingStatus(db, cors);
    }

    // POST /api/admin/chapters/generate — 生成章节标记
    if (path === '/api/admin/chapters/generate' && method === 'POST') {
      return await handleGenerateChapters(env, request, cors, json);
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
          const resp = await runAIWithLogging(env, AI_CONFIG.models.embedding, { text: [firstChunk.text] }, GATEWAY_PROFILES.diagnostic, 'diagnostic', context);
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
        const resp = await runAIWithLogging(env, AI_CONFIG.models.embedding, { text: [testText] }, GATEWAY_PROFILES.diagnostic, 'diagnostic', context);
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
        const rawResponse = await runAIWithLogging(
          env,
          model,
          {
            messages: [
              { role: 'system', content: '你是一个佛学助手。' },
              { role: 'user', content: testPrompt },
            ],
            max_tokens: 200,
            temperature: 0.3,
          },
          GATEWAY_PROFILES.diagnostic,
          'diagnostic',
          context
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

    // GET /api/admin/ai-stats — AI Gateway 调用统计
    if (path === '/api/admin/ai-stats' && method === 'GET') {
      const tk = url.searchParams.get('token');
      if (!tk || !env.ADMIN_TOKEN || !timingSafeCompare(tk, env.ADMIN_TOKEN)) {
        return json({ error: 'Unauthorized' }, cors, 401);
      }
      const days = parseInt(url.searchParams.get('days') || '7', 10);
      try {
        const stats = await getAICallStats(env, { days: Math.min(days, 90) });
        // 额外获取 Gateway 配置快照
        const profiles = {};
        for (const [key, val] of Object.entries(GATEWAY_PROFILES)) {
          profiles[key] = { cacheTtl: val.cacheTtl || null, skipCache: val.skipCache };
        }
        return json({ success: true, days, stats, gatewayProfiles: profiles }, cors);
      } catch (err) {
        return json({ success: false, error: err.message }, cors);
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
      return await handleAdminGetMessages(db, url, cors, json);
    }

    // PUT /api/admin/messages/:id — update message status/pin
    const admMsgPut = path.match(/^\/api\/admin\/messages\/(\d+)$/);
    if (admMsgPut && method === 'PUT') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      let body; try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, cors, 400); }
      return await handleAdminUpdateMessage(db, parseInt(admMsgPut[1], 10), body, cors, json);
    }

    // DELETE /api/admin/messages/:id
    const admMsgDel = path.match(/^\/api\/admin\/messages\/(\d+)$/);
    if (admMsgDel && method === 'DELETE') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      return await handleAdminDeleteMessage(db, parseInt(admMsgDel[1], 10), cors, json);
    }

    // GET /api/admin/categories — list categories with series count
    if (path === '/api/admin/categories' && method === 'GET') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      return await handleAdminGetCategories(db, cors, json);
    }

    // PUT /api/admin/categories/:id
    const admCatPut = path.match(/^\/api\/admin\/categories\/([^/]+)$/);
    if (admCatPut && method === 'PUT') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      let body; try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, cors, 400); }
      return await handleAdminUpdateCategory(db, admCatPut[1], body, cors, json);
    }

    // GET /api/admin/series — list series
    if (path === '/api/admin/series' && method === 'GET') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      return await handleAdminGetSeries(db, url, cors, json);
    }

    // POST /api/admin/series — create series
    if (path === '/api/admin/series' && method === 'POST') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      let body; try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, cors, 400); }
      return await handleAdminCreateSeries(db, body, cors, json);
    }

    // PUT /api/admin/series/:id
    const admSerPut = path.match(/^\/api\/admin\/series\/([^/]+)$/);
    if (admSerPut && method === 'PUT') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      let body; try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, cors, 400); }
      return await handleAdminUpdateSeries(db, admSerPut[1], body, cors, json);
    }

    // DELETE /api/admin/series/:id
    const admSerDel = path.match(/^\/api\/admin\/series\/([^/]+)$/);
    if (admSerDel && method === 'DELETE') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      return await handleAdminDeleteSeries(db, admSerDel[1], cors, json);
    }

    // GET /api/admin/episodes/:seriesId
    const admEpGet = path.match(/^\/api\/admin\/episodes\/([^/]+)$/);
    if (admEpGet && method === 'GET') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      return await handleAdminGetEpisodes(db, admEpGet[1], cors, json);
    }

    // POST /api/admin/episodes
    if (path === '/api/admin/episodes' && method === 'POST') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      let body; try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, cors, 400); }
      return await handleAdminCreateEpisode(db, body, cors, json);
    }

    // PUT /api/admin/episodes/:id
    const admEpPut = path.match(/^\/api\/admin\/episodes\/(\d+)$/);
    if (admEpPut && method === 'PUT') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      let body; try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, cors, 400); }
      return await handleAdminUpdateEpisode(db, parseInt(admEpPut[1], 10), body, cors, json);
    }

    // DELETE /api/admin/episodes/:id
    const admEpDel = path.match(/^\/api\/admin\/episodes\/(\d+)$/);
    if (admEpDel && method === 'DELETE') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      return await handleAdminDeleteEpisode(db, parseInt(admEpDel[1], 10), cors, json);
    }

    // ==================== 文库路由 ====================

    // GET /api/wenku/series — 获取文库系列列表
    if (path === '/api/wenku/series' && method === 'GET') {
      return json(await handleWenkuSeries(db), cors);
    }

    // GET /api/wenku/documents?series= — 获取系列文档列表
    if (path === '/api/wenku/documents' && method === 'GET') {
      const series = url.searchParams.get('series');
      if (!series) return json({ error: 'Missing series parameter' }, cors, 400);
      return json(await handleWenkuDocuments(db, series), cors);
    }

    // GET /api/wenku/documents/:id — 获取单个文档（含内容）
    const wenkuDocMatch = path.match(/^\/api\/wenku\/documents\/(.+)$/);
    if (wenkuDocMatch && method === 'GET') {
      return json(await handleWenkuDocument(db, decodeURIComponent(wenkuDocMatch[1])), cors);
    }

    // GET /api/wenku/search?q= — 搜索文库
    if (path === '/api/wenku/search' && method === 'GET') {
      const q = url.searchParams.get('q');
      if (!q) return json({ documents: [] }, cors);
      return json(await handleWenkuSearch(db, q), cors);
    }

    // POST /api/wenku/read-count — 记录阅读
    if (path === '/api/wenku/read-count' && method === 'POST') {
      let body; try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, cors, 400); }
      return json(await handleWenkuReadCount(db, body.documentId), cors, 200, 'no-store');
    }

    // POST /api/admin/wenku-sync — R2-to-D1 同步（需管理员权限）
    if (path === '/api/admin/wenku-sync' && method === 'POST') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      return await handleWenkuSync(env, cors, json);
    }

    // GET /api/admin/wenku-sync-status — 查看同步状态
    if (path === '/api/admin/wenku-sync-status' && method === 'GET') {
      const authErr = requireAdmin();
      if (authErr) return authErr;
      return await handleWenkuSyncStatus(db, cors, json);
    }

    return json({ error: 'Not Found' }, cors, 404);

  } catch (err) {
    console.error('API Error:', err);
    return json({ error: 'Internal Server Error' }, cors, 500);
  }
}

async function getCategories(db, opusSupported) {
  // 一次性 JOIN categories + series + episodes，避免 N+1 查询
  const result = await db.prepare(`
    SELECT
      c.id as cat_id, c.title as cat_title, c.title_en as cat_title_en, c.sort_order as cat_sort,
      s.id as series_id, s.title, s.title_en, s.speaker, s.speaker_en,
      s.bucket, s.folder, s.total_episodes, s.intro, s.play_count, s.sort_order,
      e.episode_num as ep_num, e.title as ep_title, e.file_name as ep_file,
      e.intro as ep_intro, e.story_number as ep_story, e.duration as ep_duration,
      e.play_count as ep_play_count
    FROM categories c
    LEFT JOIN series s ON c.id = s.category_id
    LEFT JOIN episodes e ON s.id = e.series_id
    ORDER BY c.sort_order, s.sort_order, e.episode_num
  `).all();

  return assembleCategories(result.results, opusSupported, 'full');
}

async function getHomeCategories(db, opusSupported) {
  const result = await db.prepare(`
    SELECT
      c.id as cat_id, c.title as cat_title, c.title_en as cat_title_en, c.sort_order as cat_sort,
      s.id as series_id, s.title, s.title_en, s.speaker, s.speaker_en,
      s.bucket, s.folder, s.total_episodes, s.intro, s.play_count, s.sort_order,
      e.episode_num as ep_num, e.title as ep_title, e.file_name as ep_file,
      e.intro as ep_intro, e.story_number as ep_story, e.duration as ep_duration,
      e.play_count as ep_play_count
    FROM categories c
    LEFT JOIN series s ON c.id = s.category_id
    LEFT JOIN episodes e ON s.id = e.series_id
    WHERE c.id = 'fohao'
    ORDER BY c.sort_order, s.sort_order, e.episode_num
  `).all();

  return assembleCategories(result.results, opusSupported, 'home');
}

async function getCategorySummary(db, categoryId) {
  const result = await db.prepare(`
    SELECT
      c.id as cat_id, c.title as cat_title, c.title_en as cat_title_en, c.sort_order as cat_sort,
      s.id as series_id, s.title, s.title_en, s.speaker, s.speaker_en,
      s.bucket, s.folder, s.total_episodes, s.intro, s.play_count, s.sort_order
    FROM categories c
    LEFT JOIN series s ON c.id = s.category_id
    WHERE c.id = ?
    ORDER BY c.sort_order, s.sort_order
  `).bind(categoryId).all();

  if (!result.results.length) return { error: 'Category not found' };

  const category = {
    id: result.results[0].cat_id,
    title: result.results[0].cat_title,
    titleEn: result.results[0].cat_title_en,
    series: [],
    _categoryLoaded: true,
  };

  for (const row of result.results) {
    if (!row.series_id) continue;
    category.series.push({
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
      episodes: null,
    });
  }

  return { category };
}

function assembleCategories(rows, opusSupported, mode = 'full') {

  // 在内存中组装嵌套结构：categories → series → episodes
  const catMap = new Map();
  const serMap = new Map();

  for (const row of rows) {
    if (!catMap.has(row.cat_id)) {
      catMap.set(row.cat_id, {
        id: row.cat_id,
        title: row.cat_title,
        titleEn: row.cat_title_en,
        series: [],
        _categoryLoaded: true,
      });
    }
    if (row.series_id && !serMap.has(row.series_id)) {
      const s = {
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
        episodes: []
      };
      serMap.set(row.series_id, s);
      catMap.get(row.cat_id).series.push(s);
    }
    if (row.series_id && row.ep_num != null) {
      const s = serMap.get(row.series_id);
      const catTitle = catMap.get(row.cat_id).title;
      const audioOpts = { opusSupported, categoryTitle: catTitle };
      let url;
      try {
        url = buildAudioUrl(s.bucket, s.folder, row.ep_file, audioOpts);
      } catch (e) {
        console.error(e.message);
        url = '';
      }
      const ep = {
        id: row.ep_num,
        title: row.ep_title,
        fileName: row.ep_file,
        url,
        duration: row.ep_duration || 0,
      };
      // Provide MP3 fallback URL for Opus episodes
      if (opusSupported && OPUS_CATEGORIES.has(catTitle)) {
        try { ep.mp3Url = buildAudioUrl(s.bucket, s.folder, row.ep_file); } catch { }
      }
      if (row.ep_intro) ep.intro = row.ep_intro;
      if (row.ep_story) ep.storyNumber = row.ep_story;
      if (row.ep_play_count) ep.playCount = row.ep_play_count;
      s.episodes.push(ep);
    }
  }

  return { mode, categories: [...catMap.values()] };
}

async function getSeriesDetail(db, seriesId, opusSupported) {
  const series = await db.prepare(
    `SELECT s.*, c.id as category_id, c.title as category_title
     FROM series s JOIN categories c ON s.category_id = c.id WHERE s.id = ?`
  ).bind(seriesId).first();
  if (!series) return { error: 'Series not found' };

  const episodes = await db.prepare(
    `SELECT episode_num as id, title, file_name as fileName, intro,
            story_number as storyNumber, play_count as playCount, duration
     FROM episodes WHERE series_id = ? ORDER BY episode_num`
  ).bind(seriesId).all();

  const catTitle = series.category_title;
  const audioOpts = { opusSupported, categoryTitle: catTitle };
  const isOpusCat = opusSupported && OPUS_CATEGORIES.has(catTitle);

  return {
    id: series.id, title: series.title, titleEn: series.title_en,
    speaker: series.speaker, speakerEn: series.speaker_en,
    bucket: series.bucket, folder: series.folder,
    totalEpisodes: series.total_episodes, intro: series.intro,
    playCount: series.play_count,
    categoryId: series.category_id, categoryTitle: catTitle,
    episodes: episodes.results.map(ep => {
      let url;
      try {
        url = buildAudioUrl(series.bucket, series.folder, ep.fileName, audioOpts);
      } catch (e) {
        console.error(e.message);
        url = '';
      }
      const obj = {
        id: ep.id, title: ep.title, fileName: ep.fileName,
        url,
        duration: ep.duration || 0,
        playCount: ep.playCount
      };
      if (isOpusCat) {
        try { obj.mp3Url = buildAudioUrl(series.bucket, series.folder, ep.fileName); } catch { }
      }
      if (ep.intro) obj.intro = ep.intro;
      if (ep.storyNumber) obj.storyNumber = ep.storyNumber;
      return obj;
    }),
  };
}

async function getEpisodes(db, seriesId, opusSupported) {
  const series = await db.prepare(
    `SELECT s.bucket, s.folder, c.title as cat_title
     FROM series s JOIN categories c ON s.category_id = c.id WHERE s.id = ?`
  ).bind(seriesId).first();
  if (!series) return { episodes: [] };

  const episodes = await db.prepare(
    `SELECT episode_num as id, title, file_name as fileName, intro,
            story_number as storyNumber, play_count as playCount, duration
     FROM episodes WHERE series_id = ? ORDER BY episode_num`
  ).bind(seriesId).all();

  const catTitle = series.cat_title;
  const audioOpts = { opusSupported, categoryTitle: catTitle };
  const isOpusCat = opusSupported && OPUS_CATEGORIES.has(catTitle);

  return {
    episodes: episodes.results.map(ep => {
      let url;
      try {
        url = buildAudioUrl(series.bucket, series.folder, ep.fileName, audioOpts);
      } catch (e) {
        console.error(e.message);
        url = '';
      }
      const obj = {
        id: ep.id, title: ep.title, fileName: ep.fileName,
        url,
        duration: ep.duration || 0,
      };
      if (isOpusCat) {
        try { obj.mp3Url = buildAudioUrl(series.bucket, series.folder, ep.fileName); } catch { }
      }
      if (ep.intro) obj.intro = ep.intro;
      if (ep.storyNumber) obj.storyNumber = ep.storyNumber;
      if (ep.playCount) obj.playCount = ep.playCount;
      return obj;
    })
  };
}

async function recordPlay(db, body, request) {
  const { seriesId, episodeNum } = body;
  if (!seriesId || typeof seriesId !== 'string' ||
    typeof episodeNum !== 'number' || !Number.isInteger(episodeNum) || episodeNum < 1) {
    return { error: 'Missing or invalid seriesId/episodeNum' };
  }

  const episode = await db.prepare(
    `SELECT e.id
     FROM episodes e
     JOIN series s ON s.id = e.series_id
     WHERE s.id = ? AND e.episode_num = ?
     LIMIT 1`
  ).bind(seriesId, episodeNum).first();
  if (!episode) {
    return { error: 'Episode not found' };
  }

  const origin = new URL(request.url).hostname;
  const ua = request.headers.get('User-Agent') || '';
  await db.batch([
    db.prepare('UPDATE series SET play_count = play_count + 1 WHERE id = ?').bind(seriesId),
    db.prepare('UPDATE episodes SET play_count = play_count + 1 WHERE series_id = ? AND episode_num = ?').bind(seriesId, episodeNum),
    db.prepare('INSERT INTO play_logs (series_id, episode_num, user_agent, origin) VALUES (?, ?, ?, ?)').bind(seriesId, episodeNum, ua.substring(0, 200), origin),
  ]);

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
  const clientIp = request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    request.headers.get('User-Agent') ||
    'unknown';
  const clientHash = await hashString('appreciate:' + clientIp);

  const existing = await db.prepare(
    'SELECT id FROM appreciations WHERE series_id = ? AND client_hash = ? LIMIT 1'
  ).bind(seriesId, clientHash).first().catch(() => null);

  if (!existing) {
    // Backward-compatible: try with episode_num first, fall back to without if column doesn't exist yet
    try {
      await db.prepare(
        'INSERT INTO appreciations (series_id, client_hash, episode_num, origin) VALUES (?, ?, ?, ?)'
      ).bind(seriesId, clientHash, episodeNum, origin).run();
    } catch (e) {
      // episode_num column may not exist yet (migration 0005 not applied)
      await db.prepare(
        'INSERT INTO appreciations (series_id, client_hash, origin) VALUES (?, ?, ?)'
      ).bind(seriesId, clientHash, origin).run();
    }
  }

  const count = await db.prepare(
    'SELECT COUNT(*) as total FROM appreciations WHERE series_id = ?'
  ).bind(seriesId).first();
  return { success: true, total: count.total, duplicate: !!existing };
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

  // 支持分批参数: ?limit=3&offset=0&retry=true&rebuild=true
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '3', 10), 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const retryFailed = url.searchParams.get('retry') === 'true';
  const rebuild = url.searchParams.get('rebuild') === 'true';

  // 获取待处理文档（跳过已完成的）
  let query;
  if (rebuild) {
    // 全量重建：忽略已完成状态，处理所有文档
    query = env.DB.prepare(
      `SELECT d.id, d.title, d.content, d.category, d.series_name,
              d.audio_series_id, d.audio_episode_num
       FROM documents d
       WHERE d.content IS NOT NULL AND d.content != ''
       ORDER BY d.id LIMIT ? OFFSET ?`
    ).bind(limit, offset);
  } else if (retryFailed) {
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
  let totalQuery;
  if (rebuild) {
    totalQuery = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM documents d
       WHERE d.content IS NOT NULL AND d.content != ''`
    ).all();
  } else if (retryFailed) {
    totalQuery = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM documents d
       INNER JOIN ai_embedding_jobs j ON j.document_id = d.id AND j.status = 'failed'
       WHERE d.content IS NOT NULL AND d.content != ''`
    ).all();
  } else {
    totalQuery = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM documents d
       LEFT JOIN ai_embedding_jobs j ON j.document_id = d.id AND j.status = 'completed'
       WHERE d.content IS NOT NULL AND d.content != '' AND j.id IS NULL`
    ).all();
  }
  const total = totalQuery.results[0]?.total || 0;

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
        audio_series_id: doc.audio_series_id || '',
        audio_episode_num: doc.audio_episode_num || null,
        series_id: doc.audio_series_id || '',
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

async function handleEmbeddingStatus(db, cors) {
  try {
    const totalDocs = await db.prepare(
      `SELECT COUNT(*) AS c
       FROM documents
       WHERE content IS NOT NULL AND content != ''`
    ).first();

    const statusRows = await db.prepare(
      `SELECT status, COUNT(*) AS count
       FROM ai_embedding_jobs
       GROUP BY status`
    ).all();

    const latestCompleted = await db.prepare(
      `SELECT j.document_id, j.chunks_count, j.completed_at, d.title, d.series_name
       FROM ai_embedding_jobs j
       LEFT JOIN documents d ON d.id = j.document_id
       WHERE j.status = 'completed'
       ORDER BY j.completed_at DESC, j.id DESC
       LIMIT 5`
    ).all();

    const latestFailed = await db.prepare(
      `SELECT j.document_id, j.error, j.created_at, d.title, d.series_name
       FROM ai_embedding_jobs j
       LEFT JOIN documents d ON d.id = j.document_id
       WHERE j.status = 'failed'
       ORDER BY j.id DESC
       LIMIT 5`
    ).all();

    const counts = { completed: 0, failed: 0, pending: 0 };
    for (const row of (statusRows.results || [])) {
      counts[row.status] = row.count || 0;
    }

    const total = totalDocs?.c || 0;
    const processed = counts.completed + counts.failed;
    const remaining = Math.max(total - counts.completed, 0);

    return json({
      success: true,
      totalDocuments: total,
      completed: counts.completed,
      failed: counts.failed,
      pending: counts.pending,
      processed,
      remaining,
      completionRate: total > 0 ? Number((counts.completed / total * 100).toFixed(1)) : 0,
      latestCompleted: latestCompleted.results || [],
      latestFailed: latestFailed.results || [],
    }, cors, 200, 'no-store');
  } catch (err) {
    return json({ success: false, error: err.message }, cors, 500);
  }
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

  // 清理 7 天前的推荐缓存
  await env.DB.prepare(
    `DELETE FROM ai_daily_recommendations WHERE date_key < date('now', '-7 days')`
  ).run();

  // 重置超时的 generating 锁（超过 5 分钟）
  await env.DB.prepare(
    `UPDATE ai_daily_recommendations SET status = 'failed', error = 'generation timeout'
     WHERE status = 'generating' AND created_at < datetime('now', '-5 minutes')`
  ).run();

  // 清理 30 天前的 AI 调用日志
  const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
  await env.DB.prepare(
    'DELETE FROM ai_call_logs WHERE timestamp < ?'
  ).bind(thirtyDaysAgo).run();

  return json({ success: true, message: '过期限流记录、推荐缓存及AI调用日志已清理' }, cors);
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
// 共修社区处理器
// ============================================================

/**
 * GET /api/gongxiu
 * 返回今日统计 + 最近30条记录 + 历史累计总数
 */
async function handleGetGongxiu(db, url, cors) {
  const today = getTodayBeijing();
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '30'), 50);

  // 今日统计（先查缓存表，否则实时聚合）
  let todayStat = await db.prepare(
    'SELECT total_count, participant_count FROM gongxiu_daily_stats WHERE date = ?'
  ).bind(today).first().catch(() => null);

  if (!todayStat) {
    todayStat = await db.prepare(
      `SELECT COALESCE(SUM(count),0) AS total_count, COUNT(*) AS participant_count
       FROM gongxiu_entries WHERE date = ?`
    ).bind(today).first().catch(() => ({ total_count: 0, participant_count: 0 }));
  }

  // 历史累计总声数
  const allTime = await db.prepare(
    'SELECT COALESCE(SUM(count),0) AS grand_total, COUNT(*) AS grand_participants FROM gongxiu_entries'
  ).first().catch(() => ({ grand_total: 0, grand_participants: 0 }));

  // 最近 N 条记录（含今日及历史，按时间倒序）
  const { results: entries } = await db.prepare(
    `SELECT id, date, nickname, practice, count, vow_type, vow_target, vow_custom, created_at
     FROM gongxiu_entries ORDER BY id DESC LIMIT ?`
  ).bind(limit).all().catch(() => ({ results: [] }));

  return json({
    today: today,
    today_total: Number(todayStat.total_count) || 0,
    today_participants: Number(todayStat.participant_count) || 0,
    grand_total: Number(allTime.grand_total) || 0,
    grand_participants: Number(allTime.grand_participants) || 0,
    entries: entries || [],
  }, cors, 200, 'public, max-age=30, s-maxage=60');
}

/**
 * POST /api/gongxiu
 * 提交一条共修回向记录。
 * 每个 IP 每天最多提交 3 次（防刷，不限每次的不同法门）
 */
async function handlePostGongxiu(db, request, cors) {
  const today = getTodayBeijing();
  const ip = request.headers.get('CF-Connecting-IP') ||
             request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || '';
  const ipHash = await hashIP(ip);

  // 解析请求体
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, cors, 400);
  }

  const nickname = String(body.nickname || '莲友').trim().slice(0, 20) || '莲友';
  const practice = String(body.practice || '南无阿弥陀佛').trim().slice(0, 40);
  const count    = parseInt(body.count);
  const vowType  = ['universal', 'blessing', 'rebirth', 'custom'].includes(body.vow_type)
                   ? body.vow_type : 'universal';
  const vowTarget = String(body.vow_target || '').trim().slice(0, 30);
  const vowCustom = String(body.vow_custom || '').trim().slice(0, 100);

  if (!count || count < 1 || count > 150000) {
    return json({ error: 'count must be 1–150000' }, cors, 400);
  }
  if (!practice) {
    return json({ error: 'practice required' }, cors, 400);
  }

  // 每日 IP 限流（每天最多 3 条）
  const { count: ipCount } = await db.prepare(
    'SELECT COUNT(*) as count FROM gongxiu_entries WHERE ip_hash = ? AND date = ?'
  ).bind(ipHash, today).first().catch(() => ({ count: 0 }));

  if (ipCount >= 3) {
    return json({ error: '今日共修已记录，明日再续精进', alreadySubmitted: true }, cors, 429);
  }

  // 插入记录
  const { meta } = await db.prepare(
    `INSERT INTO gongxiu_entries (date, nickname, practice, count, vow_type, vow_target, vow_custom, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(today, nickname, practice, count, vowType, vowTarget, vowCustom, ipHash).run();

  // 更新每日聚合缓存（upsert）
  await db.prepare(
    `INSERT INTO gongxiu_daily_stats (date, total_count, participant_count, updated_at)
     VALUES (?, ?, 1, datetime('now'))
     ON CONFLICT(date) DO UPDATE SET
       total_count = total_count + excluded.total_count,
       participant_count = participant_count + 1,
       updated_at = excluded.updated_at`
  ).bind(today, count).run().catch(() => { /* cache update failure is non-fatal */ });

  // 保存昵称建议（返回给前端，由前端存 localStorage）
  return json({
    ok: true,
    id: meta.last_row_id,
    entry: { id: meta.last_row_id, date: today, nickname, practice, count, vow_type: vowType, vow_target: vowTarget, vow_custom: vowCustom, created_at: new Date().toISOString() },
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
