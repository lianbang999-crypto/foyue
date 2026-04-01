# AI Agent Deep Dive

## Quick Links

- PDF 下载 / PDF Report: [ai-agent-deep-dive-report.pdf](./ai-agent-deep-dive-report.pdf)

## Notes

- 本仓库仅保留面向学习与评论的分析材料，不提供源码目录。
- 第二版 PDF 正在制作中。

---

# AI Agent Deep Dive Notes

> 这是一份围绕现代 Coding Agent 产品设计的学习型研究笔记，重点关注：整体架构、提示词系统、Agent 编排、Skills、Plugins、Hooks、MCP、权限与工具调用机制，以及这些系统为什么会让 Agent 产品更稳定、更好用。

---

## 目录

1. 研究范围与结论总览
2. 源码结构全景：它为什么更像 Agent Operating System
3. 系统提示词总装：提示词系统的真实地位
4. Prompt 全量提取与模块级拆解
5. Agent Prompt 与 built-in agents 深挖
6. Agent 调度链深挖：从调度器到运行时主循环
7. Skills / Plugins / Hooks / MCP 生态深挖
8. 权限、Hook、工具执行链深挖
9. 为什么 Claude Code 这么强：从源码看它真正的护城河
10. 关键文件索引与后续可继续深挖方向

---

# 1. 研究范围与结论总览

## 1.1 这次到底研究了什么

这份材料的核心目标，是围绕现代 Coding Agent 产品做系统性拆解，重点包括：

- Coding Agent 的整体架构
- 主系统提示词如何动态拼装
- AgentTool / SkillTool 的模型侧协议
- built-in agents 的角色分工
- Agent 调度链路如何跑通
- Plugin / Skill / Hook / MCP 如何接入并影响运行时
- Permission / Tool execution / Hook decision 如何协同
- 它为什么在体验上比“普通 LLM + 工具调用器”强很多

## 1.2 关键确认事实

本次研究重点关注了以下核心文件和模块：

1. 主系统提示词、Agent 编排、Skill 调用、工具执行链与权限治理相关模块

## 1.3 先给最重要的总判断

这类成熟 Coding Agent 产品的强，不是来自某个“神秘 system prompt”，而是来自一个完整的软件工程系统：

- Prompt 不是静态文本，而是模块化 runtime assembly
- Tool 不是直接裸调，而是走 permission / hook / analytics / MCP-aware execution pipeline
- Agent 不是一个万能 worker，而是多种 built-in / fork / subagent 的分工系统
- Skill 不是说明文档，而是 prompt-native workflow package
- Plugin 不是外挂，而是 prompt + metadata + runtime constraint 的扩展机制
- MCP 不是单纯工具桥，而是同时能注入工具与行为说明的 integration plane

一句话总结：

> 这类成熟 Agent 产品的价值，不是一段 prompt，而是一整套把 prompt、tool、permission、agent、skill、plugin、hook、MCP、cache 和产品体验统一起来的 Agent Operating System。

---

# 2. 源码结构全景：它为什么更像 Agent Operating System

## 2.1 顶层结构暴露出的系统复杂度

从相关产品结构看，这类成熟 Coding Agent 至少会包含这些重要模块：

- `src/entrypoints/`：入口层
- `src/constants/`：prompt、系统常量、风险提示、输出规范
- `src/tools/`：工具定义与具体实现
- `src/services/`：运行时服务，例如 tools、mcp、analytics
- `src/utils/`：底层共用能力
- `src/commands/`：slash command 与命令系统
- `src/components/`：TUI / UI 组件
- `src/coordinator/`：协调器模式
- `src/memdir/`：记忆 / memory prompt
- `src/plugins/` 与 `src/utils/plugins/`：插件生态
- `src/hooks/` 与 `src/utils/hooks.js`：hook 系统
- `src/bootstrap/`：状态初始化
- `src/tasks/`：本地任务、远程任务、异步 agent 任务

这已经说明它不是简单 CLI 包装器，而是一个完整运行平台。

## 2.2 入口层说明它是平台，而不是单一界面

可见入口包括：

- `src/entrypoints/cli.tsx`
- `src/entrypoints/init.ts`
- `src/entrypoints/mcp.ts`
- `src/entrypoints/sdk/`

也就是说它从设计上就考虑了：

- 本地 CLI
- 初始化流程
- MCP 模式
- SDK 消费者

这是一种平台化思维：同一个 agent runtime，可以服务多个入口和多个交互表面。

## 2.3 命令系统是整个产品的操作面板

`src/commands.ts` 暴露出非常多系统级命令，例如：

- `/mcp`
- `/memory`
- `/permissions`
- `/hooks`
- `/plugin`
- `/reload-plugins`
- `/skills`
- `/tasks`
- `/plan`
- `/review`
- `/status`
- `/model`
- `/output-style`
- `/agents`
- `/sandbox-toggle`

这说明命令系统不是“锦上添花”，而是用户与系统运行时交互的重要控制面。

## 2.4 Tools 层才是模型真正“能做事”的根

从 prompt 和工具名能确认的重要工具包括：

- FileRead
- FileEdit
- FileWrite
- Bash
- Glob
- Grep
- TodoWrite
- TaskCreate
- AskUserQuestion
- Skill
- Agent
- MCPTool
- Sleep

工具层的本质，是把模型从“回答器”变成“执行体”。Claude Code 的强，很大程度来自这层做得正式、清晰、可治理。

---

