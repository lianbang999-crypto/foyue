-- ============================================================
-- 0031_wenku_remove_duplicate_legacy_documents.sql
--
-- 清理法音文库历史重复记录：
-- 同一 series_name + episode_num 同时存在旧路径记录（第1讲）
-- 和新 daafs Markdown 记录（第01讲）时，保留旧路径记录，
-- 删除 daafs 补零记录。
-- ============================================================

-- 删除前先把 daafs 补零重复项的阅读数并入旧路径保留项。
WITH legacy AS (
  SELECT series_name, episode_num, MIN(id) AS keep_id
  FROM documents
  WHERE type = 'transcript'
    AND id NOT LIKE 'daafs-%'
    AND series_name IS NOT NULL
    AND episode_num IS NOT NULL
    AND content IS NOT NULL AND content != ''
  GROUP BY series_name, episode_num
),
duplicate_reads AS (
  SELECT l.keep_id, SUM(COALESCE(d.read_count, 0)) AS duplicate_read_count
  FROM legacy l
  JOIN documents d
    ON d.series_name = l.series_name
   AND d.episode_num = l.episode_num
   AND d.type = 'transcript'
   AND d.id LIKE 'daafs-%'
   AND d.format = 'md'
  GROUP BY l.keep_id
)
UPDATE documents
SET read_count = COALESCE(read_count, 0) + COALESCE((
      SELECT duplicate_read_count
      FROM duplicate_reads
      WHERE duplicate_reads.keep_id = documents.id
    ), 0),
    updated_at = datetime('now')
WHERE id IN (SELECT keep_id FROM duplicate_reads);

-- 如果 daafs 重复项已有 AI 摘要而旧路径保留项没有，搬一份过去。
WITH legacy AS (
  SELECT series_name, episode_num, MIN(id) AS keep_id
  FROM documents
  WHERE type = 'transcript'
    AND id NOT LIKE 'daafs-%'
    AND series_name IS NOT NULL
    AND episode_num IS NOT NULL
    AND content IS NOT NULL AND content != ''
  GROUP BY series_name, episode_num
),
summary_candidates AS (
  SELECT l.keep_id, s.summary, s.model, s.created_at,
         ROW_NUMBER() OVER (
           PARTITION BY l.keep_id
           ORDER BY COALESCE(s.created_at, ''), s.id
         ) AS row_num
  FROM legacy l
  JOIN documents d
    ON d.series_name = l.series_name
   AND d.episode_num = l.episode_num
   AND d.type = 'transcript'
   AND d.id LIKE 'daafs-%'
   AND d.format = 'md'
  JOIN ai_summaries s ON s.document_id = d.id
  WHERE s.summary IS NOT NULL AND s.summary != ''
)
INSERT OR IGNORE INTO ai_summaries (document_id, summary, model, created_at)
SELECT keep_id, summary, model, created_at
FROM summary_candidates
WHERE row_num = 1;

-- 清理指向 daafs 重复文档的 AI 任务与摘要记录。
WITH legacy AS (
  SELECT series_name, episode_num, MIN(id) AS keep_id
  FROM documents
  WHERE type = 'transcript'
    AND id NOT LIKE 'daafs-%'
    AND series_name IS NOT NULL
    AND episode_num IS NOT NULL
    AND content IS NOT NULL AND content != ''
  GROUP BY series_name, episode_num
),
doomed AS (
  SELECT d.id
  FROM legacy l
  JOIN documents d
    ON d.series_name = l.series_name
   AND d.episode_num = l.episode_num
   AND d.type = 'transcript'
   AND d.id LIKE 'daafs-%'
   AND d.format = 'md'
)
DELETE FROM ai_embedding_jobs
WHERE document_id IN (SELECT id FROM doomed);

WITH legacy AS (
  SELECT series_name, episode_num, MIN(id) AS keep_id
  FROM documents
  WHERE type = 'transcript'
    AND id NOT LIKE 'daafs-%'
    AND series_name IS NOT NULL
    AND episode_num IS NOT NULL
    AND content IS NOT NULL AND content != ''
  GROUP BY series_name, episode_num
),
doomed AS (
  SELECT d.id
  FROM legacy l
  JOIN documents d
    ON d.series_name = l.series_name
   AND d.episode_num = l.episode_num
   AND d.type = 'transcript'
   AND d.id LIKE 'daafs-%'
   AND d.format = 'md'
)
DELETE FROM ai_summaries
WHERE document_id IN (SELECT id FROM doomed);

-- 删除 daafs 补零重复文档；documents_fts 的触发器会同步删索引。
WITH legacy AS (
  SELECT series_name, episode_num, MIN(id) AS keep_id
  FROM documents
  WHERE type = 'transcript'
    AND id NOT LIKE 'daafs-%'
    AND series_name IS NOT NULL
    AND episode_num IS NOT NULL
    AND content IS NOT NULL AND content != ''
  GROUP BY series_name, episode_num
),
doomed AS (
  SELECT d.id
  FROM legacy l
  JOIN documents d
    ON d.series_name = l.series_name
   AND d.episode_num = l.episode_num
   AND d.type = 'transcript'
   AND d.id LIKE 'daafs-%'
   AND d.format = 'md'
)
DELETE FROM documents
WHERE id IN (SELECT id FROM doomed);
