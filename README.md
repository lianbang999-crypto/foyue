# 净土法音 Pure Land Dharma Audio

佛教净土宗音频播放器 PWA，提供佛号念诵、法师讲经等音频内容的在线收听服务。

## 在线访问

- 主站：https://foyue.org
- 文库：https://wenku.foyue.org（部署中）
- 备用：https://amituofo.pages.dev

## 功能特性

- 首页推荐（每日一句、东林佛号卡片、继续收听、推荐系列）
- 多专辑浏览（有声书 / 听经台分类）
- 连续播放 + 自动切集
- 全屏播放器（下滑关闭、进度条拖动增强）
- 播放历史记录（查看全部、单条删除、一键清空）
- 播放进度持久化（关闭后重新打开可继续播放）
- 多语言支持（中文 / English / Français）
- 浅色/深色主题切换
- PWA 支持（可安装到手机主屏幕）
- 后退导航保护（防止误操作离开页面）
- 搜索功能
- 倍速播放（0.5x – 2.0x）
- 定时关闭（15/30/45/60/90 分钟）
- Media Session API（锁屏控制）
- 预加载下一首（网络感知）

## 技术栈

- **前端**：Vite + Vanilla JS（ES Modules）
- **托管**：Cloudflare Pages（Git 推送自动部署）
- **后端 API**：Cloudflare Pages Functions
- **数据库**：Cloudflare D1
- **音频存储**：Cloudflare R2（4 个存储桶）
- **字体**：Google Fonts（Noto Sans SC + DM Sans）

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/lianbang999-crypto/bojingji.git
cd bojingji

# 安装依赖
npm install

# 本地开发（带 API 代理）
npm run dev

# 生产构建
npm run build

# 预览构建结果
npm run preview
```

## 项目结构

```
foyue/
├── index.html              # HTML 入口（仅 DOM 结构）
├── package.json            # Vite 项目配置
├── vite.config.js          # Vite 构建配置
├── wrangler.toml           # Cloudflare D1 绑定
├── public/                 # 静态资源（不经 Vite 处理）
│   ├── manifest.json       # PWA 配置
│   ├── robots.txt
│   ├── sitemap.xml
│   ├── data/audio-data.json
│   └── icons/              # 图标文件
├── src/
│   ├── css/                # 7 个 CSS 模块
│   │   ├── tokens.css      # CSS 变量（主题色）
│   │   ├── reset.css       # CSS Reset
│   │   ├── layout.css      # 布局（Header/TabBar/Content）
│   │   ├── player.css      # 播放器样式
│   │   ├── cards.css       # 卡片和列表
│   │   ├── pages.css       # 各页面特有样式
│   │   └── components.css  # 通用组件（Modal/Toast/Banner）
│   ├── js/                 # 13 个 JS 模块
│   │   ├── main.js         # 入口（初始化 + 事件绑定）
│   │   ├── state.js        # 共享状态
│   │   ├── dom.js          # DOM 引用
│   │   ├── i18n.js         # 国际化
│   │   ├── theme.js        # 主题管理
│   │   ├── icons.js        # SVG 图标常量
│   │   ├── utils.js        # 工具函数
│   │   ├── history.js      # 播放历史
│   │   ├── player.js       # 播放器核心
│   │   ├── search.js       # 搜索
│   │   ├── pwa.js          # PWA 安装引导
│   │   ├── pages-home.js   # 首页渲染
│   │   ├── pages-my.js     # "我的"页面
│   │   └── pages-category.js # 分类/集数页面
│   └── locales/            # i18n 翻译文件
│       ├── zh.json
│       ├── en.json
│       └── fr.json
├── functions/              # Cloudflare Pages Functions
│   └── api/[[path]].js     # API 路由处理
└── dist/                   # 构建输出（.gitignore）
```

## 项目文档

| 文档 | 说明 |
|------|------|
| [CLAUDE.md](CLAUDE.md) | 智能体工作手册（AI Agent 必读） |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 技术架构 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 开发规范 |
| [CHANGELOG.md](CHANGELOG.md) | 变更记录 |
| [TODO.md](TODO.md) | 任务看板 |
| [DEPLOY.md](DEPLOY.md) | 部署指南 |

## 数据规模

- 3 个分类、14 个系列、466 集音频
- 4 个 R2 存储桶

## 团队

| 角色 | GitHub | 职责 |
|------|--------|------|
| 架构 + 审核 | @lianbang999-crypto | 架构决策、代码 Review、PR 合并、文档维护、内容管理 |
| 前端开发 | @fayin001 | 功能页面开发、PWA、Bug 修复、多设备适配 |
| 后端 + AI | @fayin002 | Pages Functions API、D1 数据库、AI 功能 |
| SEO + 测试 | @fayin003 | SEO 优化、兼容性测试、部署运维 |

## 子项目

| 项目 | 域名 | 仓库 | 说明 |
|------|------|------|------|
| 法音文库 | wenku.foyue.org | [foyue-wenku](https://github.com/lianbang999-crypto/foyue-wenku) | 经典文献与讲义稿在线阅读 |

## 许可

本项目为佛教公益项目，仅供学习和弘法使用。

南无阿弥陀佛 Namo Amitabha
