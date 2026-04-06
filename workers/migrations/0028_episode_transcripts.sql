-- 音频转文字结果表
CREATE TABLE IF NOT EXISTS episode_transcripts (
  series_id TEXT NOT NULL,
  episode_num INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  full_text TEXT,
  segments TEXT,
  language TEXT,
  duration REAL,
  audio_url TEXT,
  file_size INTEGER,
  error TEXT,
  model TEXT DEFAULT 'whisper-large-v3-turbo',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (series_id, episode_num)
);

-- 按状态查询索引
CREATE INDEX IF NOT EXISTS idx_episode_transcripts_status
  ON episode_transcripts(status);
