import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    target: ['es2015', 'chrome64', 'safari12'],
    minify: 'esbuild',
    // esbuild drop options (replaces terserOptions which only work with minify: 'terser')
    esbuild: {
      drop: ['console', 'debugger'],
    },
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        ai: resolve(__dirname, 'ai.html'),
        wenku: resolve(__dirname, 'wenku.html'),
        nianfo: resolve(__dirname, 'nianfo.html'),
        gongxiu: resolve(__dirname, 'gongxiu.html'),
      },
      output: {
        manualChunks(id) {
          // 独立页入口尽量保持自包含，避免再拆出旧实现相关 chunk
          if (id.includes('/ai-app.js') || id.includes('/ai-page.css')) return undefined;

          // 公共模块
          if (id.includes('/state.js') || id.includes('/dom.js') || id.includes('/utils.js') || id.includes('/i18n.js')) return 'common';
          // 播放器
          if (id.includes('/player.js') || id.includes('/history.js') || id.includes('/api.js') || id.includes('/audio-cache.js') || id.includes('/audio-url.js')) return 'player';
          // 页面
          if (id.includes('/pages-home.js') || id.includes('/pages-category.js') || id.includes('/history-view.js') || id.includes('/counter.js') || id.includes('/gongxiu.js') || id.includes('/gongxiu-panel.js')) return 'pages';
          // 文库 API 客户端（AI 预览抽屉依赖）
          if (id.includes('/wenku-api.js')) return 'ai-doc';
        }
      }
    },
    // ✅ 优化：添加构建分析
    reportCompressedSize: true,
    chunkSizeWarningLimit: 500,
    // ✅ 优化：添加 CSS 代码分割
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
