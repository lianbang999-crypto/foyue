-- 下线用户指定删除的听经台系列。
-- 由于当前表结构未配置 ON DELETE CASCADE，需先显式清理关联表再删 series。

DELETE FROM play_logs
WHERE series_id IN (
  'foshuo-wuliangshoujing-shuyi',
  'zhiqu-wushang-puti'
);

DELETE FROM appreciations
WHERE series_id IN (
  'foshuo-wuliangshoujing-shuyi',
  'zhiqu-wushang-puti'
);

DELETE FROM episodes
WHERE series_id IN (
  'foshuo-wuliangshoujing-shuyi',
  'zhiqu-wushang-puti'
);

DELETE FROM series
WHERE id IN (
  'foshuo-wuliangshoujing-shuyi',
  'zhiqu-wushang-puti'
);