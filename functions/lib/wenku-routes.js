const SYNC_R2_BASE = '大安法师/大安法师（讲法集）TXT/';
const SYNC_YIYONG = '已用/';
const SYNC_YIYONG_DUPS = new Set(['一函遍复', '龙舒净土文（马来西亚）']);
const SYNC_FOLDER22 = [
  { prefix: '净土十疑论', expected: 6 },
  { prefix: '净土决疑论', expected: 8 },
];
const SYNC_GARBAGE = [/\.netdisk\.p\.downloading$/, /~\$/, /\.docx?$/i];

export async function handleWenkuSeries(db) {
  const result = await db.prepare(
    `SELECT series_name, COUNT(*) as count
     FROM documents
     WHERE type = 'transcript' AND content IS NOT NULL AND content != ''
       AND series_name IS NOT NULL
     GROUP BY series_name
     ORDER BY series_name`
  ).all();
  return { series: result.results };
}

export async function handleWenkuDocuments(db, seriesName) {
  const result = await db.prepare(
    `SELECT id, title, type, category, series_name, episode_num, format,
            file_size, audio_series_id, read_count
     FROM documents
     WHERE series_name = ? AND type = 'transcript'
       AND content IS NOT NULL AND content != ''
     ORDER BY episode_num`
  ).bind(seriesName).all();
  return { documents: result.results };
}

export async function handleWenkuDocument(db, id) {
  const doc = await db.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first();
  if (!doc) return { document: null };

  let prevId = null;
  let nextId = null;
  let totalEpisodes = 0;

  if (doc.series_name && doc.episode_num) {
    const prev = await db.prepare(
      `SELECT id FROM documents
       WHERE series_name = ? AND episode_num < ? AND type = 'transcript'
         AND content IS NOT NULL AND content != ''
       ORDER BY episode_num DESC LIMIT 1`
    ).bind(doc.series_name, doc.episode_num).first();

    const next = await db.prepare(
      `SELECT id FROM documents
       WHERE series_name = ? AND episode_num > ? AND type = 'transcript'
         AND content IS NOT NULL AND content != ''
       ORDER BY episode_num ASC LIMIT 1`
    ).bind(doc.series_name, doc.episode_num).first();

    const total = await db.prepare(
      `SELECT COUNT(*) as count FROM documents
       WHERE series_name = ? AND type = 'transcript'
         AND content IS NOT NULL AND content != ''`
    ).bind(doc.series_name).first();

    prevId = prev?.id || null;
    nextId = next?.id || null;
    totalEpisodes = total?.count || 0;
  }

  return { document: doc, prevId, nextId, totalEpisodes };
}

export async function handleWenkuSearch(db, query) {
  const pattern = `%${query}%`;
  const result = await db.prepare(
    `SELECT id, title, type, category, series_name, episode_num, format, read_count
     FROM documents
     WHERE type = 'transcript' AND content IS NOT NULL AND content != ''
       AND (title LIKE ? OR content LIKE ? OR series_name LIKE ?)
     ORDER BY read_count DESC LIMIT 30`
  ).bind(pattern, pattern, pattern).all();
  return { documents: result.results };
}

export async function handleWenkuReadCount(db, documentId) {
  if (!documentId) return { error: 'Missing documentId' };
  await db.prepare(
    'UPDATE documents SET read_count = read_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(documentId).run();
  return { success: true };
}

function syncNormalizeName(name) {
  let n = name;
  n = n.replace(/（[^）]*）/g, '');
  n = n.replace(/\([^)]*\)/g, '');
  n = n.replace(/[《》、·「」『』【】“”‘’！？。，；：]/g, '');
  n = n.replace(/\s+/g, '-');
  n = n.replace(/[^\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9-]/g, '');
  n = n.replace(/-{2,}/g, '-');
  n = n.replace(/^-+|-+$/g, '');
  return n;
}

function syncGenId(seriesName, epNum) {
  return `daafs-${syncNormalizeName(seriesName)}-${String(epNum).padStart(2, '0')}`;
}

function syncIsGarbage(key) {
  const fileName = key.split('/').pop();
  return SYNC_GARBAGE.some(pattern => pattern.test(fileName));
}

function syncParseFolder(name) {
  const m = name.match(/^(\d+)\s+(.+?)\s+(\d+)[讲辑]$/);
  if (m) return { num: m[1], series: m[2].trim(), total: parseInt(m[3], 10) };
  const s = name.match(/^(\d+)\s+(.+)$/);
  if (s) return { num: s[1], series: s[2].trim(), total: null };
  return null;
}

function syncParseEpNum(fileName) {
  const m = fileName.match(/第(\d+)[讲辑]/);
  return m ? parseInt(m[1], 10) : null;
}

function syncResolveFolder22(fileName) {
  for (const item of SYNC_FOLDER22) {
    if (fileName.includes(item.prefix)) return item.prefix;
  }
  return null;
}

