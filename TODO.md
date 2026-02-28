# 任务看板

## 进行中

- 法音文库部署（wenku.foyue.org）— 代码已完成，待创建 GitHub 仓库和 Cloudflare Pages 项目

---

## 阶段 1：基础建设 ✅

- [x] GitHub 仓库建立
- [x] Cloudflare Pages 部署
- [x] 基础播放器功能
- [x] 浅色/深色主题
- [x] i18n 国际化（zh/en/fr）
- [x] PWA 安装引导
- [x] 播放历史记录功能
- [x] 播放历史弹层（查看全部、单条删除、一键清空）
- [x] 全屏播放器手势（下滑关闭）
- [x] 进度条拖动增强（thumb 放大 + 时间气泡）
- [x] 后退导航保护
- [x] 断点续播（localStorage 持久化）
- [x] 搜索功能
- [x] 首页（每日一句、佛号卡片、继续收听、推荐系列）
- [x] Media Session API（锁屏控制）
- [x] 预加载下一首（网络感知）
- [x] **Vite + ES Modules 重构（单文件 → 模块化）**
- [x] Pages Functions API 搭建
- [x] D1 数据库绑定
- [x] 项目文档体系建立
- [x] Git Push 自动部署配置

---

## 阶段 2：数据后端（待启动）

- [ ] 前端接入 D1 API（替换 JSON 静态数据）
- [ ] 播放计数 API 前端集成
- [ ] 随喜功能（前端 UI + 后端 API 联调）
- [ ] AI Gateway 搭建（负责人：fayin002）

---

## 阶段 3：内容体系

- [x] **法音文库子项目启动**（独立仓库 [foyue-wenku](https://github.com/lianbang999-crypto/foyue-wenku)）
- [x] 文库前端开发（4 页面 SPA + 4 种阅读模式 + 字号字体设置）
- [x] 文库 D1 schema 设计（documents + bookmarks 表）
- [x] 文库 Pages Functions API（5 个接口）
- [x] R2 数据同步脚本（jingdianwendang → D1）
- [ ] 文库部署到 Cloudflare Pages（wenku.foyue.org）
- [ ] D1 schema 执行 + R2 数据同步
- [ ] 主站「我的」页面添加文库入口
- [ ] 音频-文档关联（边听边读）
- [ ] 内容上传管理界面

---

## 阶段 4：社区互动

- [ ] 莲友留言墙（审核后展示）
- [ ] 反馈表单

---

## 阶段 5：AI 功能

- [ ] AI 语义搜索
- [ ] AI 问答助手
- [ ] AI 内容摘要
- [ ] 音频转文字（Whisper）
- [ ] AI 留言审核
- [ ] AI 推荐
- [ ] AI 辅助翻译（标注"仅供参考"，用户主动触发）

---

## 阶段 6：SEO 与推广

- [ ] Open Graph / 结构化数据（负责人：fayin003）
- [ ] sitemap.xml / robots.txt 完善（负责人：fayin003）
- [ ] meta 描述标签（description, keywords）（负责人：fayin003）
- [ ] Schema.org 结构化数据（AudioObject）（负责人：fayin003）
- [ ] 多页面（文章页利于搜索引擎收录）
- [ ] 分享海报生成

---

## 阶段 7：APP 化

- [ ] Service Worker 离线缓存
- [ ] Web Push 新内容通知
- [ ] TWA 打包上架 Google Play

---

## 阶段 8：念佛计数器

- [ ] 计数界面 + 每日/累计统计
- [ ] 边听边念模式

---

## 阶段 9：体验优化

- [ ] 多主题皮肤
- [ ] 无障碍优化（ARIA 标签、键盘导航）
- [ ] 数据备份方案
- [ ] 网站访问统计（Cloudflare Web Analytics 已集成）
- [ ] 错误监控（捕获 JS 错误并上报）
- [ ] 性能监控（页面加载时间、音频缓冲时间）

---

## 兼容性测试（持续）

- [ ] iOS Safari 测试（音频自动播放限制、PWA 行为）
- [ ] 微信内置浏览器测试（音频播放、下载限制、分享卡片）
- [ ] Android Chrome 测试
- [ ] 低端设备性能测试
- [ ] 负责人：fayin003

---

## 暂不做

- 用户注册登录系统
- 视频播放
- 论坛/社区
- 原生 APP
- AI 自动替换原文翻译
