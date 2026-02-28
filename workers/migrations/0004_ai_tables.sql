-- ============================================================
-- 0004_ai_tables.sql
-- AI 功能所需的数据库表
-- ============================================================

-- AI 请求限流表（基于 IP 的速率限制）
CREATE TABLE IF NOT EXISTS ai_rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'ai_request',
  timestamp INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip_ts ON ai_rate_limits(ip, action, timestamp);

-- AI 摘要缓存表（每个文档/集生成一次，永久缓存）
CREATE TABLE IF NOT EXISTS ai_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_summaries_doc ON ai_summaries(document_id);

-- 向量化任务追踪表（追踪文档嵌入状态）
CREATE TABLE IF NOT EXISTS ai_embedding_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  chunks_count INTEGER DEFAULT 0,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_embedding_jobs_status ON ai_embedding_jobs(status);
CREATE INDEX IF NOT EXISTS idx_embedding_jobs_doc ON ai_embedding_jobs(document_id);
