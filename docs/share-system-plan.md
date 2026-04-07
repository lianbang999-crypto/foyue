# 全站分享功能统一规划

> 创建日期：2026-04-06
> 状态：规划中
> 优先级：P1

---

## 1. 目标

将全站分享功能统一为**一套组件 + 一套 API**，覆盖所有分享场景：
- 统一的底部分享面板 UI
- 所有场景生成极简风格海报
- 微信自定义分享卡片适配
- 保留 Web Share API 原生分享能力

## 2. 现状分析

### 已有分享

| 场景 | 实现 | 问题 |
|------|------|------|
| 播放器-单集 | `shareTrack()` → `shareContent()` | 只分享链接，无海报 |
| 分类页-系列 | `shareSeries()` → `shareContent()` | 只分享链接，无海报 |
| 念佛计数 | `counter-share.js` 独立海报 | 独立实现，不可复用 |
| AI 复制 | `_aiCopy()` 独立实现 | 未复用 utils.js |

### 缺失分享

| 场景 | 需要 |
|------|------|
| 共修广场 | 分享修行记录/统计海报 |
| AI 对话 | 分享精彩问答 |
| 首页推荐 | 分享推荐系列 |
| 每日法语 | 分享法语海报 |

### 后端支撑

- `/share/{seriesId}/{epNum}` — 已有 OG 标签 + 重定向
- 需扩展：`/share/quote/{id}`, `/share/practice/{date}`, `/share/ai/{id}`

---

## 3. 架构设计

### 3.1 分层架构

```
┌──────────────────────────────────────────┐
│          SharePanel（UI 组件）           │  ← 统一底部面板
├──────────────────────────────────────────┤
│     SharePoster（海报生成引擎）          │  ← Canvas 渲染
├──────────────────────────────────────────┤
│      share-utils.js（基础工具）          │  ← Web Share / Clipboard
├──────────────────────────────────────────┤
│   /share/* Functions（OG 标签后端）      │  ← 社交媒体爬虫
└──────────────────────────────────────────┘
```

### 3.2 文件规划

| 文件 | 职责 | Agent |
|------|------|-------|
| `src/js/share-panel.js` | 统一分享面板 UI | foyue-frontend |
| `src/js/share-poster.js` | 海报生成引擎 | foyue-frontend |
| `src/css/share.css` | 分享组件样式 | foyue-frontend |
| `src/js/utils.js` | 保留 `shareContent()` `shareImageBlob()` | foyue-frontend |
| `functions/share/[[path]].js` | OG 标签扩展 | foyue-backend |

### 3.3 废弃文件

| 现有文件 | 处理 |
|---------|------|
| `src/js/counter-share.js` | 迁移到 share-poster.js，删除 |
| `ai-app.js._aiCopy()` | 改用 share-utils |

---

## 4. 分享面板 UI 设计

### 4.1 底部面板（Bottom Sheet）

```
┌─────────────────────────────────────┐
│                                     │
│   ─────  (拖拽条)                   │
│                                     │
│   [海报预览区 — 极简风格]           │
│                                     │
│   ┌─────┐  ┌─────┐  ┌─────┐       │
│   │ 微信 │  │ 朋友圈│  │复制链接│   │  ← 分享目标
│   └─────┘  └─────┘  └─────┘       │
│   ┌─────┐  ┌─────┐  ┌─────┐       │
│   │保存图│  │更多  │  │     │       │
│   └─────┘  └─────┘  └─────┘       │
│                                     │
│   [取消]                            │
│                                     │
└─────────────────────────────────────┘
```

### 4.2 图标选用

从 Iconify 获取，统一使用 Lucide 风格：
- 微信分享：`ri:wechat-line` 或自绘简笔微信图标
- 朋友圈：`ri:wechat-2-line`
- 复制链接：`lucide:link`
- 保存图片：`lucide:download`
- 更多分享：`lucide:share-2`

### 4.3 交互

- 点击分享按钮 → 面板从底部滑入（200ms ease-out）
- 海报在面板打开时异步生成
- 背景遮罩 + 点击关闭
- iOS 安全区适配（`safe-area-inset-bottom`）

---

## 5. 海报设计

### 5.1 设计风格

**极简禅意** — 与水墨首页方案一致

```
┌─────────────────────────────────┐
│       净土法音                   │  ← 小 logo + 品牌名
│                                 │
│                                 │
│                                 │
│   《观经四帖疏》                │  ← 大标题，Noto Serif SC
│    第3讲 · 善导大师              │  ← 副标题
│                                 │
│                                 │
│   得生与否，全由信愿之有无       │  ← 可选：法语/摘要
│   品位高下，全由持名之深浅       │
│                                 │
│                                 │
│   ┌──────┐                     │
│   │ QR码 │  扫码收听            │  ← 分享链接二维码
│   └──────┘  foyue.org           │
│                                 │
└─────────────────────────────────┘
```

### 5.2 海报色彩方案

| 元素 | 色值 | 说明 |
|------|------|------|
| 背景 | `#F7F5F0` | 宣纸底色 |
| 标题 | `#2D2824` | 焦墨 |
| 副标题 | `rgba(45,40,36,.5)` | 淡墨 |
| 品牌色 | `#C04B2D` | 朱砂红 |
| QR 暗色 | `#2D2824` | 与文字统一 |
| 边框装饰 | 无 | 纯留白 |

### 5.3 海报尺寸

| 用途 | 尺寸 | 比例 |
|------|------|------|
| 朋友圈 | 750×1334 px | 约 9:16 |
| 微信好友 | 750×750 px | 1:1 |
| 通用 | 750×1000 px | 3:4 |

默认使用 750×1000，朋友圈模式可切换。

### 5.4 海报变体

