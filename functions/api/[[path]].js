/**
 * Pages Function: /api/*
 * 处理所有 /api/ 路由请求
 */

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  try {
    const db = env.DB;

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
      const body = await request.json();
      return json(await recordPlay(db, body, request), cors);
    }

    // GET /api/play-count/:id
    const pm = path.match(/^\/api\/play-count\/([^/]+)$/);
    if (pm && method === 'GET') {
      return json(await getPlayCount(db, pm[1]), cors);
    }

    // POST /api/appreciate/:id
    const am = path.match(/^\/api\/appreciate\/([^/]+)$/);
    if (am && method === 'POST') {
      return json(await appreciate(db, am[1], request), cors);
    }

    // GET /api/stats
    if (path === '/api/stats' && method === 'GET') {
      const origin = url.searchParams.get('origin') || '';
      return json(await getStats(db, origin), cors);
    }

    return json({ error: 'Not Found' }, cors, 404);

  } catch (err) {
    console.error('API Error:', err);
    return json({ error: 'Internal Server Error', message: err.message }, cors, 500);
  }
}

// ============================================================
function json(data, cors, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-cache',
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
  if (!seriesId || episodeNum === undefined) return { error: 'Missing seriesId or episodeNum' };

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
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}
