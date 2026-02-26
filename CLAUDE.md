# 净土法音 — 智能体工作手册

> 本文件是智能体（AI Agent）启动时的必读文件。无论你是谁，第一次接手这个项目时请先通读本文件。

---

## 项目简介

**净土法音**是一个佛教净土宗音频播放器 PWA（Progressive Web App）。用户可以在线收听佛号、法师讲经等音频内容。

- 线上地址：https://bojingji.pages.dev （备用：https://fayin.uk）
- GitHub 仓库：https://github.com/lianbang999-crypto/bojingji
- 技术栈：纯前端，无后端服务器
- 托管：Cloudflare Pages
- 音频存储：Cloudflare R2

---

## 团队成员

| 角色 | GitHub 账号 | 邮箱 | 职责 |
|------|------------|------|------|
| 产品经理（管理员） | lianbang999-crypto | lianbang999@qq.com | 需求定义、内容管理、最终验收 |
| 前端开发（主力） | fayin001 | 2569331267@qq.com | 功能开发、代码拆分、bug修复 |
| UI/UX + 测试 | fayin002 | xiaoshanyuan001@qq.com | 视觉设计、多设备兼容测试、回归测试 |
| SEO + 运维 | fayin003 | xiaoshanyuan002@qq.com | SEO优化、部署、域名管理、数据统计 |

---

## 文件结构

```
bojingji/
├── index.html          # 主文件（包含所有 HTML + CSS + JS，约2400行）
├── manifest.json       # PWA 配置文件
├── data/
│   └── audio-data.json # 音频数据（专辑、集数、URL）
├── icons/
│   ├── icon-192.png    # PWA 图标 192x192
│   ├── icon-512.png    # PWA 图标 512x512
│   ├── logo.png        # 导航栏 Logo
│   └── profile.png     # "我的"页面头像
├── CLAUDE.md           # 本文件（智能体工作手册）
├── README.md           # 项目说明
├── ARCHITECTURE.md     # 技术架构文档
├── CONTRIBUTING.md     # 开发规范
├── CHANGELOG.md        # 变更记录
├── TODO.md             # 任务看板
└── DEPLOY.md           # 部署指南
```

---

## index.html 内部结构（重要）

当前项目是单文件架构，所有代码都在 `index.html` 中。结构如下：

```
行 1-20       : <!DOCTYPE> + <head>（meta、字体、manifest）
行 20-600     : <style>（全部 CSS）
  - CSS 变量（主题色、字体）
  - 布局样式（导航栏、标签页、内容区）
  - 迷你播放器样式
  - 全屏播放器样式
  - "我的"页面样式
  - 历史弹层样式
  - About 弹层样式
  - PWA 安装引导样式
  - 首页样式
  - Toast 提示样式
行 600-700    : <body> HTML 结构
  - 导航栏（logo + 搜索）
  - 底部 Tab 栏（首页/有声书/播放按钮/听经台/我的）
  - 内容区 #contentArea
  - 迷你播放器 #playerTrack
  - About 弹层 #aboutOverlay
  - 历史弹层 #historyOverlay
  - PWA 安装横幅
  - 全屏播放器 #expPlayer
  - Toast #toast
行 700-950    : <script> i18n 国际化（zh/en/fr 三种语言）
行 950-2366   : <script> JavaScript 主逻辑
  - 音频数据加载
  - Tab 切换 / 路由
  - 页面渲染（首页、分类、集数列表、我的页面）
  - 迷你播放器控制
  - 全屏播放器控制
  - 播放历史（localStorage）
  - 播放状态持久化
  - 后退导航保护
  - PWA 安装检测
  - 下滑关闭手势
  - 双击快进/快退
  - 进度条拖动增强
```

---

## 关键技术概念

### i18n 国际化
- 支持 zh（中文）、en（英文）、fr（法文）
- 翻译函数：`t(key)` 返回当前语言的翻译
- HTML 中使用 `data-i18n="key"` 属性标记需翻译的元素
- **修改翻译时，三种语言必须同步修改**

### 数据存储（localStorage）
- `pl-history`：播放历史记录（JSON 数组，最多20条）
- `pl-state`：当前播放状态（正在播放哪个专辑/集数/进度）
- `pl-lang`：用户选择的语言
- `pl-theme`：用户选择的主题（light/dark）

### 音频 URL 格式
音频文件存储在 Cloudflare R2，URL 格式：
```
https://pub-7be57e30faae4f81bbd76b61006ac8fc.r2.dev/{文件夹}/{文件名}.mp3
```

### 后退导航保护
使用 `history.pushState` + `popstate` 事件防止用户意外离开页面。层级：
1. 全屏播放器打开 → 后退关闭播放器
2. 集数列表打开 → 后退回到分类列表
3. 播放列表面板打开 → 后退关闭面板
4. 已在首页 → 后退时重新 push state，不离开页面

---

## 开发注意事项

1. **修改前必须先读代码**：不要凭猜测修改，先 Read 相关代码段
2. **0 控制台错误**：每次修改后必须验证浏览器控制台无错误
3. **三语言同步**：涉及 i18n 的修改，zh/en/fr 必须同步
4. **不要删除 R2 音频**：音频文件在 Cloudflare R2 上，不在本仓库中
5. **测试播放功能**：改了播放相关代码后，必须测试播放、切集、切专辑
6. **后退保护**：改了路由/导航相关代码后，必须测试所有后退场景

---

## 部署

详见 [DEPLOY.md](DEPLOY.md)

快速部署命令：
```bash
CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=<account_id> npx wrangler pages deploy . --project-name=bojingji --branch=main
```

---

## 当前状态（2026-02-26）

### 最近完成
- 播放历史优化：弹层查看全部、单条删除、一键清空、进度条可视化
- 全屏播放器：下滑手势关闭、双击快进快退、进度条拖动增强
- 后退导航 bug 修复

### 下一步计划
- 项目文件拆分（单文件 → 多文件模块化）
- SEO 优化（meta 标签、Open Graph、sitemap）
- UI 视觉升级
- 多设备兼容测试（微信浏览器、iOS Safari）

详见 [TODO.md](TODO.md)
