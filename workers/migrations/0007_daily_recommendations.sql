-- ============================================================
-- 0007_daily_recommendations.sql
-- AI 每日推荐缓存表
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_daily_recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date_key TEXT NOT NULL,
  recommendations TEXT NOT NULL,
  model TEXT NOT NULL,
  generation_ms INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ready',
  error TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_rec_date ON ai_daily_recommendations(date_key);
