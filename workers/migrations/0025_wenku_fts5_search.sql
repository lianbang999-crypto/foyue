-- ============================================================
-- 0025_wenku_fts5_search.sql
-- 文库全文搜索索引（FTS5）
-- 替代 LIKE '%query%' 全表扫描，大幅提升搜索性能
-- ============================================================

-- 创建 FTS5 虚拟表，使用 content-表关联（外部内容模式），避免数据双写
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  title,
  content,
  series_name,
  content='documents',
  content_rowid='rowid',
  tokenize='unicode61'
);

-- 初始填充 FTS 索引（从已有 documents 表导入）
INSERT INTO documents_fts(documents_fts) VALUES('rebuild');

-- 触发器：documents 表插入时自动更新 FTS
CREATE TRIGGER IF NOT EXISTS documents_fts_insert AFTER INSERT ON documents BEGIN
  INSERT INTO documents_fts(rowid, title, content, series_name)
  VALUES (new.rowid, new.title, new.content, new.series_name);
END;

-- 触发器：documents 表更新时自动更新 FTS
CREATE TRIGGER IF NOT EXISTS documents_fts_update AFTER UPDATE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, title, content, series_name)
  VALUES ('delete', old.rowid, old.title, old.content, old.series_name);
  INSERT INTO documents_fts(rowid, title, content, series_name)
  VALUES (new.rowid, new.title, new.content, new.series_name);
END;

-- 触发器：documents 表删除时自动更新 FTS
CREATE TRIGGER IF NOT EXISTS documents_fts_delete AFTER DELETE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, title, content, series_name)
  VALUES ('delete', old.rowid, old.title, old.content, old.series_name);
END;
