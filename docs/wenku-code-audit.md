# 文库（Wenku）功能审计与交接报告（2026-03-31）

## 1. 报告目的
本报告用于给后续智能体提供文库模块的当前实现、今天已完成的修复与优化、仍未解决的问题，以及继续推进时的切入点。

## 2. 当前代码规模
- src/js/wenku-app.js: 1424
- src/js/wenku-api.js: 80
- functions/lib/wenku-routes.js: 331
- src/css/wenku-page.css: 1623
- wenku.html: 100

合计：3558 行

## 3. 今日完成内容

### 3.1 搜索与请求控制
- src/js/request-cache.js 支持把外部 signal 连接到内部超时控制器。
- src/js/wenku-api.js 的 searchWenku 现在支持传入 AbortSignal。
- src/js/wenku-app.js 首页搜索会主动取消上一轮未完成请求，避免旧结果覆盖新结果。
- 已对 AbortError 做显式透传，过期搜索结果会被丢弃。

### 3.2 后端搜索与查询优化
- functions/lib/wenku-routes.js 的 handleWenkuSearch 优先使用 FTS5。
- 已新增迁移 workers/migrations/0025_wenku_fts5_search.sql，用于建立 documents_fts 与相关触发器。
- 当 FTS5 不可用时仍会回退到 LIKE 搜索。
- handleWenkuDocument 由原先多次查询改为单次 CTE 查询，同时返回当前文档、上一讲、下一讲和总集数。

### 3.3 阅读计数保护
- functions/api/[[path]].js 在 read-count 接口中把 client IP 传给文库后端处理函数。
- functions/lib/wenku-routes.js 中 handleWenkuReadCount 已加入基于 IP + documentId 的 60 秒简易去重。

### 3.4 前端体验优化
- 首页“继续阅读”由单条扩展为最多三条。
- Book Sheet 打开后会自动滚动到当前阅读条目。
- Book Sheet 新增下滑关闭手势，并处理了内容区域已滚动时的边界逻辑。
- 阅读器分页初始化改为双帧 + fonts.ready 后重算，减少字体晚到导致的分页偏差。
- 阅读器增加 resize/旋转后的重新分页逻辑。
- 加载失败按钮改为事件委托，不再依赖 setTimeout 绑事件。
- 首页搜索空结果文案更明确。

### 3.5 样式整理
- src/css/wenku-page.css 做了较大轮次的视觉收敛与阴影清理。
- 删除了一批旧的最近阅读横滑样式死代码。

## 4. 当前功能架构

### 4.1 前端
- 页面入口：wenku.html
- 主控制器：src/js/wenku-app.js
- API 封装：src/js/wenku-api.js

### 4.2 后端
- API 网关入口：functions/api/[[path]].js
- 文库路由实现：functions/lib/wenku-routes.js
- FTS5 迁移：workers/migrations/0025_wenku_fts5_search.sql

### 4.3 核心能力
- 首页书架与继续阅读
- Book Sheet 底部详情卡
- 文稿搜索
- 阅读器滚动模式 / 分页模式
- 阅读进度存储
- 阅读计数回写

## 5. 仍未解决的问题
1. renderSeries 旧路径仍在
- 现在 Book Sheet 是主路径，但旧的系列页渲染路径还留着，后续结构继续收口时需要决定保留还是移除。

2. 搜索结果高亮仍不完整
- 后端已能返回 FTS snippet，但前端展示层还没有把关键词高亮成更明显的可视结果。

3. FTS5 迁移是否已在线执行，需要单独确认
- 代码与 migration 已存在，但报告无法替代真实数据库状态验证。

4. R2 同步接口的安全性仍值得再次核对
- 当前主要依赖外部 token 约束，后续如果继续开放管理能力，建议再做一次接口安全审查。

## 6. 后续智能体建议优先级
1. 先验证 FTS5 migration 是否已部署成功，再评估搜索表现。
2. 再决定是否移除 renderSeries 旧路径，减少文库前端双轨逻辑。
3. 如继续做文库体验优化，优先补搜索结果高亮与 Book Sheet / Reader 的真实设备回归。

## 7. 建议阅读顺序
1. docs/handoff-2026-03-31.md
2. docs/wenku-code-audit.md
3. src/js/wenku-app.js
4. src/js/wenku-api.js
5. functions/lib/wenku-routes.js
6. workers/migrations/0025_wenku_fts5_search.sql

## 8. 结论
文库模块今天的重点不是重构，而是把“可用但容易抖”的搜索、Book Sheet 和阅读器体验往稳定方向推进。后续继续做时，最有价值的是清理旧路径并完成数据库侧验证。
