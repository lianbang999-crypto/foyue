# foyue-frontend 项目上下文快照

更新时间：2026-04-04

## 项目架构

佛悦是一个佛教音频/法音平台，使用 `src/js/` + `src/css/` 原生 JS 结构（无框架）。

### 页面入口文件

| 页面 | HTML 文件 | 对应 JS |
|------|----------|---------|
| 主页（净土法音） | `index.html` | `src/js/` 多文件 |
| AI 页 | `ai.html` | `src/js/ai-app.js`, `ai-client.js`, `ai-conversations.js` |
| 念佛页 | `nianfo.html` | - |
| 工修页 | `gongxiu.html` | - |
| 管理后台 | `admin.html` | - |

### src/js/ 关键文件

- `api.js` — 与 Cloudflare Functions 通信的核心 API 层
- `audio-cache.js`, `audio-meta-cache.js` — 音频缓存系统
- `ai-app.js` / `ai-client.js` — AI 对话入口和客户端
- `ai-conversations.js` — 会话历史管理
- `audio-url.js` — R2 音频 URL 生成（带签名）

### src/css/ 关键文件

- `layout.css` — 全局布局、导航
- `components.css` — 通用组件样式
- `cards.css` — 音频卡片
- `ai-page.css` — AI 页面专用样式
- `nianfo-page.css` — 念佛页面专用样式

## 样式规范

- CSS 变量定义在 `layout.css` 顶部（`--primary`, `--bg`, `--text-muted` 等）
- 不使用 Tailwind，纯 CSS
- 移动优先设计

## 禁止操作

- 不接触 `functions/`（后端，由 foyue-backend 负责）
- 不接触 `workers/`（Workers 脚本，由 foyue-cloudflare 负责）
- 不修改 `wrangler.toml`

## 已知问题 / 待优化

- （由 foyue-frontend agent 使用后更新此处）
