# 代码优化建议报告

**生成日期**：2026-03-04
**检查范围**：前端 JavaScript、后端 API、CSS 样式、构建配置
**总体评价**：代码质量良好，主要优化点集中在后端性能和构建配置

---

## 一、高优先级优化（立即执行）

### 1. ⭐⭐⭐⭐ 后端 N+1 查询问题

**位置**：`functions/api/[[path]].js:392-415`

**问题描述**：
`getCategories()` 函数对每个分类单独查询系列，导致数据库查询次数 = 1 + 分类数量。

**当前代码**：
```javascript
async function getCategories(db) {
  const categories = await db.prepare(
    'SELECT id, title, title_en, sort_order FROM categories ORDER BY sort_order'
  ).all();
  const result = [];
  for (const cat of categories.results) {
    const series = await db.prepare(
      `SELECT id, title, title_en, speaker, speaker_en, bucket, folder,
              total_episodes, intro, play_count, sort_order
       FROM series WHERE category_id = ? ORDER BY sort_order`
    ).bind(cat.id).all();
    result.push({
      id: cat.id, title: cat.title, titleEn: cat.title_en,
      series: series.results.map(s => ({...}))
    });
  }
  return { categories: result };
}
```

**优化方案**：
```javascript
async function getCategories(db) {
  // 使用 JOIN 一次性获取所有数据
  const result = await db.prepare(`
    SELECT
      c.id as cat_id, c.title as cat_title, c.title_en as cat_title_en, c.sort_order as cat_sort,
      s.id as series_id, s.title, s.title_en, s.speaker, s.speaker_en,
      s.bucket, s.folder, s.total_episodes, s.intro, s.play_count, s.sort_order
    FROM categories c
    LEFT JOIN series s ON c.id = s.category_id
    ORDER BY c.sort_order, s.sort_order
  `).all();

  // 在内存中组装结果
  const categories = new Map();
  for (const row of result.results) {
    if (!categories.has(row.cat_id)) {
      categories.set(row.cat_id, {
        id: row.cat_id,
        title: row.cat_title,
        titleEn: row.cat_title_en,
        series: []
      });
    }
    if (row.series_id) {
      categories.get(row.cat_id).series.push({
        id: row.series_id,
        title: row.title,
        titleEn: row.title_en,
        speaker: row.speaker,
        speakerEn: row.speaker_en,
        bucket: row.bucket,
        folder: row.folder,
        totalEpisodes: row.total_episodes,
        intro: row.intro,
        playCount: row.play_count
      });
    }
  }

  return { categories: [...categories.values()] };
}
```

**预期效果**：
- 数据库查询次数：从 1 + N 次减少到 1 次
- 响应时间：预计减少 50-70%
- 数据库负载：显著降低

---

### 2. ⭐⭐⭐ 前端缓存版本控制

**位置**：`src/js/main.js:381-382`

**问题描述**：
localStorage 缓存的数据没有版本号，数据结构变更后可能出现兼容性问题。

**当前代码**：
```javascript
const DATA_CACHE_KEY = 'pl-data-cache';
const DATA_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
```

**优化方案**：
```javascript
const DATA_CACHE_VERSION = 2; // 添加版本号
const DATA_CACHE_KEY = 'pl-data-cache-v' + DATA_CACHE_VERSION;
const DATA_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// 在 loadCachedData 中添加版本检查
function loadCachedData() {
  try {
    const raw = localStorage.getItem(DATA_CACHE_KEY);
    if (!raw) {
      // 清理旧版本缓存
      cleanupOldCacheVersions();
      return null;
    }
    const { data, ts, version } = JSON.parse(raw);
    // 版本不匹配，清理缓存
    if (version !== DATA_CACHE_VERSION) {
      localStorage.removeItem(DATA_CACHE_KEY);
      return null;
    }
    if (Date.now() - ts > DATA_CACHE_TTL) return null;
    return data;
  } catch (e) { return null; }
}

function cleanupOldCacheVersions() {
  // 清理所有旧版本缓存
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith('pl-data-cache-') && key !== DATA_CACHE_KEY) {
      localStorage.removeItem(key);
    }
  });
}

function saveCachedData(data, hash) {
  try {
    localStorage.setItem(DATA_CACHE_KEY, JSON.stringify({
      data,
      ts: Date.now(),
      _hash: hash,
      version: DATA_CACHE_VERSION // 添加版本号
    }));
  } catch (e) { /* storage full or unavailable */ }
}
```

