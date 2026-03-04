# 项目简介 - 净土法音

## 项目概述

**净土法音（Pure Land Dharma Audio）** 是一个佛教净土宗音频内容平台 PWA，提供佛号念诵、法师讲经等音频内容的在线收听服务。

## 核心信息

- **项目名称**：净土法音 / Pure Land Dharma Audio
- **项目类型**：PWA（渐进式Web应用）
- **主要功能**：佛教音频播放、内容管理、AI辅助功能
- **在线地址**：
  - 主站：https://foyue.org
  - 备用：https://amituofo.pages.dev
  - 文库：https://wenku.foyue.org（部署中）
- **GitHub仓库**：https://github.com/lianbang999-crypto/foyue

## 技术栈

### 前端
- **构建工具**：Vite
- **开发语言**：Vanilla JS（ES Modules）
- **样式**：CSS模块化（8个文件）
- **国际化**：i18n（中文/英文/法文）
- **PWA**：支持离线访问和安装

### 后端与基础设施
- **托管平台**：Cloudflare Pages（Git推送自动部署）
- **后端API**：Cloudflare Pages Functions
- **数据库**：Cloudflare D1（foyue-db）
- **音频存储**：Cloudflare R2（4个存储桶）
- **AI服务**：
  - Cloudflare Workers AI（bge-m3 / GLM / Whisper）
  - Cloudflare Vectorize（dharma-content索引）
  - Cloudflare AI Gateway（buddhist-ai-gateway）
- **字体**：Google Fonts（Noto Sans SC + DM Sans）

## 数据规模

- **分类数量**：3个分类
- **系列数量**：14个系列
- **音频集数**：466集
- **存储桶**：4个R2存储桶

## 项目结构

```
foyue/
├── index.html              # HTML入口（仅DOM结构）
├── package.json            # Vite项目配置
├── vite.config.js          # Vite构建配置
├── wrangler.toml           # Cloudflare D1 + AI + Vectorize绑定
├── public/                 # 静态资源
│   ├── manifest.json       # PWA配置
│   ├── robots.txt
│   ├── sitemap.xml
│   ├── data/audio-data.json
│   └── icons/
├── src/
│   ├── css/                # 8个CSS模块
│   ├── js/                 # 16个ES Module
│   └── locales/            # i18n翻译文件
├── functions/              # Cloudflare Pages Functions
│   ├── api/[[path]].js     # API路由
│   └── lib/ai-utils.js     # AI工具模块
└── workers/migrations/     # D1数据库迁移脚本
```

## 核心功能

### 已完成功能
1. **音频播放器**：播放/暂停、上下曲、快进快退、倍速、定时停止
2. **播放列表管理**：顺序/单曲/随机循环
3. **主题切换**：暗色/亮色主题
4. **多语言支持**：中文、英文、法文
5. **PWA功能**：安装引导、离线支持
6. **播放历史**：记录、查看、删除、清空
7. **断点续播**：localStorage持久化
8. **搜索功能**：关键词搜索 + AI语义搜索
9. **全屏播放器**：手势控制、进度条拖动
10. **首页功能**：每日一句、推荐系列、继续收听
11. **Media Session API**：锁屏控制
12. **预加载**：网络感知的下一首预加载

### AI功能（Phase 1+2已完成，待部署）
1. **AI语义搜索**：基于bge-m3向量嵌入
2. **AI问答助手**：RAG管线 + GLM模型
3. **AI内容摘要**：自动生成 + D1缓存
4. **AI聊天面板**：悬浮"问法"按钮
5. **安全加固**：XSS/TOCTOU/时序攻击/提示注入防护

## 子项目

### 法音文库（wenku.foyue.org）
- **仓库**：https://github.com/lianbang999-crypto/wenku
- **功能**：经典文献与讲义稿在线阅读
- **状态**：代码开发完成，待部署
- **特性**：
  - 4种阅读模式（普通/护眼/夜间/墨水屏）
  - 字号/字体设置
  - 阅读进度书签
  - 独立Cloudflare Pages项目

## 开发规范

### 开发命令
```bash
npm install          # 安装依赖
npm run dev          # 本地开发（HMR + API代理）
npm run build        # 生产构建
npm run preview      # 预览构建结果
```

### 语言策略
- **核心内容**：仅中文原文（讲经开示）
- **界面语言**：中文 + 英文，法文已有
- **AI翻译**：用户主动触发，标注"AI翻译，仅供参考"
- **佛教术语**：保留音译（Amitabha、Namo等）

## 项目愿景

本项目为佛教公益项目，旨在：
1. 提供优质的佛教音频内容在线收听服务
2. 利用AI技术辅助佛法学修（语义搜索、智能问答）
3. 建立完整的佛教内容生态（音频 + 文库 + 社区）
4. 仅供学习和弘法使用

## 许可

本项目为佛教公益项目，仅供学习和弘法使用。

南无阿弥陀佛 Namo Amitabha
