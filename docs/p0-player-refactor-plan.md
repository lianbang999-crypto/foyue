# P0 播放器重构实施方案（完整版）

> 目标：在不牺牲现有功能的前提下，降低播放器复杂度，优先保障 iOS 与弱网稳定性
> 日期：2026-03-31
> 适用范围：前端主站播放链路 + 音频缓存 + 上报链路

---

## 1. 重构目标与边界

### 1.1 P0 目标

1. 把播放主链路稳定在一条可观测、可回滚、可灰度的路径
2. 把播放器职责拆分为 4 个内聚模块，避免单文件过重
3. 保持现有用户可见功能不退化：播放/暂停/切歌/循环/倍速/断点/历史/上报
4. 落实“短音频缓存、长音频纯流式”策略，减少主动优化叠加

### 1.2 非目标（本阶段不做）

1. 不重做 UI 样式和视觉结构
2. 不重构 AI、文库、共修模块
3. 不改动数据库 schema
4. 不引入新框架

---

## 2. 当前问题（代码级）

主要风险集中在 [src/js/player.js](src/js/player.js)：

1. 职责过多：播放控制、会话隔离、UI 更新、缓存触发、上报、恢复逻辑混在一起
2. 变更耦合高：任何小改动都可能影响 iOS 恢复或循环模式
3. 可测性弱：缺乏单模块边界与可替换接口
4. 回归成本高：问题定位需跨多个逻辑块

相关依赖文件：

1. [src/js/audio-cache.js](src/js/audio-cache.js)
2. [src/js/playback-policy.js](src/js/playback-policy.js)
3. [src/js/history.js](src/js/history.js)
4. [src/js/api.js](src/js/api.js)
5. [src/js/state.js](src/js/state.js)
6. [src/js/dom.js](src/js/dom.js)
7. [src/js/store.js](src/js/store.js)

---

## 3. 目标模块拆分

在 P0 不改变对外行为的前提下，把 [src/js/player.js](src/js/player.js) 演进为以下结构：

```
src/js/player/
  core.js         # Audio 元素生命周期、播放状态机、基础控制
  session.js      # 切歌会话隔离、过期回调丢弃
  ui.js           # 迷你/全屏播放器 UI 同步
  telemetry.js    # 播放上报、错误统计、关键事件埋点
  index.js        # 对外兼容导出层（保持旧接口）
```

### 3.1 core.js（播放内核）

职责：

1. 管理 Audio 实例和关键事件（play/pause/timeupdate/ended/error）
2. 提供纯播放控制 API：`loadTrack`, `play`, `pause`, `seek`, `setRate`
3. 调用 `playback-policy` 决策短/长音频策略
4. 暴露最小状态快照：`isPlaying`, `currentTime`, `duration`, `buffered`

### 3.2 session.js（会话隔离）

职责：

1. 每次切歌生成新 sessionId
2. 异步任务绑定 sessionId，过期即丢弃
3. 统一处理“上一首异步回写下一首 UI”风险
4. 明确用户主动暂停意图，不被自动恢复抢回

### 3.3 ui.js（播放器视图）

职责：

1. 仅处理 DOM 更新，不处理网络或业务决策
2. 提供纯函数式更新入口：`renderMini`, `renderFull`, `renderProgress`, `renderLoopMode`
3. 保持与 [src/js/dom.js](src/js/dom.js) 的单向依赖

### 3.4 telemetry.js（上报与观测）

职责：

1. 对接 [src/js/api.js](src/js/api.js) 播放次数上报（保留熔断）
2. 记录关键事件：首播耗时、切歌耗时、恢复成功率、错误码分布
3. 对接 [src/js/monitor.js](src/js/monitor.js)

### 3.5 index.js（兼容层）

职责：

1. 维持当前对外导出函数签名不变，避免影响调用方
2. 作为唯一入口给 [src/js/main.js](src/js/main.js) 与页面模块使用
3. 逐步把旧 [src/js/player.js](src/js/player.js) 导出迁移到新结构

---

## 4. 关键接口草案

### 4.1 播放内核接口

```js
// core.js
createPlayerCore({ audioEl, policyResolver, onEvent })

core.loadTrack(track, { autoplay, sessionId })
core.play({ sessionId })
core.pause({ reason, sessionId })
core.seek(time, { sessionId })
core.setRate(rate)
core.getSnapshot()
```

### 4.2 会话管理接口

```js
// session.js
const session = createPlaybackSessionManager()

const id = session.begin("track-switch")
session.guard(id, () => { /* only run when current */ })
session.isCurrent(id)
session.currentId()
```

### 4.3 遥测接口

