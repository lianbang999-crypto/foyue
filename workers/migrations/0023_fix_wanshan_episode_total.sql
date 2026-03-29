-- ============================================================
-- 0023_fix_wanshan_episode_total.sql
--
-- 目的：万善先资当前实际可播章节为 47 条，第 37 条未上传，
-- 前台 total_episodes 需与实际可播数量一致。
-- ============================================================

UPDATE series
SET total_episodes = 47
WHERE id = 'wanshan-xianzi';