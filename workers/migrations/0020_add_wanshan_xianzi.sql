-- ============================================================
-- 0020_add_wanshan_xianzi.sql
--
-- 目的：
-- 1. 将“万善先资”补充到“有声书”入口。
-- 2. 目前已确认第 1 集对象可访问，先按单集系列入库。
-- ============================================================

INSERT OR IGNORE INTO series (
  id, category_id, title, title_en, speaker, speaker_en,
  bucket, folder, total_episodes, intro, sort_order
) VALUES (
  'wanshan-xianzi',
  'youshengshu',
  '万善先资',
  'Wanshan Xianzi',
  '',
  '',
  'youshengshu',
  '万善先资',
  1,
  '《万善先资》有声书入口。当前先接入已确认可访问的第 1 集。',
  8
);

INSERT OR IGNORE INTO episodes (
  series_id, episode_num, title, file_name, url, intro, duration
) VALUES (
  'wanshan-xianzi',
  1,
  '示劝全禄',
  '【万善先资】01 示劝全禄.mp3',
  'https://audio.foyue.org/772643034503463d9b954f0eea5ce80b/%E4%B8%87%E5%96%84%E5%85%88%E8%B5%84/%E3%80%90%E4%B8%87%E5%96%84%E5%85%88%E8%B5%84%E3%80%9101%20%E7%A4%BA%E5%8A%9D%E5%85%A8%E7%A6%84.mp3',
  NULL,
  0
);