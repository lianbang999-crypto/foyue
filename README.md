# 净土法音 Pure Land Dharma Audio

佛教净土宗音频播放器 PWA，提供佛号念诵、法师讲经等音频内容的在线收听与离线缓存服务。

**在线访问**：[foyue.org](https://foyue.org) · 备用：[amituofo.pages.dev](https://amituofo.pages.dev) · 文库：[wenku.foyue.org](https://wenku.foyue.org)（部署中）

**仓库**：[github.com/lianbang999-crypto/foyue](https://github.com/lianbang999-crypto/foyue)

---

## 快速开始

```bash
git clone https://github.com/lianbang999-crypto/foyue.git
cd foyue
npm install
npm run dev       # 本地开发（端口 8080，API 代理到 foyue.org）
npm run build     # 生产构建，输出到 dist/
npm run preview   # 预览构建结果
```

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vite + Vanilla JS（ES Modules） |
| 样式 | CSS 模块化（11 个文件），CSS 变量主题系统 |
| 国际化 | 中文 / 英文 / 法文（src/locales/） |
| 托管 | Cloudflare Pages（Git 推送自动部署） |
| 后端 API | Cloudflare Pages Functions |
| 数据库 | Cloudflare D1（foyue-db） |
| 音频存储 | Cloudflare R2（4 个存储桶） |
| AI 服务 | Cloudflare Workers AI（BGE-M3 / GLM / Qwen） |
| 向量搜索 | Cloudflare Vectorize（dharma-content 索引） |
| 字体 | Google Fonts（Noto Sans SC + DM Sans） |

---

## 项目结构

```
foyue/
├── index.html                  # 主站 HTML 入口
├── admin.html                  # 管理后台入口
├── package.json                # Vite 项目配置
├── vite.config.js              # Vite 构建配置（代码分割、代理）
├── wrangler.toml               # Cloudflare D1 + AI + Vectorize 绑定
│
├── src/
│   ├── css/                    # 11 个 CSS 模块
│   │   ├── tokens.css          #   CSS 变量（浅色 + 深色主题）
│   │   ├── reset.css           #   CSS Reset
│   │   ├── layout.css          #   应用壳（Header / TabBar / Content）
│   │   ├── player.css          #   播放器（迷你 + 全屏 + 播放列表）
│   │   ├── cards.css           #   系列卡片 + 集数列表
│   │   ├── pages.css           #   首页 + 我的页面
│   │   ├── components.css      #   通用组件（Modal / Toast / Banner）
│   │   ├── ai.css              #   AI 组件（聊天 / 摘要）
│   │   ├── message-wall.css    #   留言墙
│   │   ├── wenku.css           #   文库阅读器
│   │   └── admin.css           #   管理后台
│   │
│   ├── js/                     # 28 个 ES Module
│   │   ├── main.js             #   入口：初始化 + 事件绑定 + 数据加载
│   │   ├── state.js            #   共享可变状态对象
│   │   ├── store.js            #   统一 localStorage 管理器
│   │   ├── dom.js              #   DOM 元素引用（延迟初始化）
│   │   ├── i18n.js             #   国际化
│   │   ├── theme.js            #   主题管理
│   │   ├── icons.js            #   SVG 图标常量
│   │   ├── utils.js            #   工具函数
│   │   ├── player.js           #   播放器核心
│   │   ├── history.js          #   播放历史
│   │   ├── api.js              #   D1 API 客户端（播放次数 / 随喜）
│   │   ├── audio-cache.js      #   Cache API 音频离线缓存
│   │   ├── audio-url.js        #   音频 URL 构建（MP3 / Opus 自适应）
│   │   ├── duration-cache.js   #   时长探测与缓存
│   │   ├── search.js           #   关键词 + AI 语义搜索
│   │   ├── pwa.js              #   PWA 安装引导
│   │   ├── monitor.js          #   性能监控
│   │   ├── pages-home.js       #   首页渲染
│   │   ├── pages-category.js   #   分类 / 集数页面
│   │   ├── pages-my.js         #   "我的"页面
│   │   ├── ai-client.js        #   AI API 客户端
│   │   ├── ai-chat.js          #   AI 聊天面板
│   │   ├── ai-summary.js       #   内容摘要组件
│   │   ├── transcript.js       #   文稿展示组件
│   │   ├── message-wall.js     #   留言墙
│   │   ├── wenku.js            #   文库入口
│   │   ├── wenku-api.js        #   文库 API
│   │   └── wenku-reader.js     #   文库阅读器
│   │
│   └── locales/                # i18n 翻译文件
│       ├── zh.json
│       ├── en.json
│       └── fr.json
│
├── functions/                  # Cloudflare Pages Functions
│   ├── api/[[path]].js         #   API 路由（分类 / 系列 / 播放 / AI / 管理）
│   ├── lib/ai-utils.js         #   AI 工具模块
│   ├── lib/audio-utils.js      #   音频工具模块
│   └── share/[[path]].js       #   分享页面
│
├── public/                     # 静态资源（不经 Vite 处理）
│   ├── manifest.json           #   PWA manifest
│   ├── sw.js                   #   Service Worker
│   ├── robots.txt
│   ├── sitemap.xml
│   ├── _headers                #   Cloudflare 自定义响应头
│   ├── _routes.json            #   Cloudflare 路由规则
│   ├── icons/                  #   PWA 图标
│   └── screenshots/            #   PWA 截图
│
├── icons/                      # Logo 源文件
├── scripts/                    # 工具脚本（音频转码 / R2 上传 / 数据同步）
└── workers/                    # D1 迁移脚本 + 子域 Worker
    └── migrations/             #   0001 ~ 0013 数据库迁移
```

---

## 核心功能

**音频播放器**：播放 / 暂停、上下曲、快进快退、倍速（0.5x ~ 2x）、定时停止、顺序 / 单曲 / 随机循环、迷你播放器与全屏播放器切换、锁屏控制（Media Session API）。

**离线与缓存**：Cache API 音频离线缓存、Service Worker 静态资源缓存、断点续播（localStorage 持久化）、音频预加载（网络感知）。

**首页**：每日推荐、继续收听、推荐系列、留言墙。

**搜索**：关键词搜索 + AI 语义搜索（Cloudflare Vectorize）。

**AI 功能**：RAG 问答（BGE-M3 嵌入 → Vectorize 检索 → GLM/Qwen 生成）、内容摘要、语义搜索。

**文库**：净土宗经典文献在线阅读，4 种阅读模式，字号 / 字体设置，阅读进度书签。

**其他**：暗色 / 亮色主题、中英法三语、PWA 安装引导、播放历史管理、随喜功能。

---

## 部署

### 自动部署

推送到 `main` 分支 → Cloudflare Pages 自动构建部署。其他分支 → 预览环境。

### Cloudflare Dashboard 配置

| 配置项 | 值 |
|--------|-----|
| 构建命令 | `npm run build` |
| 输出目录 | `dist` |
| Node.js 版本 | 20+ |

### 绑定（wrangler.toml）

- **D1 数据库**：`DB` → `foyue-db`
- **Workers AI**：`AI`
- **Vectorize**：`VECTORIZE` → `dharma-content`（768 维，cosine）

### 环境变量（Cloudflare Pages → Settings）

| 变量 | 说明 |
|------|------|
| `ADMIN_TOKEN` | 管理员 API 密钥 |
| `ALLOWED_ORIGINS` | CORS 白名单，如 `https://foyue.org,https://amituofo.pages.dev` |

### 本地调试 Pages Functions + D1

```bash
npx wrangler pages dev dist --d1=DB
```

### AI 功能首次部署

```bash
# 1. 创建 Vectorize 索引
npx wrangler vectorize create dharma-content --dimensions=768 --metric=cosine

# 2. 执行 D1 迁移
npx wrangler d1 execute foyue-db --remote --file=workers/migrations/0004_ai_tables.sql

# 3. 构建向量数据（部署成功后执行一次）
curl -X POST https://foyue.org/api/admin/embeddings/build \
  -H "X-Admin-Token: <ADMIN_TOKEN>"
```

### Cloudflare 缓存规则清理脚本

用于把音频缓存规则收敛成一组精确规则，避免 Cloudflare 后台出现重复或过宽匹配。

```bash
# 查看参数
node scripts/cleanup-cloudflare-cache-rules.mjs --help

# 仅预览，不写入 Cloudflare
CLOUDFLARE_API_TOKEN=<token> \
node scripts/cleanup-cloudflare-cache-rules.mjs --zone foyue.org --dry-run

# 实际写入
CLOUDFLARE_API_TOKEN=<token> \
node scripts/cleanup-cloudflare-cache-rules.mjs --zone foyue.org
```

---

## 开发规范

### Git

- `main` 分支为稳定版本，推送自动部署
- 功能分支命名：`feature/功能名`、`fix/bug名`
- 提交信息格式：`类型(范围): 描述`，如 `fix(player): cache-first loading`

### 代码

- HTML：语义化标签，需翻译文本加 `data-i18n` 属性
- CSS：使用 `tokens.css` 中的 CSS 变量，类名 kebab-case，移动端优先（触摸目标 ≥ 44px）
- JS：ES Module，`const`/`let`（不用 `var`），共享状态通过 `state.js`，DOM 引用通过 `dom.js` 的 `getDOM()`
- i18n：修改翻译时 zh/en/fr 三种语言必须同步

### 修改后检查

- `npm run build` 构建成功
- 浏览器控制台 0 错误
- 浅色 + 深色主题正常
- 播放功能正常（播放、暂停、切集、切专辑）
- 手机端布局正常（375px）

---

## 数据规模

- 3 个分类、14+ 个系列、466+ 集音频
- 4 个 R2 存储桶
- D1 迁移脚本 13 个（0001 ~ 0013）

---

## 许可证

[MIT](LICENSE) © 2026 净土法音 (foyue.org)
