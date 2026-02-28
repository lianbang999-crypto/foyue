# 净土法音 — 智能体工作手册

> 你是一个 AI 智能体，被分配到本项目的一个工位上。请先通读本文件，再读 CURRENT-STATUS.md，然后开始工作。

---

## 项目简介

**净土法音**是一个佛教净土宗音频内容平台 PWA。用户可以在线收听佛号、法师讲经等音频，未来会扩展文章阅读、AI 功能、社区互动等。

- 线上地址：https://foyue.org
- 备用地址：https://amituofo.pages.dev
- GitHub 仓库：https://github.com/lianbang999-crypto/foyue

---



---

## 技术架构

```
前端构建 → Vite（ES Modules，输出到 dist/）
静态托管 → Cloudflare Pages（Git Push 自动部署）
后端 API → Cloudflare Pages Functions（functions/ 目录）
数据库 → Cloudflare D1（foyue-db）
音频存储 → Cloudflare R2（4 个存储桶）
AI 推理 → Cloudflare Workers AI（bge-m3 / GLM / Whisper）
向量搜索 → Cloudflare Vectorize（dharma-content 索引）
AI 网关 → Cloudflare AI Gateway（buddhist-ai-gateway）
字体 → Google Fonts CDN（Noto Sans SC + DM Sans）
```

## 文件结构

```
foyue/
├── index.html              # HTML 入口（仅 DOM 结构）
├── package.json            # Vite 项目配置
├── vite.config.js          # Vite 构建配置
├── wrangler.toml           # Cloudflare D1 + AI + Vectorize 绑定
├── public/                 # 静态资源（Vite 直接复制到 dist/）
│   ├── manifest.json
│   ├── robots.txt
│   ├── sitemap.xml
│   ├── data/audio-data.json
│   └── icons/
├── src/
│   ├── css/                # 8 个 CSS 模块
│   │   ├── tokens.css      # CSS 变量（浅色 + 深色主题）
│   │   ├── reset.css       # CSS Reset
│   │   ├── layout.css      # Header/TabBar/Content 布局
│   │   ├── player.css      # 播放器（迷你 + 全屏）
│   │   ├── cards.css       # 系列卡片 + 集数列表
│   │   ├── pages.css       # 首页 + 我的页面
│   │   ├── components.css  # 弹窗/Toast/Banner/加载
│   │   └── ai.css          # AI 组件（聊天面板/摘要/搜索切换）
│   ├── js/                 # 16 个 ES Module
│   │   ├── main.js         # 入口
│   │   ├── state.js        # 共享状态
│   │   ├── dom.js          # DOM 引用
│   │   ├── i18n.js         # 国际化
│   │   ├── theme.js        # 主题管理
│   │   ├── icons.js        # SVG 图标常量
│   │   ├── utils.js        # 工具函数（含 escapeHtml）
│   │   ├── history.js      # 播放历史
│   │   ├── player.js       # 播放器核心
│   │   ├── search.js       # 搜索（关键词 + AI 语义）
│   │   ├── pwa.js          # PWA 安装引导
│   │   ├── pages-home.js   # 首页
│   │   ├── pages-my.js     # "我的"页面
│   │   ├── pages-category.js # 分类/集数页面
│   │   ├── ai-client.js    # AI API 客户端
│   │   ├── ai-chat.js      # AI 悬浮问答面板
│   │   └── ai-summary.js   # AI 摘要组件
│   └── locales/            # i18n 翻译文件（JSON）
│       ├── zh.json
│       ├── en.json
│       └── fr.json
├── functions/              # Cloudflare Pages Functions
│   ├── api/[[path]].js     # API 路由（数据 + AI + 管理员）
│   └── lib/ai-utils.js     # 共享 AI 工具模块
├── workers/
│   └── migrations/         # D1 数据库迁移脚本
│       └── 0004_ai_tables.sql
└── dist/                   # 构建输出（.gitignore）
```

---

## 开发命令

```bash
npm install          # 安装依赖
npm run dev          # 本地开发（HMR + API 代理）
npm run build        # 生产构建
npm run preview      # 预览构建结果
```

---

---

#

## 功能规划（9 个阶段）

### 阶段 1：基础建设 ✅
- 代码拆分为 Vite + ES Modules
- 构建部署流程（npm run build → Cloudflare Pages）
- audio-data.json 纳入仓库
- Pages Functions API 搭建

### 阶段 2：数据后端 ✅
- D1 数据库搭建
- 播放计数 API
- 随喜功能（莲花图标，"随喜 +1"）
- AI Gateway 搭建

### 阶段 3：内容体系
- 文章阅读页面（大安法师开示文字稿）
- 音频-文档关联（边听边读）
- 内容上传管理界面

### 阶段 4：社区互动
- 莲友留言墙（审核后展示）
- 反馈表单

### 阶段 5：AI 功能（Phase 1+2 ✅，待 Cloudflare 部署配置）
- ✅ AI 语义搜索（bge-m3 + Vectorize）
- ✅ AI 问答助手（RAG 管线 + GLM）
- ✅ AI 内容摘要（GLM + D1 缓存）
- ✅ 安全加固（XSS/TOCTOU/时序攻击/提示注入/CORS）
- 待部署：Vectorize 索引创建 + D1 迁移 + 环境变量
- 待开发：Wenku AI 集成、Whisper 音频转文字、AI 留言审核、AI 推荐

### 阶段 6：SEO 与推广
- Open Graph / 结构化数据
- sitemap.xml / robots.txt
- 多页面（文章页利于搜索引擎收录）
- 分享海报生成

### 阶段 7：APP 化
- Service Worker 离线缓存
- Web Push 新内容通知
- TWA 打包上架 Google Play

### 阶段 8：念佛计数器
- 计数界面 + 每日/累计统计
- 边听边念模式

### 阶段 9：体验优化
- 多主题皮肤
- 无障碍优化
- 数据备份方案

### 暂不做
- 用户注册登录系统
- 视频播放
- 论坛/社区
- 原生 APP
- AI 自动替换原文翻译

---

## 语言策略

- 核心内容（讲经开示）：仅中文原文
- 界面语言：中文 + 英文（手动维护），法文已有
- AI 翻译：用户主动触发，标注"AI 翻译，仅供参考"，优先推荐权威译本
- 佛教术语保留音译（Amitabha、Namo 等）

---

## 部署

详见 [DEPLOY.md](DEPLOY.md)
