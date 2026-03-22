/* ===== 监控页面 ===== */
import { get as storeGet } from '../js/store.js';

function getMonitorData() {
  return (storeGet('monitor') || {}).summary || {};
}

export function renderMonitor(container) {
  container.innerHTML = `
    <div class="adm-page">
      <h1 class="adm-page-title">性能监控</h1>

      <div class="adm-section">
        <h2 class="adm-section-title">页面性能</h2>
        <div class="adm-stats-grid">
          <div class="adm-stat-card">
            <div class="adm-stat-label">页面加载时间</div>
            <div class="adm-stat-value" id="pageLoadTime">--</div>
          </div>
          <div class="adm-stat-card">
            <div class="adm-stat-label">首次内容渲染</div>
            <div class="adm-stat-value" id="fcp">--</div>
          </div>
          <div class="adm-stat-card">
            <div class="adm-stat-label">DOM 加载完成</div>
            <div class="adm-stat-value" id="domReady">--</div>
          </div>
        </div>
      </div>

      <div class="adm-section">
        <h2 class="adm-section-title">API 性能</h2>
        <div class="adm-stats-grid">
          <div class="adm-stat-card">
            <div class="adm-stat-label">总调用次数</div>
            <div class="adm-stat-value" id="apiCalls">--</div>
          </div>
          <div class="adm-stat-card">
            <div class="adm-stat-label">平均响应时间</div>
            <div class="adm-stat-value" id="apiAvgTime">--</div>
          </div>
          <div class="adm-stat-card adm-stat-card-error">
            <div class="adm-stat-label">错误次数</div>
            <div class="adm-stat-value" id="apiErrors">--</div>
          </div>
        </div>
        <div class="adm-table-container">
          <table class="adm-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>端点</th>
                <th>耗时</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody id="apiCallsTable">
              <tr><td colspan="4" style="text-align:center;color:#999">暂无数据</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="adm-section">
        <h2 class="adm-section-title">音频播放</h2>
        <div class="adm-stats-grid">
          <div class="adm-stat-card">
            <div class="adm-stat-label">播放尝试</div>
            <div class="adm-stat-value" id="playAttempts">--</div>
          </div>
          <div class="adm-stat-card">
            <div class="adm-stat-label">成功次数</div>
            <div class="adm-stat-value" id="playSuccess">--</div>
          </div>
          <div class="adm-stat-card">
            <div class="adm-stat-label">成功率</div>
            <div class="adm-stat-value" id="playRate">--</div>
          </div>
        </div>
      </div>

      <div class="adm-section">
        <h2 class="adm-section-title">缓存效果</h2>
        <div class="adm-stats-grid">
          <div class="adm-stat-card">
            <div class="adm-stat-label">缓存命中</div>
            <div class="adm-stat-value" id="cacheHits">--</div>
          </div>
          <div class="adm-stat-card">
            <div class="adm-stat-label">缓存未命中</div>
            <div class="adm-stat-value" id="cacheMisses">--</div>
          </div>
          <div class="adm-stat-card">
            <div class="adm-stat-label">命中率</div>
            <div class="adm-stat-value" id="cacheRate">--</div>
          </div>
        </div>
      </div>

      <div class="adm-section">
        <h2 class="adm-section-title">用户访问</h2>
        <div class="adm-stats-grid">
          <div class="adm-stat-card">
            <div class="adm-stat-label">页面浏览</div>
            <div class="adm-stat-value" id="pageViews">--</div>
          </div>
          <div class="adm-stat-card">
            <div class="adm-stat-label">独立访客</div>
            <div class="adm-stat-value" id="uniqueVisitors">--</div>
          </div>
        </div>
      </div>

      <div class="adm-section-actions">
        <button class="adm-btn adm-btn-secondary" id="refreshMonitor">刷新数据</button>
        <button class="adm-btn adm-btn-secondary" id="exportReport">导出报告</button>
      </div>
    </div>
  `;

  // 加载监控数据
  loadMonitorData();

  // 绑定刷新按钮
  document.getElementById('refreshMonitor').addEventListener('click', loadMonitorData);

  // 绑定导出按钮
  document.getElementById('exportReport').addEventListener('click', exportReport);
}