| 场景 | 内容 | 特殊元素 |
|------|------|---------|
| **单集** | 系列名 + 集名 + 法师名 | 播放进度（可选） |
| **系列** | 系列名 + 集数 + 简介 | 系列封面（如有） |
| **法语** | 法语原文 + 出处 | 居中大字，最小元素 |
| **念佛** | 今日计数 + 累计 | 念珠装饰 |
| **共修** | 修行名称 + 统计 | 参与人数 |
| **AI 问答** | 问题 + 精选答案 | AI ☸ 标记 |

---

## 6. 微信适配

### 6.1 微信 JSSDK

需要后端签名接口：

```
Backend:
  GET /api/wx/jsconfig?url={currentUrl}
  → { appId, timestamp, nonceStr, signature }

Frontend:
  wx.config({...})
  wx.ready(() => {
    wx.updateAppMessageShareData({...})    // 分享给朋友
    wx.updateTimelineShareData({...})      // 分享到朋友圈
  })
```

### 6.2 需要的微信配置

- 微信公众号 AppID + Secret
- JS 安全域名配置：`foyue.org`
- IP 白名单（Workers?）

### 6.3 降级策略

- 非微信环境：直接 Web Share API + 海报
- 微信但未配置 JSSDK：默认分享（取 OG 标签）
- 微信 + JSSDK：自定义标题、描述、图片

**⚠️ 微信 JSSDK 需要公众号配置，列为 Phase 2**

---

## 7. 统一 Share API 设计

### 7.1 调用方式

```js
import { showSharePanel } from './share-panel.js';

// 分享单集
showSharePanel({
  type: 'track',
  title: '《观经四帖疏》第3讲',
  subtitle: '善导大师',
  url: '/share/guanjingsitieshu/3',
  quote: '得生与否，全由信愿之有无',  // 可选
  image: null,  // 系列封面 URL（如有）
});

// 分享法语
showSharePanel({
  type: 'quote',
  title: '每日法语',
  quote: '得生与否，全由信愿之有无\n品位高下，全由持名之深浅',
  author: '蕅益大师',
  url: '/share/quote/20260406',
});

// 分享念佛计数
showSharePanel({
  type: 'practice',
  title: '今日念佛',
  count: 10800,
  totalCount: 1234567,
  practice: '念佛',
  url: 'https://foyue.org/nianfo',
});
```

### 7.2 面板选项

面板根据 `type` 自动显示合适的选项：

| 选项 | 所有类型 | 说明 |
|------|---------|------|
| 生成海报 | ✅ | 默认第一个选项 |
| 微信好友 | ✅ | Web Share API / 微信 JSSDK |
| 复制链接 | ✅ | Clipboard API |
| 保存图片 | ✅ | 下载海报到本地 |

---

## 8. 实施计划

### Phase 1（核心组件）— 预计 2-3 个工作日

| 步骤 | 任务 | Agent |
|------|------|-------|
| 1 | 创建 `share-panel.js` + `share.css` | foyue-frontend |
| 2 | 创建 `share-poster.js` — Canvas 海报引擎 | foyue-frontend |
| 3 | 播放器分享 → 接入新面板 | foyue-frontend |
| 4 | 分类页分享 → 接入新面板 | foyue-home |
| 5 | 小迁移：`counter-share.js` 改用新海报引擎 | foyue-nianfo |

### Phase 2（扩展场景）

| 步骤 | 任务 | Agent |
|------|------|-------|
| 6 | 法语海报分享（首页法语卡片） | foyue-home |
| 7 | AI 问答分享 | foyue-ai |
| 8 | 共修广场分享 | foyue-gongxiu |

### Phase 3（微信适配）

| 步骤 | 任务 | Agent |
|------|------|-------|
| 9 | 后端：`/api/wx/jsconfig` 签名接口 | foyue-backend |
| 10 | 前端：微信 JSSDK 集成 | foyue-frontend |
| 11 | WeChat 自定义分享卡片 | foyue-frontend |

### Phase 4（体验优化）

| 步骤 | 任务 |
|------|------|
| 12 | 海报模板选择（多种风格） |
| 13 | 分享统计（后端记录分享次数） |
| 14 | 海报缓存（避免重复生成） |

---

## 9. 海报渲染技术方案

### Canvas 渲染（推荐）

```js
// share-poster.js
export async function generatePoster(config) {
  const canvas = document.createElement('canvas');
  canvas.width = 750;
  canvas.height = 1000;
  const ctx = canvas.getContext('2d');

  // 1. 背景
  ctx.fillStyle = '#F7F5F0';
  ctx.fillRect(0, 0, 750, 1000);

  // 2. 品牌 Logo + 名称
  // 3. 标题（Noto Serif SC）
  // 4. 副标题
  // 5. 法语/引文
  // 6. QR 码
  // 7. foyue.org

  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}
```

### 字体加载

Canvas 需要字体已加载才能正确渲染：
```js
await document.fonts.load('600 24px "Noto Serif SC"');
await document.fonts.load('400 16px "Noto Sans SC"');
```

### QR 码

继续使用现有 `qrcode` 依赖（package.json 已有）。

---

## 10. 不做的事

- ❌ 不做微博/抖音等小众平台适配（Web Share API 已覆盖）
- ❌ 不做海报编辑器（用户不能自定义布局）
- ❌ 不做服务端海报渲染（纯客户端 Canvas）
- ❌ Phase 1 不引入新依赖

---

## 附：图标参考

从 Iconify 获取（better-icons CLI）：
```bash
better-icons search share --prefix lucide --limit 5
better-icons search wechat --prefix ri --limit 5
better-icons search download --prefix lucide --limit 5
better-icons search link --prefix lucide --limit 5
better-icons search image --prefix lucide --limit 5
```
