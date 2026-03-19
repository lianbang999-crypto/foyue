-- ============================================================
-- 0014_ai_schema_hardening.sql
-- AI 相关查询性能与任务表约束强化
-- ============================================================

-- 先去重，确保每个 document_id 只保留最新一条任务记录
DELETE FROM ai_embedding_jobs
WHERE id NOT IN (
  SELECT MAX(id)
  FROM ai_embedding_jobs
  GROUP BY document_id
);

-- ai_embedding_jobs 应该是每文档一条状态记录，建立唯一索引后可安全 UPSERT
CREATE UNIQUE INDEX IF NOT EXISTS idx_embedding_jobs_doc_unique
ON ai_embedding_jobs(document_id);

-- AI 聊天、讲义映射、每日推荐都会频繁按音频系列/集数查 documents
CREATE INDEX IF NOT EXISTS idx_documents_audio_lookup
ON documents(audio_series_id, audio_episode_num);