# 3. 系统提示词总装：提示词系统的真实地位

## 3.1 真正的主入口：`src/constants/prompts.ts`

这份文件是整个系统最关键的源码之一。不是因为它写了一大段神奇文案，而是因为它承担了：

- 主系统提示词的总装配
- 环境信息注入
- 工具使用规范注入
- 安全与风险动作规范
- Session-specific guidance 注入
- language / output style 注入
- MCP instructions 注入
- memory prompt 注入
- scratchpad 说明注入
- function result clearing 提示注入
- brief / proactive / token budget 等 feature-gated section 注入

这类成熟 Agent 产品的 prompt 往往不是静态字符串，而是一个 **system prompt assembly architecture**。

## 3.2 `getSystemPrompt()` 不是文本，而是编排器

`getSystemPrompt()` 里最核心的结构，是先构造静态部分，再加上动态部分。你可以把它理解成：

### 静态前缀（更适合 cache）
- `getSimpleIntroSection()`
- `getSimpleSystemSection()`
- `getSimpleDoingTasksSection()`
- `getActionsSection()`
- `getUsingYourToolsSection()`
- `getSimpleToneAndStyleSection()`
- `getOutputEfficiencySection()`

### 动态后缀（按会话条件注入）
- session guidance
- memory
- env info
- language
- output style
- mcp instructions
- scratchpad
- function result clearing
- summarize tool results
- token budget
- brief

这个设计非常值钱，因为它不是“把能想到的都写进 system prompt”，而是把 prompt 当作可编排运行时资源来管理。

---

# 4. Prompt 全量提取与模块级拆解

## 4.1 身份与基础定位

系统提示词会先定义它是 interactive agent，并明确它是帮助用户完成软件工程任务的，不是普通聊天机器人。

## 4.2 基础系统规范

这里会规定：

- 所有非工具输出都直接给用户看
- 工具运行在 permission mode 下
- 用户拒绝后不能原样重试
- tool result 可能含系统提醒或外部内容
- 需要对 prompt injection 保持警惕

## 4.3 做任务哲学

它非常强调：

- 不要乱加功能
- 不要过度抽象
- 不要瞎重构
- 先读代码再改代码
- 不要轻易创建新文件
- 结果要诚实汇报

这部分是它稳定性的关键来源之一。

---

# 5. Agent Prompt 与 built-in agents 深挖

## 5.1 AgentTool Prompt 的价值

这份 prompt 本质上是在告诉模型：

- 何时该启动 agent
- 何时该 fork 自己
- 何时不该用 AgentTool
- 如何正确地写 subagent prompt

## 5.2 built-in agents 的意义

内建 agents 至少包括：

- General Purpose Agent
- Explore Agent
- Plan Agent
- Verification Agent

这说明它不是一个万能 worker，而是通过角色分工来提高稳定性。

## 5.3 Verification Agent 为什么值钱

Verification Agent 的核心不是“再看一眼”，而是主动去验证、去尝试打破实现。它要求 build、tests、type-check、真实命令输出和最终 verdict，这对提高任务完成质量非常关键。

---

# 6. Agent 调度链深挖

## 6.1 总体调度链

主链路可以抽象为：

1. 主模型决定调用 Agent 工具
2. AgentTool 解析输入并选择路径
3. 判断 fork / normal / background / remote / worktree
4. 构造 prompt messages 与 system prompt
5. 组装工具池与上下文
6. 调用 `runAgent()`
7. `runAgent()` 再进入 `query()` 主循环

## 6.2 为什么这个调度链重要

因为这说明 agent execution 不是简单“开个新会话”，而是一个完整的 runtime lifecycle。

---

# 7. Skills / Plugins / Hooks / MCP 生态深挖

## 7.1 Skill 的本质

Skill 不是文档，而是可复用的 workflow package。它让系统能把重复流程变成按需注入的 prompt 资产。

## 7.2 Plugin 的本质

Plugin 不是普通脚本扩展，而是 prompt、metadata 和 runtime constraints 的组合包。

## 7.3 Hook 的本质

Hook 是运行时治理层，它可以改输入、给权限建议、阻止继续执行、注入上下文。

## 7.4 MCP 的本质

MCP 不只是工具桥，还能通过 instructions 影响模型如何理解和使用这些工具。

---

# 8. 权限、Hook、工具执行链深挖

成熟 Agent 产品的工具调用并不是模型直接裸调，而是完整的 runtime pipeline：

- schema 校验
- validateInput
- pre-tool hooks
- permission decision
- tool call
- telemetry
- post-tool hooks
- failure hooks

这也是它比很多“会调工具的 Agent”更稳定的重要原因。

---

# 9. 为什么 Claude Code 这么强

最核心的原因不是模型更聪明一点，而是这类产品把这些东西系统化了：

- Prompt architecture
- Tool runtime governance
- Permission model
- Agent specialization
- Skill workflow packaging
- Plugin / MCP extensibility
- Context hygiene
- Async/background lifecycle
- Product-level engineering

所以它真正厉害的不是某一句 prompt，而是整个 operating model。

---

# 10. 最终结论

> 成熟 Agent 产品真正的价值，不是一段 system prompt，而是一个把 prompt architecture、tool runtime、permission model、agent orchestration、skill packaging、plugin system、hooks governance、MCP integration、context hygiene 和 product engineering 统一起来的系统。

这也是为什么它不像一个“会调工具的聊天机器人”，而更像一个真正的 Agent Operating System。
