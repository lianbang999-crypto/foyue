-- 为 episodes 表添加 duration 列（音频时长，秒）
-- 去除对完整 URL 的依赖，URL 由后端从 bucket + folder + file_name 动态构建

ALTER TABLE episodes ADD COLUMN duration INTEGER DEFAULT 0;
