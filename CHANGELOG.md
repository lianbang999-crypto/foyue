# 变更记录

所有重要变更按时间倒序记录。

---

## 2026-03-15

### 分支合并与缓存架构修复

- 合并 `copilot/vscode-mmrbgotg-etsq` 分支：统一 localStorage 管理器（store.js）、Cache API 集成、api.js 修复
- 合并 `copilot/fix-audio-playback-issues` 分支：音频播放结束后重播修复、自动切集高亮、缓存指示器 UX 优化
- 解决 3 个文件的合并冲突（cards.css、audio-cache.js、pages-category.js）
- 远程仓库回滚到 45727a8 后重新合并所有修复

---

## 2026-03-14

### 播放器核心修复（问题 1-7）

**提交**：`45727a8` feat: optimization phase elements

- 精确播放次数统计
- Open Graph 分享元数据
- 完整断点续播实现
- Facebook / Reddit 发帖规则更新

---

## 2026-03-13

### 首页与 UI 优化

- 首页 hero banner 重新设计，快速访问网格
- 书架式分类列表布局
- 首页加载字体优化，内联 SVG loader
- 首页顶部间距优化，离线热更新 Toast 提醒

---

## 2026-03-10 ~ 03-12

### PWA 与性能优化（PR #1 ~ #4）

- Service Worker stale-while-revalidate 策略
- 首页 DOM 缓存，消除骨架屏闪烁
- DNS prefetch 音频 CDN
- 播放按钮状态修复，今日推荐加载优化
- 全面 PWA 优化和代码修复
- 浏览器特定的手动安装引导

---

## 2026-03-06 ~ 03-09

### AI 功能迭代

- AI 从聊天机器人重构为搜索助手
- 模型切换：GLM-4.7-Flash → Qwen3-30B，抑制思维链输出
- AI 流式响应空内容修复，隐藏语音输入
- 文稿源高亮和阅读器滚动定位改进

---

## 2026-03-01 ~ 03-05

### 代码优化与部署

- D1 AI 表迁移执行
- Vectorize 索引重建（1024 维 → 768 维，匹配 BGE-M3）
- 文稿自动匹配（7 个系列，36 篇文档）
- 嵌入模型调整（PLaMo → BGE-M3）
- 后端 N+1 查询问题识别

---

## 2026-02-28

### AI 功能 Phase 1+2

**后端**（functions/api/[[path]].js + functions/lib/ai-utils.js）：
- RAG 问答：BGE-M3 嵌入 → Vectorize 检索 top-5 → D1 获取原文 → GLM 生成回答
- 语义搜索、内容摘要（缓存到 D1）
- 向量化管线（管理员 API 批量切块 + 嵌入）
- IP 限流（10 次/分钟、100 次/天）

**前端**：
- ai-chat.js — AI 问答面板
- ai-summary.js — 集摘要组件
- ai-client.js — AI API 客户端（30s 超时）
- ai.css — AI 组件样式

**安全**：innerHTML 防 XSS、恒定时间 token 比较、系统提示防注入、CORS 白名单

**新增 6 个文件**，修改 6 个文件。

---

## 2026-02-27

### Vite 模块化重构

从单文件 index.html（2135 行）重构为 Vite 模块化项目：

| 变更 | 说明 |
|------|------|
| 构建工具 | 引入 Vite |
| index.html | 2135 行 → 265 行（仅 DOM 结构） |
| CSS | 拆分为 7 个模块 |
| JavaScript | 拆分为 13 个 ES Module |
| i18n | 内嵌对象 → JSON 文件 |
| 后端 | 统一使用 Pages Functions |
| 部署 | Git Push 自动部署 |

### 法音文库子项目启动

- 独立仓库：wenku
- 4 个页面、4 种阅读模式、字号/字体设置、阅读进度书签
- 与主站共用 D1 和 R2

---

## 2026-02-26 及更早

### 基础功能建设

- 音频播放器核心功能（播放/暂停/切曲/倍速/定时）
- 播放列表管理、循环模式
- 暗色/亮色主题、多语言（中/英/法）
- PWA 安装引导
- 播放历史、断点续播、搜索
- 全屏播放器、后退导航保护
- 首页（每日一句、继续收听、推荐系列）
- Media Session API 锁屏控制
- 预加载下一首（网络感知）
- Pages Functions API + D1 数据库
