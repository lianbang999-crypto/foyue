# 净土法音 Pure Land Dharma Audio

佛教净土宗音频播放器，提供佛号念诵、法师讲经等音频内容的在线收听服务。

## 在线访问

- 主站：https://foyue.org（配置中）
- 备用：https://bojingji.pages.dev

## 功能特性

- 多专辑浏览（有声书 / 听经台分类）
- 连续播放 + 自动切集
- 全屏播放器（下滑关闭、双击快进/快退、进度条拖动增强）
- 播放历史记录（查看全部、单条删除、一键清空）
- 播放进度持久化（关闭后重新打开可继续播放）
- 多语言支持（中文 / English / Français）
- 浅色/深色主题切换
- PWA 支持（可安装到手机主屏幕）
- 后退导航保护（防止误操作离开页面）

## 技术栈

- 纯前端（HTML + CSS + JS），无后端
- Cloudflare Pages 托管
- Cloudflare R2 存储音频文件
- PWA（Service Worker + manifest.json）

## 快速开始

```bash
# 克隆仓库
git clone https://github.com/lianbang999-crypto/bojingji.git
cd bojingji

# 本地预览（任意静态服务器）
npx serve .
# 或
python3 -m http.server 8080
```

浏览器打开 http://localhost:8080 即可预览。

## 项目文档

| 文档 | 说明 |
|------|------|
| [CLAUDE.md](CLAUDE.md) | 智能体工作手册（AI Agent 必读） |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 技术架构 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 开发规范 |
| [CHANGELOG.md](CHANGELOG.md) | 变更记录 |
| [TODO.md](TODO.md) | 任务看板 |
| [DEPLOY.md](DEPLOY.md) | 部署指南 |

## 团队

| 角色 | GitHub | 职责 |
|------|--------|------|
| 架构 + 审核 | @lianbang999-crypto | 架构决策、代码 Review、PR 合并、文档维护、内容管理 |
| 前端开发 | @fayin001 | 功能页面开发、PWA、Bug 修复、多设备适配 |
| 后端 + AI | @fayin002 | Workers API、D1 数据库、AI Gateway、AI 功能 |
| SEO + 测试 | @fayin003 | SEO 优化、兼容性测试、部署运维 |

## 许可

本项目为佛教公益项目，仅供学习和弘法使用。

南无阿弥陀佛 Namo Amitabha
