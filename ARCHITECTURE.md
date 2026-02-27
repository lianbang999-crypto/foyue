# 技术架构

## 总体架构

```
用户浏览器
    ↓
Cloudflare Pages（托管 Vite 构建产物 + Pages Functions）
    ├── 静态资源 → dist/（HTML/CSS/JS/JSON/图标）
    ├── API 路由 → functions/api/（Pages Functions）
    ├── 数据库 → Cloudflare D1（foyue-db）
    └── 音频文件 → Cloudflare R2（4 个存储桶）
```

---

## 构建工具

使用 **Vite** 作为构建工具：
- 开发模式：`npm run dev`，自带 HMR 和 API 代理
- 生产构建：`npm run build`，输出到 `dist/`
- 目标浏览器：`es2020` + `safari14`
- 压缩：esbuild
- 静态资源：`public/` 目录直接复制到 `dist/`

---

## 文件架构

```
foyue/
├── index.html              # HTML 入口（仅 DOM 结构，265 行）
├── package.json            # 项目配置 + Vite 依赖
├── vite.config.js          # Vite 构建配置
├── wrangler.toml           # Cloudflare D1 绑定配置
├── public/                 # 静态资源（不经 Vite 处理）
│   ├── manifest.json       # PWA manifest
│   ├── robots.txt
│   ├── sitemap.xml
│   ├── data/audio-data.json
│   └── icons/              # logo.png, icon-192.png, icon-512.png, favicon.ico
├── src/
│   ├── css/                # CSS 模块（通过 main.js import）
│   │   ├── tokens.css      # CSS 自定义属性（浅色 + 深色主题）
│   │   ├── reset.css       # CSS Reset + body 默认值
│   │   ├── layout.css      # 应用壳（Header/TabBar/Content/Landscape）
│   │   ├── player.css      # 播放器（迷你 + 全屏 + 播放列表面板）
│   │   ├── cards.css       # 系列卡片 + 集数列表
│   │   ├── pages.css       # 首页 + 我的页面
│   │   └── components.css  # 加载/错误/弹窗/Toast/PWA引导
│   ├── js/                 # ES Module
│   │   ├── main.js         # 入口：初始化 + 事件绑定 + 数据加载
│   │   ├── state.js        # 共享可变状态对象
│   │   ├── dom.js          # DOM 元素引用（延迟初始化）
│   │   ├── i18n.js         # 国际化：detectLang/t/setLang/applyI18n
│   │   ├── theme.js        # 主题：isDark/toggleTheme/initTheme
│   │   ├── icons.js        # SVG 图标常量
│   │   ├── utils.js        # 工具：fmt/showToast/seekAt
│   │   ├── history.js      # 播放历史（localStorage）
│   │   ├── player.js       # 播放器核心（~350行）
│   │   ├── search.js       # 搜索功能
│   │   ├── pwa.js          # PWA 安装引导 + 后退保护
│   │   ├── pages-home.js   # 首页渲染（每日一句/佛号卡片/继续收听/推荐）
│   │   ├── pages-my.js     # "我的"页面渲染（历史/设置/关于）
│   │   └── pages-category.js # 分类列表 + 集数列表渲染
│   └── locales/            # i18n 翻译文件（JSON）
│       ├── zh.json         # 中文
│       ├── en.json         # English
│       └── fr.json         # Français
├── functions/              # Cloudflare Pages Functions
│   └── api/[[path]].js     # 通配路由：/api/* 的统一处理
└── dist/                   # Vite 构建输出（.gitignore 忽略）
```

---

## 模块依赖关系

```
main.js（入口）
  ├── CSS imports（tokens → reset → layout → player → cards → pages → components）
  ├── state.js ← 几乎所有模块依赖
  ├── dom.js ← 需要 DOM 引用的模块依赖
  ├── i18n.js
  ├── theme.js
  ├── utils.js
  ├── icons.js ← pages-*.js 和 player.js 依赖
  ├── history.js ← player.js 依赖
  ├── player.js（核心，依赖 state/dom/i18n/icons/history/utils）
  ├── search.js
  ├── pwa.js
  ├── pages-home.js → 动态 import pages-category.js（避免循环依赖）
  ├── pages-my.js
  └── pages-category.js
```

---

## 模块职责

