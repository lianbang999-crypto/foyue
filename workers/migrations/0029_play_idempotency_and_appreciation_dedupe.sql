-- ============================================================
-- 0029_play_idempotency_and_appreciation_dedupe.sql
--
-- 目的：
-- 1. 为播放日志增加稳定访客标识和请求幂等键
-- 2. 清洗历史空 client_hash 随喜脏数据
-- 3. 为系列级随喜去重建立数据库唯一约束
-- ============================================================

ALTER TABLE play_logs ADD COLUMN visitor_id TEXT;
ALTER TABLE play_logs ADD COLUMN request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_play_logs_request_id_unique
ON play_logs(request_id)
WHERE request_id IS NOT NULL AND TRIM(request_id) != '';

WITH ranked_empty_hash_rows AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY series_id
      ORDER BY COALESCE(created_at, ''), id
    ) AS row_num
  FROM appreciations
  WHERE client_hash IS NULL OR TRIM(client_hash) = ''
)
DELETE FROM appreciations
WHERE id IN (
  SELECT id
  FROM ranked_empty_hash_rows
  WHERE row_num > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_appreciations_series_client_unique
ON appreciations(series_id, client_hash)
WHERE client_hash IS NOT NULL AND TRIM(client_hash) != '';