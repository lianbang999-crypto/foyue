/**
 * 净土法音 API — Cloudflare Workers + D1
 *
 * 端点:
 *   GET  /api/categories          → 全部分类（含系列列表，不含集数）
 *   GET  /api/series/:id          → 单个系列详情（含所有集数）
 *   GET  /api/series/:id/episodes → 系列的所有集数
 *   POST /api/play-count          → 记录播放（+1）
 *   GET  /api/play-count/:id      → 获取系列播放次数
 *   POST /api/appreciate/:id      → 随喜（点赞）
 *   GET  /api/stats                → 全站统计概览
 *   GET  /api/stats?origin=xxx    → 按域名筛选统计
 *
 * 兼容端点（过渡期，模拟原 JSON 结构）:
 *   GET  /data/audio-data.json    → 返回与原 JSON 完全一致的结构
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS 头
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // 处理 OPTIONS 预检请求
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 路由
      if (path === '/api/categories' && method === 'GET') {
        return jsonResponse(await getCategories(env.DB), corsHeaders);
      }

      if (path === '/data/audio-data.json' && method === 'GET') {
        return jsonResponse(await getCompatibleJSON(env.DB), corsHeaders);
      }

      const seriesMatch = path.match(/^\/api\/series\/([^/]+)$/);
      if (seriesMatch && method === 'GET') {
        return jsonResponse(await getSeriesDetail(env.DB, seriesMatch[1]), corsHeaders);
      }

      const episodesMatch = path.match(/^\/api\/series\/([^/]+)\/episodes$/);
      if (episodesMatch && method === 'GET') {
        return jsonResponse(await getEpisodes(env.DB, episodesMatch[1]), corsHeaders);
      }

      if (path === '/api/play-count' && method === 'POST') {
        const body = await request.json();
        return jsonResponse(await recordPlay(env.DB, body, request), corsHeaders);
      }

      const playCountMatch = path.match(/^\/api\/play-count\/([^/]+)$/);
      if (playCountMatch && method === 'GET') {
        return jsonResponse(await getPlayCount(env.DB, playCountMatch[1]), corsHeaders);
      }

      const appreciateMatch = path.match(/^\/api\/appreciate\/([^/]+)$/);
      if (appreciateMatch && method === 'POST') {
        return jsonResponse(await appreciate(env.DB, appreciateMatch[1], request), corsHeaders);
      }

      if (path === '/api/stats' && method === 'GET') {
        const origin = url.searchParams.get('origin') || '';
        return jsonResponse(await getStats(env.DB, origin), corsHeaders);
      }

      // 未匹配的 API 路由
      if (path.startsWith('/api/')) {
        return jsonResponse({ error: 'Not Found' }, corsHeaders, 404);
      }

      // 非 API 路径，交给 Pages 处理（不会到达这里，除非 Worker 拦截了所有请求）
      return new Response('Not Found', { status: 404 });

    } catch (err) {
      console.error('API Error:', err);
      return jsonResponse(
        { error: 'Internal Server Error', message: err.message },
        corsHeaders,
        500
      );
    }
  }
};

// ============================================================
// 辅助函数
// ============================================================

function jsonResponse(data, corsHeaders, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-cache',
      ...corsHeaders,
    },
  });
}

// ============================================================
// API 实现
// ============================================================

/**
 * GET /api/categories
 * 返回所有分类及其系列（不含集数详情，减少传输量）
 */
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
      id: cat.id,
      title: cat.title,
      titleEn: cat.title_en,
      series: series.results.map(s => ({
        id: s.id,
        title: s.title,
        titleEn: s.title_en,
        speaker: s.speaker,
        speakerEn: s.speaker_en,
        bucket: s.bucket,
        folder: s.folder,
        totalEpisodes: s.total_episodes,
        intro: s.intro,
        playCount: s.play_count,
      })),
    });
  }

  return { categories: result };
}

/**
 * GET /data/audio-data.json
 * 兼容端点：返回与原 audio-data.json 完全一致的结构
 * 前端无需任何修改即可使用
 */
