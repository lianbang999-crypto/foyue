-- 0015_gongxiu.sql
-- 共修社区：莲友念佛共修与回向记录

CREATE TABLE IF NOT EXISTS gongxiu_entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  date          TEXT    NOT NULL,                      -- YYYY-MM-DD（北京时间）
  nickname      TEXT    NOT NULL DEFAULT '莲友',
  practice      TEXT    NOT NULL,                      -- 念佛法门名称（如 南无阿弥陀佛）
  count         INTEGER NOT NULL CHECK(count > 0 AND count <= 150000),
  vow_type      TEXT    NOT NULL DEFAULT 'universal',  -- universal/blessing/rebirth/custom
  vow_target    TEXT    NOT NULL DEFAULT '',           -- 回向对象（消灾/往生时填写）
  vow_custom    TEXT    NOT NULL DEFAULT '',           -- 自定义回向文
  ip_hash       TEXT    NOT NULL DEFAULT '',           -- 用于每日去重（服务端填充）
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 快速聚合查询：按日期统计参与人数和总声数
CREATE INDEX IF NOT EXISTS idx_gx_date      ON gongxiu_entries(date, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gx_ip_date   ON gongxiu_entries(ip_hash, date);

-- 每日聚合缓存（避免频繁全表扫描）
CREATE TABLE IF NOT EXISTS gongxiu_daily_stats (
  date              TEXT    PRIMARY KEY,               -- YYYY-MM-DD
  total_count       INTEGER NOT NULL DEFAULT 0,
  participant_count INTEGER NOT NULL DEFAULT 0,
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
