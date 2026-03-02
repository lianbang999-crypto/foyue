-- 0006_message_wall.sql
-- 留言墙功能 — 莲友留言互动

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT NOT NULL DEFAULT '莲友',
  content TEXT NOT NULL,
  ip_hash TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'approved', -- approved / pending / hidden
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_pinned ON messages(pinned DESC, created_at DESC);
