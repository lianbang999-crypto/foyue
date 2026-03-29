-- 为 episodes 表添加音频元数据列
-- 供播放器 API 直接返回 bytes / mime / etag，减少前端探测请求

ALTER TABLE episodes ADD COLUMN bytes INTEGER DEFAULT 0;
ALTER TABLE episodes ADD COLUMN mime TEXT DEFAULT '';
ALTER TABLE episodes ADD COLUMN etag TEXT DEFAULT '';