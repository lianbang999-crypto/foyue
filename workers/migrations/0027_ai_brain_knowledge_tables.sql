-- 法音 AI Brain 知识图谱表
-- 让 AI 后台学习文库内容，建立结构化知识，精准回答用户问题

-- 主题分类树
CREATE TABLE IF NOT EXISTS ai_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER REFERENCES ai_topics(id),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INTEGER DEFAULT 0
);

-- 初始主题分类
INSERT INTO ai_topics (name, description, sort_order) VALUES
  ('信', '信心、深信因果、信佛功德、破疑生信', 1),
  ('愿', '发愿往生、厌离娑婆、欣求极乐', 2),
  ('行', '念佛方法、持名、念佛功夫、十念法', 3),
  ('往生', '往生条件、临终关怀、助念、九品往生', 4),
  ('净土庄严', '极乐世界依正庄严、莲池海会', 5),
  ('阿弥陀佛', '弥陀本愿、名号功德、四十八大愿', 6),
  ('因果', '善恶报应、三世因果、业力、戒律', 7),
  ('菩提心', '发菩提心、大乘心、菩萨道、回向', 8),
  ('教理', '教判、宗义、经典解释、净土五经', 9),
  ('实修问答', '散乱、妄念、懈怠、功课安排等修行问题', 10);

-- 预提取的问答知识对
CREATE TABLE IF NOT EXISTS ai_qa_pairs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT NOT NULL,
  topic_id INTEGER REFERENCES ai_topics(id),
  question TEXT NOT NULL,
  answer_quote TEXT NOT NULL,
  answer_position INTEGER,
  importance TEXT DEFAULT 'medium',
  hit_count INTEGER DEFAULT 0,
  confidence REAL DEFAULT 0.8,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_qa_topic ON ai_qa_pairs(topic_id);
CREATE INDEX IF NOT EXISTS idx_qa_doc ON ai_qa_pairs(doc_id);
CREATE INDEX IF NOT EXISTS idx_qa_importance ON ai_qa_pairs(importance);

-- 关键引文
CREATE TABLE IF NOT EXISTS ai_key_quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT NOT NULL,
  topic_id INTEGER REFERENCES ai_topics(id),
  quote TEXT NOT NULL,
  context TEXT,
  position INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_quotes_topic ON ai_key_quotes(topic_id);
CREATE INDEX IF NOT EXISTS idx_quotes_doc ON ai_key_quotes(doc_id);

-- 概念定义
CREATE TABLE IF NOT EXISTS ai_concepts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  definition TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  topic_id INTEGER REFERENCES ai_topics(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_concepts_name ON ai_concepts(name);
CREATE INDEX IF NOT EXISTS idx_concepts_topic ON ai_concepts(topic_id);

-- 学习进度追踪
CREATE TABLE IF NOT EXISTS ai_learning_state (
  doc_id TEXT PRIMARY KEY,
  status TEXT DEFAULT 'pending',
  segments_total INTEGER DEFAULT 0,
  segments_done INTEGER DEFAULT 0,
  qa_extracted INTEGER DEFAULT 0,
  quotes_extracted INTEGER DEFAULT 0,
  concepts_extracted INTEGER DEFAULT 0,
  error TEXT,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_learning_status ON ai_learning_state(status);

-- 用户查询日志（发现知识盲区）
CREATE TABLE IF NOT EXISTS ai_query_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  matched_qa_id INTEGER,
  match_score REAL,
  had_good_result INTEGER DEFAULT 0,
  response_path TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_query_created ON ai_query_log(created_at);
