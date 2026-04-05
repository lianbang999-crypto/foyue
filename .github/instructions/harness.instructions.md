---
applyTo: "**"
---

# Foyue Harness 编排配置

> 基于 revfactory/harness 6-Phase 方法论构建
> 创建日期：2026-04-05
> 架构模式：**Supervisor + Expert Pool** 混合模式

---

## 架构模式

### 主模式：Supervisor（监督者）
`foyue-lead` 作为中心编排者，接收所有用户请求，分析意图后分派给专家 Agent。

### 辅模式：Expert Pool（专家池）
9 个专家 Agent 按领域分工，由 `foyue-lead` 根据上下文选择调用。

```
                  ┌──────────────┐
                  │  foyue-lead  │ ← Supervisor
                  └──────┬───────┘
           ┌──────┬──────┼──────┬──────┐
           ▼      ▼      ▼      ▼      ▼
     ┌─────┐ ┌────┐ ┌─────┐ ┌─────┐ ┌──────┐
     │ ai  │ │home│ │front│ │back │ │cloud │
     └─────┘ └────┘ └─────┘ └─────┘ └──────┘
       ▲       ▲       ▲       ▲
       │       │       │       │
     AI页   首页    播放器/   后端
     重设计  分类    基础设施  API
           搜索    SW/PWA
```

## Agent 清单与路由表

| Agent | 触发词 | 管辖范围 | 工具权限 |
|-------|--------|---------|---------|
| `foyue-lead` | 总体规划, 跨域, 架构 | 全局编排 | read,edit,execute,search |
| `foyue-ai` | AI页, 对话, TTS, 语音 | ai-*.js, ai.html | read,edit,search |
| `foyue-home` | 首页, 分类, 搜索 | pages-home, pages-category, search | read,edit,search |
| `foyue-frontend` | 播放器, SW, PWA, 路由, 主题 | player*, state, dom, api, router, main, theme, i18n, pwa, history, store, pages-my | read,edit,search |
| `foyue-nianfo` | 念佛, 计数器 | nianfo-app, counter* | read,edit,search |
| `foyue-gongxiu` | 共修, 消息墙 | gongxiu-*, message-wall | read,edit,search |
| `foyue-backend` | 后端, API, D1, Workers | functions/, workers/ | read,edit,execute,search |
| `foyue-cloudflare` | 部署, wrangler, R2, KV | wrangler.toml, 基础设施 | read,edit,execute |

## 任务路由决策流程

```
用户请求
  │
  ├─ 涉及 AI 页？ → foyue-ai
  ├─ 涉及首页/分类/搜索？ → foyue-home
  ├─ 涉及播放器/SW/PWA/路由/主题？ → foyue-frontend
  ├─ 涉及念佛页？ → foyue-nianfo
  ├─ 涉及共修页？ → foyue-gongxiu
  ├─ 涉及后端 API/数据库？ → foyue-backend
  ├─ 涉及 Cloudflare 配置/部署？ → foyue-cloudflare
  ├─ 涉及多个域？ → foyue-lead 拆解后按依赖顺序分派
  ├─ 不确定归属？ → Explore 先定位文件再决策
  └─ 简单问答？ → 自行处理
```

## 跨域任务编排

当任务涉及多个 Agent 时，按依赖顺序执行：

```
Phase 1: cloudflare（基础设施变更）
  ↓
Phase 2: backend（API 变更）
  ↓
Phase 3: frontend/页面 Agent（UI 变更）
  ↓
Phase 4: npm run build 验证
```

### 数据传递协议

| 策略 | 适用场景 |
|------|---------|
| **文件基** | 跨 Agent 分享代码变更（直接修改源文件） |
| **context.md** | 跨会话状态共享（写入 `_brain/context.md`） |
| **build 验证** | 每个 Phase 完成后运行 `npm run build` 确认无破坏 |

## 错误处理

| 错误类型 | 处理策略 |
|---------|---------|
| build 失败 | 回退变更，报告失败原因，不继续下一 Phase |
| Agent 超出管辖 | 停止并报告，建议路由到正确 Agent |
| 接口不一致 | foyue-lead 仲裁，以后端 API 为准 |
| 文件冲突 | foyue-lead 协调修改顺序 |

## 质量检查点

每次代码变更后：
1. ✅ `npm run build` 零错误
2. ✅ 修改文件在 Agent 管辖范围内
3. ✅ 不涉及废弃模块（wenku）
4. ✅ 不引入新依赖（除非用户明确要求）