function loadMonitorData() {
  const monitorData = getMonitorData();

  // 更新页面性能
  document.getElementById('pageLoadTime').textContent =
    monitorData.performance?.pageLoadTime || '--';
  document.getElementById('fcp').textContent =
    monitorData.performance?.firstContentfulPaint || '--';
  document.getElementById('domReady').textContent =
    monitorData.performance?.domContentLoaded || '--';

  // 更新 API 性能
  document.getElementById('apiCalls').textContent =
    monitorData.api?.totalCalls || '0';
  document.getElementById('apiAvgTime').textContent =
    monitorData.api?.avgResponseTime || '--';
  document.getElementById('apiErrors').textContent =
    monitorData.api?.errorCount || '0';

  // 更新 API 调用表格
  const apiCallsTable = document.getElementById('apiCallsTable');
  if (monitorData.api?.recentCalls && monitorData.api.recentCalls.length > 0) {
    apiCallsTable.innerHTML = monitorData.api.recentCalls.slice(-10).reverse().map(call => `
      <tr>
        <td>${new Date(call.timestamp).toLocaleTimeString('zh-CN')}</td>
        <td>${call.endpoint}</td>
        <td>${call.duration}ms</td>
        <td><span class="adm-badge ${call.success ? 'adm-badge-success' : 'adm-badge-error'}">
          ${call.success ? '成功' : '失败'}
        </span></td>
      </tr>
    `).join('');
  }

  // 更新音频播放
  document.getElementById('playAttempts').textContent =
    monitorData.audio?.playAttempts || '0';
  document.getElementById('playSuccess').textContent =
    monitorData.audio?.playSuccess || '0';
  document.getElementById('playRate').textContent =
    monitorData.audio?.successRate || '--';

  // 更新缓存效果
  document.getElementById('cacheHits').textContent =
    monitorData.cache?.hits || '0';
  document.getElementById('cacheMisses').textContent =
    monitorData.cache?.misses || '0';
  document.getElementById('cacheRate').textContent =
    monitorData.cache?.hitRate || '--';

  // 更新用户访问
  document.getElementById('pageViews').textContent =
    monitorData.users?.pageViews || '0';
  document.getElementById('uniqueVisitors').textContent =
    monitorData.users?.uniqueVisitors || '0';
}

function exportReport() {
  const monitorData = getMonitorData();
  const report = generateTextReport(monitorData);

  // 创建下载
  const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `monitor-report-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function generateTextReport(data) {
  return `
=== 净土法音 性能监控报告 ===
生成时间: ${new Date().toLocaleString('zh-CN')}

【页面性能】
- 页面加载时间: ${data.performance?.pageLoadTime || '--'}
- 首次内容渲染: ${data.performance?.firstContentfulPaint || '--'}
- DOM 加载完成: ${data.performance?.domContentLoaded || '--'}

【API 性能】
- 总调用次数: ${data.api?.totalCalls || 0}
- 平均响应时间: ${data.api?.avgResponseTime || '--'}
- 错误次数: ${data.api?.errorCount || 0}

【音频播放】
- 播放尝试: ${data.audio?.playAttempts || 0}
- 成功次数: ${data.audio?.playSuccess || 0}
- 成功率: ${data.audio?.successRate || '--'}

【缓存效果】
- 缓存命中: ${data.cache?.hits || 0}
- 缓存未命中: ${data.cache?.misses || 0}
- 命中率: ${data.cache?.hitRate || '--'}

【用户访问】
- 页面浏览: ${data.users?.pageViews || 0}
- 独立访客: ${data.users?.uniqueVisitors || 0}

=== 报告结束 ===
  `.trim();
}
