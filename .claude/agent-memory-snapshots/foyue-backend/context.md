# foyue-backend 项目上下文快照

更新时间：2026-04-04

## 技术栈

- Cloudflare Pages Functions（`functions/api/[[path]].js` 单路由 catch-all）
- D1 数据库（binding: `DB`, database: `foyue-db`）
- R2 对象存储（binding: `R2_WENKU`, bucket: `jingdianwendang`）
- Workers（`workers/` 目录，音频域名分发）
- 迁移文件：`workers/migrations/`

## 本地开发命令

```bash
cd /Users/bincai/lianbang999/foyue
npm run build
npx wrangler pages dev dist --d1=DB
```

## API 路由结构

`functions/api/[[path]].js` 处理所有 `/api/...` 请求，内部路由使用路径匹配。

## D1 数据库迁移规范

- **新增 SQL 变更**必须在 `workers/migrations/` 里新建迁移文件
- 命名格式：`NNNN_description.sql`（如 `0005_add_audio_metadata.sql`）
- 严禁直接执行 DROP / TRUNCATE / ALTER（必须先确认）

## wrangler.toml 关键 bindings

```toml
# D1
[[d1_databases]]
binding = "DB"
database_name = "foyue-db"

# R2 文献
[[r2_buckets]]
binding = "R2_WENKU"
bucket_name = "jingdianwendang"
```

## 禁止操作

- 不接触 `src/js/` 和 `src/css/`（前端，由 foyue-frontend 负责）
- SQL schema 变更必须写迁移文件

## 已知问题 / 当前状态

- （由 foyue-backend agent 使用后更新此处）
