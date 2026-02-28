# 变更记录

所有重要变更按时间倒序记录。

---

## 2026-02-27

### 法音文库子项目（foyue-wenku）

启动法音文库项目，提供净土宗经典文献与讲义稿的在线阅读功能。

- 独立仓库：[foyue-wenku](https://github.com/lianbang999-crypto/foyue-wenku)
- 域名：wenku.foyue.org（部署中）
- 与主站共用 D1（foyue-db）和 R2（jingdianwendang）

**前端**
- 4 个页面：首页、分类、系列、阅读器
- Hash 路由：`#/`、`#/category/:id`、`#/series/:cat/:name`、`#/read/:id`
- 4 种阅读模式：普通、护眼（Sepia）、夜间（Dark）、墨水屏（E-ink）
- 字号切换（小/中/大/特大）+ 字体切换（无衬线/宋体/楷体）
- 阅读进度书签自动保存
- 搜索功能（标题/内容/系列名）
- 构建产物：HTML 4.63KB + CSS 12.04KB + JS 16.62KB

**后端**
- D1 schema：documents 表（id, title, type, category, series_name, episode_num, format, content 等）
- 5 个 API：categories / documents / documents/:id / search / read-count
- R2 同步脚本：扫描 jingdianwendang 桶 → 解析元数据 → 写入 D1

**数据规模**
- 大安法师讲法集：~35 个系列，~290 篇 TXT 讲义稿
- 佛教经典：6 部 PDF
- 印光大师文钞：5 个文件（PDF/EPUB/DOCX）
- 省庵大师：1 部 PDF

### Vite + ES Modules 全量重构

将单文件 index.html（2135 行）重构为 Vite 模块化项目：

**构建工具**
- 引入 Vite 作为构建工具（`npm run dev` / `npm run build` / `npm run preview`）
- 构建目标：es2020 + safari14
- 压缩：esbuild
- 开发模式 API 代理到 foyue.org

**CSS 拆分**（从 index.html 提取到 7 个文件）
- `src/css/tokens.css` — CSS 变量（浅色 + 深色主题）
- `src/css/reset.css` — CSS Reset
- `src/css/layout.css` — 应用壳布局
- `src/css/player.css` — 播放器样式
- `src/css/cards.css` — 卡片和列表
- `src/css/pages.css` — 首页和"我的"页面
- `src/css/components.css` — 通用组件

**JavaScript 拆分**（从内联 IIFE 拆分为 13 个 ES Module）
- `main.js` — 入口 + 事件绑定 + 数据加载
- `state.js` — 共享状态
- `dom.js` — DOM 引用
- `i18n.js` — 国际化
- `theme.js` — 主题管理
- `icons.js` — SVG 图标常量
- `utils.js` — 工具函数
- `history.js` — 播放历史
- `player.js` — 播放器核心
- `search.js` — 搜索
- `pwa.js` — PWA 安装引导 + 后退保护
- `pages-home.js` — 首页
- `pages-my.js` — "我的"页面
- `pages-category.js` — 分类/集数页面

**i18n 改造**
- 从内嵌 JS 对象改为 JSON 文件（`src/locales/zh.json`, `en.json`, `fr.json`）
- `share_from` 翻译键更新为 foyue.org

**架构变更**
- 静态资源移到 `public/` 目录
- 删除 `workers/` 目录，统一使用 Pages Functions
- 部署方式从手动 wrangler deploy 改为 Git Push 自动部署
- index.html 从 2135 行缩减到 265 行

**构建产物**
- HTML: ~14 KB
- CSS: ~31 KB (gzip ~6 KB)
- JS: ~51 KB (gzip ~17 KB)

---

## 2026-02-26

### 播放历史优化
- 新增：历史弹层（查看全部历史记录）
- 新增：单条删除历史记录
- 新增：一键清空所有历史
- 新增：迷你进度条可视化（替代百分比文字）
- 更新："我的"页面只显示最近 3 条历史 + "查看全部"链接
- 新增 i18n 键：my_history_all, my_history_clear, my_history_clear_confirm, my_history_cleared

### 全屏播放器增强
- 新增：下滑手势关闭全屏播放器（滑动 >120px 关闭，<120px 弹回）
- 新增：双击左半区后退 15 秒 + 闪烁提示
- 新增：双击右半区前进 15 秒 + 闪烁提示
- 新增：进度条拖动时 thumb 放大 + 时间气泡提示

### Bug 修复
- 修复：从集数列表后退时显示空白页（现在正确恢复分类列表）
- 修复：首页后退时意外离开页面（现在始终保持在页面内）
- 修复：旧版历史记录字段名不兼容导致显示 "undefined"

---

## 2026-02-25

### 新功能
- 新增：播放历史记录（自动保存播放进度到 localStorage）
- 新增："我的"页面显示播放历史列表
- 新增：右滑/后退导航保护（防止误操作离开页面）
- 新增：PWA 安装引导（"我的"页面显示安装说明）

### 部署
- 首次部署到 Cloudflare Pages

---

## 2026-02-24

### 初始版本
- 基础播放器功能（播放、暂停、上/下一集、进度条）
- 有声书 + 听经台分类浏览
- 全屏播放器界面
- 迷你播放器底部栏
- i18n 国际化（zh/en/fr）
- 浅色/深色主题切换
- PWA 支持（manifest.json）
- 音频数据通过 JSON 配置