function syncIsYiyongDup(name) {
  for (const dup of SYNC_YIYONG_DUPS) {
    if (name.includes(dup) || dup.includes(name)) return true;
  }
  return false;
}

async function syncListAll(bucket, prefix) {
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

export async function handleWenkuSync(env, cors, json) {
  const db = env.DB;
  const bucket = env.R2_WENKU;

  if (!bucket) {
    return json({ error: 'R2_WENKU binding not available' }, cors, 500);
  }

  const stats = { scanned: 0, inserted: 0, skipped: 0, errors: 0, series: {} };

  await db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY, title TEXT NOT NULL,
      type TEXT DEFAULT 'transcript', category TEXT DEFAULT '大安法师',
      series_name TEXT, episode_num INTEGER,
      format TEXT DEFAULT 'txt', r2_bucket TEXT DEFAULT 'jingdianwendang',
      r2_key TEXT, content TEXT, file_size INTEGER,
      audio_series_id TEXT, audio_episode_num INTEGER,
      read_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const existingResult = await db.prepare('SELECT id FROM documents').all();
  const existing = new Set(existingResult.results.map(r => r.id));
  const allObjects = await syncListAll(bucket, SYNC_R2_BASE);
  const mainFiles = [];
  const yiyongFiles = [];

  for (const obj of allObjects) {
    if (obj.key.endsWith('/')) continue;
    const rel = obj.key.slice(SYNC_R2_BASE.length);
    if (rel.startsWith(SYNC_YIYONG)) yiyongFiles.push(obj);
    else mainFiles.push(obj);
  }

  async function processObj(obj, isYiyong) {
    const fileName = obj.key.split('/').pop();
    if (!fileName.endsWith('.txt')) {
      stats.skipped++;
      return;
    }
    if (syncIsGarbage(obj.key)) {
      stats.skipped++;
      return;
    }
    stats.scanned++;

    const base = isYiyong ? SYNC_R2_BASE + SYNC_YIYONG : SYNC_R2_BASE;
    const rel = obj.key.slice(base.length);
    const segs = rel.split('/');
    if (segs.length < 2) {
      stats.skipped++;
      return;
    }

    const folderName = segs[0];
    const parsed = syncParseFolder(folderName);
    if (!parsed) {
      stats.skipped++;
      return;
    }

    let seriesName = parsed.num === '22' ? syncResolveFolder22(fileName) : parsed.series;
    if (!seriesName) {
      stats.skipped++;
      return;
    }
    if (isYiyong && syncIsYiyongDup(seriesName)) {
      stats.skipped++;
      return;
    }

    const epNum = syncParseEpNum(fileName);
    if (!epNum) {
      stats.skipped++;
      return;
    }

    const id = syncGenId(seriesName, epNum);
    if (existing.has(id)) {
      stats.skipped++;
      return;
    }

    let content = '';
    try {
      const r2Obj = await bucket.get(obj.key);
      if (r2Obj) content = await r2Obj.text();
    } catch {
      content = '';
    }

    if (!content || !content.trim()) {
      stats.skipped++;
      return;
    }

    const title = `${seriesName} 第${String(epNum).padStart(2, '0')}讲`;

    try {
      await db.prepare(
        `INSERT INTO documents (id, title, type, category, series_name, episode_num,
          format, r2_bucket, r2_key, content, file_size, created_at, updated_at)
         VALUES (?, ?, 'transcript', '大安法师', ?, ?, 'txt', 'jingdianwendang', ?, ?, ?,
                 datetime('now'), datetime('now'))`
      ).bind(id, title, seriesName, epNum, obj.key, content, obj.size || 0).run();

      existing.add(id);
      stats.inserted++;
      if (!stats.series[seriesName]) stats.series[seriesName] = 0;
      stats.series[seriesName]++;
    } catch {
      stats.errors++;
    }
  }

  for (const obj of mainFiles) await processObj(obj, false);
  for (const obj of yiyongFiles) await processObj(obj, true);

  return json({
    success: true,
    scanned: stats.scanned,
    inserted: stats.inserted,
    skipped: stats.skipped,
    errors: stats.errors,
    series: stats.series,
    totalInDb: existing.size,
  }, cors, 200, 'no-store');
}

export async function handleWenkuSyncStatus(db, cors, json) {
  try {
    const total = await db.prepare('SELECT COUNT(*) as c FROM documents').first();
    const series = await db.prepare(
      `SELECT series_name, COUNT(*) as count FROM documents
       WHERE type = 'transcript' AND content IS NOT NULL AND content != ''
       GROUP BY series_name ORDER BY series_name`
    ).all();
    return json({
      totalDocuments: total?.c || 0,
      series: series.results || [],
    }, cors, 200, 'no-store');
  } catch (e) {
    return json({ error: e.message }, cors, 500);
  }
}
