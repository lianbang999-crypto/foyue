-- 净土法音 D1 数据库 — 随喜功能升级：支持按集随喜，取消每日限制
-- Migration: 0005_appreciate_episode.sql

-- 给 appreciations 表添加 episode_num 字段
ALTER TABLE appreciations ADD COLUMN episode_num INTEGER DEFAULT NULL;

-- 创建索引：按系列+集数查询随喜总数
CREATE INDEX IF NOT EXISTS idx_appreciations_series_ep ON appreciations(series_id, episode_num);
