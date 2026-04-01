# 净土法音 AI 状态报告（2026-03-31）

## 1. 报告目的
本报告用于给后续智能体提供 AI 相关的最新事实基线，避免继续沿用已经过时的结论、代码规模统计和待办项。

## 2. 当前代码规模

### 2.1 AI 核心链路代码
统计范围：
- functions/lib/ai-utils.js
- functions/lib/ai-prompts.js
- functions/lib/ai-routes.js
- src/js/ai-client.js
- src/js/ai-app.js
- src/js/ai-format.js
- src/js/ai-preview.js
- src/js/ai-conversations.js
- src/js/ai-voice.js
- src/js/ai-summary.js

合计：3720 行

### 2.2 AI 扩展代码
扩展范围：
- src/css/ai-page.css
- ai.html
- src/admin/view-ai.js

合计：2057 行

### 2.3 AI 总量
- 核心链路 + 扩展：5777 行

### 2.4 逐文件行数
- functions/lib/ai-utils.js: 616
- functions/lib/ai-prompts.js: 132
- functions/lib/ai-routes.js: 985
- src/js/ai-client.js: 227
- src/js/ai-app.js: 964
- src/js/ai-format.js: 243
- src/js/ai-preview.js: 298
- src/js/ai-conversations.js: 72
- src/js/ai-voice.js: 129
- src/js/ai-summary.js: 54
- src/css/ai-page.css: 1469
- ai.html: 196
- src/admin/view-ai.js: 392

说明：
- 本统计不包含 functions/api/[[path]].js 的网关分发代码，因为该文件同时承载大量非 AI 业务。

## 3. 今日完成内容

### 3.1 前端稳定性修复
已完成修复：
- 停止生成时保留已输出内容，不再误走普通错误分支。
- ask-stream 支持外部 AbortSignal，前端可以显式取消正在进行的流式请求。
- 区分“用户主动取消”和“请求超时”，不再把两者混为同一类错误。
- 语音录制增加浏览器能力检测，避免在不支持 MediaRecorder 的环境中直接报错。
- 语音自动停止逻辑绑定到具体录音实例，避免旧定时器误停掉后续录音。
- 停止生成分支与普通回答分支都统一执行消息裁剪，避免会话无限增长。
- 文库预览抽屉与遮罩会挡住底部输入区的问题已修复；现在抽屉会按输入区实际高度自动上移，关闭态也不会残留拦截点击。

### 3.2 后端 AI 链路修复
已完成修复：
- ask 与 ask-stream 的输入统一做 trim 校验，纯空白问题直接返回 400。
- AI 搜索的关键词降级分支现在也走限流，不再绕过 ai_search 频控。
- Whisper 语音识别已统一接入 runAIWithLogging，纳入同一套日志链路。
- 每日推荐改为使用北京时间 dateKey。
- 每日推荐增加僵尸 generating 锁清理逻辑。
- 每日推荐生成完成后会异步清理过期限流记录。
- AI 回答 payload 构建收口到 buildAiAnswerPayload，减少 ask 与 ask-stream 的重复逻辑。

### 3.3 前端模块拆分
今日已把原先过大的 src/js/ai-app.js 拆出以下模块：
- src/js/ai-format.js：回答格式化、追问提取、关键词提取、高亮
- src/js/ai-preview.js：文库预览抽屉和片段导航
- src/js/ai-conversations.js：多会话存储、旧 localStorage 迁移、消息裁剪
- src/js/ai-voice.js：录音、自动停止、转写、异常处理

结果：
- src/js/ai-app.js 从先前的 1500+ 行降到 964 行。
- AI 页主入口现在更偏向编排层，而不是继续堆积所有细节实现。

## 4. 当前 AI 架构快照

### 4.1 前端
- 页面入口：ai.html
- 页面主控制器：src/js/ai-app.js
- 网络客户端：src/js/ai-client.js
- 文本格式化：src/js/ai-format.js
- 引文预览：src/js/ai-preview.js
- 会话持久化：src/js/ai-conversations.js
- 语音输入：src/js/ai-voice.js

### 4.2 后端
- 主路由：functions/lib/ai-routes.js
- 公共能力：functions/lib/ai-utils.js
- 提示词与回答契约：functions/lib/ai-prompts.js

### 4.3 当前能力
- RAG 问答
- 流式问答
- 语义搜索 + 关键词降级
- 每日推荐
- Whisper 语音转文字
- 个性化推荐
- 文库引用预览
- 多会话保存与导出

## 5. 已验证内容
- 已执行 npm run build
- 构建通过，无编译错误
- src/js/ai-app.js、src/js/ai-conversations.js、src/js/ai-voice.js 无编辑器报错
- 已做一轮 AI 页真实浏览器回归，确认预览引用可打开、预览打开时仍可继续发送、语音入口在无麦克风权限时会给出提示

## 6. 仍需关注的风险

### 6.1 仍建议优先处理
1. AI 页需要真实浏览器手工回归
- 尤其是停止生成、语音录制、移动端键盘与焦点切换。
- 当前已做基础浏览器回归，但还不是完整设备矩阵验证。

2. src/js/ai-app.js 仍可继续下沉职责
- 目前它仍然承担提交流程编排、消息渲染、抽屉控制、导出和部分 UI 状态切换。
- 下一步可以考虑继续抽离消息渲染或对话列表控制器，但不属于必须立即处理的故障项。

### 6.2 中优先级改进
1. 增加 AI 会话隐私模式
- 当前会话仍默认写入 localStorage。

2. 增加 AI 页自动化或半自动化回归
- 目前仍依赖人工验证，后续智能体继续改 AI 页时风险较高。

## 7. 后续智能体必须知道的事实
- 不要再把“搜索降级路径未限流”和“Whisper 未接入 runAIWithLogging”当成待办，这两项今天已经完成。
- AI 问答的结构化契约已经收口到 normalizeAiAnswerContract；不要只改前端的 extractFollowUps。
- src/js/ai-app.js 中 init() 不能挪到 convListEl 等 DOM 常量初始化之前，否则会触发 TDZ 白屏。
- 继续缩减 ai-app.js 时，优先抽离独立控制器，不要重排顶部 DOM 常量与 init() 的相对顺序。

## 8. 建议阅读顺序
1. docs/handoff-2026-03-31.md
2. docs/ai-status-report-2026-03-31.md
3. functions/lib/ai-routes.js
4. functions/lib/ai-prompts.js
5. src/js/ai-app.js
6. src/js/ai-format.js
7. src/js/ai-preview.js
8. src/js/ai-conversations.js
9. src/js/ai-voice.js

## 9. 结论
AI 主链路今天已经从“能跑”提升到“更稳、更清楚、可继续拆分”。真正阻碍后续工作的旧误导信息主要来自过时文档，本报告已同步刷新。
