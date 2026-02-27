-- 净土法音 D1 数据库 — 添加 origin 分站统计字段
-- Migration: 0003_add_origin.sql

-- 给 play_logs 表添加 origin 字段（记录请求来自哪个域名）
ALTER TABLE play_logs ADD COLUMN origin TEXT DEFAULT '';

-- 给 appreciations 表也添加 origin 字段
ALTER TABLE appreciations ADD COLUMN origin TEXT DEFAULT '';

-- 为 origin 创建索引，方便按域名筛选
CREATE INDEX IF NOT EXISTS idx_play_logs_origin ON play_logs(origin);
CREATE INDEX IF NOT EXISTS idx_appreciations_origin ON appreciations(origin);
