/* ===== 简化监控模块 ===== */
// 收集关键性能指标，显示在管理后台

class SimpleMonitor {
  constructor() {
    this.metrics = {
      // 性能指标
      pageLoadTime: 0,
      firstContentfulPaint: 0,
      domContentLoaded: 0,

      // API 性能
      apiCalls: [],
      apiErrors: [],

      // 音频播放
      playAttempts: 0,
      playSuccess: 0,
      playErrors: [],

      // 缓存
      cacheHits: 0,
      cacheMisses: 0,

      // 用户行为
      pageViews: 0,
      uniqueVisitors: new Set(),
    };

    this.init();
  }

  init() {
    // 监听页面加载性能
    if (window.performance) {
      window.addEventListener('load', () => {
        setTimeout(() => this.collectPerformanceMetrics(), 0);
      });
    }

    // 监听错误
    window.addEventListener('error', (e) => {
      this.logError('global', e.error);
    });

    // 监听未处理的 Promise 拒绝
    window.addEventListener('unhandledrejection', (e) => {
      this.logError('promise', e.reason);
    });
  }

  // 收集性能指标
  collectPerformanceMetrics() {
    const perf = performance.getEntriesByType('navigation')[0];
    if (perf) {
      this.metrics.pageLoadTime = perf.loadEventEnd - perf.fetchStart;
      this.metrics.domContentLoaded = perf.domContentLoadedEventEnd - perf.fetchStart;
    }

    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    if (fcp) {
      this.metrics.firstContentfulPaint = fcp.startTime;
    }
  }

  // 记录 API 调用
  logApiCall(endpoint, duration, success = true) {
    this.metrics.apiCalls.push({
      endpoint,
      duration,
      success,
      timestamp: Date.now()
    });

    // 只保留最近 100 条
    if (this.metrics.apiCalls.length > 100) {
      this.metrics.apiCalls.shift();
    }
  }

  // 记录错误
  logError(type, error) {
    this.metrics.apiErrors.push({
      type,
      message: error?.message || String(error),
      stack: error?.stack,
      timestamp: Date.now()
    });

    // 只保留最近 50 条
    if (this.metrics.apiErrors.length > 50) {
      this.metrics.apiErrors.shift();
    }
  }

  // 记录播放
  logPlayAttempt(success, error = null) {
    this.metrics.playAttempts++;
    if (success) {
      this.metrics.playSuccess++;
    } else if (error) {
      this.metrics.playErrors.push({
        error,
        timestamp: Date.now()
      });
      if (this.metrics.playErrors.length > 20) {
        this.metrics.playErrors.shift();
      }
    }
  }

  // 记录缓存
  logCacheHit() {
    this.metrics.cacheHits++;
  }

  logCacheMiss() {
    this.metrics.cacheMisses++;
  }

  // 记录页面访问
  logPageView() {
    this.metrics.pageViews++;
    const visitorId = this.getVisitorId();
    this.metrics.uniqueVisitors.add(visitorId);
  }

  getVisitorId() {
    let id = localStorage.getItem('visitor-id');
    if (!id) {
      id = 'visitor-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('visitor-id', id);
    }
    return id;
  }

  // 获取汇总数据
  getSummary() {
    const avgApiTime = this.metrics.apiCalls.length > 0
      ? this.metrics.apiCalls.reduce((sum, call) => sum + call.duration, 0) / this.metrics.apiCalls.length
      : 0;

    const successRate = this.metrics.playAttempts > 0
      ? (this.metrics.playSuccess / this.metrics.playAttempts * 100).toFixed(1)
      : 0;

    const cacheHitRate = (this.metrics.cacheHits + this.metrics.cacheMisses) > 0
      ? (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) * 100).toFixed(1)
      : 0;

    return {
      performance: {
        pageLoadTime: (this.metrics.pageLoadTime / 1000).toFixed(2) + 's',
        firstContentfulPaint: (this.metrics.firstContentfulPaint / 1000).toFixed(2) + 's',
        domContentLoaded: (this.metrics.domContentLoaded / 1000).toFixed(2) + 's',
      },
      api: {
        totalCalls: this.metrics.apiCalls.length,
        avgResponseTime: avgApiTime.toFixed(0) + 'ms',
        errorCount: this.metrics.apiErrors.length,
        recentCalls: this.metrics.apiCalls.slice(-20)
      },
      audio: {
        playAttempts: this.metrics.playAttempts,
        playSuccess: this.metrics.playSuccess,
        successRate: successRate + '%',
      },
      cache: {
        hits: this.metrics.cacheHits,
        misses: this.metrics.cacheMisses,
        hitRate: cacheHitRate + '%'
      },
      users: {
        pageViews: this.metrics.pageViews,
        uniqueVisitors: this.metrics.uniqueVisitors.size
      }
    };
  }

  // 生成简单的文本报告
  generateReport() {
    const summary = this.getSummary();
    return `
=== 网站性能监控报告 ===

【页面性能】
- 页面加载时间: ${summary.performance.pageLoadTime}
- 首次内容渲染: ${summary.performance.firstContentfulPaint}
- DOM 加载完成: ${summary.performance.domContentLoaded}

【API 性能】
- 总调用次数: ${summary.api.totalCalls}
- 平均响应时间: ${summary.api.avgResponseTime}
- 错误次数: ${summary.api.errorCount}

【音频播放】
- 播放尝试: ${summary.audio.playAttempts}
- 成功次数: ${summary.audio.playSuccess}
- 成功率: ${summary.audio.successRate}

【缓存效果】
- 缓存命中: ${summary.cache.hits}
- 缓存未命中: ${summary.cache.misses}
- 命中率: ${summary.cache.hitRate}

【用户访问】
- 页面浏览: ${summary.users.pageViews}
- 独立访客: ${summary.users.uniqueVisitors}

生成时间: ${new Date().toLocaleString('zh-CN')}
    `.trim();
  }
}

// 创建全局实例
export const monitor = new SimpleMonitor();

// 自动记录页面访问
monitor.logPageView();
