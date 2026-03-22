-- 0016_appreciation_guardrails.sql
-- 随喜防刷：按系列 + 客户端哈希去重时使用的查询索引

CREATE INDEX IF NOT EXISTS idx_appreciations_series_client
ON appreciations(series_id, client_hash);