async function getCompatibleJSON(db) {
  const categories = await db.prepare(
    'SELECT id, title, title_en, sort_order FROM categories ORDER BY sort_order'
  ).all();

  const result = { categories: [] };

  for (const cat of categories.results) {
    const seriesList = await db.prepare(
      `SELECT id, title, title_en, speaker, speaker_en, bucket, folder,
              total_episodes, intro, sort_order
       FROM series WHERE category_id = ? ORDER BY sort_order`
    ).bind(cat.id).all();

    const catObj = {
      id: cat.id,
      title: cat.title,
      titleEn: cat.title_en,
      series: [],
    };

    for (const s of seriesList.results) {
      const episodes = await db.prepare(
        `SELECT episode_num as id, title, file_name as fileName, url, intro, story_number as storyNumber
         FROM episodes WHERE series_id = ? ORDER BY episode_num`
      ).bind(s.id).all();

      const seriesObj = {
        id: s.id,
        title: s.title,
        titleEn: s.title_en,
        speaker: s.speaker,
        speakerEn: s.speaker_en,
        bucket: s.bucket,
        folder: s.folder,
        totalEpisodes: s.total_episodes,
        intro: s.intro,
        episodes: episodes.results.map(ep => {
          const obj = { id: ep.id, title: ep.title, fileName: ep.fileName, url: ep.url };
          if (ep.intro) obj.intro = ep.intro;
          if (ep.storyNumber) obj.storyNumber = ep.storyNumber;
          return obj;
        }),
      };

      catObj.series.push(seriesObj);
    }

    result.categories.push(catObj);
  }

  return result;
}

/**
 * GET /api/series/:id
 * 返回单个系列的完整信息（含所有集数）
 */
async function getSeriesDetail(db, seriesId) {
  const series = await db.prepare(
    `SELECT s.*, c.id as category_id, c.title as category_title
     FROM series s JOIN categories c ON s.category_id = c.id
     WHERE s.id = ?`
  ).bind(seriesId).first();

  if (!series) {
    return { error: 'Series not found' };
  }

  const episodes = await db.prepare(
    `SELECT episode_num as id, title, file_name as fileName, url, intro,
            story_number as storyNumber, play_count as playCount
     FROM episodes WHERE series_id = ? ORDER BY episode_num`
  ).bind(seriesId).all();

  return {
    id: series.id,
    title: series.title,
    titleEn: series.title_en,
    speaker: series.speaker,
    speakerEn: series.speaker_en,
    bucket: series.bucket,
    folder: series.folder,
    totalEpisodes: series.total_episodes,
    intro: series.intro,
    playCount: series.play_count,
    categoryId: series.category_id,
    categoryTitle: series.category_title,
    episodes: episodes.results.map(ep => {
      const obj = { id: ep.id, title: ep.title, fileName: ep.fileName, url: ep.url, playCount: ep.playCount };
      if (ep.intro) obj.intro = ep.intro;
      if (ep.storyNumber) obj.storyNumber = ep.storyNumber;
      return obj;
    }),
  };
}

/**
 * GET /api/series/:id/episodes
 */
async function getEpisodes(db, seriesId) {
  const episodes = await db.prepare(
    `SELECT episode_num as id, title, file_name as fileName, url, intro,
            story_number as storyNumber, play_count as playCount
     FROM episodes WHERE series_id = ? ORDER BY episode_num`
  ).bind(seriesId).all();

  return { episodes: episodes.results };
}

/**
 * POST /api/play-count
 * body: { seriesId: string, episodeNum: number }
 */
async function recordPlay(db, body, request) {
  const { seriesId, episodeNum } = body;
  if (!seriesId || episodeNum === undefined) {
    return { error: 'Missing seriesId or episodeNum' };
  }

  // 获取来源域名
  const origin = new URL(request.url).hostname;

  // 更新系列播放次数
  await db.prepare(
    'UPDATE series SET play_count = play_count + 1 WHERE id = ?'
  ).bind(seriesId).run();

  // 更新集数播放次数
  await db.prepare(
    'UPDATE episodes SET play_count = play_count + 1 WHERE series_id = ? AND episode_num = ?'
  ).bind(seriesId, episodeNum).run();

  // 记录播放日志（含来源域名）
  const ua = request.headers.get('User-Agent') || '';
  await db.prepare(
    'INSERT INTO play_logs (series_id, episode_num, user_agent, origin) VALUES (?, ?, ?, ?)'
  ).bind(seriesId, episodeNum, ua.substring(0, 200), origin).run();

  // 返回更新后的计数
  const result = await db.prepare(
    'SELECT play_count FROM series WHERE id = ?'
  ).bind(seriesId).first();

  return { success: true, playCount: result?.play_count || 0 };
}

