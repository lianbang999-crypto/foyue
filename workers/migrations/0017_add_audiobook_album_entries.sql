-- ============================================================
-- 0017_add_audiobook_album_entries.sql
--
-- 目的：
-- 1. 将“经典读诵”同步展示到“有声书”入口，作为“经典读诵专辑”。
-- 2. 劝修净土诗已在 0011 中存在，若上传文件沿用既有命名规则，无需额外改库。
-- 3. 万善先资待确认对象 key 后再补充，避免写入错误 URL。
-- ============================================================

INSERT OR IGNORE INTO series (
  id, category_id, title, title_en, speaker, speaker_en,
  bucket, folder, total_episodes, intro, sort_order
) VALUES (
  'jingdiandusong-zhuanji',
  'youshengshu',
  '经典读诵专辑',
  'Sutra Recitation Collection',
  '',
  '',
  'jingdiandusong',
  NULL,
  3,
  '将经典读诵内容同步展示到有声书入口，便于在同一入口连续收听。',
  7
);

INSERT OR IGNORE INTO episodes (
  series_id, episode_num, title, file_name, url, intro, duration
) VALUES (
  'jingdiandusong-zhuanji',
  1,
  '佛说阿弥陀经（念诵）',
  '佛说阿弥陀经（念诵）.mp3',
  'https://audio.foyue.org/09eef2d346704b409a5fbef97ce6464a/%E4%BD%9B%E8%AF%B4%E9%98%BF%E5%BC%A5%E9%99%80%E7%BB%8F%EF%BC%88%E5%BF%B5%E8%AF%B5%EF%BC%89.mp3',
  NULL,
  786
);

INSERT OR IGNORE INTO episodes (
  series_id, episode_num, title, file_name, url, intro, duration
) VALUES (
  'jingdiandusong-zhuanji',
  2,
  '大势至菩萨念佛圆通章',
  '大势至菩萨念佛圆通章.mp3',
  'https://audio.foyue.org/09eef2d346704b409a5fbef97ce6464a/%E5%A4%A7%E5%8A%BF%E8%87%B3%E8%8F%A9%E8%90%A8%E5%BF%B5%E4%BD%9B%E5%9C%86%E9%80%9A%E7%AB%A0.mp3',
  NULL,
  192
);

INSERT OR IGNORE INTO episodes (
  series_id, episode_num, title, file_name, url, intro, duration
) VALUES (
  'jingdiandusong-zhuanji',
  3,
  '心经',
  '心经.mp3',
  'https://audio.foyue.org/09eef2d346704b409a5fbef97ce6464a/%E5%BF%83%E7%BB%8F.mp3',
  NULL,
  204
);