| 模块 | 文件 | 职责 |
|------|------|------|
| 入口 | main.js | 应用初始化、事件绑定、数据加载（fetch + retry）、首次默认播放 |
| 状态 | state.js | 共享状态对象：data/tab/seriesId/epIdx/playlist/loopMode |
| DOM | dom.js | DOM 元素引用缓存，延迟初始化，RING_CIRCUMFERENCE 常量 |
| 国际化 | i18n.js | 语言检测/切换，翻译函数 t()，applyI18n() 批量更新 DOM |
| 主题 | theme.js | 浅色/深色切换，读写 localStorage + data-theme 属性 |
| 图标 | icons.js | SVG 字符串常量，避免内联 SVG 重复 |
| 工具 | utils.js | 时间格式化 fmt()、Toast 提示、进度条 seek |
| 历史 | history.js | 播放历史 CRUD（localStorage 'pl-history'，最多 20 条） |
| 播放核心 | player.js | playList/togglePlay/prev/next/loop/speed/timer/media session/save/restore |
| 搜索 | search.js | 全局搜索，模糊匹配系列和集数 |
| PWA | pwa.js | 安装引导（beforeinstallprompt/iOS 检测）、后退导航保护 |
| 首页 | pages-home.js | 每日一句、佛号横滚卡片、继续收听、推荐系列 |
| 我的 | pages-my.js | 播放历史列表、语言/主题设置、关于弹窗、PWA 安装引导 |
| 分类 | pages-category.js | 分类系列列表 + 集数列表 + 当前播放高亮 |

---

## 核心流程

### 1. 路由与页面切换

无前端路由框架。通过 Tab 切换控制页面：

```
Tab: 首页(home) | 有声书(youshengshu) | [播放按钮] | 听经台(tingjingtai) | 我的(mypage)
```

- 点击 Tab → 更新 `state.tab`，调用对应的 render 函数
- 内容渲染到 `#contentArea` 容器中
- 使用 `history.pushState` 管理后退行为

### 2. 数据流

```
/data/audio-data.json
    ↓ fetch 加载（main.js loadData，带 3 次重试）
state.data（内存缓存）
    ↓
renderCategory() → 显示系列卡片
    ↓ 点击系列
showEpisodes() → 显示集数列表
    ↓ 点击集数
playList() → 开始播放
    ↓
<audio> 元素控制
    ↓
syncHistoryProgress() → 更新 localStorage 历史
```

### 3. 播放器

两种形态：
- **迷你播放器**（`#playerBar`）：底部固定条，播放/暂停/上下曲
- **全屏播放器**（`#expPlayer`）：完整界面，进度条/上下曲/倍速/定时/播放列表

全屏播放器特殊交互：
- 进度条拖动时 thumb 放大 + 时间气泡
- 键盘：Space 播放/暂停，← → 快进快退 10s

### 4. 状态持久化

```
localStorage 'pl-state' = {
  epIdx, playlist, loopMode, currentTime, tab, seriesId, speed
}

localStorage 'pl-history' = [
  { seriesId, seriesTitle, epIdx, epTitle, time, duration, timestamp, url }
]

localStorage 'pl-lang'  = "zh" | "en" | "fr"
localStorage 'pl-theme' = "light" | "dark"
```

### 5. 主题系统

CSS 变量定义在 `tokens.css`：

```css
:root {
  --bg: #FAF9F6;
  --text: #2D2D2D;
  --accent: #9A7B3C;
  /* ... */
}
[data-theme="dark"] {
  --bg: #1A1A1A;
  --text: #E8E8E8;
  --accent: #C9A84C;
  /* ... */
}
```

### 6. i18n 国际化

翻译文件在 `src/locales/` 下（JSON 格式，Vite 直接 import）。

`i18n.js` 核心函数：
- `t(key)` — 获取当前语言翻译
- `applyI18n()` — 遍历 `[data-i18n]` 元素更新文本
- `setLang(l, cb)` — 切换语言并回调刷新

HTML 中通过 `data-i18n` 标记：
```html
<span data-i18n="tab_home">首页</span>
```

---

## 后端 API

使用 Cloudflare Pages Functions（`functions/api/[[path]].js`），通配路由处理所有 `/api/*` 请求。

已实现端点：
- `GET /api/categories` — 获取所有分类
- `GET /api/series?category_id=` — 获取系列列表
- `GET /api/episodes?series_id=` — 获取集数列表
- `POST /api/play-count` — 记录播放
- `POST /api/appreciate` — 随喜功能
- `GET /api/stats` — 统计数据

数据库绑定通过 `wrangler.toml` 配置 D1 `foyue-db`。

---

## 构建产物

`npm run build` 输出到 `dist/`：
- `index.html`（~14 KB）
- `assets/index-*.css`（~31 KB，gzip ~6 KB）
- `assets/index-*.js`（~51 KB，gzip ~17 KB）
- `public/` 中的静态文件直接复制

---

## 外部依赖

仅一个 npm 依赖：`vite`（开发依赖）。

运行时依赖（CDN）：
- Google Fonts（Noto Sans SC + DM Sans）

浏览器 API：
- Audio / Media Session
- localStorage
- History API
- Touch Events
- Navigator.connection（网络感知）
