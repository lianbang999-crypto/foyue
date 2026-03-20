# 净土法音 - 项目说明

## gstack

使用 gstack 的 `/browse` 技能进行所有网页浏览，**不要使用** `mcp__claude-in-chrome__*` 工具。

### 可用技能

| 命令 | 用途 |
|------|------|
| `/office-hours` | 产品讨论、问题梳理 |
| `/plan-ceo-review` | CEO 视角评审功能 |
| `/plan-eng-review` | 工程架构评审 |
| `/plan-design-review` | 设计评审 |
| `/design-consultation` | 设计咨询 |
| `/design-review` | 设计评审 |
| `/review` | 代码审查 |
| `/ship` | 发布 PR |
| `/browse` | 网页浏览 |
| `/qa` | 端到端 QA |
| `/qa-only` | 仅 QA |
| `/retro` | 开发统计回顾 |
| `/investigate` | 问题排查 |
| `/document-release` | 发布文档 |
| `/setup-browser-cookies` | 配置浏览器 Cookie |
| `/codex` | Codex |
| `/careful` | 谨慎模式 |
| `/freeze` | 冻结 |
| `/guard` | 防护 |
| `/unfreeze` | 解冻 |
| `/gstack-upgrade` | 升级 gstack |

### 故障排除

若 gstack 技能无法使用，运行：

```bash
cd .claude/skills/gstack && ./setup
```

重新构建二进制并注册技能。
