-- ============================================================
-- 0024_wenku_performance_indexes.sql
-- 文库常用查询性能优化
-- ============================================================

-- 文库首页、系列详情、上一篇/下一篇、总讲数统计
-- 都依赖 type + series_name + episode_num 这一条查询路径。
CREATE INDEX IF NOT EXISTS idx_documents_wenku_series_episode
ON documents(type, series_name, episode_num);