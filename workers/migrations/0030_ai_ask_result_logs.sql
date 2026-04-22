-- ============================================================
-- 0030_ai_ask_result_logs.sql
-- AI 问答结果级日志表 — 记录 ask / ask-stream 的最终返回结果
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_ask_result_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route TEXT NOT NULL,                -- ask / ask-stream
  mode TEXT,                          -- answer / search_only / no_result；失败时可为空
  downgrade_reason TEXT,              -- unsupported_question / insufficient_evidence / no_documents / ...
  citation_count INTEGER NOT NULL DEFAULT 0,
  citation_hit INTEGER NOT NULL DEFAULT 0,
  claim_count INTEGER NOT NULL DEFAULT 0,
  confidence REAL,
  provider TEXT,
  model TEXT,
  success INTEGER NOT NULL DEFAULT 1,
  error TEXT,
  timestamp INTEGER NOT NULL          -- Unix 时间戳（毫秒）
);

CREATE INDEX IF NOT EXISTS idx_ai_ask_result_logs_ts ON ai_ask_result_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_ai_ask_result_logs_route_ts ON ai_ask_result_logs(route, timestamp);
CREATE INDEX IF NOT EXISTS idx_ai_ask_result_logs_mode_ts ON ai_ask_result_logs(mode, timestamp);
CREATE INDEX IF NOT EXISTS idx_ai_ask_result_logs_success_ts ON ai_ask_result_logs(success, timestamp);