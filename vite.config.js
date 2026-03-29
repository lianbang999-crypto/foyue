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
        iconsPreview: resolve(__dirname, 'icons-preview.html'),
        ai: resolve(__dirname, 'ai.html'),
        wenku: resolve(__dirname, 'wenku.html'),
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
            './src/js/api.js',
            './src/js/audio-cache.js',
            './src/js/audio-url.js'
          ],
          // 将页面模块分离（含计数器，避免微信内置浏览器动态import失败）
          'pages': [
            './src/js/pages-home.js',
            './src/js/pages-category.js',
            './src/js/history-view.js',
            './src/js/counter.js',
            './src/js/gongxiu.js',
            './src/js/gongxiu-panel.js',
          ],
          // 文库模块分离（按需加载）
          'wenku': [
            './src/js/wenku.js',
            './src/js/wenku-api.js',
            './src/js/wenku-reader.js'
          ]
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
