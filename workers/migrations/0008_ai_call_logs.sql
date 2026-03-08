-- ============================================================
-- 0008_ai_call_logs.sql
-- AI Gateway 调用日志表 — 按场景记录每次 AI 调用的耗时和状态
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_call_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario TEXT NOT NULL,          -- embedding, searchEmbedding, ragChat, ragStream, summary, recommend, whisper, diagnostic
  model TEXT NOT NULL,             -- 模型标识符
  duration_ms INTEGER NOT NULL,    -- 调用耗时（毫秒）
  cached INTEGER DEFAULT 0,       -- 是否命中 Gateway 缓存 (0/1)
  success INTEGER DEFAULT 1,      -- 是否成功 (0/1)
  error TEXT,                      -- 错误信息（失败时）
  timestamp INTEGER NOT NULL       -- Unix 时间戳（毫秒）
);

-- 按场景+时间查询（统计分析用）
CREATE INDEX IF NOT EXISTS idx_ai_logs_scenario_ts ON ai_call_logs(scenario, timestamp);

-- 按时间清理旧数据
CREATE INDEX IF NOT EXISTS idx_ai_logs_ts ON ai_call_logs(timestamp);
