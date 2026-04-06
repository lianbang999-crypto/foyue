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
  plugins: [
    {
      name: 'mock-search-quotes',
      configureServer(server) {
        server.middlewares.use('/api/ai/search-quotes', (req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            audioResults: [
              {
                type: 'series',
                series_id: 'amituo-jing',
                title: '佛说阿弥陀经要解',
                total_episodes: 24,
                speaker: '大安法师',
                category: '净土五经',
              },
              {
                type: 'series',
                series_id: 'nianfo-yuanli',
                title: '念佛的原理与方法',
                total_episodes: 12,
                speaker: '大安法师',
                category: '念佛开示',
              },
            ],
            results: [
              {
                doc_id: 'mock-1',
                title: '佛说阿弥陀经讲记',
                series_name: '佛说阿弥陀经',
                audio_series_id: 'amituo-jing',
                audio_episode_num: 3,
                snippet: '念佛的时候妄念纷飞，这是正常现象。不要怕妄念多，你只要把注意力放在这句佛号上，妄念自然就少了。就好比一间暗室，你不需要去扫除黑暗，只要把灯打开，黑暗自然就消失了。',
                score: 0.92,
              },
              {
                doc_id: 'mock-2',
                title: '净土资粮信愿行',
                series_name: '净土资粮',
                audio_series_id: 'jingtu-ziliang',
                audio_episode_num: 7,
                snippet: '妄念来了不要压制它，也不要随它转。你就老老实实回到这句阿弥陀佛名号上来，这就叫"不怕念起，只怕觉迟"。觉察到妄念了，马上回来念佛，这就是功夫。',
                score: 0.88,
              },
              {
                doc_id: 'mock-3',
                title: '印光法师文钞选读',
                series_name: '印光法师文钞',
                audio_series_id: '',
                audio_episode_num: null,
                snippet: '念佛时有妄想杂念，乃吾等凡夫之通病。但须不随妄转，摄心念佛。久之，妄念自息。十念记数法，最为摄心之妙法。',
                score: 0.85,
              },
            ],
            keywords: ['念佛', '妄念'],
            disclaimer: '以上均为法师讲记原文摘录',
          }));
        });
      },
    },
  ],
});
