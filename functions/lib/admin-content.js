import { buildAudioUrl } from './audio-utils.js';

export async function handleAdminGetCategories(db, cors, json) {
  const { results } = await db.prepare(
    `SELECT c.id, c.title, c.title_en, c.sort_order,
            (SELECT COUNT(*) FROM series WHERE category_id=c.id) as series_count
     FROM categories c ORDER BY c.sort_order`
  ).all();
  return json({ categories: results || [] }, cors, 200, 'no-store');
}

export async function handleAdminUpdateCategory(db, id, body, cors, json) {
  const fields = [];
  const vals = [];
  if (body.title !== undefined) {
    fields.push('title=?');
    vals.push(body.title);
  }
  if (body.title_en !== undefined) {
    fields.push('title_en=?');
    vals.push(body.title_en);
  }
  if (body.sort_order !== undefined) {
    fields.push('sort_order=?');
    vals.push(body.sort_order);
  }
  if (!fields.length) return json({ error: 'No fields to update' }, cors, 400);
  vals.push(id);
  await db.prepare(`UPDATE categories SET ${fields.join(',')} WHERE id=?`).bind(...vals).run();
  return json({ success: true }, cors, 200, 'no-store');
}

export async function handleAdminGetSeries(db, url, cors, json) {
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

async function syncSeriesEpisodeCount(db, seriesId) {
  if (!seriesId) return 0;
  const row = await db.prepare(
    'SELECT COUNT(*) AS count FROM episodes WHERE series_id=?'
  ).bind(seriesId).first();
  const count = row?.count || 0;
  await db.prepare('UPDATE series SET total_episodes=? WHERE id=?').bind(count, seriesId).run();
  return count;
}

async function rebuildSeriesEpisodeUrls(db, seriesId) {
  if (!seriesId) return 0;
  const series = await db.prepare('SELECT bucket, folder FROM series WHERE id=?').bind(seriesId).first();
  if (!series) return 0;
  const { results } = await db.prepare(
    'SELECT id, file_name FROM episodes WHERE series_id=?'
  ).bind(seriesId).all();
  const episodes = results || [];
  if (!episodes.length) return 0;
  await db.batch(episodes.map(ep =>
    db.prepare('UPDATE episodes SET url=? WHERE id=?')
      .bind(buildAudioUrl(series.bucket, series.folder, ep.file_name), ep.id)
  ));
  return episodes.length;
}

export async function handleAdminCreateSeries(db, body, cors, json) {
  const { id, category_id, title, title_en, speaker, speaker_en, bucket, folder, intro, sort_order } = body;
  if (!id || !category_id || !title) {
    return json({ error: 'Missing required fields (id, category_id, title)' }, cors, 400);
  }
  await db.prepare(
    `INSERT INTO series (id, category_id, title, title_en, speaker, speaker_en, bucket, folder, total_episodes, intro, sort_order)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    id,
    category_id,
    title || '',
    title_en || '',
    speaker || '',
    speaker_en || '',
    bucket || '',
    folder || '',
    0,
    intro || '',
    sort_order || 0
  ).run();
  return json({ success: true, id }, cors, 201, 'no-store');
}

export async function handleAdminUpdateSeries(db, id, body, cors, json) {
  const fields = [];
  const vals = [];
  const allowed = ['category_id', 'title', 'title_en', 'speaker', 'speaker_en', 'bucket', 'folder', 'intro', 'sort_order'];
  for (const key of allowed) {
    if (body[key] !== undefined) {
      fields.push(`${key}=?`);
      vals.push(body[key]);
    }
  }
  if (!fields.length) return json({ error: 'No fields to update' }, cors, 400);
  vals.push(id);
  await db.prepare(`UPDATE series SET ${fields.join(',')} WHERE id=?`).bind(...vals).run();
  const syncedEpisodeUrls = (body.bucket !== undefined || body.folder !== undefined)
    ? await rebuildSeriesEpisodeUrls(db, id)
    : 0;
  const totalEpisodes = await syncSeriesEpisodeCount(db, id);
  return json({ success: true, syncedEpisodeUrls, totalEpisodes }, cors, 200, 'no-store');
}

export async function handleAdminDeleteSeries(db, id, cors, json) {
  try {
    await db.prepare('DELETE FROM episode_chapters WHERE series_id=?').bind(id).run();
  } catch {
    // Older databases may not have the episode_chapters table yet.
  }
  const result = await db.batch([
    db.prepare('DELETE FROM play_logs WHERE series_id=?').bind(id),
    db.prepare('DELETE FROM appreciations WHERE series_id=?').bind(id),
    db.prepare('DELETE FROM episodes WHERE series_id=?').bind(id),
    db.prepare('DELETE FROM series WHERE id=?').bind(id),
  ]);
  const epResult = result[2];
  return json({ success: true, deletedEpisodes: epResult?.meta?.changes || 0 }, cors, 200, 'no-store');
}

export async function handleAdminGetEpisodes(db, seriesId, cors, json) {
  const series = await db.prepare('SELECT id, title FROM series WHERE id=?').bind(seriesId).first();
  const { results } = await db.prepare(
    'SELECT id, series_id, episode_num, title, file_name, url, intro, story_number, play_count FROM episodes WHERE series_id=? ORDER BY episode_num'
  ).bind(seriesId).all();
  return json({ episodes: results || [], series: series || { id: seriesId } }, cors, 200, 'no-store');
}

export async function handleAdminCreateEpisode(db, body, cors, json) {
  const { series_id, episode_num, title, file_name, intro, story_number, duration } = body;
  if (!series_id || !episode_num || !title || !file_name) {
    return json({ error: 'Missing required fields' }, cors, 400);
  }
  const series = await db.prepare('SELECT bucket, folder FROM series WHERE id = ?').bind(series_id).first();
  const url = series ? buildAudioUrl(series.bucket, series.folder, file_name) : '';
  await db.prepare(
    'INSERT INTO episodes (series_id, episode_num, title, file_name, url, intro, story_number, duration) VALUES (?,?,?,?,?,?,?,?)'
  ).bind(series_id, episode_num, title, file_name, url, intro || null, story_number || null, duration || 0).run();
  const totalEpisodes = await syncSeriesEpisodeCount(db, series_id);
  return json({ success: true, totalEpisodes }, cors, 201, 'no-store');
}

export async function handleAdminUpdateEpisode(db, id, body, cors, json) {
  const ep = await db.prepare('SELECT series_id, episode_num FROM episodes WHERE id=?').bind(id).first();
  if (!ep) return json({ error: 'Episode not found' }, cors, 404, 'no-store');
  const fields = [];
  const vals = [];
  const allowed = ['episode_num', 'title', 'file_name', 'intro', 'story_number', 'duration'];
  for (const key of allowed) {
    if (body[key] !== undefined) {
      fields.push(`${key}=?`);
      vals.push(body[key]);
    }
  }
  if (body.file_name !== undefined) {
    const series = await db.prepare('SELECT bucket, folder FROM series WHERE id=?').bind(ep.series_id).first();
    if (series) {
      fields.push('url=?');
      vals.push(buildAudioUrl(series.bucket, series.folder, body.file_name));
    }
  }
  if (body.episode_num !== undefined && body.episode_num !== ep.episode_num) {
    try {
      await db.prepare(
        'UPDATE episode_chapters SET episode_num=? WHERE series_id=? AND episode_num=?'
      ).bind(body.episode_num, ep.series_id, ep.episode_num).run();
    } catch {
      // Older databases may not have the episode_chapters table yet.
    }
  }
  if (!fields.length) return json({ error: 'No fields to update' }, cors, 400);
  vals.push(id);
  await db.prepare(`UPDATE episodes SET ${fields.join(',')} WHERE id=?`).bind(...vals).run();
  const totalEpisodes = await syncSeriesEpisodeCount(db, ep.series_id);
  return json({ success: true, totalEpisodes }, cors, 200, 'no-store');
}

export async function handleAdminDeleteEpisode(db, id, cors, json) {
  const ep = await db.prepare('SELECT series_id, episode_num FROM episodes WHERE id=?').bind(id).first();
  if (!ep) return json({ error: 'Episode not found' }, cors, 404, 'no-store');
  try {
    await db.prepare('DELETE FROM episode_chapters WHERE series_id=? AND episode_num=?').bind(ep.series_id, ep.episode_num).run();
  } catch {
    // Older databases may not have the episode_chapters table yet.
  }
  await db.prepare('DELETE FROM episodes WHERE id=?').bind(id).run();
  const totalEpisodes = await syncSeriesEpisodeCount(db, ep.series_id);
  return json({ success: true, totalEpisodes }, cors, 200, 'no-store');
}
