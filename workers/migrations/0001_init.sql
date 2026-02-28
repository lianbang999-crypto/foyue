-- 净土法音 D1 数据库 Schema
-- Migration: 0001_init.sql

-- ============================================================
-- 分类表
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,            -- 'tingjingtai', 'fohao', 'youshengshu'
  title TEXT NOT NULL,            -- '听经台'
  title_en TEXT NOT NULL,         -- 'Dharma Lectures'
  sort_order INTEGER DEFAULT 0,  -- 排序权重
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- 系列表
-- ============================================================
CREATE TABLE IF NOT EXISTS series (
  id TEXT PRIMARY KEY,            -- 'xingyuanxing-zhengbian'
  category_id TEXT NOT NULL,      -- 外键 → categories.id
  title TEXT NOT NULL,            -- '净土资粮信愿行（正编）'
  title_en TEXT NOT NULL,         -- 'Faith, Vow & Practice (Part 1)'
  speaker TEXT NOT NULL,          -- '大安法师'
  speaker_en TEXT NOT NULL,       -- 'Master Da''an'
  bucket TEXT NOT NULL,           -- R2 bucket 标识: 'daanfashi'
  folder TEXT,                    -- R2 文件夹路径（可为 null）
  total_episodes INTEGER DEFAULT 0,
  intro TEXT,                     -- 系列简介
  sort_order INTEGER DEFAULT 0,
  play_count INTEGER DEFAULT 0,  -- 系列总播放次数
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE INDEX IF NOT EXISTS idx_series_category ON series(category_id);

-- ============================================================
-- 集数表
-- ============================================================
CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id TEXT NOT NULL,        -- 外键 → series.id
  episode_num INTEGER NOT NULL,   -- 集数编号（原 id 字段）
  title TEXT NOT NULL,            -- '第1讲'
  file_name TEXT NOT NULL,        -- 原始文件名
  url TEXT NOT NULL,              -- R2 完整 URL
  intro TEXT,                     -- 集数简介（可选）
  story_number INTEGER,           -- 故事编号（仅大安法师讲故事用）
  play_count INTEGER DEFAULT 0,   -- 单集播放次数
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (series_id) REFERENCES series(id)
);

CREATE INDEX IF NOT EXISTS idx_episodes_series ON episodes(series_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_episodes_unique ON episodes(series_id, episode_num);

-- ============================================================
-- 播放计数日志表（可选，用于统计趋势）
-- ============================================================
CREATE TABLE IF NOT EXISTS play_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id TEXT NOT NULL,
  episode_num INTEGER NOT NULL,
  played_at TEXT DEFAULT (datetime('now')),
  user_agent TEXT,                -- 浏览器 UA（匿名统计用）
  FOREIGN KEY (series_id) REFERENCES series(id)
);

CREATE INDEX IF NOT EXISTS idx_play_logs_series ON play_logs(series_id);
CREATE INDEX IF NOT EXISTS idx_play_logs_date ON play_logs(played_at);

-- ============================================================
-- 随喜表（点赞/appreciation）
-- ============================================================
CREATE TABLE IF NOT EXISTS appreciations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id TEXT NOT NULL,
  client_hash TEXT,               -- 匿名客户端标识（IP hash，防刷）
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (series_id) REFERENCES series(id)
);

CREATE INDEX IF NOT EXISTS idx_appreciations_series ON appreciations(series_id);