```js
// telemetry.js
telemetry.trackPlayRequested(track)
telemetry.trackFirstSound(track, costMs)
telemetry.trackRecoverAttempt({ platform, reason })
telemetry.trackRecoverResult({ ok, costMs })
telemetry.trackPlayCountReported({ ok, status })
```

---

## 5. 渐进迁移步骤（不一次性重写）

### Step 1：建立兼容壳（低风险）

1. 新建 `src/js/player/` 目录和 5 个文件
2. 在 `index.js` 内先直接代理旧逻辑，确保行为不变
3. [src/js/main.js](src/js/main.js) 改为从 `player/index.js` 引入

验收：构建通过，功能行为无变化

### Step 2：拆出 session（优先）

1. 从旧播放器抽离会话 ID 与过期回调丢弃逻辑到 `session.js`
2. 所有异步路径统一经 `session.guard` 执行
3. 增加调试日志开关（仅开发环境）

验收：快速切歌 50 次无串台

### Step 3：拆出 telemetry

1. 抽离播放上报逻辑到 `telemetry.js`
2. 保留熔断策略和失败降级
3. 增加关键指标埋点（首播耗时、恢复成功率）

验收：上报失败不影响播放主链路

### Step 4：拆出 ui

1. 把播放器 DOM 操作迁移到 `ui.js`
2. `core` 仅发事件，不直接改 DOM
3. 统一更新入口，避免重复渲染

验收：UI 状态同步正确，播放器控制无倒挂

### Step 5：拆 core

1. 把音频事件绑定、load/play/pause/seek 从旧文件迁到 `core.js`
2. 接入 `playback-policy`，固定策略：短缓存、长流式
3. 保留 iOS ghost playback 恢复能力

验收：iOS/Android 回归通过

### Step 6：清理旧文件

1. 删除旧 [src/js/player.js](src/js/player.js) 内已迁移逻辑
2. 最终仅保留兼容导出或改为 re-export
3. 补充文档与注释

验收：旧接口全部可用，代码复杂度下降

---

## 6. 回归验证清单（必须执行）

### 6.1 功能回归

1. 播放/暂停
2. 上一曲/下一曲
3. 顺序/单曲/随机循环
4. 倍速切换
5. 断点续播
6. 历史记录
7. 播放次数上报

### 6.2 稳定性回归

1. iPhone Safari：前后台切换 20 次
2. iPhone 微信内置浏览器：连续切歌 20 次
3. Android Chrome：连续切歌 50 次
4. 弱网模拟：2G/Slow 3G 下长音频播放与 seek
5. 缓存命中与非命中场景切换

### 6.3 构建与部署验证

1. `npm run build` 必须通过
2. 线上灰度时开启播放器开关监控
3. 出现回归时可一键切回旧内核

---

## 7. 灰度与回滚

### 7.1 灰度开关

建议在 [src/js/feature-flags.js](src/js/feature-flags.js) 增加：

1. `FEATURE_PLAYER_V2`
2. `FEATURE_PLAYER_TELEMETRY_VERBOSE`

灰度策略：

1. 本地与预发全量
2. 线上 10% -> 30% -> 100%
3. 每阶段至少观察 24 小时

### 7.2 回滚触发条件

1. 首播失败率显著升高
2. iOS 恢复成功率低于基线
3. 播放上报异常引发主链路抖动

回滚动作：

1. 关闭 `FEATURE_PLAYER_V2`
2. 恢复旧播放器路径
3. 保留 telemetry 数据用于复盘

---

## 8. 产出物清单

本阶段交付应包含：

1. 代码：`src/js/player/*` 新模块
2. 文档：本文件 + 更新 [docs/architecture.md](docs/architecture.md)
3. 验证：回归测试记录（iOS/Android/弱网）
4. 运营：灰度策略与回滚预案

---

## 9. 与后续阶段衔接

P0 完成后建议立即进入 P1：

1. 统一内容域 DTO（音频/文稿/文库）
2. 统一 `series + episode + transcript + ai` 聚合接口
3. 管理后台新增映射可视化与缺失修复入口

这样可以把“播放稳定化”与“内容能力扩展”形成连续演进，避免再次回到大文件耦合模式

---

## 10. 当前实施进展（2026-03-31）

已完成：

1. 第一步中的文档与结构准备（P0 方案已落地）
2. 性能热路径优化（进度 UI 刷新节流、播放列表缓存标记同步化）
3. 弱网保护策略（弱网/省流下跳过后台整曲加载）
4. 会话隔离模块初版落地：新增 [src/js/player/session.js](src/js/player/session.js)
5. 现有 [src/js/player.js](src/js/player.js) 已接入会话管理器并替换关键 stale callback 判定

待继续：

1. 把更多异步分支统一收敛到 `session.guard` 风格
2. 抽离 telemetry 到独立模块
3. 抽离 UI 更新到独立模块
