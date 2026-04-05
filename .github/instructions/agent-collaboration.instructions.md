---
name: "Agent Collaboration Protocol"
description: "子智能体协作协议：路由规则、文件边界、上下文传递、冲突解决"
applyTo: "**"
---

# 子智能体协作协议

## 1. 文件所有权边界（硬规则）

每个 Agent 有明确的文件管辖范围，跨界修改属于协议违规。

| Agent | 管辖文件 | 禁区 |
|---|---|---|
| `foyue-ai` | `src/js/ai-*.js`, `ai.html`, `src/css/ai-page.css` | `functions/`, `workers/`, 非 ai-* 的 js 文件 |
| `foyue-home` | `src/js/pages-home.js`, `pages-category.js`, `search.js`, `src/css/pages.css`, `src/css/cards.css` | player, ai-*, counter*, gongxiu-* |
| `foyue-nianfo` | `src/js/nianfo-app.js`, `counter.js`, `counter-lazy.js`, `counter-share.js`, `src/css/nianfo-page.css`, `nianfo.html` | gongxiu-*, pages-my.js |
| `foyue-gongxiu` | `src/js/gongxiu-*.js`, `message-wall.js`, `src/css/gongxiu*.css`, `message-wall.css`, `gongxiu.html` | counter*.js, pages-my.js |
| `foyue-frontend` | `src/js/player*`, `state.js`, `dom.js`, `api.js`, `router.js`, `main.js`, `theme.js`, `i18n.js`, `pwa.js`, `history*.js`, `store.js`, `pages-my.js`, 基础 CSS, `public/sw.js` | pages-home, ai-*, nianfo-*, gongxiu-*, counter* |
| `foyue-backend` | `functions/`, `workers/`, `workers/migrations/` | `src/js/`, `src/css/` |
| `foyue-cloudflare` | `wrangler.toml`, `workers/wrangler.toml`, `workers/migrations/`, 部署操作 | `src/js/`, `src/css/`, `functions/lib/` 业务逻辑 |
| `foyue-lead` | 全局只读 + 配置文件（package.json, vite.config.js, 文档）| 不直接修改业务代码，通过委派子 Agent 执行 |

**冲突判定**：如果一个文件同时属于多个 Agent 的管辖范围，由编排者指定主责 Agent 并在 prompt 中声明。

## 2. 委派上下文传递

编排者委派子 Agent 时，**必须**传递以下结构化上下文：

```
## 任务
[一句话描述具体目标]

## 上下文
- 相关文件：[绝对路径列表]
- 用户原始需求：[原文复述]
- 前置发现：[之前的搜索/分析结果，或上一个 Agent 的产出]

## 约束
- 文件边界：[明确列出不可修改的文件/目录]
- 验证方式：npm run build 零错误
- [其他特殊约束]

## 返回要求
- 列出所有修改的文件路径和变更摘要
- 报告任何需要其他 Agent 配合的事项
- 如有 API 接口变更，说明请求/响应格式
```

## 3. 跨域协作排序

多 Agent 协作时，遵循以下执行顺序：

```
基础设施 (foyue-cloudflare)
    ↓ 绑定/迁移就绪
后端 (foyue-backend)
    ↓ API 接口就绪
前端 (foyue-frontend / foyue-ai)
    ↓ 全部完成
编排者 → npm run build 验证
```

## 4. API 契约协商

当前端和后端需要协作时：

1. **编排者** 先委派 `foyue-backend` 定义或修改 API 接口
2. 后端 Agent 返回结果中**必须包含** API 路径、请求格式、响应格式
3. **编排者** 将 API 契约作为上下文传递给前端 Agent
4. 前端 Agent 按契约实现调用逻辑

## 5. 数据库变更协议

涉及 D1 schema 变更时：

1. `foyue-cloudflare` 负责创建迁移文件
2. `foyue-backend` 负责使用新 schema 的查询逻辑
3. 迁移文件编号必须递增（当前最新：0025）
4. **生产迁移执行（--remote）** 需要用户确认

## 6. 错误处理与回退

- 子 Agent 报告"需要其他 Agent 配合"时，编排者负责协调
- 子 Agent 发现自己需要修改禁区文件时，**应停止并报告**，不得越界
- 构建验证失败时，编排者根据错误信息判断归属，委派对应 Agent 修复
