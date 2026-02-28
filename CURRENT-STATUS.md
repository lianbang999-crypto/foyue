# 当前状态与交接记录

> 每次 PR 合并后更新本文件。新智能体到来时，读完 CLAUDE.md 后读这里。

---

## 项目进度

### 已完成
- [x] GitHub 仓库建立，3 位协作者已邀请
- [x] 基础音频播放器（播放/暂停/上下曲/快进快退/倍速/定时）
- [x] 播放列表管理、循环模式（顺序/单曲/随机）
- [x] 暗色/亮色主题
- [x] 多语言（中/英/法）
- [x] PWA 安装引导（Android + iOS）
- [x] 播放历史记录（弹层查看、单条删除、一键清空）
- [x] 断点续播（localStorage 持久化）
- [x] 搜索功能
- [x] 全屏播放器（下滑关闭、进度条拖动增强）
- [x] 后退导航保护
- [x] 首页（每日一句、东林佛号卡片、继续收听、推荐系列）
- [x] Media Session API（锁屏控制）
- [x] 预加载下一首（网络感知）
- [x] **Vite + ES Modules 重构**（单文件 → 13 JS 模块 + 7 CSS 文件 + 3 JSON 翻译文件）
- [x] Pages Functions API（categories/series/episodes/play-count/appreciate/stats）
- [x] D1 数据库绑定（foyue-db）
- [x] 项目文档体系
- [x] **AI 功能 Phase 1+2**（RAG 问答、语义搜索、内容摘要、聊天面板）— 代码已完成，待 Cloudflare 部署配置

### 当前阶段：AI 功能部署 + 文库部署

**AI 功能（Foyue 主站）** — 后端+前端代码已完成，待 Cloudflare 部署配置（详见下方 AI 功能章节）

**法音文库子项目（wenku.foyue.org）** — 代码开发完成，待部署

