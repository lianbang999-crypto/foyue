# 当前状态与交接记录

> 每次 PR 合并后更新本文件。新智能体到来时，读完 CLAUDE.md 后读这里。

---

## 项目进度

### 已完成
- [x] GitHub 仓库建立，3 位协作者已邀请
- [x] 基础音频播放器（播放/暂停/上下曲/快进快退/倍速/定时）
- [x] 播放列表管理、循环模式（顺序/单曲/随机）
- [x] 暗色/亮色主题
- [x] 多语言（中/英/法）
- [x] PWA 安装引导（Android + iOS）
- [x] 播放历史记录（弹层查看、单条删除、一键清空）
- [x] 断点续播（localStorage 持久化）
- [x] 搜索功能
- [x] 全屏播放器（下滑关闭、进度条拖动增强）
- [x] 后退导航保护
- [x] 首页（每日一句、东林佛号卡片、继续收听、推荐系列）
- [x] Media Session API（锁屏控制）
- [x] 预加载下一首（网络感知）
- [x] **Vite + ES Modules 重构**（单文件 → 13 JS 模块 + 7 CSS 文件 + 3 JSON 翻译文件）
- [x] Pages Functions API（categories/series/episodes/play-count/appreciate/stats）
- [x] D1 数据库绑定（foyue-db）
- [x] 项目文档体系

### 当前阶段：阶段 3（内容体系）进行中

**法音文库子项目（wenku.foyue.org）** — 代码开发完成，待部署

