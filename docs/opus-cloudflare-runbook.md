# Opus Cloudflare 下线 Runbook

适用范围：第二阶段下线 Opus 云端资源

当前策略：

1. 第一阶段仓库代码已经切到纯 MP3，并已构建通过
2. 本地 Opus Worker 文件暂时保留，作为第二阶段执行前后的参考与回滚依据
3. 第二阶段只处理 Cloudflare 侧资源，不要求先删本地文件

## 目标

下线并最终删除以下 Opus 云端资源：

1. Opus 路由：opus.foyue.org/*
2. Opus Worker：opus-subdomain-worker
3. Opus R2 对象
4. 视观察期结果决定是否删除 Opus R2 桶

## 前置确认

执行第二阶段之前，必须确认以下条件全部成立：

1. 第一阶段纯 MP3 代码已经上线
2. 主站播放器、分类页、系列页都不再生成任何 Opus 链接
3. 以下历史仅 Opus 系列已经准备好 MP3 版本：
   - 佛说无量寿经述义
   - 劝修净土诗
   - 直趋无上菩提的妙修行路
4. 线上抽样访问上述系列的 MP3 链接可正常返回
5. 当前没有必须依赖 opus.foyue.org 的客户端版本或外部集成方

## 删除顺序

严格按以下顺序执行，不要跳步：

### 第 1 步：冻结现状

目的：保留回滚抓手，避免删除后无法快速恢复

执行项：

1. 记录当前 Opus Worker 名称与路由
2. 记录当前 Opus 桶名：opus
3. 导出或备份当前 Opus 对象列表
4. 保留本地文件：
   - workers/opus-subdomain-worker.js
   - workers/opus-wrangler.toml

通过标准：

1. 已有一份可追溯的对象清单或备份
2. 知道如何重新部署 Opus Worker

### 第 2 步：线上 MP3 核验

目的：确认第二阶段不会打掉仍依赖 Opus 的内容

建议核验方式：

1. 对三个历史系列做全量或至少高覆盖抽样校验
2. 校验内容包括：
   - MP3 URL 返回 200
   - 响应头包含正确的 Content-Type 与 Accept-Ranges
   - 浏览器可实际播放

重点系列：

1. workers/migrations/0011_add_new_series.sql 中 17 号排序系列
2. workers/migrations/0011_add_new_series.sql 中 18 号排序系列
3. workers/migrations/0011_add_new_series.sql 中 19 号排序系列

阻断条件：

1. 任意一集 MP3 缺失
2. 任意一集只能通过 Opus 播放
3. 线上仍有明显 Opus 访问依赖

### 第 3 步：先下线路由

目的：先切断新流量入口，但不立即清空底层对象

执行项：

1. 从 Cloudflare 移除 opus.foyue.org/* 对应路由

通过标准：

1. opus.foyue.org 不再对外提供服务
2. 主站 MP3 播放不受影响

回滚方式：

1. 重新绑定 opus.foyue.org/* 到原 Opus Worker

### 第 4 步：停用 Opus Worker

目的：去掉计算层入口，但继续保留对象作为短期保险

执行项：

1. 停止使用 workers/opus-wrangler.toml 对应部署流程
2. 在 Cloudflare 中停用或删除 opus-subdomain-worker

通过标准：

1. Cloudflare 侧不再有生效中的 Opus Worker 服务入口

回滚方式：

1. 使用本地保留文件重新部署 Opus Worker

### 第 5 步：观察期

目的：确认下线路由与 Worker 后没有隐藏依赖

建议观察项：

1. 主站播放成功率
2. 新老用户播放异常反馈
3. 是否还出现对 opus.foyue.org 的访问记录

建议观察窗口：

1. 至少一个短观察周期
2. 如果近期用户量波动大，适当延长

### 第 6 步：删除 Opus R2 对象

目的：真正回收存储层资源

执行项：

1. 删除 opus 桶中的对象
2. 先删已验证无依赖的对象，再删剩余对象

阻断条件：

1. 观察期内仍出现真实 Opus 依赖
2. 任意系列的 MP3 校验不完整

回滚方式：

1. 从备份恢复对象
2. 恢复路由与 Worker

### 第 7 步：最后决定是否删除 Opus 桶

目的：完成彻底退役

执行项：

1. 确认桶内对象已清空
2. 确认没有后续审计或恢复需求
3. 删除 Opus R2 桶

建议：

1. 这一项放到所有验证完成后最后做

## 验证清单

每完成一个阶段，都做一次最小验证：

1. 首页加载正常
2. 分类页和系列页可打开
3. 历史仅 Opus 的三个系列可以播放 MP3
4. 任意拖动进度仍能正确返回 Range 响应
5. PWA 已安装用户的播放流程正常

## 回滚顺序

如果第二阶段任一步出现问题，按下面顺序回滚：

1. 恢复 Opus 路由
2. 重新部署 Opus Worker
3. 如已删除对象，则从备份恢复 Opus R2 对象
4. 临时延后桶删除动作

## 本地文件处理建议

本地仓库中的以下文件建议在 Cloudflare 第二阶段完全完成后再删除：

1. workers/opus-subdomain-worker.js
2. workers/opus-wrangler.toml

这样做的原因：

1. 回滚更快
2. 不需要在云端出问题时再从历史提交里翻文件
3. 有利于对照旧架构排查残留问题