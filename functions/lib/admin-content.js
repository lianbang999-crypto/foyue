import { buildAudioUrl } from './audio-utils.js';

let episodeMetaColumnCache = null;

async function getEpisodeMetaColumns(db) {
  if (episodeMetaColumnCache) return episodeMetaColumnCache;
  const result = await db.prepare("PRAGMA table_info('episodes')").all();
  const names = new Set((result.results || []).map(row => row.name));
  episodeMetaColumnCache = {
    bytes: names.has('bytes'),
    mime: names.has('mime'),
    etag: names.has('etag'),
  };
  return episodeMetaColumnCache;
}

function buildEpisodeMetaSelect(columns) {
  return [
    columns.bytes ? 'bytes' : '0 as bytes',
    columns.mime ? 'mime' : "'' as mime",
    columns.etag ? 'etag' : "'' as etag",
  ].join(', ');
}

function normalizeNonNegativeInteger(value) {
  const num = parseInt(value, 10);
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

function normalizeOptionalText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseContentRangeTotal(value) {
  if (!value) return 0;
  const match = String(value).match(/\/\s*(\d+)\s*$/);
  if (!match) return 0;
  const total = parseInt(match[1], 10);
  return Number.isFinite(total) && total > 0 ? total : 0;
}

function extractAudioMetaFromResponse(response) {
  const contentLength = normalizeNonNegativeInteger(response.headers.get('content-length'));
  const contentRangeTotal = parseContentRangeTotal(response.headers.get('content-range'));
  const mime = normalizeOptionalText((response.headers.get('content-type') || '').split(';')[0]);
  const etag = normalizeOptionalText(response.headers.get('etag'));
  return {
    bytes: contentLength || contentRangeTotal || 0,
    mime,
    etag,
  };
}

function hasUsefulAudioMeta(meta) {
  return Boolean((meta?.bytes || 0) > 0 || meta?.mime || meta?.etag);
}

async function fetchEpisodeAudioMeta(url) {
  const headResponse = await fetch(url, {
    method: 'HEAD',
    redirect: 'follow',
    headers: { 'Cache-Control': 'no-store' },
  });
  if (!headResponse.ok) {
    throw new Error(`HEAD ${headResponse.status}`);
  }
  const headMeta = extractAudioMetaFromResponse(headResponse);
  if (hasUsefulAudioMeta(headMeta)) {
    return headMeta;
  }

  const rangeResponse = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      Range: 'bytes=0-0',
      'Cache-Control': 'no-store',
    },
  });
  if (!rangeResponse.ok && rangeResponse.status !== 206) {
    throw new Error(`Range ${rangeResponse.status}`);
  }
  return extractAudioMetaFromResponse(rangeResponse);
}

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
  const episodeMetaColumns = await getEpisodeMetaColumns(db);
  const episodeMetaSelect = buildEpisodeMetaSelect(episodeMetaColumns);
  const series = await db.prepare('SELECT id, title FROM series WHERE id=?').bind(seriesId).first();
  const { results } = await db.prepare(
    `SELECT id, series_id, episode_num, title, file_name, url, intro, story_number, play_count, duration, ${episodeMetaSelect}
     FROM episodes WHERE series_id=? ORDER BY episode_num`
  ).bind(seriesId).all();
  return json({ episodes: results || [], series: series || { id: seriesId } }, cors, 200, 'no-store');
}

