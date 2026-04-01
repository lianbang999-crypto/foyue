# 净土法音 (Foyue) — 全站架构与功能文档

> 版本: 1.0 · 更新日期: 2026-03-31
> 在线地址: [foyue.org](https://foyue.org) · 备用: [amituofo.pages.dev](https://amituofo.pages.dev)

---

## 目录

1. [系统总览](#1-系统总览)
2. [技术栈](#2-技术栈)
3. [前端架构](#3-前端架构)
4. [后端架构](#4-后端架构)
5. [数据层](#5-数据层)
6. [核心功能链路](#6-核心功能链路)
7. [PWA 与缓存策略](#7-pwa-与缓存策略)
8. [模块依赖关系图](#8-模块依赖关系图)
9. [数据规模与配置](#9-数据规模与配置)

---

## 1. 系统总览

### 1.1 产品定位

净土法音是一个面向佛教净土宗的 PWA 音频流媒体播放器，核心功能包括：

- **音频播放** — 法师讲经、佛号念诵、有声书在线收听与离线缓存
- **AI 问法** — RAG 架构的智能问答，结合净土宗经典文献
- **讲记文库** — 净土宗经典文献在线阅读器
- **念佛计数** — 日常修行计数，支持海报分享与每日回向
- **共修广场** — 社区集体修行统计与功德池

### 1.2 架构总图

```
┌────────────────────────── 用户浏览器 (PWA) ──────────────────────────┐
│                                                                       │
│  index.html      ai.html      wenku.html    nianfo.html  gongxiu.html│
│  (主站播放器)    (AI问答)     (讲记文库)    (念佛计数)   (共修广场)  │
│     │               │             │             │            │        │
│     └───────────────┼─────────────┼─────────────┼────────────┘        │
│                     │             │             │                      │
│                Service Worker (sw.js)                                  │
│                     │                                                  │
└─────────────────────┼──────────────────────────────────────────────────┘
                      │  HTTPS
┌─────────────────────┼──────────────────────────────────────────────────┐
│              Cloudflare Edge                                           │
│                     │                                                  │
│  ┌──────────────────┴──────────────────┐                              │
│  │  Cloudflare Pages Functions         │                              │
│  │  /api/*  → [[path]].js 路由        │                              │
│  │  /share/* → 社交分享 OG 标签       │                              │
│  └──────┬──────────┬──────────┬────────┘                              │
│         │          │          │                                        │
│  ┌──────┴───┐ ┌────┴────┐ ┌──┴──────┐  ┌─────────────────┐          │
│  │ D1 数据库│ │Workers AI│ │Vectorize│  │   R2 存储桶     │          │
│  │ foyue-db │ │BGE/Qwen │ │768维索引│  │ 6个音频桶       │          │
│  │ (SQL)    │ │/Whisper  │ │语义搜索 │  │ 1个文库桶       │          │
│  └──────────┘ └─────────┘ └─────────┘  └────────┬────────┘          │
│                                                   │                    │
│  ┌────────────────────────────────────────────────┴─────┐             │
│  │  audio-subdomain-worker.js                           │             │
│  │  audio.foyue.org — R2 音频分发 + Range + 缓存      │             │
│  └──────────────────────────────────────────────────────┘             │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **前端构建** | Vite 6.0 | 多入口构建、代码分割、HMR |
| **前端框架** | Vanilla JS (ES Modules) | 无框架、46 个模块手动组织 |
| **样式方案** | CSS 模块化 (15 个文件) | CSS 变量主题系统、移动端优先 |
| **国际化** | 自研 i18n | 中文/英文/法文 |
| **图标** | Lucide Static 0.577 | 33 个 SVG 图标 |
| **托管** | Cloudflare Pages | Git 推送自动部署 |
| **后端 API** | Cloudflare Pages Functions | 无框架、正则路由 |
| **数据库** | Cloudflare D1 (SQLite) | 13+ 表、25 个迁移 |
| **音频存储** | Cloudflare R2 | 6 个音频桶 + 1 个文库桶 |
| **音频分发** | Cloudflare Worker | audio.foyue.org、Range 支持 |
| **AI 嵌入** | Workers AI (BGE-M3) | 768 维向量 |
| **AI 对话** | Workers AI (Qwen 3 30B) | 备选 Llama 3.3 70B |
| **AI 转录** | Workers AI (Whisper v3) | 语音转文字 |
| **向量搜索** | Cloudflare Vectorize | dharma-content 索引 |
| **字体** | Google Fonts (镜像) | Noto Sans SC + DM Sans + Noto Serif SC |

---

## 3. 前端架构

### 3.1 多入口 SPA 架构

项目采用 **多入口独立应用** 模式，每个 HTML 文件是独立的 SPA：

| 入口 | HTML 文件 | JS 入口 | 功能定位 |
|------|-----------|---------|---------|
| **主站** | `index.html` | `src/js/main.js` | 完整 PWA 播放器、首页、分类、搜索、设置 |
| **管理后台** | `admin.html` | `src/admin/main.js` | 内容 CRUD、数据统计、消息管理 |
| **AI 问答** | `ai.html` | `src/js/ai-app.js` | 多轮对话、语音输入、文库引用 |
| **讲记文库** | `wenku.html` | `src/js/wenku-app.js` | 文献阅读器、书签、进度 |
| **念佛计数** | `nianfo.html` | `src/js/nianfo-app.js` | 独立计数器（无播放器依赖） |
| **共修广场** | `gongxiu.html` | `src/js/gongxiu-app.js` | 社区修行统计、功德池 |

### 3.2 代码分割策略 (Vite)

```
manualChunks:
  common  → state.js, dom.js, utils.js, i18n.js
  player  → player.js, history.js, api.js, audio-cache.js
  pages   → pages-home.js, pages-category.js, counter.js, gongxiu.js
```

还有大量动态 `import()` 用于按需加载：
- `search.js` 动态导入 `pages-category.js`（避免循环依赖）
- `pages-my.js` 动态导入 `gongxiu-panel.js`、`counter-lazy.js`
- `ai-summary.js`、`transcript.js` 由 `pages-category.js` 在用户点击时按需加载

### 3.3 前端模块分类 (46 个模块)

#### 核心基础层 (7 个)

| 模块 | 职责 |
|------|------|
| **main.js** | 应用入口：加载 CSS、初始化所有子系统、绑定事件、协调标签页导航 |
| **state.js** | 全局状态容器：当前 tab、系列、集数、播放列表、循环模式、网络状态 |
| **dom.js** | DOM 元素缓存：40+ UI 元素引用，避免重复查询 |
| **store.js** | localStorage 统一管理：播放状态、历史、时长、偏好设置，含防抖保存和旧键迁移 |
| **theme.js** | 主题管理：明暗切换、系统偏好同步、`data-theme` 属性控制 |
| **i18n.js** | 国际化：检测浏览器语言、`data-i18n` 属性绑定、三语翻译 |
| **pwa.js** | PWA 生命周期：安装引导、更新通知、App 内浏览器检测 |

#### 播放器与音频层 (6 个)

| 模块 | 职责 |
|------|------|
| **player.js** | 播放核心引擎 (40+ 导出函数)：HTML5 Audio 管理、切歌、循环、倍速、卡顿恢复、播放列表渲染、锁屏控制(Media Session) |
| **audio-cache.js** | Cache API 离线缓存：500MB 限制 LRU 淘汰、与 SW 联动、缓存状态同步 |
| **audio-meta-cache.js** | 音频元数据缓存：bytes/MIME/etag 持久化 |
| **audio-url.js** | 音频 URL 工具：域名检测 (audio.foyue.org)、Response 清理 |
| **duration-cache.js** | 时长探测与缓存：创建 Audio 对象加载 metadata、iOS 并发限制 |
| **playback-policy.js** | 播放策略决策：短音频(≤15分钟)/长音频分类、full-load vs Range 流式 |

#### 页面与导航层 (4 个)

| 模块 | 职责 |
|------|------|
| **pages-home.js** | 首页视图：每日法语、继续收听、分类佛号卡片、AI 每日推荐 |
| **pages-category.js** | 分类页/集数列表：系列卡片、集数列表(20-24 条预览)、播放次数、缓存状态、AI 摘要 |
| **pages-my.js** | 设置页：主题/语言切换、PWA 安装、缓存管理、历史、社区入口 |
| **search.js** | 全站搜索：关键词过滤系列+集数、高亮匹配 |

#### 历史与持久化层 (2 个)

| 模块 | 职责 |
|------|------|
| **history.js** | 播放历史管理：记录/查询/清理已播集数、断点续播位置解析 |
| **history-view.js** | 历史列表 UI：最近播放列表、进度条、时间戳、继续播放 |

#### AI 功能层 (8 个)

| 模块 | 职责 |
|------|------|
| **ai-client.js** | AI API 客户端：SSE 流式传输、语音转文字、摘要、每日推荐、60s 超时 |
| **ai-app.js** | AI 独立页入口：多对话管理、消息流、语音输入、文库预览抽屉 |
| **ai-conversations.js** | 多对话状态：最多 20 个对话 × 20 条消息、localStorage 持久化 |
| **ai-format.js** | AI 回答渲染：HTML 转义、Markdown 格式化、高亮、欢迎屏 |
| **ai-summary.js** | 摘要组件：按需加载集数摘要、加载态、错误回退 |
| **ai-voice.js** | 语音输入控制器：MediaRecorder、30s/5MB 自动停止 |
| **ai-preview.js** | 文库预览抽屉：加载被引用文档、高亮查询词、360 字分块 |
| **transcript.js** | 文稿组件：按需加载集数文稿、段落格式化 |

#### 社区功能层 (6 个)

| 模块 | 职责 |
|------|------|
| **counter.js** | 念佛计数器：日计/总计、预设佛号、每日重置、连续天数、涟漪动画、日志 |
| **counter-share.js** | 分享海报生成：Canvas 渲染、QR 码、水印、修行数据 |
| **counter-lazy.js** | 计数器懒加载入口 |
| **gongxiu.js** | 共修广场视图：功德池(社区总量)、每日提交、发愿(回向偈) |
| **gongxiu-app.js** | 共修独立页入口 |
| **gongxiu-panel.js / gongxiu-lazy.js** | 从"我的"页面打开共修的模态面板 |

#### 文库功能层 (2 个)

| 模块 | 职责 |
|------|------|
| **wenku-app.js** | 文库独立页入口：系列列表/文档列表/阅读器三视图切换、书签、进度记忆 |
| **wenku-api.js** | 文库 API 客户端：请求去重、5 分钟缓存、前后导航 |

#### 工具层 (9 个)

| 模块 | 职责 |
|------|------|
| **utils.js** | 通用工具 (50+ 函数)：时间格式化、Toast/浮动提示、触觉反馈、iOS 检测、分享 |
| **icons.js** | SVG 图标定义：20+ 图标常量 (Lucide 风格 24×24) |
| **api.js** | D1 API 客户端：播放次数记录(含熔断)、随喜、请求去重 |
| **request-cache.js** | 请求去重+响应缓存：防止重复 inflight 请求、LRU、超时管理 |
| **feature-flags.js** | 功能开关：共修广场开关 |
| **monitor.js** | 性能监控：CWV 指标、API 响应时间、播放成功率 |
| **mock-data.js** | 开发模拟数据：API 不可用时的回退 |
| **message-wall.js** | 留言墙组件：发表留言、昵称、消息列表 |
| **nianfo-app.js** | 念佛独立页入口 |

### 3.4 主站导航结构

```
index.html
├── Header
│   ├── Logo
│   ├── AI 入口按钮 → 跳转 /ai.html
│   └── 搜索按钮 → 打开搜索覆盖层
│
├── Tab Bar (底部5个标签)
│   ├── 首页 (home)
│   │   ├── 每日法语
│   │   ├── 继续收听 (断点续播卡片)
│   │   ├── 东林念佛/佛号推荐卡片
│   │   └── AI 每日推荐
│   │
│   ├── 有声书 (youshengshu)
│   │   └── → renderCategory('有声书')
│   │       ├── 系列卡片列表
│   │       └── → showEpisodes() 集数列表
│   │
│   ├── 中心播放按钮 (centerPlayBtn)
│   │   └── 播放/暂停 当前音频 + 进度环
│   │
│   ├── 听经台 (tingjingtai)
│   │   └── → renderCategory('听经台')
│   │       ├── 系列卡片列表
│   │       └── → showEpisodes() 集数列表
│   │
│   └── 我的 (mypage)
│       ├── 主题切换 (明/暗)
│       ├── 语言切换 (中/英/法)
│       ├── PWA 安装引导
│       ├── 缓存管理 (大小/清理)
│       ├── 播放历史列表
│       ├── 共修广场入口
│       ├── 留言墙
│       └── 念佛计数入口
│
├── Mini Player (底部播放条)
│   ├── 进度条
│   ├── 曲目名/系列名
│   ├── 上一曲/播放/下一曲
│   └── 展开按钮 → 全屏播放器
│
└── 全屏播放器 (overlay)
    ├── 系列封面 + 曲目信息
    ├── 进度条 (可拖拽)
    ├── 控制按钮 (上曲/快退/播放/快进/下曲)
    ├── 倍速控制 (0.5x ~ 2x)
    ├── 循环模式 (顺序/单曲/随机)
    ├── 定时停止
    ├── 播放列表面板
    ├── AI 摘要按钮
    ├── 文稿按钮
    └── 分享按钮
```

### 3.5 CSS 架构

#### 文件组织 (15 个)

| 文件 | 职责 | 加载方式 |
|------|------|---------|
| `tokens.css` | 设计Token：颜色/字体/圆角/间距/阴影 + 深色主题 | 主站 main.js |
| `reset.css` | CSS Reset + 基础样式 | 主站 main.js |
| `ui.css` | 按钮组件 (`.btn-*`)、图标 (`.icon-*`)、AI 纽 | 主站 main.js |
| `layout.css` | App Shell：`.header`, `.tab-bar`, `.content` | 主站 main.js |
| `player.css` | 播放器：mini + 全屏 + 播放列表面板 | 主站 main.js |
| `cards.css` | 系列卡片 + 集数列表 | 主站 main.js |
| `pages.css` | 首页 + 我的 + 计数器 + 回向 | 主站 main.js |
| `components.css` | Modal、Toast、Skeleton、Loading | 主站 main.js |
| `admin.css` | 管理后台（独立页面） | admin/main.js |
| `ai-page.css` | AI 页面（独立 Token + 对话气泡） | ai-app.js |
| `wenku-page.css` | 文库页面（阅读器优化） | wenku-app.js |
| `nianfo-page.css` | 念佛页面 | nianfo-app.js |
| `gongxiu-page.css` | 共修页面布局 | gongxiu-app.js |
| `gongxiu.css` | 共修组件（功德池、消息卡） | gongxiu.js |
| `message-wall.css` | 留言墙组件 | message-wall.js |

#### 设计 Token 体系

```
颜色系统 (赤陶色)：
  亮色：--bg: #F9F8F6 (温暖米白)  |  --accent: #D97757 (赤陶)  |  --text: #1E1E1E
  暗色：--bg: #1D1D1D            |  --accent: #E0876B          |  --text: #E8E0D5

圆角：--radius: 12px / --radius-sm: 8px / --radius-lg: 20px
字体：--font-zh (Noto Sans SC) / --font-en (DM Sans) / --font-serif (Noto Serif SC)
布局：--player-h: 72px / --safe-bottom: env(safe-area-inset-bottom)
```

#### 响应式断点

| 断点 | 策略 |
|------|------|
| 基础 (< 375px) | 单列布局，全宽卡片 |
| 375px+ | 标准移动端优化 |
| 500px+ | 系列列表双列网格 |
| 768px+ | 内容区居中 `max-width: 900px` |

---

## 4. 后端架构

### 4.1 API 路由入口

**文件**: `functions/api/[[path]].js`

- Cloudflare Pages Function，单入口处理所有 `/api/*` 请求
- 正则路由匹配（无框架）
- CORS origin 验证（`foyue.org` + `amituofo.pages.dev`）
- 管理员路由需要 `X-Admin-Token` 头验证

### 4.2 完整 API 路由表

#### 公开路由 — 音频内容

| 方法 | 路径 | 功能 | 缓存 |
|------|------|------|------|
| GET | `/api/categories` | 获取所有分类+系列+集数 | 5min 浏览器, 30min CF |
| GET | `/api/category/:id` | 单个分类详情 | 同上 |
| GET | `/api/series/:id` | 系列元数据 | - |
| GET | `/api/series/:id/episodes` | 系列集数列表 | - |
| POST | `/api/play-count` | 记录播放事件 | - |
| GET | `/api/play-count/:id` | 获取系列播放总数 | - |
| POST/GET | `/api/appreciate/:id` | 随喜(赞赏)系列 | - |
| GET | `/api/stats` | 全站统计 | - |

#### 公开路由 — AI

| 方法 | 路径 | 功能 | 说明 |
|------|------|------|------|
| POST | `/api/ai/ask` | RAG 问答 | 向量检索 → 重排 → 生成 |
| POST | `/api/ai/ask-stream` | 流式 RAG 问答 | SSE 逐 token 返回 |
| GET | `/api/ai/summary/:id` | 集数摘要 | 7 天缓存 |
| GET | `/api/ai/search` | 语义搜索 | Vectorize topK=5 |
| GET | `/api/ai/daily-recommend` | 每日推荐 | 12h 缓存 |
| POST | `/api/ai/voice-to-text` | 语音转文字 | Whisper v3 |
| GET | `/api/ai/personalized-recommend` | 个性化推荐 | 基于历史 |
| GET | `/api/chapters/:seriesId/:ep` | 章节标记 | - |

#### 公开路由 — 文库

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/wenku/series` | 文库系列列表 |
| GET | `/api/wenku/documents` | 系列内文档列表 |
| GET | `/api/wenku/documents/:id` | 文档内容(含上下篇导航) |
| GET | `/api/wenku/search` | 全文搜索(FTS5 + LIKE) |
| POST | `/api/wenku/read-count` | 阅读计数(IP 限频1次/分) |

#### 公开路由 — 文稿

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/transcript/available/:seriesId` | 查有文稿的集数 |
| GET | `/api/transcript/:seriesId/:ep` | 获取文稿全文 |

#### 公开路由 — 社区

| 方法 | 路径 | 功能 |
|------|------|------|
| GET/POST | `/api/messages` | 留言墙（列表 + 发表） |
| GET/POST | `/api/gongxiu` | 共修记录（列表 + 提交） |

#### 管理员路由 (需 X-Admin-Token)

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/admin/verify` | Token 验证 |
| GET | `/api/admin/stats` | 仪表盘数据(播放趋势/热门系列) |
| GET/PUT | `/api/admin/categories` | 分类管理 |
| GET/POST/PUT/DELETE | `/api/admin/series` | 系列 CRUD |
| GET/POST/PUT/DELETE | `/api/admin/episodes/:seriesId` | 集数 CRUD |
| POST | `/api/admin/episodes/:id/backfill-audio-meta` | 回填音频元数据(HEAD→content-length) |
| POST | `/api/admin/embeddings/build` | 批量向量化文档 |
| GET | `/api/admin/embeddings/status` | 向量化进度 |
| POST | `/api/admin/transcript/populate` | 文稿 ↔ 音频映射 |
| POST | `/api/admin/transcript/auto-match` | 自动匹配文稿与音频 |
| POST | `/api/admin/transcript/transcribe` | 批量 Whisper 转录 |
| POST | `/api/admin/chapters/generate` | 生成章节时间戳 |
| POST | `/api/admin/wenku-sync` | R2→D1 文库同步 |
| GET | `/api/admin/wenku-sync-status` | 同步进度 |
| GET/PUT/DELETE | `/api/admin/messages/:id` | 留言审核 |
| POST | `/api/admin/cleanup` | 清理过期数据 |
| GET | `/api/admin/ai-stats` | AI 调用统计(7/30/90天) |

#### 分享路由

| 路径 | 功能 |
|------|------|
| `/share/:seriesId` | 系列分享页(爬虫→OG标签, 用户→302跳转) |
| `/share/:seriesId/:ep` | 集数分享页 |

### 4.3 后端模块组织

```
functions/
├── api/[[path]].js          # 统一路由入口 + CORS + 鉴权
├── lib/
│   ├── admin-content.js     # 分类/系列/集数 CRUD + schema 发现
│   ├── admin-messages.js    # 留言审核(状态/置顶/删除)
│   ├── ai-routes.js         # RAG问答/摘要/推荐/搜索/语音
│   ├── ai-utils.js          # AI基础设施(模型/分块/嵌入/重排/限频)
│   ├── ai-prompts.js        # 提示词模板(引用原文/摘要/推荐)
│   ├── audio-utils.js       # 音频URL构建(桶→CDN映射)
│   ├── crypto-utils.js      # SHA-256哈希/IP脱敏/北京时间
│   ├── http-utils.js        # JSON响应/Edge缓存/缓存键规范化
│   ├── transcript-routes.js # 文稿路由(可用性/获取/映射/转录)
│   └── wenku-routes.js      # 文库路由(系列/文档/搜索/同步)
├── share/[[path]].js        # 社交分享OG标签生成
```

### 4.4 音频分发 Worker

**文件**: `workers/audio-subdomain-worker.js`
**域名**: `audio.foyue.org`

```
请求:  https://audio.foyue.org/{bucketId}/{folder}/{file.mp3}
       │
       ├── 路径解析 → R2 存储桶查找
       ├── Range 请求 → 206 Partial Content
       ├── 完整请求 → 200 + 小文件预缓存
       │
       └── 响应头:
           Cache-Control: public, max-age=2592000, immutable (30天)
           Accept-Ranges: bytes
           Access-Control-Allow-Origin: https://foyue.org
```

**6 个音频存储桶**:
| 桶名 | 内容 |
|------|------|
| `daanfashi` | 大安法师讲经 |
| `fohao` | 佛号念诵 |
| `yinguangdashi` | 印光大师 |
| `jingtushengxian` | 净土圣贤 |
| `youshengshu` | 有声书 |
| `jingdiandusong` | 经典读诵 |

---

## 5. 数据层

### 5.1 D1 数据库 Schema

#### 核心内容表

```sql
-- 分类表
categories (id, title, sort_order)

-- 系列表
series (id, category_id, title, speaker, description, intro,
        bucket, folder, total_episodes, play_count, appreciate_count,
        cover_url, sort_order)

-- 集数表
episodes (id, series_id, episode_num, title, file_name, url,
          story_number, play_count,
          duration,           -- 音频时长(秒)
          bytes, mime, etag)  -- 音频元数据

-- 播放日志
play_logs (id, series_id, episode_num, origin, user_agent, timestamp)

-- 随喜
appreciations (id, series_id, client_hash, ip_hash, created_at)
```

#### AI/向量化表

```sql
-- AI 限频
ai_rate_limits (id, ip_hash, action, timestamp)

-- AI 摘要缓存
ai_summaries (id, document_id, summary, model, created_at)

-- 向量化任务
ai_embedding_jobs (id, document_id, status, chunks_count, error, ...)

-- 每日推荐缓存
ai_daily_recommendations (id, date, status, content, error)

-- AI 调用日志
ai_call_logs (id, action, model, input_tokens, output_tokens, ...)
```

#### 文库/文稿表

```sql
-- 文库文档
documents (id, title, type, category, series_name, episode_num, format,
           r2_bucket, r2_key, content, file_size,
           audio_series_id, audio_episode_num,  -- 音频映射
           read_count, created_at, updated_at)

-- 全文搜索索引
documents_fts (虚拟表, FTS5, 自动触发器同步)

-- 章节标记
episode_chapters (id, series_id, episode_num, chapters_json)
```

#### 社区表

```sql
-- 留言墙
messages (id, nickname, content, ip_hash,
          status: approved/pending/hidden,
          pinned, created_at)

-- 共修记录
gongxiu_entries (id, date, nickname, practice_name, count,
                 vow_type: universal/blessing/rebirth/custom,
                 vow_target, ip_hash)

-- 共修每日统计
gongxiu_daily_stats (date, total_count, participant_count)
```

### 5.2 外部服务绑定 (wrangler.toml)

| 绑定名 | 服务 | 用途 |
|--------|------|------|
| `DB` | D1: foyue-db | 主数据库 |
| `AI` | Workers AI | BGE-M3/Qwen/Whisper |
| `VECTORIZE` | Vectorize: dharma-content | 768维语义搜索 |
| `R2_WENKU` | R2: jingdianwendang | 文库文档存储 |

### 5.3 数据库迁移历史 (25 个)

| 迁移 | 内容 |
|------|------|
| 0001 | 初始化 categories/series/episodes/play_logs |
| 0002 | 种子数据 |
| 0003 | 添加 origin 字段 |
| 0004 | AI 表 (rate_limits, summaries, embedding_jobs, documents) |
| 0005 | 随喜集数级别 |
| 0006 | 留言墙 |
| 0007 | 每日推荐 |
| 0008 | AI 调用日志 |
| 0009 | 集数添加 duration |
| 0010 | 回填 duration 数据 |
| 0011 | 添加新系列 |
| 0012 | 修复数据 |
| 0013 | 章节标记 |
| 0014 | AI schema 加固 |
| 0015 | 共修 |
| 0016 | 随喜护栏 |
| 0017 | 有声书专辑 |
| 0018 | 修复净土百问引用 |
| 0019 | 删除废弃系列 |
| 0020 | 添加万善先资 |
| 0021 | 集数添加 audio_meta (bytes/mime/etag) |
| 0022 | 同步新系列+修复描述 |
| 0023 | 修复万善集数总数 |
| 0024 | 文库性能索引 |
| 0025 | 文库 FTS5 搜索 |

---

## 6. 核心功能链路

### 6.1 音频播放链路

```
用户点击集数卡片
    │
    ▼
pages-category.js: showEpisodes()
    │ 构建 playlist 数组
    ▼
player.js: playList(seriesId, index, playlist)
    │
    ├── 1. 清理上一首的异步回调(会话隔离)
    ├── 2. 更新 state + UI (曲目信息、进度条归零)
    ├── 3. playback-policy.js 判断:
    │   ├── 短音频(≤15min) → full-load 后播放
    │   └── 长音频 → Range 流式播放
    ├── 4. audio-cache.js 检查离线缓存:
    │   ├── 命中 → 使用缓存 URL
    │   └── 未命中 → audio.foyue.org URL
    ├── 5. audio.src = url; audio.play()
    ├── 6. history.js 记录/恢复播放位置
    ├── 7. api.js 上报播放次数(含熔断)
    └── 8. Media Session API 更新锁屏控制

播放中持续:
    ├── onTimeUpdate → 更新进度条 + store 断点保存(防抖)
    ├── stall 检测 → 自动恢复 (iOS 兼容)
    └── onEnded → 根据循环模式:
        ├── 顺序 → nextTrack()
        ├── 单曲 → 重播
        └── 随机 → 随机下一首(避免重复命中)
```

### 6.2 AI 问答链路

```
用户输入问题 (文本或语音)
    │
    ├── [语音] ai-voice.js: MediaRecorder → 音频 blob
    │   → POST /api/ai/voice-to-text → Whisper v3 → 文本
    │
    ▼
ai-app.js: sendMessage(question)
    │
    ▼
ai-client.js: askQuestionStream(question, history)
    │
    ▼
POST /api/ai/ask-stream (SSE)
    │
    ├── 1. 限频检查 (10次/分, 100次/天 per IP)
    ├── 2. BGE-M3 生成查询向量
    ├── 3. Vectorize 语义检索 (topK=5, 阈值0.45)
    ├── 4. D1 加载文档原文
    ├── 5. LLM 重排 (2+结果时)
    ├── 6. 构建 RAG 上下文 (系统提示 + 文档 + 历史)
    ├── 7. Qwen 3 30B 流式生成回答
    └── 8. 提取 [FOLLOWUP] 追问建议
    │
    ▼ SSE 逐 token 推送
ai-app.js: 实时渲染消息气泡
    │
    ├── ai-format.js: Markdown → HTML
    ├── ai-preview.js: 展示引用文档预览
    └── ai-conversations.js: 持久化对话历史
```

### 6.3 首页加载链路

```
浏览器打开 index.html
    │
    ▼
main.js 初始化
    ├── 1. 导入所有 CSS 模块
    ├── 2. theme.js: 检测/应用主题
    ├── 3. i18n.js: 检测/应用语言
    ├── 4. dom.js: 缓存 DOM 引用
    ├── 5. store.js: 加载持久状态
    ├── 6. history.js: 加载播放历史
    ├── 7. player.js: 恢复播放状态(不自动播放)
    ├── 8. pwa.js: 注册 SW + 安装引导
    └── 9. 绑定事件: tab切换、搜索、播放控制
    │
    ▼
renderHomePage()
    ├── 1. 获取 /api/categories → state.data (缓存)
    ├── 2. 渲染每日法语
    ├── 3. 渲染继续收听卡片 (从 history 获取)
    ├── 4. 渲染分类念佛卡片
    └── 5. AI 每日推荐 (lazy, 不阻塞首屏)
```

### 6.4 文库阅读链路

```
wenku.html → wenku-app.js
    │
    ▼
初始化
    ├── theme.syncSystemTheme()
    └── currentView = 'home'
    │
    ▼
加载系列列表
    │ wenku-api.js: GET /api/wenku/series
    ▼
用户点击系列 → currentView = 'series'
    │ wenku-api.js: GET /api/wenku/documents?series=xxx
    ▼
用户点击文档 → currentView = 'reader'
    │ wenku-api.js: GET /api/wenku/documents/:id
    ▼
阅读器界面
    ├── 文档内容渲染 (HTML)
    ├── 上一篇/下一篇导航 (CTE 窗口查询)
    ├── 书签 (localStorage)
    ├── 字体/字号设置
    ├── 阅读进度自动保存
    └── 阅读计数上报 (IP 限频)
```

### 6.5 念佛计数链路

```
nianfo.html → nianfo-app.js
    │ 或 index.html → pages-my → counter-lazy.js (模态框)
    │
    ▼
counter.js: initCounterStandalone(container)
    │
    ├── 加载 store 中的计数数据
    ├── 检查每日重置 (北京时间 00:00)
    └── 渲染计数器 UI
    │
    ▼
用户点击计数
    ├── 1. 日计 + 1, 总计 + 1
    ├── 2. 涟漪动画 + 触觉反馈
    ├── 3. 防抖保存到 store
    └── 4. 目标达成提示
    │
    ▼
用户点击回向
    ├── 展示回向偈文
    └── 记录今日完成
    │
    ▼
用户点击分享
    └── counter-share.js:
        ├── Canvas 渲染海报
        ├── QR 码 (foyue.org/nianfo)
        └── → navigator.share() 或 下载图片
```

### 6.6 共修提交链路

```
gongxiu.html → gongxiu-app.js
    │ 或 index.html → pages-my → gongxiu-panel → gongxiu-lazy.js
    │
    ▼
gongxiu.js: renderGongxiu()
    │
    ├── GET /api/gongxiu → 社区功德池(日总量/参与人数)
    ├── 展示今日回向流(他人的发愿)
    │
    ▼
用户提交修行记录
    │ POST /api/gongxiu
    │ {nickname, practice_name, count, vow_type, vow_target}
    │
    ├── 后端校验: count 1~150000, IP 限 3次/天
    ├── 更新 gongxiu_entries + gongxiu_daily_stats
    └── 返回更新后的社区统计
```

---

## 7. PWA 与缓存策略

### 7.1 Service Worker 三层缓存

| 缓存名 | 版本 | 策略 | 内容 |
|--------|------|------|------|
| `static-v10` | 手动版本号 | Cache-First | .js, .css, .png, 字体, HTML 壳 |
| `data-v10` | 手动版本号 | Stale-While-Revalidate | /api/* 响应 |
| `audio-v3` | 手动版本号 | Cache-First | .mp3, .m4a 音频文件 |

### 7.2 音频缓存管理

```
audio-cache.js 管理前端缓存逻辑:
  ├── 缓存上限: 500MB
  ├── 淘汰策略: LRU (最近最少使用)
  ├── 缓存写入: 用户手动触发 或 短音频播放完成后自动缓存
  ├── 缓存状态: store 中维护已缓存 URL 集合(同步可查)
  └── SW 联动: SW 缓存成功后通过 postMessage 通知主线程
```

### 7.3 HTTP 缓存策略

| 资源类型 | Cache-Control | 说明 |
|---------|---------------|------|
| `/assets/*` (带 hash) | `max-age=31536000` | 永久缓存（文件名含哈希） |
| `/icons/*` | `max-age=2592000` | 30 天 |
| `/api/*` | `no-store` | 不缓存（由 SW 层管理） |
| `/admin.html` | `no-store + noindex` | 管理页不缓存不索引 |
| 音频 (audio.foyue.org) | `max-age=2592000, immutable` | 30 天不变 |

### 7.4 Edge Cache (Cloudflare)

后端使用 `http-utils.js` 的 `getEdgeCachedJson()` 在 CF Edge 缓存 API 响应：

| 数据 | Edge 缓存时间 | 说明 |
|------|-------------|------|
| /api/categories | 30 分钟 | stale-while-revalidate 24h |
| AI 嵌入 | 24 小时 | 稳定内容 |
| AI 摘要 | 7 天 | 确定性输出 |
| 每日推荐 | 12 小时 | 每日刷新 |

### 7.5 离线行为

| 场景 | 行为 |
|------|------|
| 页面导航离线 | 返回缓存的应用壳 (/) |
| API 请求离线 | 返回 `{"error":"offline"}` (503) |
| 音频请求离线 | 从 audio-v3 缓存播放已缓存音频 |
| Range 请求 | 直接走网络（不走缓存，避免冲突） |

---

## 8. 模块依赖关系图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        main.js (Bootstrap)                          │
│   加载 CSS → 初始化子系统 → 绑定事件 → 协调标签页导航               │
└────────────────────────────┬────────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────────────┐
        │          Core Infrastructure Layer               │
        │  ┌───────┐ ┌─────┐ ┌───────┐ ┌───────┐         │
        │  │state  │ │dom  │ │store  │ │utils  │         │
        │  │(状态) │ │(DOM)│ │(持久) │ │(工具) │         │
        │  └───────┘ └─────┘ └───────┘ └───────┘         │
        │  ┌───────┐ ┌─────┐ ┌───────┐                   │
        │  │theme  │ │i18n │ │icons  │                   │
        │  │(主题) │ │(i18n)│ │(图标) │                   │
        │  └───────┘ └─────┘ └───────┘                   │
        └─────────────────────────────────────────────────┘
                             │ (所有模块依赖此层)
        ┌────────────────────┼────────────────────────────┐
        │              Player & Audio Layer                │
        │                                                  │
        │  player.js ──────► audio-cache.js               │
        │      │  │          audio-meta-cache.js          │
        │      │  │          duration-cache.js            │
        │      │  │          playback-policy.js           │
        │      │  └────────► history.js                   │
        │      └──────────── api.js (播放次数上报)        │
        │                         └─► request-cache.js    │
        └─────────────────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────────────┐
        │              Pages Layer                         │
        │                                                  │
        │  pages-home.js ──► ai-client.js (每日推荐)      │
        │  pages-category.js ──► ai-summary.js            │
        │       │                transcript.js            │
        │       └──────────► duration-cache.js            │
        │  pages-my.js ──► history-view.js                │
        │       │           gongxiu-panel.js (动态)       │
        │       │           message-wall.js               │
        │  search.js ──► pages-category.js (动态)         │
        └─────────────────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────────────┐
        │          独立页面 (各自独立的 JS 入口)            │
        │                                                  │
        │  ai-app.js ──► ai-client/conversations/format/  │
        │      │          voice/preview/wenku-api          │
        │  wenku-app.js ──► wenku-api.js                  │
        │  nianfo-app.js ──► counter.js                   │
        │  gongxiu-app.js ──► gongxiu.js                  │
        │  admin/main.js ──► (独立管理模块)               │
        └─────────────────────────────────────────────────┘
```

---

## 9. 数据规模与配置

### 9.1 内容数据

| 指标 | 数量 |
|------|------|
| 分类 | 3 个（首页/有声书/听经台） |
| 系列 | 14+ 个 |
| 集数 | 466+ 集 |
| R2 音频桶 | 6 个 |
| R2 文库桶 | 1 个 (jingdianwendang) |
| D1 数据表 | 13+ 个 |
| D1 迁移 | 25 个 |

### 9.2 环境变量

| 变量 | 说明 |
|------|------|
| `ADMIN_TOKEN` | 管理员 API 密钥 |
| `ALLOWED_ORIGINS` | CORS 白名单 |

### 9.3 域名与服务

| 域名 | 服务 | 用途 |
|------|------|------|
| foyue.org | Cloudflare Pages | 主站 |
| amituofo.pages.dev | Cloudflare Pages | 备用域名 |
| audio.foyue.org | Cloudflare Worker | 音频 CDN 分发 |

### 9.4 AI 模型配置

| 模型 | 用途 | 缓存 |
|------|------|------|
| `@cf/baai/bge-m3` | 文本嵌入 (768维) | 24h |
| `@cf/qwen/qwen3-30b-a3b-fp8` | 对话/摘要/推荐 | 按场景 |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | 备用对话 | - |
| `@cf/openai/whisper-large-v3-turbo` | 语音转文字 | 7d |

### 9.5 限频规则

| 场景 | 限制 |
|------|------|
| AI 问答 | 10次/分钟, 100次/天 per IP |
| 文库阅读计数 | 1次/分钟 per 文档 per IP |
| 共修提交 | 3次/天 per IP |
| 留言发表 | 内容审核 (status: pending → approved) |

---

## 10. 重构方向（建议方案）

本节是基于当前代码结构给出的下一阶段重构建议，目标是：

- 降低主链路复杂度，减少 iOS/弱网场景不稳定
- 提升模块边界清晰度，降低后续功能扩展成本
- 让 AI、文库、社区能力形成统一内容中台

### 10.1 当前主要架构痛点

| 维度 | 当前问题 | 影响 |
|------|---------|------|
| 前端状态管理 | `state.js` + `store.js` + 各模块局部状态并存 | 状态来源分散，问题排查成本高 |
| 播放链路 | `player.js` 职责过重（播放/状态/UI/恢复/上报混合） | 修改风险高，回归测试面大 |
| API 路由组织 | `functions/api/[[path]].js` 规则持续膨胀 | 新功能接入时路由冲突风险上升 |
| 内容模型 | 音频、文库、文稿映射关系分散在多个表和脚本 | 数据一致性依赖人工流程 |
| 社区能力 | 共修、留言、计数器数据孤岛化 | 难做统一用户画像和增长功能 |

### 10.2 目标架构（下一阶段）

```
前端 (App Shell + Feature Modules)
    ├── shell/ (启动、路由、主题、i18n、权限)
    ├── features/player/ (纯播放域)
    ├── features/content/ (分类、系列、集数、文稿)
    ├── features/ai/ (问答、摘要、推荐、语音)
    ├── features/community/ (计数、共修、留言)
    └── shared/ (API SDK、缓存、工具、UI primitives)

边缘 API (Domain Router)
    ├── /api/content/*
    ├── /api/player/*
    ├── /api/ai/*
    ├── /api/community/*
    ├── /api/admin/*
    └── /api/system/*

数据与服务
    ├── D1: 结构化业务数据
    ├── Vectorize: 语义索引
    ├── R2: 音频与文档对象
    └── Worker: 音频分发与边缘缓存
```

### 10.3 重构优先级（按收益排序）

#### P0：播放主链路稳定化（先做）

- 将 `player.js` 拆为：
    - `player-core`（audio 元素与状态机）
    - `player-session`（切歌会话隔离）
    - `player-ui`（DOM 更新）
    - `player-telemetry`（播放上报）
- 明确唯一播放流程：`selectTrack -> resolveSource -> play -> observe -> persist`
- 固化音频策略：短音频缓存、长音频纯流式（与 `audio-playback-simplification-plan.md` 对齐）

交付标准：

- iPhone/Android 各 10 轮切歌无串台
- 前后台切换恢复成功率 > 99%
- 回归问题定位可在单模块完成

#### P1：内容域统一（音频 + 文库 + 文稿）

- 抽象统一内容实体：`ContentSeries`, `ContentEpisode`, `ContentDocument`
- 建立单向映射关系：`episode -> document(optional)`
- 将文稿可用性、章节、摘要入口统一到内容域 API

交付标准：

- 前端任一集数可一次性拿到：播放信息 + 文稿状态 + AI能力状态
- 管理后台支持可视化查看映射关系与缺失项

#### P2：API 领域化路由

- 从单文件正则路由迁移到领域路由目录：
    - `functions/api/content/*`
    - `functions/api/ai/*`
    - `functions/api/community/*`
- 保持旧路由兼容（至少 1 个版本周期）

交付标准：

- 路由文件大小和复杂度显著下降
- 每个领域具备独立测试脚本与错误码规范

#### P3：社区能力产品化

- 打通计数器、共修、留言数据，形成“修行档案”
- 增加匿名身份标识策略（隐私友好）
- 引入成长激励：连续天数、阶段成就、共修目标

交付标准：

- 用户能在“我的”看到统一修行数据面板
- 共修参与率和次日留存可统计

### 10.4 推荐的目录演进（前端）

```
src/js/
    shell/
        bootstrap.js
        router.js
        lifecycle.js
    features/
        player/
            core.js
            session.js
            ui.js
            telemetry.js
        content/
            categories.js
            episodes.js
            transcript.js
        ai/
            chat.js
            summary.js
            recommend.js
        community/
            counter.js
            gongxiu.js
            messages.js
    shared/
        api-client/
        cache/
        store/
        utils/
```

### 10.5 风险与回滚策略

| 风险 | 触发条件 | 回滚方案 |
|------|---------|---------|
| 播放异常上升 | 播放失败率、卡顿恢复率恶化 | 切回旧 `player.js` 分支逻辑（开关控制） |
| API 兼容问题 | 老版本前端命中新路由失败 | 保留旧路径代理到新 handler |
| 文稿映射错乱 | 批量同步脚本误匹配 | 映射变更写入审计表并支持一键回滚 |

### 10.6 30 天执行计划（建议）

| 周次 | 目标 | 产出 |
|------|------|------|
| 第 1 周 | 播放器拆分设计 + 基线监控 | 设计文档 + 指标看板 |
| 第 2 周 | P0 实施与灰度 | 新播放内核 + 灰度开关 |
| 第 3 周 | 内容域 API 整理 | 统一内容 DTO + 管理后台映射页 |
| 第 4 周 | 路由领域化改造 | 新目录路由 + 兼容层 + 验收报告 |

### 10.7 详细实施文档

- 播放器 P0 完整实施方案: [docs/p0-player-refactor-plan.md](docs/p0-player-refactor-plan.md)

---

*文档由 GitHub Copilot 自动生成，基于代码库全量分析*
