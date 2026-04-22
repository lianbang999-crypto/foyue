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
  try {
    const result = await db.prepare(
      `SELECT d.id, d.title, d.type, d.category, d.series_name, d.episode_num, d.format,
              d.file_size, d.audio_series_id, d.read_count, s.summary
       FROM documents d
       LEFT JOIN ai_summaries s ON s.document_id = d.id
       WHERE d.series_name = ? AND d.type = 'transcript'
         AND d.content IS NOT NULL AND d.content != ''
       ORDER BY d.episode_num`
    ).bind(seriesName).all();
    return { documents: result.results };
  } catch {
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
}

export async function handleWenkuDocument(db, id) {
  // 单次 CTE 查询：同时取当前文档、前一讲、后一讲和总集数
  // 当 series_name 或 episode_num 为空时，nav CTE 不产生行，LEFT JOIN 给出 NULL，行为与原逻辑一致
  const row = await db.prepare(`
    WITH target AS (
      SELECT * FROM documents WHERE id = ?
    ),
    nav AS (
      SELECT
        LAG(d.id)  OVER (ORDER BY d.episode_num) AS prev_id,
        LEAD(d.id) OVER (ORDER BY d.episode_num) AS next_id,
        COUNT(*)   OVER ()                        AS total_count,
        d.id
      FROM documents d, target t
      WHERE d.series_name = t.series_name
        AND t.series_name IS NOT NULL
        AND t.episode_num IS NOT NULL
        AND d.type = 'transcript'
        AND d.content IS NOT NULL AND d.content != ''
    )
    SELECT t.*, n.prev_id, n.next_id, COALESCE(n.total_count, 0) AS total_count
    FROM target t
    LEFT JOIN nav n ON n.id = t.id
  `).bind(id).first();

  if (!row) return { document: null };

  const { prev_id, next_id, total_count, ...doc } = row;
  return {
    document: doc,
    prevId: prev_id || null,
    nextId: next_id || null,
    totalEpisodes: total_count || 0,
  };
}

export async function handleWenkuSearch(db, query) {
  // 优先使用 FTS5 全文索引，若不可用则回退到 LIKE
  try {
    const result = await db.prepare(
      `SELECT d.id, d.title, d.type, d.category, d.series_name, d.episode_num, d.format, d.read_count,
              snippet(documents_fts, 1, '', '', '…', 30) AS snippet
       FROM documents_fts
       JOIN documents d ON d.rowid = documents_fts.rowid
       WHERE documents_fts MATCH ?
         AND d.type = 'transcript' AND d.content IS NOT NULL AND d.content != ''
       ORDER BY rank LIMIT 30`
    ).bind(query).all();
    return { documents: result.results };
  } catch {
    // FTS5 不可用时回退 LIKE 搜索
    const escaped = query.replace(/[%_]/g, '\\$&');
    const pattern = `%${escaped}%`;
    const result = await db.prepare(
      `SELECT id, title, type, category, series_name, episode_num, format, read_count
       FROM documents
       WHERE type = 'transcript' AND content IS NOT NULL AND content != ''
         AND (title LIKE ? OR content LIKE ? OR series_name LIKE ?)
       ORDER BY read_count DESC LIMIT 30`
    ).bind(pattern, pattern, pattern).all();
    return { documents: result.results };
  }
}

const _readCountRecent = new Map();