/**
 * GET /api/play-count/:seriesId
 */
async function getPlayCount(db, seriesId) {
  const series = await db.prepare(
    'SELECT play_count FROM series WHERE id = ?'
  ).bind(seriesId).first();

  if (!series) {
    return { error: 'Series not found' };
  }

  const episodes = await db.prepare(
    'SELECT episode_num as id, play_count as playCount FROM episodes WHERE series_id = ? ORDER BY episode_num'
  ).bind(seriesId).all();

  return {
    seriesId,
    totalPlayCount: series.play_count,
    episodes: episodes.results,
  };
}

/**
 * POST /api/appreciate/:seriesId
 * 随喜功能（匿名点赞）
 */
async function appreciate(db, seriesId, request) {
  // 用 IP 的 hash 做简单防刷（同一 IP 对同一系列每天限 1 次）
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const clientHash = await hashString(ip);
  const today = new Date().toISOString().split('T')[0];
  const origin = new URL(request.url).hostname;

  // 检查今日是否已随喜
  const existing = await db.prepare(
    `SELECT id FROM appreciations
     WHERE series_id = ? AND client_hash = ? AND created_at >= ?`
  ).bind(seriesId, clientHash, today).first();

  if (existing) {
    const count = await db.prepare(
      'SELECT COUNT(*) as total FROM appreciations WHERE series_id = ?'
    ).bind(seriesId).first();
    return { success: false, message: 'already_appreciated_today', total: count.total };
  }

  await db.prepare(
    'INSERT INTO appreciations (series_id, client_hash, origin) VALUES (?, ?, ?)'
  ).bind(seriesId, clientHash, origin).run();

  const count = await db.prepare(
    'SELECT COUNT(*) as total FROM appreciations WHERE series_id = ?'
  ).bind(seriesId).first();

  return { success: true, total: count.total };
}

/**
 * GET /api/stats
 * 全站统计
 */
async function getStats(db, origin = '') {
  const totalSeries = await db.prepare('SELECT COUNT(*) as count FROM series').first();
  const totalEpisodes = await db.prepare('SELECT COUNT(*) as count FROM episodes').first();
  const totalPlays = await db.prepare('SELECT SUM(play_count) as count FROM series').first();
  const totalAppreciations = await db.prepare('SELECT COUNT(*) as count FROM appreciations').first();

  // 按域名筛选的播放日志查询
  let recentPlaysQuery, recentPlaysParams;
  if (origin) {
    recentPlaysQuery = `SELECT DATE(played_at) as date, COUNT(*) as count
       FROM play_logs
       WHERE played_at >= datetime('now', '-7 days') AND origin = ?
       GROUP BY DATE(played_at)
       ORDER BY date`;
    recentPlaysParams = [origin];
  } else {
    recentPlaysQuery = `SELECT DATE(played_at) as date, COUNT(*) as count
       FROM play_logs
       WHERE played_at >= datetime('now', '-7 days')
       GROUP BY DATE(played_at)
       ORDER BY date`;
    recentPlaysParams = [];
  }

  const recentPlays = recentPlaysParams.length
    ? await db.prepare(recentPlaysQuery).bind(...recentPlaysParams).all()
    : await db.prepare(recentPlaysQuery).all();

  // 热门系列 Top 5
  const topSeries = await db.prepare(
    `SELECT s.id, s.title, s.speaker, s.play_count
     FROM series s ORDER BY s.play_count DESC LIMIT 5`
  ).all();

  // 各域名播放分布
  const originStats = await db.prepare(
    `SELECT origin, COUNT(*) as count
     FROM play_logs
     WHERE origin != ''
     GROUP BY origin
     ORDER BY count DESC`
  ).all();

  return {
    totalSeries: totalSeries.count,
    totalEpisodes: totalEpisodes.count,
    totalPlays: totalPlays.count || 0,
    totalAppreciations: totalAppreciations.count,
    recentPlays: recentPlays.results,
    topSeries: topSeries.results,
    originStats: originStats.results,
    filteredBy: origin || 'all',
  };
}

// ============================================================
// 工具函数
// ============================================================

async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}
