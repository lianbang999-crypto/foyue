# Lucide SVG 图标库

顶级设计的开源 SVG 图标，来自 [Lucide](https://lucide.dev/)。设计简洁、一致，适合现代 UI。

## 已包含的图标

| 图标 | 用途 |
|------|------|
| home | 首页 |
| book-open | 有声书 |
| radio / headphones | 听经台 |
| user | 我的 |
| search | 搜索 |
| play / pause | 播放/暂停 |
| skip-back / skip-forward | 后退/前进 15 秒 |
| volume-2 | 音量 |
| repeat | 循环 |
| list / list-music | 播放列表 |
| heart | 随喜 |
| timer | 定时 |
| share / share-2 | 分享 |
| sparkles | AI |
| x | 关闭 |
| chevron-down / chevron-up | 展开/收起 |
| arrow-left / arrow-right | 前进/后退 |
| check / loader | 成功/加载 |
| mail / info / download | 联系/信息/下载 |

## 使用方式

### 1. 作为图片引用

```html
<img src="/icons/lucide/home.svg" alt="首页" width="24" height="24" />
```

### 2. 内联 SVG（可继承颜色）

复制 SVG 内容，移除 `width`/`height` 或设为 `currentColor` 继承父级颜色：

```html
<svg class="icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
  <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
</svg>
```

### 3. CSS 背景

```css
.icon-home {
  background-image: url('/icons/lucide/home.svg');
  background-size: contain;
  width: 24px;
  height: 24px;
}
```

## 更多图标

完整图标库（1900+）：`node_modules/lucide-static/icons/`

如需添加新图标：
```bash
cp node_modules/lucide-static/icons/图标名.svg public/icons/lucide/
```

## 许可证

Lucide Icons - ISC License  
https://lucide.dev/guide/packages/lucide-static