export async function handleAdminBackfillEpisodeAudioMeta(db, seriesId, cors, json) {
  const episodeMetaColumns = await getEpisodeMetaColumns(db);
  if (!episodeMetaColumns.bytes || !episodeMetaColumns.mime || !episodeMetaColumns.etag) {
    return json({ error: 'Audio metadata columns are not ready. Apply migration 0021 first.' }, cors, 400, 'no-store');
  }

  const series = await db.prepare('SELECT id, title FROM series WHERE id=?').bind(seriesId).first();
  if (!series) {
    return json({ error: 'Series not found' }, cors, 404, 'no-store');
  }

  const { results } = await db.prepare(
    `SELECT id, episode_num, title, file_name, url, bytes, mime, etag
     FROM episodes WHERE series_id=? ORDER BY episode_num`
  ).bind(seriesId).all();

  const episodes = results || [];
  const targets = episodes.filter(ep => (ep.bytes || 0) <= 0 || !ep.mime || !ep.etag);
  const updates = [];
  const failures = [];
  const skippedEntries = [];
  let skipped = 0;
  let unchanged = 0;

  for (const episode of targets) {
    if (!episode.url) {
      skipped += 1;
      skippedEntries.push({
        id: episode.id,
        episodeNum: episode.episode_num,
        title: episode.title,
        reason: 'missing-url',
      });
      continue;
    }

    try {
      const fetchedMeta = await fetchEpisodeAudioMeta(episode.url);
      const nextMeta = {
        bytes: fetchedMeta.bytes || episode.bytes || 0,
        mime: fetchedMeta.mime || episode.mime || '',
        etag: fetchedMeta.etag || episode.etag || '',
      };

      if (
        nextMeta.bytes === (episode.bytes || 0) &&
        nextMeta.mime === (episode.mime || '') &&
        nextMeta.etag === (episode.etag || '')
      ) {
        unchanged += 1;
        continue;
      }

      updates.push(
        db.prepare('UPDATE episodes SET bytes=?, mime=?, etag=? WHERE id=?')
          .bind(nextMeta.bytes, nextMeta.mime, nextMeta.etag, episode.id)
      );
    } catch (error) {
      failures.push({
        id: episode.id,
        episodeNum: episode.episode_num,
        title: episode.title,
        reason: error?.message || 'fetch-failed',
      });
    }
  }

  if (updates.length) {
    await db.batch(updates);
  }

  return json({
    success: true,
    seriesId,
    seriesTitle: series.title,
    scanned: episodes.length,
    targeted: targets.length,
    updated: updates.length,
    unchanged,
    skipped,
    failed: failures.length,
    failures: failures.slice(0, 20),
    skippedEntries: skippedEntries.slice(0, 20),
  }, cors, 200, 'no-store');
}

export async function handleAdminCreateEpisode(db, body, cors, json) {
  const { series_id, episode_num, title, file_name, intro, story_number, duration, bytes, mime, etag } = body;
  if (!series_id || !episode_num || !title || !file_name) {
    return json({ error: 'Missing required fields' }, cors, 400);
  }
  const series = await db.prepare('SELECT bucket, folder FROM series WHERE id = ?').bind(series_id).first();
  const url = series ? buildAudioUrl(series.bucket, series.folder, file_name) : '';
  const episodeMetaColumns = await getEpisodeMetaColumns(db);
  const insertColumns = ['series_id', 'episode_num', 'title', 'file_name', 'url', 'intro', 'story_number', 'duration'];
  const insertValues = [series_id, episode_num, title, file_name, url, intro || null, story_number || null, duration || 0];
  if (episodeMetaColumns.bytes) {
    insertColumns.push('bytes');
    insertValues.push(normalizeNonNegativeInteger(bytes));
  }
  if (episodeMetaColumns.mime) {
    insertColumns.push('mime');
    insertValues.push(normalizeOptionalText(mime));
  }
  if (episodeMetaColumns.etag) {
    insertColumns.push('etag');
    insertValues.push(normalizeOptionalText(etag));
  }
  await db.prepare(
    `INSERT INTO episodes (${insertColumns.join(', ')}) VALUES (${insertColumns.map(() => '?').join(',')})`
  ).bind(...insertValues).run();
  const totalEpisodes = await syncSeriesEpisodeCount(db, series_id);
  return json({ success: true, totalEpisodes }, cors, 201, 'no-store');
}

export async function handleAdminUpdateEpisode(db, id, body, cors, json) {
  const ep = await db.prepare('SELECT series_id, episode_num FROM episodes WHERE id=?').bind(id).first();
  if (!ep) return json({ error: 'Episode not found' }, cors, 404, 'no-store');
  const fields = [];
  const vals = [];
  const episodeMetaColumns = await getEpisodeMetaColumns(db);
  const allowed = ['episode_num', 'title', 'file_name', 'intro', 'story_number', 'duration'];
  if (episodeMetaColumns.bytes) allowed.push('bytes');
  if (episodeMetaColumns.mime) allowed.push('mime');
  if (episodeMetaColumns.etag) allowed.push('etag');
  for (const key of allowed) {
    if (body[key] !== undefined) {
      fields.push(`${key}=?`);
      if (key === 'bytes') vals.push(normalizeNonNegativeInteger(body[key]));
      else if (key === 'mime' || key === 'etag') vals.push(normalizeOptionalText(body[key]));
      else vals.push(body[key]);
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
