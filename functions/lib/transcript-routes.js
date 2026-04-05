import { AI_CONFIG, GATEWAY_PROFILES, extractAIResponse, runAIWithLogging, timingSafeCompare, resolveAIModel } from './ai-utils.js';

export async function handleTranscriptAvailability(db, seriesId, cors, json) {
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

export async function handleGetTranscript(db, seriesId, episodeNum, cors, json) {
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

export async function handlePopulateTranscriptMapping(env, request, cors, json) {
  const token = request.headers.get('X-Admin-Token');
  if (!token || !env.ADMIN_TOKEN || !timingSafeCompare(token, env.ADMIN_TOKEN)) {
    return json({ error: 'Unauthorized' }, cors, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, cors, 400);
  }

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
      await env.DB.prepare(
        `UPDATE documents
         SET episode_num = CAST(
           SUBSTR(title,
             INSTR(title, '第') + 1,
             INSTR(SUBSTR(title, INSTR(title, '第') + 1), '讲') - 1
           ) AS INTEGER
         ), updated_at = CURRENT_TIMESTAMP
         WHERE series_name = ? AND episode_num IS NULL
           AND title LIKE '%第%讲%'
           AND type = 'transcript'`
      ).bind(seriesName).run();

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

export async function handleAutoMatchTranscripts(env, request, cors, json) {
  const token = request.headers.get('X-Admin-Token');
  if (!token || !env.ADMIN_TOKEN || !timingSafeCompare(token, env.ADMIN_TOKEN)) {
    return json({ error: 'Unauthorized' }, cors, 401);
  }

  const db = env.DB;
  const { results: allSeries } = await db.prepare('SELECT id, title FROM series').all();
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

  function normalize(str) {
    return str
      .replace(/[（）()《》【】\[\]""''「」『』]/g, '')
      .replace(/[：:，,。.、；;！!？?\s]/g, '')
      .toLowerCase();
  }

  const audioMap = new Map();
  for (const series of allSeries) {
    audioMap.set(normalize(series.title), series.id);
  }

  let matched = 0;
  let updated = 0;
  const matches = [];
  const unmatched = [];

  for (const ws of wenkuSeries) {
    const normWenku = normalize(ws.series_name);
    let bestMatch = null;

    if (audioMap.has(normWenku)) bestMatch = audioMap.get(normWenku);

    if (!bestMatch) {
      let bestLen = 0;
      for (const [normAudio, audioId] of audioMap) {
        if (normWenku.includes(normAudio) || normAudio.includes(normWenku)) {
          const overlap = Math.min(normWenku.length, normAudio.length);
          if (overlap > bestLen) {
            bestLen = overlap;
            bestMatch = audioId;
          }
        }
      }
    }

    if (!bestMatch) {
      unmatched.push(ws.series_name);
      continue;
    }

    matched++;
    matches.push({ wenkuSeries: ws.series_name, audioSeriesId: bestMatch });

    try {
      await db.prepare(
        `UPDATE documents
         SET episode_num = CAST(
           SUBSTR(title,
             INSTR(title, '第') + 1,
             INSTR(SUBSTR(title, INSTR(title, '第') + 1), '讲') - 1
           ) AS INTEGER
         ), updated_at = CURRENT_TIMESTAMP
         WHERE series_name = ? AND episode_num IS NULL
           AND title LIKE '%第%讲%'
           AND type = 'transcript'`
      ).bind(ws.series_name).run();
    } catch { }

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
  }

  return json({
    success: true,
    matched,
    updated,
    matches,
    unmatched: unmatched.length > 0 ? unmatched : undefined,
  }, cors, 200, 'no-store');
}

export async function handleIncrementalTranscribe(env, request, cors, json) {
  const token = request.headers.get('X-Admin-Token');
  if (!token || !env.ADMIN_TOKEN || !timingSafeCompare(token, env.ADMIN_TOKEN)) {
    return json({ error: 'Unauthorized' }, cors, 401);
  }

  if (!env.AI) {
    return json({ error: 'Workers AI not bound. Add [ai] binding to wrangler.toml' }, cors, 500);
  }

  let body = {};
  try { body = await request.json(); } catch { }
  const batchLimit = Math.min(body.limit || 3, 10);
  const db = env.DB;

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
    const epResult = { seriesId: ep.series_id, episodeNum: ep.episode_num, title: ep.title };
    try {
      const audioResponse = await fetch(ep.url, {
        headers: { Range: 'bytes=0-1048576' },
      });
      if (!audioResponse.ok) {
        throw new Error(`Audio download failed: ${audioResponse.status}`);
      }

      const audioBuffer = await audioResponse.arrayBuffer();
      const transcription = await env.AI.run(
        resolveAIModel(env, 'whisper'),
        { audio: [...new Uint8Array(audioBuffer)] },
        { gateway: GATEWAY_PROFILES.whisper }
      );

      const text = transcription.text?.trim();
      if (!text) throw new Error('Whisper returned empty transcription');

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
        ep.episode_num
      ).run();

      epResult.status = 'completed';
      epResult.textLength = text.length;
      epResult.preview = text.slice(0, 100) + '...';
      processed++;
    } catch (err) {
      epResult.status = 'failed';
      epResult.error = err.message;
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

export async function handleGetChapters(env, seriesId, episodeNum, cors, json) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT chapter_index, title, start_time, end_time
       FROM episode_chapters
       WHERE series_id = ? AND episode_num = ?
       ORDER BY chapter_index`
    ).bind(seriesId, episodeNum).all();
    return json({ chapters: results || [] }, cors);
  } catch {
    return json({ chapters: [] }, cors);
  }
}

export async function handleGenerateChapters(env, request, cors, json) {
  const token = request.headers.get('X-Admin-Token');
  if (!token || !env.ADMIN_TOKEN || !timingSafeCompare(token, env.ADMIN_TOKEN)) {
    return json({ error: 'Unauthorized' }, cors, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, cors, 400);
  }

  const { series_id, episode_num } = body;
  if (!series_id || !episode_num) {
    return json({ error: 'Missing series_id or episode_num' }, cors, 400);
  }

  const doc = await env.DB.prepare(
    `SELECT id, title, content FROM documents
     WHERE audio_series_id = ? AND audio_episode_num = ?
     AND content IS NOT NULL AND content != ''
     LIMIT 1`
  ).bind(series_id, episode_num).first();

  if (!doc?.content) {
    return json({ error: '未找到该集文稿，请先确保有转录文本' }, cors, 404);
  }

  const ep = await env.DB.prepare(
    'SELECT duration FROM episodes WHERE series_id = ? AND episode_num = ?'
  ).bind(series_id, episode_num).first();
  const totalDuration = ep?.duration || 3600;
  const truncated = doc.content.slice(0, 8000);
  const messages = [
    {
      role: 'system',
      content: `你是一位佛教音频内容编辑。请分析以下讲经文稿，识别主要的主题段落，生成章节标记。
要求：
1. 生成3-8个章节，每个章节有标题和预估的开始时间
2. 标题简洁（10-20字），概括该段落的核心内容
3. 开始时间按内容在全文中的相对位置估算（总时长约${Math.round(totalDuration / 60)}分钟）
4. 严格按JSON数组格式输出，不要输出其他内容
5. 第一个章节的开始时间为0`,
    },
    {
      role: 'user',
      content: `文稿标题：${doc.title}\n\n文稿内容：${truncated}\n\n请按以下JSON格式输出：
[{"title":"章节标题","start_time":0},{"title":"...","start_time":360}]`,
    },
  ];

  let response;
  const chatModel = resolveAIModel(env, 'chat');
  const fallbackChatModel = resolveAIModel(env, 'chatFallback');
  try {
    response = await env.AI.run(
      chatModel,
      { messages, max_tokens: 500, temperature: 0.3 },
      { gateway: GATEWAY_PROFILES.ragChat }
    );
  } catch {
    response = await env.AI.run(
      fallbackChatModel,
      { messages, max_tokens: 500, temperature: 0.3 },
      { gateway: GATEWAY_PROFILES.ragChat }
    );
  }

  const text = extractAIResponse(response);
  if (!text) return json({ error: 'AI 未能生成章节标记' }, cors, 503);

  const cleaned = text.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
  let chapters;
  try {
    chapters = JSON.parse(cleaned);
  } catch {
    return json({ error: 'AI 输出格式解析失败', raw: cleaned.slice(0, 200) }, cors, 500);
  }

  if (!Array.isArray(chapters) || !chapters.length) {
    return json({ error: '未生成有效章节' }, cors, 500);
  }

  let inserted = 0;
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    if (!chapter.title || chapter.start_time == null) continue;
    try {
      await env.DB.prepare(
        `INSERT OR REPLACE INTO episode_chapters
         (series_id, episode_num, chapter_index, title, start_time, end_time)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(
        series_id,
        episode_num,
        i,
        chapter.title.slice(0, 100),
        Number(chapter.start_time) || 0,
        i < chapters.length - 1 ? (Number(chapters[i + 1].start_time) || null) : null
      ).run();
      inserted++;
    } catch (err) {
      console.warn('Chapter insert failed:', err.message);
    }
  }

  return json({ success: true, chapters_count: inserted, chapters }, cors);
}
