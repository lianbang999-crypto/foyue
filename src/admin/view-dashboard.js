/* ===== Dashboard View ===== */

import { api } from './api.js';

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export async function renderDashboard(container) {
  container.innerHTML = '<div class="adm-loading">加载统计数据...</div>';

  const data = await api.get('/stats');
  if (!data) return;

  const o = data.overview || {};
  container.innerHTML = '';

  // Metric cards
  const metrics = [
    { label: 'Series', value: o.totalSeries || 0 },
    { label: 'Episodes', value: o.totalEpisodes || 0 },
    { label: 'Plays', value: formatNum(o.totalPlays || 0) },
    { label: 'Appreciations', value: formatNum(o.totalAppreciations || 0) },
    { label: 'Messages', value: o.totalMessages || 0 },
    { label: 'Pending', value: o.pendingMessages || 0 },
  ];
  const metricsEl = document.createElement('div');
  metricsEl.className = 'adm-metrics';
  metricsEl.innerHTML = metrics.map(m =>
    `<div class="adm-metric"><div class="adm-metric-label">${m.label}</div><div class="adm-metric-value">${m.value}</div></div>`
  ).join('');
  container.appendChild(metricsEl);

  // 30-day play chart
  const plays30 = data.playsLast30Days || [];
  if (plays30.length) {
    const maxVal = Math.max(...plays30.map(d => d.count), 1);
    const chart = document.createElement('div');
    chart.className = 'adm-chart';
    chart.innerHTML = `<div class="adm-chart-title">播放趋势（近30天）</div>
      <div class="adm-chart-bars">${plays30.map(d => {
        const pct = Math.max(d.count / maxVal * 100, 2);
        return `<div class="adm-bar-col" title="${d.date}: ${d.count}次"><div class="adm-bar" style="height:${pct}%"></div><span class="adm-bar-label">${d.date.slice(5)}</span></div>`;
      }).join('')}</div>`;
    container.appendChild(chart);
  }

  // Two-column: top series + top episodes
  const row = document.createElement('div');
  row.className = 'adm-row';

  // Top series
  const topSeries = data.topSeries || [];
  const seriesSection = document.createElement('div');
  seriesSection.className = 'adm-section';
  seriesSection.innerHTML = `<div class="adm-section-title">热门系列 Top 10</div>
    <div class="adm-table-wrap"><table class="adm-table">
      <thead><tr><th>#</th><th>标题</th><th>播放</th></tr></thead>
      <tbody>${topSeries.map((s, i) =>
        `<tr class="no-click"><td>${i + 1}</td><td>${esc(s.title)}</td><td>${formatNum(s.play_count)}</td></tr>`
      ).join('') || '<tr><td colspan="3" style="text-align:center">暂无数据</td></tr>'}</tbody>
    </table></div>`;
  row.appendChild(seriesSection);

  // Top episodes
  const topEps = data.topEpisodes || [];
  const epsSection = document.createElement('div');
  epsSection.className = 'adm-section';
  epsSection.innerHTML = `<div class="adm-section-title">热门单集 Top 10</div>
    <div class="adm-table-wrap"><table class="adm-table">
      <thead><tr><th>#</th><th>标题</th><th>系列</th><th>播放</th></tr></thead>
      <tbody>${topEps.map((e, i) =>
        `<tr class="no-click"><td>${i + 1}</td><td>${esc(e.title)}</td><td>${esc(e.series_title || '')}</td><td>${formatNum(e.play_count)}</td></tr>`
      ).join('') || '<tr><td colspan="4" style="text-align:center">暂无数据</td></tr>'}</tbody>
    </table></div>`;
  row.appendChild(epsSection);
  container.appendChild(row);

  // Origin + message stats
  const row2 = document.createElement('div');
  row2.className = 'adm-row';

  const origins = data.originStats || [];
  const originSection = document.createElement('div');
  originSection.className = 'adm-section';
  originSection.innerHTML = `<div class="adm-section-title">来源分布</div>
    <div class="adm-table-wrap"><table class="adm-table">
      <thead><tr><th>来源</th><th>播放次数</th></tr></thead>
      <tbody>${origins.map(o =>
        `<tr class="no-click"><td>${esc(o.origin || '(未知)')}</td><td>${formatNum(o.count)}</td></tr>`
      ).join('') || '<tr><td colspan="2" style="text-align:center">暂无数据</td></tr>'}</tbody>
    </table></div>`;
  row2.appendChild(originSection);

  const ms = data.messageStats || {};
  const msgSection = document.createElement('div');
  msgSection.className = 'adm-section';
  msgSection.innerHTML = `<div class="adm-section-title">留言统计</div>
    <div class="adm-table-wrap"><table class="adm-table">
      <thead><tr><th>状态</th><th>数量</th></tr></thead>
      <tbody>
        <tr class="no-click"><td><span class="adm-badge adm-badge-green">已通过</span></td><td>${ms.approved || 0}</td></tr>
        <tr class="no-click"><td><span class="adm-badge adm-badge-yellow">待审核</span></td><td>${ms.pending || 0}</td></tr>
        <tr class="no-click"><td><span class="adm-badge adm-badge-red">已隐藏</span></td><td>${ms.hidden || 0}</td></tr>
      </tbody>
    </table></div>`;
  row2.appendChild(msgSection);
  container.appendChild(row2);
}

function formatNum(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}
