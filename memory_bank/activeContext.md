# 当前任务上下文

## 当前阶段

**AI功能部署 + 文库部署 + 代码优化**

## 当前任务

### 1. AI功能部署（Foyue主站）
**状态**：后端+前端代码已完成，待Cloudflare部署配置

**待完成步骤**：
1. 创建Vectorize索引
   ```bash
   npx wrangler vectorize create dharma-content --dimensions=1024 --metric=cosine
   npx wrangler vectorize create-metadata-index dharma-content --property-name=source --type=string
   npx wrangler vectorize create-metadata-index dharma-content --property-name=doc_id --type=string
   ```

2. 执行D1迁移
   ```bash
   npx wrangler d1 execute foyue-db --remote --file=workers/migrations/0004_ai_tables.sql
   ```

3. 设置环境变量（Cloudflare Pages → Settings → Environment variables）
   - `ADMIN_TOKEN` — 管理员API密钥（自定义强密码）
   - `ALLOWED_ORIGINS` — CORS来源，如 `https://foyue.org,https://amituofo.pages.dev`

4. 部署
   ```bash
   git push  # 自动触发Cloudflare Pages构建
   ```

5. 构建向量数据（部署成功后执行一次）
   ```bash
   curl -X POST https://foyue.org/api/admin/embeddings/build \
     -H "X-Admin-Token: <你设置的ADMIN_TOKEN>"
   ```

**注意事项**：
- AI功能在线上报错是因为Vectorize索引和D1 AI表尚未创建
- 管理员API通过`X-Admin-Token` header认证，token不可提交到代码中

### 2. 法音文库部署（wenku.foyue.org）
**状态**：代码开发完成，待部署

**待完成步骤**：
1. 创建GitHub仓库foyue-wenku并推送代码
2. 创建Cloudflare Pages项目，绑定D1 + R2
3. 执行D1 schema + R2数据同步
4. 绑定wenku.foyue.org域名
5. 主站「我的」页面添加文库入口

**注意事项**：
- wrangler.toml中的database_id是占位符，需替换为真实D1 ID
- R2同步脚本需要D1绑定才能运行
- 文库API路径为`/api/wenku/*`，主站API路径为`/api/*`，互不冲突

## 当前工作重点

### 优先级1：AI功能部署
- 完成Vectorize索引创建
- 执行D1 AI表迁移
- 配置环境变量
- 部署并测试AI功能

### 优先级2：文库部署
- 创建GitHub仓库
- 配置Cloudflare Pages项目
- 执行数据库迁移和数据同步
- 域名绑定和测试

### 优先级3：代码优化（2026-03-04新增）
**高优先级优化**：
- ⭐⭐⭐⭐ 修复后端 N+1 查询问题（`getCategories()` 函数）
- ⭐⭐⭐ 添加前端数据缓存版本控制
- ⭐⭐⭐ 完善 Vite 构建配置（代码分割、压缩优化）

**中优先级优化**：
- ⭐⭐⭐ 优化后端批量数据库操作（`recordPlay()` 函数）
- ⭐⭐ 添加前端缓存大小限制（LRU策略）
- ⭐⭐ 优化 Service Worker 缓存策略

**详细优化报告**：见 `memory_bank/optimization-report.md`

## 技术债务

1. **Cloudflare Dashboard构建设置需更新**
   - 构建命令：`npm run build`
   - 输出目录：`dist`

2. **manifest.json引用了icon-512.png**
   - 需确认文件存在

3. **前端尚未完全接入D1 API**
   - 部分功能仍使用audio-data.json

4. **后端 N+1 查询问题**（2026-03-04发现）
   - `getCategories()` 函数对每个分类单独查询系列
   - 影响：数据库查询次数 = 1 + 分类数量
   - 优先级：高
   - 解决方案：使用 JOIN 一次性获取所有数据

5. **前端缓存缺少版本控制**（2026-03-04发现）
   - localStorage 缓存的数据没有版本号
   - 影响：数据结构变更后可能出现兼容性问题
   - 优先级：高
   - 解决方案：添加缓存版本号 `DATA_CACHE_VERSION`

6. **Vite 构建配置不完善**（2026-03-04发现）
   - 缺少代码分割策略
   - 缺少压缩优化配置
   - 缺少构建分析
   - 优先级：高
   - 解决方案：添加 `manualChunks`、`terserOptions` 等配置

## 已知问题

- AI功能需要完成Cloudflare部署配置才能生效
- 文库项目需要独立的Cloudflare Pages配置
- Logo处理待完成（已有AI生成稿，待裁切为icon）

## 下一步行动

1. **立即执行**：创建Vectorize索引
2. **立即执行**：执行D1 AI表迁移
3. **立即执行**：设置环境变量
4. **然后执行**：git push触发部署
5. **部署后执行**：构建向量数据
6. **并行执行**：文库项目部署准备

## 关键决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-02-27 | Vite + Vanilla JS重构 | 保持简洁，无框架负担，适合1人+AI模式 |
| 2026-02-27 | 删除独立Workers，仅用Pages Functions | 简化架构，自动集成部署 |
| 2026-02-27 | Git Push自动部署 | 取代手动wrangler deploy，更可靠 |
| 2026-02-25 | 不做用户注册登录 | 增加使用门槛，初期localStorage够用 |
| 2026-02-25 | AI翻译必须标注"仅供参考" | 佛法翻译必须准确，AI可能出错 |
| 2026-02-25 | 用Cloudflare全家桶 | 服务间零延迟，免费额度够初期使用 |
| 2026-02-25 | 随喜代替点赞 | 莲花图标，契合佛教场景 |
| 2026-02-25 | 先不做论坛/社区 | 运营成本太高，留言墙先行 |

## 团队协作

- **项目负责人**：lianbang999-crypto
- **协作者**：3位已邀请
- **SEO负责人**：fayin003
- **兼容性测试负责人**：fayin003
