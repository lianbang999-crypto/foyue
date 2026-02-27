# Workers + D1 部署指南

## 前提条件

- 已安装 [Node.js](https://nodejs.org/) (v18+)
- 已安装 wrangler CLI: `npm install -g wrangler`
- 已登录 Cloudflare: `wrangler login`

---

## 第一步：创建 D1 数据库

```bash
cd workers/

# 创建生产数据库
wrangler d1 create foyue-db

# 创建开发数据库（可选）
wrangler d1 create foyue-db-dev
```

命令会输出 `database_id`，将其填入 `wrangler.toml` 中对应的位置。

---

## 第二步：运行数据库迁移

```bash
# 创建表结构
wrangler d1 execute foyue-db --file=migrations/0001_init.sql

# 生成种子数据（从 audio-data.json）
node scripts/migrate-json-to-d1.js

# 导入种子数据
wrangler d1 execute foyue-db --file=migrations/0002_seed_data.sql
```

验证数据导入：

```bash
wrangler d1 execute foyue-db --command="SELECT COUNT(*) FROM categories"
# 应返回 3

wrangler d1 execute foyue-db --command="SELECT COUNT(*) FROM series"
# 应返回 13

wrangler d1 execute foyue-db --command="SELECT COUNT(*) FROM episodes"
# 应返回 382
```

---

## 第三步：部署 Worker

```bash
cd workers/
wrangler deploy
```

部署后，Worker 会运行在 `foyue-api.<你的子域名>.workers.dev`。

---

## 第四步：配置路由（关键）

需要让前端的 `/data/audio-data.json` 和 `/api/*` 请求走 Worker，其余请求走 Pages。

### 方案 A：Pages Functions（推荐）

将 `workers/src/index.js` 的逻辑放入 Pages Functions，不需要单独的 Worker：

```
foyue/
├── functions/
│   └── api/
│       └── [...path].js    ← Pages Function，处理 /api/* 路由
├── index.html
├── data/audio-data.json     ← 保留静态文件作为降级方案
└── ...
```

### 方案 B：Worker + Pages 独立部署

在 Cloudflare Dashboard 中配置路由规则：
1. `foyue.org/api/*` → Worker `foyue-api`
2. `foyue.org/*` → Pages `bojingji`

---

## 第五步：前端对接（最小改动）

**过渡期无需修改前端**：Worker 提供了 `/data/audio-data.json` 兼容端点，返回与原 JSON 文件完全一致的数据结构。

**后续可选优化**——在播放时发送计数请求，在 index.html 的播放函数中添加：

```javascript
// 在 playCurrent() 函数中，播放开始后发送计数
fetch('/api/play-count', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    seriesId: playlist[epIdx].seriesId,
    episodeNum: playlist[epIdx].id
  })
}).catch(() => {}); // 静默失败，不影响播放
```

---

## API 端点一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/categories` | 全部分类+系列（不含集数） |
| GET | `/api/series/:id` | 单个系列详情（含集数） |
| GET | `/api/series/:id/episodes` | 系列的集数列表 |
| POST | `/api/play-count` | 记录播放 `{seriesId, episodeNum}` |
| GET | `/api/play-count/:id` | 获取播放次数 |
| POST | `/api/appreciate/:id` | 随喜（每 IP 每天限 1 次） |
| GET | `/api/stats` | 全站统计 |
| GET | `/data/audio-data.json` | 兼容端点（原 JSON 格式） |

---

## 本地开发

```bash
cd workers/
wrangler dev
```

Worker 会在 `http://localhost:8787` 启动，使用本地 D1 数据库。

先初始化本地数据库：

```bash
wrangler d1 execute foyue-db --local --file=migrations/0001_init.sql
wrangler d1 execute foyue-db --local --file=migrations/0002_seed_data.sql
```
