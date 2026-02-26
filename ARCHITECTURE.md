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

---

## 单文件架构

当前所有代码在 `index.html` 中（约2400行），结构：

```
┌─────────────────────────────────────┐
│  <head>                             │
│  - meta 标签、字体加载、manifest     │
├─────────────────────────────────────┤
│  <style>  （约600行）               │
│  - CSS 变量（主题）                  │
│  - 组件样式（按功能分块）            │
├─────────────────────────────────────┤
│  <body>  HTML 结构 （约100行）      │
│  - 导航栏、Tab栏、内容区            │
│  - 迷你播放器、全屏播放器            │
│  - 弹层（About、历史）              │
│  - Toast 提示                       │
├─────────────────────────────────────┤
│  <script> i18n （约250行）          │
│  - zh/en/fr 三语翻译对象             │
│  - t() 翻译函数                     │
│  - applyI18n() 应用翻译到 DOM        │
├─────────────────────────────────────┤
│  <script> 主逻辑 （约1400行）       │
│  - 数据加载与解析                    │
│  - Tab 切换与页面路由                │
│  - 各页面渲染函数                    │
│  - 播放器控制                        │
│  - 历史记录管理                      │
│  - 手势与交互                        │
│  - 事件绑定与初始化                  │
└─────────────────────────────────────┘
```

---

## 核心模块

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
    ↓ fetch 加载
audioData（全局变量）
    ↓
renderCategory() → 显示专辑列表
    ↓ 点击专辑
showEpisodes() → 显示集数列表
    ↓ 点击集数
playEpisode() → 开始播放
    ↓
<audio> 元素控制播放
    ↓
syncHistoryProgress() → 更新 localStorage 历史
```

### 3. 播放器

两种形态：
- **迷你播放器**（`#playerTrack`）：底部固定条，显示当前曲目 + 播放/暂停
- **全屏播放器**（`#expPlayer`）：全屏界面，显示完整控制（进度条、上/下一集、倍速、定时、播放列表）

全屏播放器交互：
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

```javascript
const i18n = {
  zh: { app_title: '净土法音', ... },
  en: { app_title: 'Pure Land Audio', ... },
  fr: { app_title: 'Audio Terre Pure', ... }
};

function t(key) { return i18n[currentLang][key] || key; }
```

HTML 中通过 `data-i18n` 属性标记：
```html
<span data-i18n="app_title">净土法音</span>
```

调用 `applyI18n()` 时自动替换所有标记元素的文本。

### 6. 主题系统

CSS 变量定义在 `:root`（浅色）和 `[data-theme="dark"]`（深色）：

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

## 关键函数索引

| 函数 | 位置 | 作用 |
|------|------|------|
| `renderHomePage()` | JS 主逻辑 | 渲染首页（推荐内容） |
| `renderCategory(id)` | JS 主逻辑 | 渲染分类页（专辑列表） |
| `showEpisodes(series)` | JS 主逻辑 | 渲染集数列表 |
| `renderMyPage()` | JS 主逻辑 | 渲染"我的"页面 |
| `playEpisode(series, idx)` | JS 主逻辑 | 播放指定集数 |
| `openExpPlayer()` | JS 主逻辑 | 打开全屏播放器 |
| `closeExpPlayer()` | JS 主逻辑 | 关闭全屏播放器 |
| `renderHistoryOverlay()` | JS 主逻辑 | 渲染历史弹层内容 |
| `removeHistoryItem(idx)` | JS 主逻辑 | 删除单条历史 |
| `clearHistory()` | JS 主逻辑 | 清空所有历史 |
| `syncHistoryProgress()` | JS 主逻辑 | 同步播放进度到历史记录 |
| `saveState()` / `loadState()` | JS 主逻辑 | 保存/恢复播放状态 |
| `t(key)` | i18n 部分 | 获取翻译文本 |
| `applyI18n()` | i18n 部分 | 应用翻译到所有 DOM 元素 |
| `showToast(msg)` | JS 主逻辑 | 显示底部提示消息 |

---

## 外部依赖

无 npm 包依赖。仅使用：
- Google Fonts（Noto Sans SC + Inter）通过 CDN 加载
- 浏览器原生 API（Audio、localStorage、History、Touch Events）