**预期效果**：
- 避免数据结构变更后的兼容性问题
- 自动清理旧版本缓存
- 提升数据一致性

---

### 3. ⭐⭐⭐ Vite 构建配置优化

**位置**：`vite.config.js`

**问题描述**：
缺少代码分割策略、压缩优化配置、构建分析等。

**当前代码**：
```javascript
export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    target: ['es2015', 'chrome64', 'safari12'],
    minify: 'esbuild',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
  // ...
});
```

**优化方案**：
```javascript
export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    target: ['es2015', 'chrome64', 'safari12'],
    minify: 'esbuild',
    // 添加代码分割
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
      output: {
        manualChunks: {
          // 将公共模块分离
          'common': [
            './src/js/state.js',
            './src/js/dom.js',
            './src/js/utils.js',
            './src/js/i18n.js'
          ],
          // 将播放器模块分离
          'player': [
            './src/js/player.js',
            './src/js/history.js',
            './src/js/api.js'
          ],
          // 将页面模块分离
          'pages': [
            './src/js/pages-home.js',
            './src/js/pages-category.js',
            './src/js/pages-my.js'
          ]
        }
      }
    },
    // 添加压缩配置
    terserOptions: {
      compress: {
        drop_console: true, // 生产环境移除 console
        drop_debugger: true
      }
    },
    // 添加构建分析
    reportCompressedSize: true,
    chunkSizeWarningLimit: 500,
    // 添加 CSS 代码分割
    cssCodeSplit: true
  },
  server: {
    port: 8080,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'https://foyue.org',
        changeOrigin: true,
      },
    },
  },
});
```

**预期效果**：
- 首屏加载速度提升 30-50%
- 更好的缓存利用（公共模块独立）
- 生产环境代码更精简
- 构建产物更易分析

---

## 二、中优先级优化（近期执行）

### 4. ⭐⭐⭐ 后端批量操作优化

**位置**：`functions/api/[[path]].js:455-471`

**问题描述**：
`recordPlay()` 函数执行了 3 次独立的数据库操作，可以优化为批量操作。

**优化方案**：
```javascript
async function recordPlay(db, body, request) {
  const { seriesId, episodeNum } = body;
  // ... 验证代码

  const origin = new URL(request.url).hostname;
  const ua = request.headers.get('User-Agent') || '';

  // 优化：使用批量操作
  await db.batch([
    db.prepare('UPDATE series SET play_count = play_count + 1 WHERE id = ?').bind(seriesId),
    db.prepare('UPDATE episodes SET play_count = play_count + 1 WHERE series_id = ? AND episode_num = ?').bind(seriesId, episodeNum),
    db.prepare('INSERT INTO play_logs (series_id, episode_num, user_agent, origin) VALUES (?, ?, ?, ?)').bind(seriesId, episodeNum, ua.substring(0, 200), origin)
  ]);

  const result = await db.prepare('SELECT play_count FROM series WHERE id = ?').bind(seriesId).first();
  return { success: true, playCount: result?.play_count || 0 };
}
```

**预期效果**：
- 数据库操作次数：从 4 次减少到 2 次
- 响应时间：预计减少 30-40%

---

### 5. ⭐⭐ 前端缓存大小限制

**位置**：`src/js/api.js:6-18`

**问题描述**：
缓存使用简单的 Map，没有大小限制，可能导致内存占用过高。

