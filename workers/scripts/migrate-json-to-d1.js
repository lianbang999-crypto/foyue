/**
 * 数据迁移脚本：audio-data.json → D1 SQL
 *
 * 用法:
 *   node scripts/migrate-json-to-d1.js
 *
 * 输出:
 *   migrations/0002_seed_data.sql — 包含所有 INSERT 语句
 *
 * 然后用 wrangler 导入：
 *   wrangler d1 execute foyue-db --file=migrations/0002_seed_data.sql
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = resolve(__dirname, '../../data/audio-data.json');
const outputPath = resolve(__dirname, '../migrations/0002_seed_data.sql');

// 读取原始 JSON
const raw = readFileSync(dataPath, 'utf-8');
const data = JSON.parse(raw);

const lines = [];
lines.push('-- 自动生成：从 audio-data.json 迁移数据到 D1');
lines.push('-- 生成时间: ' + new Date().toISOString());
lines.push('');
lines.push('-- 清空现有数据（按依赖顺序）');
lines.push('DELETE FROM play_logs;');
lines.push('DELETE FROM appreciations;');
lines.push('DELETE FROM episodes;');
lines.push('DELETE FROM series;');
lines.push('DELETE FROM categories;');
lines.push('');

// SQL 转义
function esc(str) {
  if (str === null || str === undefined) return 'NULL';
  return "'" + String(str).replace(/'/g, "''") + "'";
}

let categoryOrder = 0;

for (const cat of data.categories) {
  categoryOrder++;
  lines.push(`-- 分类: ${cat.title}`);
  lines.push(
    `INSERT INTO categories (id, title, title_en, sort_order) VALUES (${esc(cat.id)}, ${esc(cat.title)}, ${esc(cat.titleEn)}, ${categoryOrder});`
  );
  lines.push('');

  let seriesOrder = 0;

  for (const s of cat.series) {
    seriesOrder++;
    lines.push(`-- 系列: ${s.title} (${s.episodes.length} 集)`);
    lines.push(
      `INSERT INTO series (id, category_id, title, title_en, speaker, speaker_en, bucket, folder, total_episodes, intro, sort_order) VALUES (${esc(s.id)}, ${esc(cat.id)}, ${esc(s.title)}, ${esc(s.titleEn)}, ${esc(s.speaker)}, ${esc(s.speakerEn)}, ${esc(s.bucket)}, ${esc(s.folder)}, ${s.totalEpisodes || s.episodes.length}, ${esc(s.intro)}, ${seriesOrder});`
    );

    // 集数
    for (const ep of s.episodes) {
      const storyNum = ep.storyNumber !== undefined ? ep.storyNumber : 'NULL';
      const introVal = ep.intro ? esc(ep.intro) : 'NULL';
      lines.push(
        `INSERT INTO episodes (series_id, episode_num, title, file_name, url, intro, story_number) VALUES (${esc(s.id)}, ${ep.id}, ${esc(ep.title)}, ${esc(ep.fileName)}, ${esc(ep.url)}, ${introVal}, ${storyNum});`
      );
    }

    lines.push('');
  }
}

const sql = lines.join('\n');
writeFileSync(outputPath, sql, 'utf-8');

// 统计
let catCount = data.categories.length;
let seriesCount = 0;
let episodeCount = 0;
for (const cat of data.categories) {
  seriesCount += cat.series.length;
  for (const s of cat.series) {
    episodeCount += s.episodes.length;
  }
}

console.log('迁移文件已生成: migrations/0002_seed_data.sql');
console.log(`统计: ${catCount} 个分类, ${seriesCount} 个系列, ${episodeCount} 集`);
console.log('');
console.log('下一步:');
console.log('  wrangler d1 execute foyue-db --file=migrations/0002_seed_data.sql');