export async function handleWenkuReadCount(db, documentId, clientIp) {
  if (!documentId) return { error: 'Missing documentId' };

  // 简易 IP 限流：同一 IP + 同一文档 60s 内只计一次
  const key = `rc:${clientIp || 'unknown'}:${documentId}`;
  const now = Date.now();
  const lastSeenAt = _readCountRecent.get(key) || 0;
  if (lastSeenAt && now - lastSeenAt < 60_000) return { success: true, throttled: true };
  _readCountRecent.set(key, now);
  // 清理过期条目（每 50 次写入清理一次）
  if (_readCountRecent.size > 200) {
    for (const [k, ts] of _readCountRecent) {
      if (now - ts > 60_000) _readCountRecent.delete(k);
    }
  }

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

  const stats = { scanned: 0, inserted: 0, updated: 0, skipped: 0, errors: 0, series: {} };

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

  const existingResult = await db.prepare('SELECT id, format FROM documents').all();
  const existingById = new Map(existingResult.results.map(row => [row.id, row.format || 'txt']));
  const allObjects = await syncListAll(bucket, SYNC_R2_BASE);
  const mainFiles = [];
  const yiyongFiles = [];

  for (const obj of allObjects) {
    if (obj.key.endsWith('/')) continue;
    const rel = obj.key.slice(SYNC_R2_BASE.length);
    if (rel.startsWith(SYNC_YIYONG)) yiyongFiles.push(obj);
    else mainFiles.push(obj);
  }

  // .md 优先于 .txt：同一文档同时存在两种格式时，优先处理 .md
  const mdFirstSort = (a, b) => {
    const aMd = a.key.endsWith('.md') ? 0 : 1;
    const bMd = b.key.endsWith('.md') ? 0 : 1;
    return aMd - bMd;
  };
  mainFiles.sort(mdFirstSort);
  yiyongFiles.sort(mdFirstSort);

  function buildSyncCandidate(obj, isYiyong) {
    const fileName = obj.key.split('/').pop();
    if (!fileName.endsWith('.txt') && !fileName.endsWith('.md')) return null;
    if (syncIsGarbage(obj.key)) return null;

    const base = isYiyong ? SYNC_R2_BASE + SYNC_YIYONG : SYNC_R2_BASE;
    const rel = obj.key.slice(base.length);
    const segs = rel.split('/');
    if (segs.length < 2) return null;

    const folderName = segs[0];
    const parsed = syncParseFolder(folderName);
    if (!parsed) return null;

    const seriesName = parsed.num === '22' ? syncResolveFolder22(fileName) : parsed.series;
    if (!seriesName) return null;
    if (isYiyong && syncIsYiyongDup(seriesName)) return null;

    const epNum = syncParseEpNum(fileName);
    if (!epNum) return null;

    const isMd = fileName.endsWith('.md');
    return {
      id: syncGenId(seriesName, epNum),
      seriesName,
      epNum,
      isMd,
      format: isMd ? 'md' : 'txt',
      title: `${seriesName} 第${String(epNum).padStart(2, '0')}讲`,
    };
  }

  const mainSourceIds = new Set();
  for (const obj of mainFiles) {
    const candidate = buildSyncCandidate(obj, false);
    if (candidate) mainSourceIds.add(candidate.id);
  }

  async function processObj(obj, isYiyong) {
    const candidate = buildSyncCandidate(obj, isYiyong);
    if (!candidate) {
      stats.skipped++;
      return;
    }
    stats.scanned++;

    const { id, seriesName, epNum, isMd, format, title } = candidate;
    const existingFormat = existingById.get(id) || '';

    if (existingFormat && !isMd) {
      stats.skipped++;
      return;
    }

    if (existingFormat === 'md') {
      stats.skipped++;
      return;
    }

    if (isYiyong && isMd && mainSourceIds.has(id)) {
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

    try {
      if (existingFormat && isMd) {
        // 仅允许 .md 升级已有的 .txt 记录，避免不同来源的 .md 互相覆盖。
        await db.prepare(
          `UPDATE documents SET format = ?, r2_key = ?, content = ?, file_size = ?,
                  updated_at = datetime('now') WHERE id = ?`
        ).bind(format, obj.key, content, obj.size || 0, id).run();
        existingById.set(id, format);
        stats.updated++;
      } else {
        await db.prepare(
          `INSERT INTO documents (id, title, type, category, series_name, episode_num,
            format, r2_bucket, r2_key, content, file_size, created_at, updated_at)
           VALUES (?, ?, 'transcript', '大安法师', ?, ?, ?, 'jingdianwendang', ?, ?, ?,
                   datetime('now'), datetime('now'))`
        ).bind(id, title, seriesName, epNum, format, obj.key, content, obj.size || 0).run();
        existingById.set(id, format);
        stats.inserted++;
      }
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
    updated: stats.updated,
    skipped: stats.skipped,
    errors: stats.errors,
    series: stats.series,
    totalInDb: existingById.size,
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