文库是独立的 Cloudflare Pages 项目，仓库：[foyue-wenku](https://github.com/lianbang999-crypto/foyue-wenku)

已完成：
- Vite + Vanilla JS 单页应用（4 个页面：首页、分类、系列、阅读器）
- 4 种阅读模式（普通、护眼、夜间、墨水屏）
- 字号 / 字体设置 + 阅读进度书签
- D1 schema（documents + bookmarks 表，与主站共用 foyue-db）
- Pages Functions API（5 个接口）
- R2 同步脚本（jingdianwendang → D1，~304 个文件）
- 构建通过：19 modules → HTML 4.63KB + CSS 12.04KB + JS 16.62KB

待完成：
1. 创建 GitHub 仓库 foyue-wenku 并推送代码
2. 创建 Cloudflare Pages 项目，绑定 D1 + R2
3. 执行 D1 schema + R2 数据同步
4. 绑定 wenku.foyue.org 域名
5. 主站「我的」页面添加文库入口

---

## 重构记录（2026-02-27）

从单文件 index.html（2135 行）重构为 Vite 模块化项目：

| 变更 | 说明 |
|------|------|
| 构建工具 | 引入 Vite（`npm run dev` / `npm run build`） |
| index.html | 从 2135 行缩减到 265 行（仅 DOM 结构） |
| CSS | 拆分为 7 个文件（tokens/reset/layout/player/cards/pages/components） |
| JavaScript | 拆分为 13 个 ES Module（main/state/dom/i18n/theme/icons/utils/history/player/search/pwa/pages-*） |
| i18n | 从内嵌对象改为 JSON 文件（src/locales/zh.json, en.json, fr.json） |
| 静态资源 | 移到 public/ 目录（manifest.json, robots.txt, sitemap.xml, icons/, data/） |
| 后端 | 删除 workers/ 目录，统一使用 Pages Functions（functions/api/） |
| 部署 | 从手动 wrangler deploy 改为 Git Push 自动部署 |
| 构建产物 | dist/ 目录（HTML 14KB + CSS 31KB + JS 51KB） |

### Cloudflare Dashboard 需要的设置变更

**重要**：由于从静态站点改为 Vite 构建项目，需要在 Cloudflare Dashboard 更新构建设置：
- 构建命令：`npm run build`
- 输出目录：`dist`

---

## 重要决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-02-27 | Vite + Vanilla JS 重构 | 保持简洁，无框架负担，适合 1人+AI 模式 |
| 2026-02-27 | 删除独立 Workers，仅用 Pages Functions | 简化架构，Pages Functions 自动与 Pages 部署集成 |
| 2026-02-27 | Git Push 自动部署 | 取代手动 wrangler deploy，更可靠 |
| 2026-02-25 | 不做用户注册登录 | 增加使用门槛，初期 localStorage 够用 |
| 2026-02-25 | AI 翻译必须标注"仅供参考" | 佛法翻译必须准确，AI 可能出错 |
| 2026-02-25 | 用 Cloudflare 全家桶 | 服务间零延迟，免费额度够初期使用 |
| 2026-02-25 | 随喜代替点赞 | 莲花图标，契合佛教场景 |
| 2026-02-25 | 不做论坛/社区 | 运营成本太高，留言墙先行 |

---

## 已知问题

- Cloudflare Dashboard 构建设置需更新（构建命令 + 输出目录）
- manifest.json 引用了 icon-512.png，需确认文件存在

---

## 交接记录

### 2026-02-27 法音文库子项目开发完成

**做了什么：**
- 新建法音文库项目（foyue-wenku），独立于主站
- 完成全部前端代码：首页、分类页、系列页、阅读器
- 设计并实现 4 种阅读模式（普通 / 护眼 / 夜间 / 墨水屏）
- 字号（小/中/大/特大）、字体（无衬线/宋体/楷体）设置
- 阅读进度自动保存（localStorage 书签）
- D1 数据库 schema 设计（documents 表 + bookmarks 表）
- Pages Functions API 开发（分类 / 文档列表 / 文档详情 / 搜索 / 阅读计数）
- R2 数据同步脚本（扫描 jingdianwendang 桶，解析文件元数据写入 D1）
- PWA manifest
- Vite 构建验证通过（19 modules, 0 errors）

**架构决策：**
- 文库作为独立 Cloudflare Pages 项目（wenku.foyue.org）
- 与主站共用同一个 Cloudflare 账户、D1（foyue-db）、R2（jingdianwendang）
- 技术栈与主站一致（Vite + Vanilla JS）
- API 路径前缀 `/api/wenku/` 避免与主站 API 冲突

**没做完：**
- GitHub 仓库创建 + 代码推送
- Cloudflare Pages 项目创建 + D1/R2 绑定
- D1 schema 执行 + R2 数据同步
- wenku.foyue.org 域名绑定
- Logo 处理（已有 AI 生成稿，待裁切为 icon）
- 主站「我的」页面文库入口

**注意事项：**
- wrangler.toml 中的 database_id 是占位符，需替换为真实 D1 ID
- R2 同步脚本需要 D1 绑定才能运行
- 文库 API 路径为 `/api/wenku/*`，主站 API 路径为 `/api/*`，互不冲突

### 2026-02-27 重构完成

**做了什么：**
- 完成 Vite + ES Modules 全量重构
- 创建 package.json、vite.config.js
- 拆分 CSS 为 7 个模块
- 拆分 JS 为 13 个 ES Module
- i18n 改为 JSON 文件
- 静态资源移到 public/
- 删除 workers/ 目录
- 更新所有项目文档
- 构建验证通过（27 modules，0 error）

**没做完：**
- Cloudflare Dashboard 构建设置需要手动更新
- 前端尚未接入 D1 API（仍使用 audio-data.json）
- 线上全功能测试（部署后需验证）

**注意事项：**
- 部署前必须在 Cloudflare Dashboard 设置构建命令为 `npm run build`，输出目录为 `dist`
- share_from 翻译键已更新为 foyue.org（替换旧的 bojingji.pages.dev）
- 旧的 Service Worker 会在首次访问时自动清理（main.js 中有清理逻辑）

### 2026-02-26 lianbang999-crypto

**做了什么：**
- 更新 CLAUDE.md：工位分工、文件结构、功能规划、交接流程
- 创建 CURRENT-STATUS.md：实时进度和交接记录
- 更新 TODO.md：完整 9 阶段功能规划
- 添加 .gitignore

**没做完：**
- ARCHITECTURE.md 需要更新为多文件架构描述 → ✅ 已在 2026-02-27 重构中完成

**注意事项：**
- 语言文件已从 lang/*.js 改为 src/locales/*.json
