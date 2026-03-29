---
name: "UI/UX Design Guidelines"
description: "Use when designing, styling, or updating the UI/UX of the application. Enforces Claude-like calm aesthetics, touch-friendly PWA interactions, and minimalist modern design."
applyTo: "**/*.css, **/*.html, **/*.js"
---
# 净土法音 (Foyue) UI/UX Guidelines

## 整体美学 (Aesthetic)
- **宁静与极简 (Calm & Minimalist)**：结合佛教网站的宁静氛围与 Claude 风格的极简现代感。设计应留有充足的留白(whitespace)，减少不必要的边框和干扰性元素。
- **Claude 风格配色**：
  - **亮色模式**：主题背景使用柔和的奶油白/纸张色（如 `#F9F8F6` 或 `#F7F5F0`），文字使用深炭灰色（如 `#1E1E1E` 或 `#333333`）。
  - **强调色**：使用柔和温润的红棕色/陶土色（如 Claude 的 `#D97757` 类似色调）作为主按钮或点缀，避免使用高纯度饱和的霓虹色。
  - **暗色模式**：使用深邃而温暖的暗灰色背景（如 `#1D1D1D` 到 `#2D2D2D`），文字使用柔和的米色，避免纯黑（`#000000`）和纯白（`#FFFFFF`）带来的刺眼对比。

## 交互与 PWA 体验 (Touch-Friendly PWA)
- **触控友好 (Touch Targets)**：所有可点击元素（播放控制、按钮、列表项）的最小触控区域必须为 `44px` x `44px`。
- **平滑动画 (Fluid Animations)**：所有状态切换（悬停、点击、面板展开）应有顺滑的过渡效果（例如 `transition: all 0.2s ease-in-out`），避免生硬跳变。
- **手势操作**：支持和考虑移动端的自然交互（如下拉关闭、左右滑动切换等），滚动容器应当隐藏默认滚动条但保持丝滑滚动（`scroll-behavior: smooth`, `-webkit-overflow-scrolling: touch`）。
- **底栏 & 悬浮播放器**：悬浮组件（如底部播放器或导航）应使用毛玻璃效果（Glassmorphism，`backdrop-filter: blur(12px)` 与半透明背景色），与现代移动操作系统（如 iOS）的视觉体验保持一致。

## 排版与布局 (Typography & Layout)
- **层级清晰**：通过字重（font-weight）、大小、以及不同的柔和灰度文字区分标题、主文本、辅助信息。
- **舒适的阅读体验**：法音、文章内容的 `line-height` 应在 `1.6` 到 `1.8` 之间。
- **圆角与阴影**：卡片、弹窗与按钮使用统一的柔和圆角（如 `border-radius: 12px` 或 `8px`），阴影应大而极其柔和，避免生硬阴影。
