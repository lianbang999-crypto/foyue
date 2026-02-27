# 开发规范

## Git 工作流

### 分支规则
- `main` — 稳定版本，推送自动部署到线上
- 功能分支 — 从 main 创建，命名格式：`feature/功能名`、`fix/bug名`、`seo/优化项`

### 提交信息格式
```
类型：简要描述

详细说明（可选）
```

类型：
- `新增` — 新功能
- `更新` — 增强现有功能
- `修复` — Bug 修复
- `优化` — 性能或代码质量优化
- `文档` — 文档变更
- `测试` — 测试相关
- `部署` — 部署配置变更
- `重构` — 代码重构（不改变外部行为）

示例：
```
新增：播放历史弹层，支持单条删除和一键清空
修复：后退导航在首页时不再离开页面
重构：Vite + ES Modules 模块化拆分
```

### Pull Request 流程
1. 从 main 创建功能分支
2. 开发完成后，推送到远程
3. 创建 Pull Request，描述改了什么、为什么改
4. 至少一人 Review 后合入 main
5. 合入后自动部署到 Cloudflare Pages

---

## 代码规范

### HTML
- 使用语义化标签（`<nav>`、`<main>`、`<button>` 等）
- 需要翻译的文本必须加 `data-i18n` 属性
- ID 命名用 camelCase：`historyOverlay`、`expPlayer`

### CSS
- 所有 CSS 文件在 `src/css/` 目录下
- 使用 CSS 变量（`var(--bg)`、`var(--text)`、`var(--accent)` 等），定义在 `tokens.css`
- 类名用 kebab-case：`my-history-item`、`exp-progress-bar`
- 浅色和深色主题都要测试
- 移动端优先，确保触摸目标至少 44px

### JavaScript
- 所有 JS 文件在 `src/js/` 目录下，使用 ES Module（`import`/`export`）
- 使用 `const` 和 `let`（不再使用 `var`）
- 函数命名用 camelCase：`renderMyPage()`、`showEpisodes()`
- 模块间通过 import/export 通信，不使用全局变量
- 共享状态统一通过 `state.js` 管理
- DOM 引用通过 `dom.js` 的 `getDOM()` 获取
- 错误处理用 `try-catch`，特别是 localStorage 操作

### i18n 规则
- 翻译文件在 `src/locales/` 下（JSON 格式）
- **修改任何翻译时，zh/en/fr 三种语言必须同步修改**
- 翻译键用 snake_case：`my_history_all`、`player_speed`
- 新增键时在 CHANGELOG 中记录

---

## 修改前检查清单

开始修改代码之前：
- [ ] 已读 CLAUDE.md 了解项目全貌
- [ ] 已读 ARCHITECTURE.md 了解技术架构
- [ ] 已读相关代码段（不要凭猜测修改）
- [ ] 已读 TODO.md 了解当前任务

修改完成后：
- [ ] `npm run build` 构建成功，0 error
- [ ] 浏览器控制台 0 错误
- [ ] 浅色 + 深色主题都测试了
- [ ] 如涉及 i18n，三种语言都改了
- [ ] 播放功能正常（播放、暂停、切集、切专辑）
- [ ] 后退导航正常（全屏播放器、集数列表、首页）
- [ ] 手机端布局正常（宽度 375px 测试）

---

## 测试要点

### 必测场景
1. **播放流程**：选专辑 → 选集数 → 播放 → 切下一集 → 切专辑
2. **迷你/全屏切换**：点击迷你播放器 → 全屏 → 关闭 → 迷你
3. **历史记录**：播放后检查"我的"页面历史 → 点击历史恢复播放
4. **后退保护**：浏览器后退在各种状态下都不离开页面
5. **主题切换**：我的 → 设置 → 主题 → 切换后界面正常
6. **语言切换**：我的 → 设置 → 语言 → 所有文本正确切换
7. **搜索**：输入关键词 → 显示匹配结果 → 点击播放
8. **断点续播**：播放到某个位置 → 刷新页面 → 恢复播放

### 需测试的设备/浏览器
- iOS Safari（iPhone）
- Android Chrome
- 微信内置浏览器
- 桌面 Chrome
- 桌面 Safari