文库是独立的 Cloudflare Pages 项目，仓库：[wenku](https://github.com/lianbang999-crypto/wenku)

已完成：
- Vite + Vanilla JS 单页应用（4 个页面：首页、分类、系列、阅读器）
- 4 种阅读模式（普通、护眼、夜间、墨水屏）
- 字号 / 字体设置 + 阅读进度书签
- D1 schema（documents + bookmarks 表，与主站共用 foyue-db）
- Pages Functions API（5 个接口）
- R2 同步脚本（jingdianwendang → D1，~304 个文件）
- 构建通过：19 modules → HTML 4.63KB + CSS 12.04KB + JS 16.62KB

待完成：
1. 创建 GitHub 仓库 foyue-wenku 并推送代码
2. 创建 Cloudflare Pages 项目，绑定 D1 + R2
3. 执行 D1 schema + R2 数据同步
4. 绑定 wenku.foyue.org 域名
5. 主站「我的」页面添加文库入口

---

## 重构记录（2026-02-27）

从单文件 index.html（2135 行）重构为 Vite 模块化项目：

| 变更 | 说明 |
|------|------|
| 构建工具 | 引入 Vite（`npm run dev` / `npm run build`） |
| index.html | 从 2135 行缩减到 265 行（仅 DOM 结构） |
| CSS | 拆分为 7 个文件（tokens/reset/layout/player/cards/pages/components） |
| JavaScript | 拆分为 13 个 ES Module（main/state/dom/i18n/theme/icons/utils/history/player/search/pwa/pages-*） |
| i18n | 从内嵌对象改为 JSON 文件（src/locales/zh.json, en.json, fr.json） |
| 静态资源 | 移到 public/ 目录（manifest.json, robots.txt, sitemap.xml, icons/, data/） |
| 后端 | 删除 workers/ 目录，统一使用 Pages Functions（functions/api/） |
| 部署 | 从手动 wrangler deploy 改为 Git Push 自动部署 |
| 构建产物 | dist/ 目录（HTML 14KB + CSS 31KB + JS 51KB） |

### Cloudflare Dashboard 需要的设置变更

**重要**：由于从静态站点改为 Vite 构建项目，需要在 Cloudflare Dashboard 更新构建设置：
- 构建命令：`npm run build`
- 输出目录：`dist`

---

## 重要决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-02-27 | Vite + Vanilla JS 重构 | 保持简洁，无框架负担，适合 1人+AI 模式 |
| 2026-02-27 | 删除独立 Workers，仅用 Pages Functions | 简化架构，Pages Functions 自动与 Pages 部署集成 |
| 2026-02-27 | Git Push 自动部署 | 取代手动 wrangler deploy，更可靠 |
| 2026-02-25 | 不做用户注册登录 | 增加使用门槛，初期 localStorage 够用 |
| 2026-02-25 | AI 翻译必须标注"仅供参考" | 佛法翻译必须准确，AI 可能出错 |
| 2026-02-25 | 用 Cloudflare 全家桶 | 服务间零延迟，免费额度够初期使用 |
| 2026-02-25 | 随喜代替点赞 | 莲花图标，契合佛教场景 |
| 2026-02-25 | 不做论坛/社区 | 运营成本太高，留言墙先行 |

---

## 已知问题

- AI 功能需要完成 Cloudflare 部署配置才能生效（见下方 AI 部署步骤）
- Cloudflare Dashboard 构建设置需更新（构建命令 + 输出目录）
- manifest.json 引用了 icon-512.png，需确认文件存在

---

## AI 功能（Phase 1+2）详情

### 架构

```
                    Cloudflare AI Gateway
                   (buddhist-ai-gateway)
                  /         |            \
          Workers AI    Vectorize      AI Gateway
          (env.AI)    (env.VECTORIZE)  (缓存/监控/限流)
         /    |    \       |
     bge-m3  GLM  Whisper  |
     (嵌入) (对话) (语音)   |
                           |
                 共享 D1 (foyue-db)
```

### 模型选择

| 用途 | 模型 | 说明 |
|------|------|------|
| 文本嵌入 | `@cf/baai/bge-m3` (1024维) | 多语言，支持中文 |
| 中文对话/摘要 | `@cf/zai-org/glm-4.7-flash` | 中文优化，131K上下文 |
| 对话备用 | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | GLM 不可用时自动切换 |
| 语音转文字 | `@cf/openai/whisper-large-v3-turbo` | Phase 4 预留 |

### 新增文件

| 文件 | 说明 |
|------|------|
| `functions/lib/ai-utils.js` | 共享 AI 工具模块（切块/嵌入/搜索/RAG/摘要/限流/安全比较） |
| `src/js/ai-client.js` | 前端 AI API 客户端（30s 超时，安全 JSON 解析） |
| `src/js/ai-chat.js` | 悬浮 AI 问答面板组件 |
| `src/js/ai-summary.js` | 集摘要展示组件 |
| `src/css/ai.css` | AI 组件样式（暗色适配、响应式） |
| `workers/migrations/0004_ai_tables.sql` | D1 迁移：ai_rate_limits + ai_summaries + ai_embedding_jobs 表 |

### 修改的文件

| 文件 | 变更 |
|------|------|
| `functions/api/[[path]].js` | 添加 AI 路由 + XSS/安全修复 |
| `src/js/main.js` | 挂载 AI 聊天组件，播放时更新上下文 |
| `src/js/pages-category.js` | 集成摘要组件 + escapeHtml 修复 |
| `src/js/search.js` | 添加关键词/语义搜索切换 |
| `src/js/utils.js` | 新增 escapeHtml，修复 showToast 计时器泄漏 |
| `wrangler.toml` | 添加 AI + Vectorize 绑定 |
| `index.html` | 引入 ai.css |

### API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/ai/ask` | POST | RAG 问答（支持 series_id 范围限定） |
| `/api/ai/summary/:id` | GET | 获取/生成内容摘要（自动缓存） |
| `/api/ai/search?q=` | GET | 语义搜索 |
| `/api/admin/embeddings/build` | POST | 批量构建向量嵌入（需 X-Admin-Token） |
| `/api/admin/cleanup` | POST | 清理过期限流记录（需 X-Admin-Token） |

### 安全措施

- XSS 防护：所有 innerHTML 数据均通过 `escapeHtml()` 转义
- TOCTOU 修复：限流采用先插入后检查模式
- 时序攻击防护：管理员 Token 使用 XOR 恒定时间比较
- 提示注入防护：系统提示含角色锁定规则 + 上下文分隔符
- CORS 白名单：仅允许 foyue.org / amituofo.pages.dev
- 限流：每 IP 10次/分钟、100次/天

### 部署步骤（必须在 Cloudflare Dashboard 完成）

**1. 创建 Vectorize 索引**
```bash
npx wrangler vectorize create dharma-content --dimensions=1024 --metric=cosine
npx wrangler vectorize create-metadata-index dharma-content --property-name=source --type=string
npx wrangler vectorize create-metadata-index dharma-content --property-name=doc_id --type=string
```

**2. 执行 D1 迁移**
```bash
npx wrangler d1 execute foyue-db --remote --file=workers/migrations/0004_ai_tables.sql
```

**3. 设置环境变量**（Cloudflare Pages → Settings → Environment variables）
- `ADMIN_TOKEN` — 管理员 API 密钥（自定义一个强密码）
- `ALLOWED_ORIGINS` — 允许的 CORS 来源，如 `https://foyue.org,https://amituofo.pages.dev`

**4. 部署**
```bash
git push  # 自动触发 Cloudflare Pages 构建
```

**5. 构建向量数据**（部署成功后执行一次）
```bash
curl -X POST https://foyue.org/api/admin/embeddings/build \
  -H "X-Admin-Token: <你设置的ADMIN_TOKEN>"
```

### 后续开发方向

- **Phase 3（Wenku AI）**：复用 `ai-utils.js`，添加阅读器侧边栏问答、文本选中解释
- **Phase 4（Whisper）**：对缺少文稿的音频集使用 `whisper-large-v3-turbo` 转录
- **成本预估**：< $1/月（Vectorize 免费额度内，AI 推理极低用量）

---

## 交接记录

### 2026-02-28 AI 功能 Phase 1+2 实施完成

**做了什么：**
- 实现完整 AI 后端：RAG 问答、语义搜索、内容摘要、向量化管线
- 实现完整 AI 前端：悬浮聊天面板、摘要组件、关键词/语义搜索切换
- 创建共享 AI 工具模块（`functions/lib/ai-utils.js`）
- 创建 D1 迁移脚本（3 张 AI 表）
- 配置 wrangler.toml（AI + Vectorize 绑定）
- 经 6 个审查 agent 两轮安全审查，修复 ~30 个问题
- 构建通过：32 modules，CSS 40.80 KB，JS 70.64 KB
- 代码推送到 GitHub main 分支（2 个 commit）

**没做完：**
- Cloudflare Vectorize 索引创建（需要 `wrangler vectorize create`）
- D1 AI 表迁移（需要 `wrangler d1 execute`）
- 环境变量设置（ADMIN_TOKEN、ALLOWED_ORIGINS）
- 向量嵌入数据构建（需调用管理员 API）
- Phase 3 Wenku AI 集成
- Phase 4 Whisper 音频转文字

**注意事项：**
- AI 功能在线上报错是因为 Vectorize 索引和 D1 AI 表尚未创建
- 部署步骤严格按上方"部署步骤"章节执行
- `ai-utils.js` 设计为可复用模块，wenku 项目可直接复制使用
- 管理员 API 通过 `X-Admin-Token` header 认证，token 不可提交到代码中

### 2026-02-27 法音文库子项目开发完成

**做了什么：**
- 新建法音文库项目（foyue-wenku），独立于主站
- 完成全部前端代码：首页、分类页、系列页、阅读器
- 设计并实现 4 种阅读模式（普通 / 护眼 / 夜间 / 墨水屏）
- 字号（小/中/大/特大）、字体（无衬线/宋体/楷体）设置
- 阅读进度自动保存（localStorage 书签）
- D1 数据库 schema 设计（documents 表 + bookmarks 表）
- Pages Functions API 开发（分类 / 文档列表 / 文档详情 / 搜索 / 阅读计数）
- R2 数据同步脚本（扫描 jingdianwendang 桶，解析文件元数据写入 D1）
- PWA manifest
- Vite 构建验证通过（19 modules, 0 errors）

**架构决策：**
- 文库作为独立 Cloudflare Pages 项目（wenku.foyue.org）
- 与主站共用同一个 Cloudflare 账户、D1（foyue-db）、R2（jingdianwendang）
- 技术栈与主站一致（Vite + Vanilla JS）
- API 路径前缀 `/api/wenku/` 避免与主站 API 冲突

**没做完：**
- GitHub 仓库创建 + 代码推送
- Cloudflare Pages 项目创建 + D1/R2 绑定
- D1 schema 执行 + R2 数据同步
- wenku.foyue.org 域名绑定
- Logo 处理（已有 AI 生成稿，待裁切为 icon）
- 主站「我的」页面文库入口

**注意事项：**
- wrangler.toml 中的 database_id 是占位符，需替换为真实 D1 ID
- R2 同步脚本需要 D1 绑定才能运行
- 文库 API 路径为 `/api/wenku/*`，主站 API 路径为 `/api/*`，互不冲突

### 2026-02-27 重构完成

**做了什么：**
- 完成 Vite + ES Modules 全量重构
- 创建 package.json、vite.config.js
- 拆分 CSS 为 7 个模块
- 拆分 JS 为 13 个 ES Module
- i18n 改为 JSON 文件
- 静态资源移到 public/
- 删除 workers/ 目录
- 更新所有项目文档
- 构建验证通过（27 modules，0 error）

**没做完：**
- Cloudflare Dashboard 构建设置需要手动更新
- 前端尚未接入 D1 API（仍使用 audio-data.json）
- 线上全功能测试（部署后需验证）

**注意事项：**
- 部署前必须在 Cloudflare Dashboard 设置构建命令为 `npm run build`，输出目录为 `dist`
- share_from 翻译键已更新为 foyue.org（替换旧的 bojingji.pages.dev）
- 旧的 Service Worker 会在首次访问时自动清理（main.js 中有清理逻辑）

### 2026-02-26 lianbang999-crypto

**做了什么：**
- 更新 CLAUDE.md：工位分工、文件结构、功能规划、交接流程
- 创建 CURRENT-STATUS.md：实时进度和交接记录
- 更新 TODO.md：完整 9 阶段功能规划
- 添加 .gitignore

**没做完：**
- ARCHITECTURE.md 需要更新为多文件架构描述 → ✅ 已在 2026-02-27 重构中完成

**注意事项：**
- 语言文件已从 lang/*.js 改为 src/locales/*.json
