---
name: "Audio Player Architecture Guidelines"
description: "Use when changing the audio player, playback pipeline, audio caching, preload logic, or audio delivery worker. Enforces platform-aware playback strategy, cache separation, and large/small audio transition safety."
applyTo: "src/js/player.js, src/js/audio-cache.js, src/js/audio-url.js, src/js/history.js, src/js/store.js, src/js/pages-home.js, src/js/pages-category.js, public/sw.js, workers/audio-subdomain-worker.js, functions/**/*.js"
---

# 净土法音 (Foyue) 播放器与缓存架构指令

## 目标
- 任何播放器相关改动都必须同时考虑 iPhone / iOS WebKit 与 Android Chrome / WebView 的体验差异
- 目标不是单点修 bug，而是保证起播快、切歌稳、长音频不卡、功能键即点即响应、缓存规则不互相打架
- 任何新策略都必须回答两个问题：
  - 大音频切到小音频时是否会额外延迟或抢占带宽
  - 小音频切到大音频时是否会引入卡顿、错误预载或恢复失败

## 一等输入：音频大小与时长
- 设计播放策略时，必须把音频文件大小与时长作为一等输入，而不是只看当前网络状态
- 如果后端未提供 `bytes`、`duration`、`mime`、`etag` 等元数据，前端策略必须走保守路径，不能假设音频是“小文件”
- 任何播放器规划、重构、优化方案，都必须至少覆盖这四类切换场景：
  - 小音频 -> 小音频
  - 小音频 -> 大音频
  - 大音频 -> 小音频
  - 大音频 -> 大音频

## 平台分层策略
- iPhone / iOS WebKit：优先稳定，避免激进预加载、避免大块 warmup、避免长音频自动整曲缓存、避免后台状态下的错误 stall 判定
- Android：可比 iOS 更积极，但也不能让预加载抢占当前播放带宽
- 不允许为了“统一实现”而强行让 iOS 与 Android 共用同一套激进预取策略

## 播放链路规则
- 用户主动点击播放时，优先保证“尽快出声”，不要把首个手势窗口浪费在不必要的异步缓存转换上
- 切歌必须有明确的会话隔离与过期回调丢弃机制，防止上一首的异步事件覆盖下一首状态
- 单曲循环、随机、列表循环的 ended 续播逻辑必须独立审视 iOS 表现，不能只在桌面浏览器上验证
- 随机切换策略必须考虑避免重复命中当前曲目；如果后续增强，优先考虑最近若干首去重，而不是纯随机
- 任何“即点即用”的功能键优化，都必须保证先有明确 UI 反馈，再异步完成真实播放或切换

## 预加载与预热规则
- 预加载策略必须由平台、网络、音频大小、音频时长共同决定，不能写成单一固定规则
- 对长音频，默认优先 Range 流式播放，不自动整曲预取
- 对小音频，可以更积极地做首段预热或下一曲轻量预热，但必须证明不会影响当前播放中的大音频
- iOS 上默认避免持有额外的下一曲 `Audio` 预加载对象，除非有明确证据证明不会引发内存或音频会话问题
- 对 warmup / preload 的任何增量修改，都必须先评估是否会造成：
  - 当前曲带宽被抢占
  - iOS 假播放恢复变差
  - 大小音频切换时延迟上升

## 缓存分层规则
- 必须区分以下缓存层，禁止混用概念：
  - 音频元数据缓存：如 duration、bytes、mime、etag
  - 播放状态缓存：如 currentTime、loopMode、speed、history
  - 在线播放缓存：为快速命中和边缘热路径服务，不等于长期离线缓存
  - 离线音频缓存：只服务明确的离线播放场景
  - Service Worker 静态资源与数据缓存
- Range 请求与完整音频缓存必须有清晰边界，避免 Service Worker、Cache API、Worker edge cache 相互冲突
- 不能把“播放过”默认等于“应该整曲缓存”
- 长音频默认不自动进入长期离线缓存，除非是用户明确触发的离线动作
- 缓存淘汰规则必须考虑最近使用时间、是否用户主动保留、以及平台的存储预算差异

## Worker 与边缘缓存规则
- 音频 Worker 的设计目标是减少首包延迟、减少不必要的 R2 往返、稳定支持 Range 请求
- 设计边缘缓存时，必须区分“小文件适合整对象热缓存”和“大文件只适合首段热缓存”
- 任何 Worker 改动都要检查是否会与前端 warmup、Service Worker、Cache API 形成重复请求或缓存冲突

## 前后台与恢复规则
- 后台标签页或移动端切后台时，不能把 `currentTime` 暂时不推进直接判定为卡顿
- iOS 的 ghost playback、resume 唤醒、seek 回弹，都必须作为一等兼容场景持续考虑
- 所有自动恢复逻辑都必须尊重用户显式暂停，不得与用户意图冲突

## 设计与评审要求
- 任何播放器相关方案或代码评审，必须明确说明以下内容：
  - 对 iPhone 的影响
  - 对 Android 的影响
  - 对长音频的影响
  - 对短音频的影响
  - 对切歌响应的影响
  - 对缓存命中与缓存冲突的影响
- 如果缺少这些说明，就视为方案不完整

## 验证要求
- 至少说明以下验证场景：
  - iPhone 上长音频连续播放
  - iPhone 上大音频切小音频
  - iPhone 上小音频切大音频
  - Android 上连续切歌
  - 随机切换与列表循环
  - 前后台切换恢复
  - 清缓存后冷启动起播
- 仓库当前没有 lint / test 套件时，至少通过 `npm run build`，并补充手动验证建议