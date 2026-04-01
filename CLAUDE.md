# 净土法音 - 设计系统集成指南

> 本文档为 Figma 设计通过 Model Context Protocol (MCP) 集成到代码库的综合规则文档。

---

## 目录

1. [设计系统结构](#1-设计系统结构)
2. [Token 定义](#2-token-定义)
3. [组件库](#3-组件库)
4. [框架与库](#4-框架与库)
5. [资源管理](#5-资源管理)
6. [图标系统](#6-图标系统)
7. [样式方案](#7-样式方案)
8. [项目结构](#8-项目结构)
9. [Figma 集成规则](#9-figma-集成规则)

---

## 1. 设计系统结构

### 1.1 核心设计原则

- **Claude-like 美学** - 平静、克制的视觉风格
- **触摸友好** - 所有交互元素最小 44px
- **无障碍支持** - skip-link、ARIA 标签、键盘导航
- **性能优先** - 代码分割、懒加载、缓存策略
- **移动端优先** - 渐进增强桌面体验
- **主题一致性** - 完整的明暗双主题系统

### 1.2 设计系统文件组织

```
src/css/
├── tokens.css      # 设计 Token 定义（颜色、字体、间距）
├── reset.css       # CSS 重置与基础样式
├── ui.css          # 基础 UI 组件（按钮、图标）
├── layout.css      # 应用壳布局（header、tab-bar、player）
├── cards.css       # 卡片组件
├── pages.css       # 页面样式
├── player.css      # 播放器组件
├── components.css  # 通用组件（modal、toast、skeleton）
├── ai-page.css     # AI 页面样式
└── wenku-page.css  # 文库页面样式
```

---

## 2. Token 定义

### 2.1 Token 文件位置

**文件路径**: `src/css/tokens.css`

### 2.2 颜色系统

```css
:root {
  /* 背景色 */
  --bg: #F9F8F6;                    /* 主背景色 - 温暖的米白色 */
  --bg-secondary: #F3F1ED;          /* 次级背景 */
  --bg-card: #FFFFFF;               /* 卡片背景 */
  --bg-card-hover: #F3F1ED;         /* 卡片悬停背景 */
  --bg-header: rgba(249, 248, 246, 0.75);  /* 头部背景（毛玻璃） */
  --bg-player: rgba(249, 248, 246, 0.85);  /* 播放器背景 */
  
  /* 强调色 - 赤陶色系 */
  --accent: #D97757;                /* 主题强调色 */
  --accent-dim: rgba(217, 119, 87, 0.15);
  --accent-glow: rgba(217, 119, 87, 0.08);
  --accent-shadow: rgba(217, 119, 87, 0.25);
  
  /* 文字颜色 */
  --text: #1E1E1E;                  /* 主文字 */
  --text-secondary: rgba(30, 30, 30, 0.6);
  --text-muted: rgba(30, 30, 30, 0.35);
  --text-inverse: #FFFFFF;
  
  /* 边框与阴影 */
  --border: rgba(0, 0, 0, 0.04);
  --border-active: rgba(217, 119, 87, 0.25);
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 8px 32px rgba(0, 0, 0, 0.06);
}
```

### 2.3 深色主题

```css
[data-theme="dark"] {
  --bg: #1D1D1D;
  --bg-secondary: #252525;
  --bg-card: rgba(255, 255, 255, 0.04);
  --accent: #E0876B;
  --text: #E8E0D5;
  --text-secondary: rgba(232, 224, 213, 0.65);
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 8px 32px rgba(0, 0, 0, 0.35);
}
```

### 2.4 间距与圆角

```css
:root {
  /* 圆角系统 */
  --radius: 12px;       /* 标准圆角 */
  --radius-sm: 8px;     /* 小圆角 */
  --radius-lg: 20px;    /* 大圆角 */
  
  /* 布局变量 */
  --player-h: 72px;     /* 播放器高度 */
  --safe-bottom: env(safe-area-inset-bottom, 0px);  /* iOS 安全区 */
}
```

### 2.5 字体系统

```css
:root {
  --font-zh: 'Noto Sans SC', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  --font-en: 'DM Sans', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  --font-serif: 'Noto Serif SC', 'STSong', 'SimSun', serif;
}
```

**字体加载** (Google Fonts 镜像):
```html
<link href="https://fonts.loli.net/css2?family=Noto+Sans+SC:wght@400;500;600&family=Noto+Serif+SC:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap"
  rel="stylesheet" media="print" onload="this.media='all'">
```

### 2.6 Token 使用规则

| Token 类型 | 使用场景 | 示例 |
|-----------|---------|------|
| `--bg` | 页面主背景 | `background: var(--bg);` |
| `--bg-card` | 卡片、弹窗背景 | `background: var(--bg-card);` |
| `--accent` | 主要按钮、链接、高亮 | `color: var(--accent);` |
| `--text` | 正文文字 | `color: var(--text);` |
| `--text-secondary` | 次要文字、描述 | `color: var(--text-secondary);` |
| `--text-muted` | 辅助文字、时间戳 | `color: var(--text-muted);` |
| `--border` | 分割线、边框 | `border: 1px solid var(--border);` |
| `--shadow-sm` | 卡片阴影 | `box-shadow: var(--shadow-sm);` |
| `--radius` | 卡片圆角 | `border-radius: var(--radius);` |

---

## 3. 组件库

### 3.1 按钮组件

**文件路径**: `src/css/ui.css`

#### 基础按钮

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;              /* 触摸友好 */
  padding: 0 20px;
  border-radius: var(--radius-sm);
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
```

#### 按钮变体

| 类名 | 用途 | 样式特征 |
|-----|------|---------|
| `.btn-primary` | 主要操作 | 强调色背景、白色文字、阴影 |
| `.btn-secondary` | 次要操作 | 卡片背景、边框、浅阴影 |
| `.btn-ghost` | 透明按钮 | 无背景、次要文字色 |
| `.btn-danger` | 危险操作 | 红色文字、红色边框 |
| `.btn-icon` | 图标按钮 | 44x44px 圆形 |
| `.btn-pill` | 胶囊按钮 | 全圆角 |
| `.btn-sm` | 小按钮 | 32px 高度 |

#### HTML 示例

```html
<!-- 主要按钮 -->
<button class="btn btn-primary">
  <svg class="icon">...</svg>
  开始播放
</button>

<!-- 次要按钮 -->
<button class="btn btn-secondary">取消</button>

<!-- 图标按钮 -->
<button class="btn-icon" aria-label="设置">
  <svg class="icon">...</svg>
</button>
```

### 3.2 卡片组件

**文件路径**: `src/css/cards.css`

```css
.card {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--bg-card);
  border-radius: var(--radius);
  padding: 16px 18px;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: all .3s cubic-bezier(.22, 1, .36, 1);
}

.card:hover {
  background: var(--bg-card-hover);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
```

#### 卡片结构

```html
<div class="card">
  <div class="card-icon">
    <svg>...</svg>
  </div>
  <div class="card-body">
    <div class="card-title">标题</div>
    <div class="card-meta">元信息</div>
    <div class="card-intro">简介内容...</div>
  </div>
  <div class="card-arrow">
    <svg>...</svg>
  </div>
</div>
```

### 3.3 图标组件

```css
.icon {
  display: inline-block;
  width: 24px;
  height: 24px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.icon-sm { width: 20px; height: 20px; }
.icon-lg { width: 28px; height: 28px; }
```

### 3.4 播放器组件

**文件路径**: `src/css/player.css`

- 底部固定播放器
- 迷你模式 / 展开模式
- 播放控制、进度条、音量
- 播放列表展示

### 3.5 通用组件

**文件路径**: `src/css/components.css`

- Modal 弹窗
- Toast 提示
- Skeleton 骨架屏
- Loading 加载状态

---

## 4. 框架与库

### 4.1 技术栈概览

| 类别 | 技术 | 版本 |
|-----|------|------|
| 构建工具 | Vite | 6.0.0 |
| 开发语言 | Vanilla JavaScript (ES Modules) | - |
| 图标库 | Lucide Static | 0.577.0 |
| 二维码 | QRCode | 1.5.4 |
| 托管平台 | Cloudflare Pages | - |
| 数据库 | Cloudflare D1 | - |
| 对象存储 | Cloudflare R2 | - |
| AI 服务 | Cloudflare Workers AI | - |

### 4.2 构建配置

**文件路径**: `vite.config.js`

```javascript
export default defineConfig({
  build: {
    target: ['es2015', 'chrome64', 'safari12'],
    minify: 'esbuild',
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        admin: 'admin.html',
        ai: 'ai.html',
        wenku: 'wenku.html',
        nianfo: 'nianfo.html',
        gongxiu: 'gongxiu.html',
      },
      output: {
        manualChunks(id) {
          // 代码分割策略
          if (id.includes('/state.js')) return 'common';
          if (id.includes('/player.js')) return 'player';
          if (id.includes('/pages-home.js')) return 'pages';
        }
      }
    }
  }
});
```

### 4.3 多入口页面

| 入口 | 文件 | 用途 |
|-----|------|------|
| main | index.html | 主站（PWA） |
| admin | admin.html | 管理后台 |
| ai | ai.html | AI 问答 |
| wenku | wenku.html | 文库 |
| nianfo | nianfo.html | 念佛页面 |
| gongxiu | gongxiu.html | 共修页面 |

---

## 5. 资源管理

### 5.1 图片资源

**目录结构**:
```
public/
├── icons/           # PWA 图标、Logo
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── apple-touch-icon.png
│   └── lucide/      # Lucide 图标库 (SVG)
├── images/          # 应用图片
└── screenshots/     # PWA 截图

icons/               # Logo 源文件 (PNG/WebP)
```

### 5.2 图片优化策略

1. **格式优先**: WebP > PNG > JPG
2. **响应式图片**: 使用 `<picture>` 标签
3. **懒加载**: `loading="lazy"` 属性
4. **尺寸优化**: 提供多尺寸版本

### 5.3 CDN 配置

- 静态资源通过 Cloudflare Pages 自动 CDN
- 字体使用 Google Fonts 镜像 (fonts.loli.net)
- 音频文件存储在 Cloudflare R2

---

## 6. 图标系统

### 6.1 Lucide 图标库

**位置**: `public/icons/lucide/`

**可用图标** (33 个):
```
arrow-left, arrow-right, book-open, book, check,
chevron-down, chevron-up, circle, download, headphones,
heart, home, info, list-music, list, loader, mail,
music-2, pause, play, radio, repeat, search, share-2,
share, skip-back, skip-forward, sparkles, timer, user,
volume-2, x
```

### 6.2 图标使用方式

#### 内联 SVG

```html
<button class="btn-icon">
  <svg class="icon" viewBox="0 0 24 24">
    <path d="..."/>
  </svg>
</button>
```

#### 引用 Lucide 图标

```html
<img src="/icons/lucide/play.svg" class="icon" alt="播放">
```

### 6.3 图标命名规范

- 使用 kebab-case: `arrow-left`, `skip-back`
- 语义化命名: `play`, `pause`, `share`
- 尺寸后缀: 无后缀为 24px, `-sm` 为 20px, `-lg` 为 28px

---

## 7. 样式方案

### 7.1 CSS 方法论

- **CSS 变量优先**: 所有设计值使用 tokens.css 定义的变量
- **移动端优先**: 基础样式针对移动端，媒体查询增强桌面端
- **组件化**: 每个 CSS 文件负责特定功能域
- **命名规范**: kebab-case 类名，如 `.card`, `.card-title`

### 7.2 响应式断点

```css
/* 移动端优先，渐进增强 */

/* 小屏手机 (375px+) */
@media (min-width: 375px) { }

/* 大屏手机 (500px+) */
@media (min-width: 500px) {
  .series-list {
    grid-template-columns: 1fr 1fr;
  }
}

/* 平板 (768px+) */
@media (min-width: 768px) {
  .content {
    max-width: 900px;
    margin: 0 auto;
  }
}
```

### 7.3 安全区域适配

```css
/* iOS 底部安全区 */
.tab-bar {
  padding-bottom: var(--safe-bottom);
}

/* 动态视口高度 */
@supports (min-height: 100dvh) {
  body { min-height: 100dvh; }
}
```

### 7.4 主题切换

**JavaScript 实现** (`src/js/theme.js`):

```javascript
export function applyTheme() {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('pl-theme', theme);
}

export function toggleTheme() {
  theme = theme === 'light' ? 'dark' : 'light';
  applyTheme();
}
```

### 7.5 动画系统

#### 过渡曲线

```css
/* 标准过渡 */
transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);

/* 弹性过渡 */
transition: all 0.3s cubic-bezier(.22, 1, .36, 1);
```

#### 关键动画

```css
@keyframes breathe { }      /* 呼吸动画（加载） */
@keyframes viewIn { }       /* 视图进入 */
@keyframes eqBars { }       /* 音频均衡器 */
```

#### 减少动画偏好

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 7.6 国际化

**文件位置**: `src/locales/`
- `zh.json` - 中文
- `en.json` - 英文
- `fr.json` - 法文

**使用方式**:

```html
<span data-i18n="tab_home">首页</span>
<input data-i18n-placeholder="search_placeholder">
```

---

## 8. 项目结构

### 8.1 目录组织

```
foyue/
├── index.html              # 主站入口
├── admin.html              # 管理后台
├── ai.html                 # AI 问答
├── wenku.html              # 文库
├── nianfo.html             # 念佛
├── gongxiu.html            # 共修
├── package.json
├── vite.config.js
├── wrangler.toml           # Cloudflare 配置
│
├── src/
│   ├── css/               # 样式模块 (16 个文件)
│   ├── js/                # JavaScript 模块 (45 个文件)
│   └── locales/           # 国际化文件
│
├── public/
│   ├── icons/             # PWA 图标、Lucide 图标
│   ├── images/            # 图片资源
│   ├── manifest.json      # PWA 清单
│   └── sw.js              # Service Worker
│
├── icons/                  # Logo 源文件
├── functions/              # Cloudflare Pages Functions
├── workers/                # Cloudflare Workers
└── scripts/                # 工具脚本
```

### 8.2 JavaScript 模块组织

| 模块 | 职责 |
|-----|------|
| `main.js` | 应用入口、CSS 导入 |
| `state.js` | 全局状态管理 |
| `dom.js` | DOM 引用缓存 |
| `theme.js` | 主题切换 |
| `i18n.js` | 国际化 |
| `player.js` | 播放器核心 |
| `api.js` | API 请求 |
| `router.js` | 路由管理 |

---

## 9. Figma 集成规则

### 9.1 设计 Token 映射

当从 Figma 导出设计时，按以下规则映射到 CSS 变量：

| Figma Style | CSS Variable | 说明 |
|------------|--------------|------|
| Background/Main | `--bg` | 主背景 |
| Background/Secondary | `--bg-secondary` | 次级背景 |
| Background/Card | `--bg-card` | 卡片背景 |
| Accent/Primary | `--accent` | 强调色 |
| Text/Primary | `--text` | 主文字 |
| Text/Secondary | `--text-secondary` | 次要文字 |
| Text/Muted | `--text-muted` | 辅助文字 |
| Border/Default | `--border` | 边框 |
| Shadow/Small | `--shadow-sm` | 小阴影 |
| Shadow/Medium | `--shadow-md` | 中阴影 |
| Radius/Default | `--radius` | 圆角 |

### 9.2 组件命名映射

| Figma Component | CSS Class | 说明 |
|----------------|-----------|------|
| Button/Primary | `.btn.btn-primary` | 主要按钮 |
| Button/Secondary | `.btn.btn-secondary` | 次要按钮 |
| Button/Ghost | `.btn.btn-ghost` | 透明按钮 |
| Button/Icon | `.btn-icon` | 图标按钮 |
| Card/Default | `.card` | 卡片 |
| Icon/Small | `.icon-sm` | 小图标 |
| Icon/Default | `.icon` | 默认图标 |
| Icon/Large | `.icon-lg` | 大图标 |

### 9.3 颜色值转换规则

1. **Figma 颜色格式**: `#RRGGBB` 或 `rgba(r, g, b, a)`
2. **CSS 变量格式**: 保持原格式，添加到 `tokens.css`
3. **透明度处理**: 使用 `rgba()` 格式
4. **深色主题**: 在 `[data-theme="dark"]` 中定义对应变量

### 9.4 间距转换规则

| Figma Spacing | CSS Value | 说明 |
|--------------|-----------|------|
| 4px | `4px` | 极小间距 |
| 8px | `8px` | 小间距 |
| 12px | `12px` | 标准间距 |
| 16px | `16px` | 中间距 |
| 20px | `20px` | 大间距 |
| 24px | `24px` | 超大间距 |

### 9.5 字体映射规则

| Figma Text Style | CSS Variable | Weight |
|-----------------|--------------|--------|
| Heading/zh | `--font-zh` | 600 |
| Body/zh | `--font-zh` | 400 |
| Heading/en | `--font-en` | 600 |
| Body/en | `--font-en` | 400 |
| Serif | `--font-serif` | 500 |

### 9.6 图标导出规则

1. **格式**: SVG
2. **尺寸**: 24x24 (默认), 20x20 (small), 28x28 (large)
3. **属性**: `stroke-width: 1.5`, `stroke-linecap: round`
4. **存放位置**: `public/icons/lucide/`
5. **命名**: kebab-case，如 `arrow-left.svg`

### 9.7 组件导出检查清单

- [ ] 颜色使用 CSS 变量而非硬编码
- [ ] 间距使用 4px 倍数
- [ ] 圆角使用 `--radius` 系列
- [ ] 阴影使用 `--shadow-sm` 或 `--shadow-md`
- [ ] 字体使用 `--font-*` 变量
- [ ] 交互元素最小 44px
- [ ] 添加 hover/active 状态
- [ ] 支持深色主题
- [ ] 添加过渡动画

### 9.8 响应式设计规则

1. **移动端优先**: 基础样式针对 375px
2. **断点**: 375px, 500px, 768px
3. **布局**: Flexbox 为主，Grid 用于列表
4. **触摸友好**: 最小点击区域 44x44px
5. **安全区域**: 使用 `env(safe-area-inset-*)`

---

## 附录

### A. 常用 CSS 代码片段

#### 卡片样式

```css
.my-card {
  background: var(--bg-card);
  border-radius: var(--radius);
  padding: 16px;
  box-shadow: var(--shadow-sm);
  transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.my-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
```

#### 文字截断

```css
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

### B. 主题切换示例

```javascript
// 切换主题
import { toggleTheme } from './theme.js';
button.addEventListener('click', toggleTheme);

// 设置特定主题
import { setTheme } from './theme.js';
setTheme('dark');
```

### C. 国际化示例

```javascript
import { t, setLang } from './i18n.js';

// 获取翻译
const text = t('tab_home');

// 切换语言
setLang('en');
```

---

*文档版本: 1.0.0*
*最后更新: 2026-03-31*
