-- Episode chapter markers (generated via Whisper + LLM)
CREATE TABLE IF NOT EXISTS episode_chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id TEXT NOT NULL,
  episode_num INTEGER NOT NULL,
  chapter_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  start_time REAL NOT NULL,
  end_time REAL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (series_id) REFERENCES series(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chapters_unique
  ON episode_chapters(series_id, episode_num, chapter_index);
CREATE INDEX IF NOT EXISTS idx_chapters_episode
  ON episode_chapters(series_id, episode_num);