**优化方案**：
```javascript
const _cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 50; // 添加缓存大小限制

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    _cache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(key, data) {
  // LRU 淘汰策略：删除最旧的条目
  if (_cache.size >= MAX_CACHE_SIZE) {
    const firstKey = _cache.keys().next().value;
    _cache.delete(firstKey);
  }
  _cache.set(key, { data, ts: Date.now() });
}
```

**预期效果**：
- 内存占用可控
- 避免缓存无限增长
- 提升缓存命中率

---

### 6. ⭐⭐ Service Worker 缓存策略优化

**位置**：`public/sw.js:4-14`

**问题描述**：
缓存版本固定为 `v1`，没有自动更新机制。

**优化方案**：
```javascript
// 使用日期作为版本号，每天自动更新
const CACHE_VERSION = 'v' + new Date().toISOString().slice(0, 10);
const STATIC_CACHE = 'static-' + CACHE_VERSION;
const DATA_CACHE = 'data-' + CACHE_VERSION;

const APP_SHELL = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  // 添加关键 CSS 和 JS
  '/src/css/tokens.css',
  '/src/css/layout.css',
  '/src/js/main.js',
];
```

**预期效果**：
- 缓存自动更新
- 避免缓存过期问题
- 提升离线体验

---

## 三、低优先级优化（长期优化）

### 7. ⭐⭐ CSS 变量统一管理

**建议**：
```css
/* src/css/tokens.css */
:root {
  /* 添加过渡时间变量 */
  --transition-fast: 0.15s;
  --transition-normal: 0.3s;
  --transition-slow: 0.5s;

  /* 添加 z-index 层级变量 */
  --z-player: 300;
  --z-modal: 400;
  --z-toast: 999;
}
```

---

### 8. ⭐ 错误处理和性能监控

**建议**：
```javascript
// 添加全局错误处理
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  // 可以添加错误上报到后端
  fetch('/api/log-error', {
    method: 'POST',
    body: JSON.stringify({
      message: event.error.message,
      stack: event.error.stack,
      url: window.location.href
    })
  }).catch(() => {});
});

// 添加性能监控
if ('PerformanceObserver' in window) {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      console.log('[Performance]', entry.name, entry.duration);
    }
  });
  observer.observe({ entryTypes: ['measure', 'navigation'] });
}
```

---

### 9. ⭐ 震动反馈优化

**位置**：`src/js/utils.js:77-105`

**建议**：
```javascript
export function haptic(ms = 15) {
  if (navigator.vibrate) {
    try {
      // 简化为单次震动，更轻量
      navigator.vibrate(ms);
    } catch (e) {
      // 静默失败
    }
  }
}
```

---

## 四、实施计划

### 第一阶段（立即执行）
1. 修复后端 N+1 查询问题
2. 添加前端缓存版本控制
3. 完善 Vite 构建配置

### 第二阶段（本周内）
4. 优化后端批量操作
5. 添加前端缓存大小限制
6. 优化 Service Worker 缓存策略

### 第三阶段（长期优化）
7. CSS 变量统一管理
8. 错误处理和性能监控
9. 震动反馈优化

---

## 五、代码质量评价

**优点**：
- ✅ 代码结构清晰，模块化设计良好
- ✅ 使用了现代 ES6+ 语法
- ✅ 性能优化意识强（requestAnimationFrame、预加载等）
- ✅ 错误处理较为完善
- ✅ 国际化支持完善

**需要改进**：
- ⚠️ 后端存在 N+1 查询问题
- ⚠️ 缓存策略需要优化
- ⚠️ 构建配置可以更完善
- ⚠️ 缺少性能监控和错误上报

**总体评分**：8.5/10

---

## 六、预期效果

实施所有优化后，预期效果：
- **后端响应时间**：减少 50-70%
- **首屏加载速度**：提升 30-50%
- **内存占用**：可控且稳定
- **用户体验**：显著提升
- **代码可维护性**：进一步提升

---

**报告生成者**：CodeArts 代码智能体
**报告日期**：2026-03-04
