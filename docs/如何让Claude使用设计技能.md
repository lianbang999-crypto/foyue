# 如何让 Claude 使用设计技能重新设计网站 UI/UX

本项目已配置好设计技能和上下文。按以下方式与 Claude 对话，即可让 TA 使用这些技能。

---

## 一、项目已配置的内容

| 文件 | 作用 |
|------|------|
| `.impeccable.md` | 设计上下文：目标用户、品牌调性、技术约束 |
| `.cursor/rules/ui-ux-design.mdc` | 编辑 HTML/CSS 时自动提醒 Claude 使用设计技能 |
| `.claude/skills/impeccable` | Impeccable 技能 |
| `.claude/skills/ui-ux-pro-max` | UI/UX Pro Max 技能 |
| `.agents/skills/frontend-design` | Anthropic 官方 frontend-design 技能 |

---

## 二、推荐提示词（直接复制使用）

### 1. 全站 UI/UX 重设计（推荐）

```
请使用 frontend-design 和 Impeccable 技能，重新设计我们网站的 UI/UX。

先读取 .impeccable.md 了解设计上下文，然后：
1. 选定一个明确的美学方向（如禅意极简、古籍质感等）
2. 按 Impeccable 的排版、配色、动效准则改造
3. 避免 AI 通用美学（Inter 字体、紫色渐变、卡片套卡片等）

从首页 index.html 和 src/css/ 开始，逐步迭代。
```

### 2. 指定页面重设计

```
用 Impeccable 技能重新设计 [具体页面/组件]。

要求：
- 遵循 .impeccable.md 的品牌调性
- 使用 ui-ux-pro-max 的配色/字体参考
- 通过 AI Slop Test（不能让人一眼看出是 AI 做的）
```

### 3. 设计评审（先不写代码）

```
请用 Impeccable 的 /critique 命令，对当前 index.html 和主要 CSS 做 UX 评审。

指出：排版、配色、动效、交互、响应式方面的问题，并给出改进建议。
```

### 4. 局部优化

```
用 frontend-design 技能优化 [具体区域，如：播放器、导航栏、卡片列表]。

保持品牌调性，只改这一块，不要动其他部分。
```

### 5. 指定美学方向

```
我想把网站改成 [禅意极简 / 古籍质感 / 温和现代 / 其他] 风格。

请用 Impeccable 和 ui-ux-pro-max 技能，给出具体设计方案和代码实现。
先读 .impeccable.md，再动手。
```

---

## 三、在 Cursor 中的使用技巧

1. **@ 引用技能**：在输入框输入 `/` 可搜索技能，或输入 `@skill-name` 显式引用
2. **@ 引用文件**：`@.impeccable.md` 让 Claude 优先读取设计上下文
3. **规则自动触发**：编辑 `index.html` 或 `src/css/*.css` 时，`ui-ux-design` 规则会自动附加
4. **分步迭代**：先让 Claude 做 `/critique` 评审，再分模块逐步重设计，避免一次改太多

---

## 四、修改设计上下文

如需调整目标用户、品牌调性等，直接编辑 `.impeccable.md`。  
Claude 会在每次设计前读取该文件。

---

## 五、常见问题

**Q: Claude 说没找到技能？**  
A: 确认 Cursor 已重启或重新加载窗口后，技能会从 `.claude/skills/`、`.agents/skills/` 加载。

**Q: 设计风格不符合预期？**  
A: 在 `.impeccable.md` 中的「Brand Personality」和「Differentiation」部分写得更具体，例如：「希望像古籍排版，留白多，暖色纸质感」。

**Q: 想用 Impeccable 的 /audit 命令？**  
A: 在对话中直接写「请用 /audit 对当前页面做质量检查」即可。
