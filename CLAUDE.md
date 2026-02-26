# 净土法音 — 智能体工作手册

> 你是一个 AI 智能体，被分配到本项目的一个工位上。请先通读本文件，再读 CURRENT-STATUS.md，然后开始工作。

---

## 项目简介

**净土法音**是一个佛教净土宗音频内容平台 PWA。用户可以在线收听佛号、法师讲经等音频，未来会扩展文章阅读、AI 功能、社区互动等。

- 线上地址：https://bojingji.pages.dev
- 正式域名：https://foyue.org（配置中）
- 旧域名：https://fayin.uk（迁移中）
- GitHub 仓库：https://github.com/lianbang999-crypto/bojingji

---

## 工位与职责

本项目有 4 个 GitHub 账号（"工位"），由不同的智能体轮换使用。你需要确认自己在哪个工位，只做该工位的事。

| 工位 | GitHub 账号 | 职责 | 文件范围 |
|------|------------|------|---------|
| 架构 + 审核 | lianbang999-crypto | 架构决策、代码 Review、PR 合并、文档维护、内容管理 | 所有文件（侧重 .md 文档和 data/） |
| 前端开发 | fayin001 | 功能页面开发、PWA、Bug 修复、多设备适配 | index.html, css/, js/（UI 相关）, icons/ |
| 后端 + AI | fayin002 | Workers API、D1 数据库、AI Gateway、AI 功能 | workers/, js/api.js（API 调用层） |
| SEO + 测试 | fayin003 | SEO 优化、兼容性测试、部署运维、多主题 | meta 标签, sitemap.xml, robots.txt, manifest.json |

**如果需要改不属于你工位的文件，先在 PR 中说明原因。**

---

## 技术架构

```
当前：
  前端 → Cloudflare Pages（HTML/CSS/JS）
  音频 → Cloudflare R2

未来（逐步演进）：
  后端 API → Cloudflare Workers
  数据库 → Cloudflare D1
  AI → Cloudflare Workers AI + AI Gateway
```

## 文件结构

```
bojingji/
├── index.html           # HTML 结构
├── manifest.json        # PWA 配置
├── css/
│   └── style.css        # 全部样式
├── js/
│   ├── app.js           # 入口，初始化和事件绑定
│   ├── data.js          # 数据加载（fetch audio-data.json）
│   ├── render.js        # 页面渲染（首页、分类、集数、我的）
│   ├── player.js        # 播放器核心逻辑
│   ├── player-ui.js     # 播放器 UI 控制
│   ├── history.js       # 播放历史管理
│   ├── i18n.js          # 国际化（调用 lang/ 翻译文件）
│   ├── navigation.js    # 后退导航保护
│   ├── pwa.js           # PWA 安装引导
│   └── state.js         # 播放状态持久化（localStorage）
├── lang/
│   ├── zh.js            # 中文翻译
│   ├── en.js            # 英文翻译
│   └── fr.js            # 法文翻译
├── data/
│   └── audio-data.json  # 音频数据（专辑、集数、URL）
├── icons/               # 图标和图片
├── workers/             # （预留）Cloudflare Workers 后端代码
├── CLAUDE.md            # 本文件
├── CURRENT-STATUS.md    # 实时进度和交接记录
├── ARCHITECTURE.md      # 技术架构详细文档
├── CONTRIBUTING.md      # 开发规范
├── CHANGELOG.md         # 变更记录
├── TODO.md              # 功能规划
├── DEPLOY.md            # 部署指南
└── README.md            # 项目说明
```

---

## 项目红线

这些是绝对不能做的事：

1. **佛法内容必须准确** — 不能随意修改、AI 生成或翻译法师开示内容
2. **不提交敏感信息** — API Token、密钥等不能出现在代码中，用 Cloudflare 环境变量
3. **不直接推 main** — 所有改动通过功能分支 + PR 合并
4. **不删除 R2 音频** — 音频文件在 Cloudflare R2 上，不在仓库中
5. **AI 翻译必须标注** — 任何 AI 生成的翻译必须标注"仅供参考"，优先推荐权威译本
6. **0 控制台错误** — 提交前确认浏览器控制台无错误

---

## 智能体交接流程

### 你刚到这个项目时

1. 读本文件（CLAUDE.md）→ 了解项目和你的工位
2. 读 CURRENT-STATUS.md → 了解当前进度和上一个智能体的交接记录
3. 读你的 Issue → 了解具体任务
4. 按需读相关代码 → 只读要改的部分

### 你完成任务后

在 CURRENT-STATUS.md 中补充交接记录，三行即可：
- 做了什么
- 没做完什么
- 要注意什么

---

## 功能规划（9 个阶段）

### 阶段 1：基础建设 ✅
- 代码拆分（已完成）
- 构建部署流程
- audio-data.json 纳入仓库

### 阶段 2：数据后端
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

### 阶段 5：AI 功能
- AI 语义搜索
- AI 问答助手
- AI 内容摘要
- 音频转文字（Whisper）
- AI 留言审核
- AI 推荐
- AI 辅助翻译（标注"仅供参考"，用户主动触发）

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
