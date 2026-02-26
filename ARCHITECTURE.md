# 技术架构

## 总体架构

```
用户浏览器
    ↓
Cloudflare Pages（托管 HTML/CSS/JS/JSON/图片）
    ↓
Cloudflare R2（存储 .mp3 音频文件）
```

纯静态前端应用，无后端 API、无数据库。所有用户数据存储在浏览器 localStorage 中。

未来演进方向：
```
前端 → Cloudflare Pages（HTML/CSS/JS）
后端 API → Cloudflare Workers
数据库 → Cloudflare D1
AI → Cloudflare Workers AI + AI Gateway
音频 → Cloudflare R2
```

---

## 多文件架构

项目已从单文件拆分为模块化多文件结构：

```
bojingji/
├── index.html           # HTML 结构（仅 DOM，不含 CSS 和 JS）
├── manifest.json        # PWA 配置
├── css/
│   └── style.css        # 全部样式（CSS 变量主题、组件样式）
├── js/
│   ├── app.js           # 入口，初始化和事件绑定
│   ├── data.js          # 数据加载（fetch audio-data.json）
│   ├── render.js        # 页面渲染（首页、分类、集数、我的）
│   ├── player.js        # 播放器核心逻辑
│   ├── player-ui.js     # 播放器 UI 控制（全屏播放器、手势）
│   ├── history.js       # 播放历史管理
│   ├── i18n.js          # 国际化（调用 lang/ 翻译文件）
│   ├── navigation.js    # 后退导航保护
│   ├── pwa.js           # PWA 安装引导
│   └── state.js         # 播放状态持久化（localStorage）
├── lang/
│   ├── zh.js            # 中文翻译
│   ├── en.js            # 英文翻译
│   └── fr.js            # 法文翻译
├── data/
│   └── audio-data.json  # 音频数据（专辑、集数、URL）
├── icons/               # 图标和图片
└── workers/             # （预留）Cloudflare Workers 后端代码
```

### 模块职责

| 模块 | 文件 | 职责 |
|------|------|------|
| 入口 | app.js | 应用初始化、事件绑定、模块协调 |
| 数据 | data.js | fetch 加载 audio-data.json，解析数据 |
| 渲染 | render.js | 首页、分类页、集数页、我的页面渲染 |
| 播放核心 | player.js | 音频播放控制、播放列表、循环模式 |
| 播放 UI | player-ui.js | 全屏播放器、手势交互、进度条 |
| 历史 | history.js | 播放历史的增删改查、localStorage 操作 |
| 国际化 | i18n.js | 翻译函数 t()、applyI18n()、语言切换 |
| 导航 | navigation.js | history.pushState 管理、后退保护 |
| PWA | pwa.js | 安装引导、beforeinstallprompt |
| 状态 | state.js | 播放状态保存/恢复（断点续播） |

---

## 核心模块详解

### 1. 路由与页面切换

没有使用前端路由框架。通过 Tab 切换控制页面：

```
Tab: 首页(home) | 有声书(yss) | [播放按钮] | 听经台(tingjingtai) | 我的(my)
```

- 点击 Tab → 调用 `renderCategory(tabId)` 或 `renderMyPage()` 或 `renderHomePage()`
- 内容渲染到 `#contentArea` 容器中
- 使用 `history.pushState` 管理后退行为

### 2. 数据流

```
audio-data.json
    ↓ fetch 加载（data.js）
audioData（全局变量）
    ↓
renderCategory()（render.js）→ 显示专辑列表
    ↓ 点击专辑
showEpisodes()（render.js）→ 显示集数列表
    ↓ 点击集数
playEpisode()（player.js）→ 开始播放
    ↓
<audio> 元素控制播放
    ↓
syncHistoryProgress()（history.js）→ 更新 localStorage 历史
```

### 3. 播放器

两种形态：
- **迷你播放器**（`#playerTrack`）：底部固定条，显示当前曲目 + 播放/暂停
- **全屏播放器**（`#expPlayer`）：全屏界面，显示完整控制（进度条、上/下一集、倍速、定时、播放列表）

全屏播放器交互（player-ui.js）：
- 下滑手势关闭（touchstart/touchmove/touchend）
- 双击左半区后退15秒，双击右半区前进15秒
- 进度条拖动时 thumb 放大 + 时间气泡

### 4. 历史记录

```
localStorage 'pl-history' = [
  {
    seriesId: "donglin-fohao",
    seriesTitle: "东林佛号",
    epIdx: 3,
    epTitle: "欣赏版（女声）",
    time: 32.5,          // 当前播放时间（秒）
    duration: 314,       // 总时长（秒）
    timestamp: 1708900000 // Unix 时间戳
  },
  ...
]
```

- 最多保存 20 条
- "我的"页面显示最近 3 条 + "查看全部"
- 弹层中可单条删除或一键清空

### 5. i18n 国际化

翻译文件在 `lang/` 目录下，每个语言一个文件：

```javascript
// lang/zh.js
const zh = { app_title: '净土法音', ... };

// lang/en.js
const en = { app_title: 'Pure Land Audio', ... };
```

`i18n.js` 中的核心函数：
- `t(key)` — 获取当前语言的翻译文本
- `applyI18n()` — 遍历所有 `data-i18n` 属性元素，替换文本

HTML 中通过 `data-i18n` 属性标记：
```html
<span data-i18n="app_title">净土法音</span>
```

### 6. 主题系统

CSS 变量定义在 `css/style.css` 中：

```css
:root {
  --bg: #FAF9F6;
  --text: #2D2D2D;
  --accent: #9A7B3C;
  ...
}
[data-theme="dark"] {
  --bg: #1A1A1A;
  --text: #E8E8E8;
  --accent: #C9A84C;
  ...
}
```

---

## 外部依赖

无 npm 包依赖。仅使用：
- Google Fonts（Noto Sans SC + Inter）通过 CDN 加载
- 浏览器原生 API（Audio、localStorage、History、Touch Events、Media Session）
