/* ===== AI 运营管理 ===== */

import { api } from './api.js';

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function fmtMs(n) {
  if (n == null) return '--';
  return n >= 1000 ? (n / 1000).toFixed(1) + 's' : n + 'ms';
}

function fmtPct(n, d) {
  if (!d) return '--';
  return (n / d * 100).toFixed(1) + '%';
}

function fmtTtl(seconds) {
  if (!seconds) return '不缓存';
  if (seconds >= 86400) return (seconds / 86400) + '天';
  if (seconds >= 3600) return (seconds / 3600) + '小时';
  return seconds + '秒';
}

function fmtDateTime(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '--';
  const date = new Date(numeric);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtProgress(done, total) {
  if (!total) return '--';
  return `${done}/${total} (${fmtPct(done, total)})`;
}

function fmtCount(n) {
  if (n == null || Number.isNaN(Number(n))) return '--';
  return Number(n).toLocaleString('zh-CN');
}

function normalizeStatusCounts(statusCounts) {
  if (Array.isArray(statusCounts)) {
    return statusCounts.map(row => ({
      status: row?.status || row?.label || row?.name || 'unknown',
      count: Number(row?.cnt ?? row?.count ?? row?.total ?? 0),
    }));
  }
  if (statusCounts && typeof statusCounts === 'object') {
    return Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count: Number(count || 0),
    }));
  }
  return [];
}

function getJobStateText(enabled) {
  if (enabled === false) return '已暂停';
  if (enabled === true) return '运行中';
  return '状态未知';
}

function getJobStateBadgeClass(enabled) {
  if (enabled === false) return 'adm-badge adm-badge-red';
  if (enabled === true) return 'adm-badge adm-badge-green';
  return 'adm-badge adm-badge-yellow';
}

function getStatusBadgeClass(status) {
  const key = String(status || '').toLowerCase();
  if (['done', 'completed', 'complete', 'learned', 'success'].includes(key)) return 'adm-badge adm-badge-green';
  if (['failed', 'error'].includes(key)) return 'adm-badge adm-badge-red';
  if (['processing', 'running', 'working', 'in_progress'].includes(key)) return 'adm-badge adm-badge-accent';
  if (['pending', 'queued', 'waiting'].includes(key)) return 'adm-badge adm-badge-yellow';
  return 'adm-badge';
}

function renderStatusCountBadges(statusCounts) {
  const rows = normalizeStatusCounts(statusCounts);
  if (!rows.length) return '<span class="adm-text-muted">暂无状态计数</span>';
  return rows.map(row =>
    `<span class="${getStatusBadgeClass(row.status)}">${esc(row.status)} ${fmtCount(row.count)}</span>`
  ).join(' ');
}

function renderStatusMeta(items) {
  const rows = (items || []).filter(item => item && item.value != null && item.value !== '');
  if (!rows.length) return '<div class="adm-text-muted">暂无总量信息</div>';
  return rows.map(item =>
    `<div class="adm-text-muted" style="font-size:.82rem">${esc(item.label)}：${esc(String(item.value))}</div>`
  ).join('');
}

function renderJobStatusBlock({ title, enabled, statusCounts, metaItems, error }) {
  return `<div style="border:1px solid rgba(0,0,0,.06);border-radius:12px;padding:14px;min-width:0">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px">
      <div class="adm-section-title" style="margin:0;font-size:1rem">${esc(title)}</div>
      <span class="${getJobStateBadgeClass(enabled)}">${getJobStateText(enabled)}</span>
    </div>
    ${error ? `<div class="adm-text-muted" style="margin-bottom:10px">${esc(error)}</div>` : ''}
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">${renderStatusCountBadges(statusCounts)}</div>
    <div style="display:grid;gap:4px">${renderStatusMeta(metaItems)}</div>
  </div>`;
}

function getTranscriptStatusMeta(data) {
  const doneStats = data?.done_stats || {};
  return [
    { label: '已完成转写', value: fmtCount(doneStats.total) },
    { label: '累计音频时长', value: doneStats.total_hours != null ? `${doneStats.total_hours} 小时` : '--' },
    { label: '最近运行日志', value: Array.isArray(data?.recent_logs) ? `${data.recent_logs.length} 条` : '--' },
    { label: '最近失败', value: Array.isArray(data?.recent_failures) ? `${data.recent_failures.length} 条` : '--' },
  ];
}

function getBrainStatusMeta(data) {
  const totals = data?.totals || {};
  return [
    { label: '问答', value: fmtCount(totals.qa_pairs) },
    { label: '金句', value: fmtCount(totals.key_quotes) },
    { label: '概念', value: fmtCount(totals.concepts) },
    { label: '主题分布', value: Array.isArray(data?.topic_distribution) ? `${data.topic_distribution.length} 项` : '--' },
  ];
}

function getEmbeddingStatusCounts(data) {
  if (data?.status_counts) return data.status_counts;
  return [
    { status: 'pending', count: data?.pending ?? 0 },
    { status: 'completed', count: data?.completed ?? 0 },
    { status: 'failed', count: data?.failed ?? 0 },
  ];
}

function getEmbeddingStatusMeta(data) {
  return [
    { label: '总文档', value: fmtCount(data?.totalDocuments) },
    { label: '已处理', value: fmtCount(data?.processed) },
    { label: '剩余', value: fmtCount(data?.remaining) },
    { label: '完成率', value: data?.completionRate != null ? `${data.completionRate}%` : '--' },
  ];
}

function unwrapSettledData(result, fallbackError) {
  if (result.status === 'fulfilled' && result.value) return result.value;
  return { error: result.reason?.message || fallbackError };
}

const SCENARIO_LABELS = {
  embedding: '向量生成（构建）',
  searchEmbedding: '向量生成（搜索）',
  reranker: '检索重排',
  ragChat: 'RAG 问答',
  ragStream: 'RAG 流式问答',
  summary: '文档摘要',
  recommend: '每日推荐',
  whisper: '语音转写',
  diagnostic: '诊断测试',
};

const ASK_RESULT_MODE_LABELS = {
  answer: '直接回答',
  search_only: '降级检索',
  no_result: '无结果',
};

const ASK_RESULT_ROUTE_LABELS = {
  ask: '同步问答',
  'ask-stream': '流式问答',
};

const ASK_RESULT_DOWNGRADE_LABELS = {
  insufficient_evidence: '证据不足',
  answer_generation_failed: '回答生成失败',
  answer_generation_empty: '回答内容为空',
  answer_generation_unavailable: '回答生成不可用',
  unsupported_question: '当前问题暂不支持',
  no_documents: '未检索到相关文档',
};

function fmtPercentValue(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '--';
  const normalized = Math.abs(num) <= 1 ? num * 100 : num;
  return normalized.toFixed(1) + '%';
}

function fmtStatNumber(value, maxFractionDigits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '--';
  return num.toLocaleString('zh-CN', { maximumFractionDigits: maxFractionDigits });
}

function normalizeAskResultRoute(route) {
  return String(route || 'unknown')
    .trim()
    .replace(/^\/+/, '')
    .replace(/^api\/ai\//, '')
    .replace(/^ai\//, '') || 'unknown';
}

function getAskResultModeLabel(mode) {
  return ASK_RESULT_MODE_LABELS[mode] || mode || '未知模式';
}

function getAskResultModeBadgeClass(mode) {
  if (mode === 'answer') return 'adm-badge adm-badge-green';
  if (mode === 'search_only') return 'adm-badge adm-badge-yellow';
  if (mode === 'no_result') return 'adm-badge adm-badge-red';
  return 'adm-badge';
}

function getAskResultRouteLabel(route) {
  const key = normalizeAskResultRoute(route);
  return ASK_RESULT_ROUTE_LABELS[key] || key;
}

function getAskResultDowngradeLabel(reason) {
  const key = String(reason || 'unknown').trim() || 'unknown';
  return ASK_RESULT_DOWNGRADE_LABELS[key] || key;
}

function renderAskResultMetric(label, value, hint = '') {
  return `<div class="adm-metric">
    <div class="adm-metric-label">${esc(label)}</div>
    <div class="adm-metric-value">${esc(String(value))}</div>
    ${hint ? `<div class="adm-text-muted" style="margin-top:6px;font-size:.8rem">${esc(hint)}</div>` : ''}
  </div>`;
}

function renderAskResultHeroStat(label, value, detail = '') {
  return `<div class="adm-ai-hero-stat">
    <div class="adm-ai-hero-stat-label">${esc(label)}</div>
    <div class="adm-ai-hero-stat-value">${esc(String(value))}</div>
    ${detail ? `<div class="adm-ai-hero-stat-detail">${esc(detail)}</div>` : ''}
  </div>`;
}

/* ── Main render ── */
export async function renderAI(container) {
  container.innerHTML = `<div class="adm-page">
    <h1 class="adm-page-title">AI 运营</h1>
    <div class="adm-tabs" id="aiTabs"></div>
    <div id="aiTabContent"></div>
  </div>`;

  const TABS = [
    { id: 'stats', label: '调用统计' },
    { id: 'ops', label: '运维操作' },
    { id: 'diag', label: '模型诊断' },
  ];

  const tabsEl = document.getElementById('aiTabs');
  const contentEl = document.getElementById('aiTabContent');

  tabsEl.innerHTML = TABS.map(t =>
    `<button class="adm-tab" data-tab="${t.id}">${t.label}</button>`
  ).join('');

  let activeTab = 'stats';
  function switchTab(id) {
    activeTab = id;
    tabsEl.querySelectorAll('.adm-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === id));
    if (id === 'stats') renderStats(contentEl);
    else if (id === 'ops') renderOps(contentEl);
    else if (id === 'diag') renderDiag(contentEl);
  }

  tabsEl.addEventListener('click', e => {
    const btn = e.target.closest('.adm-tab');
    if (btn) switchTab(btn.dataset.tab);
  });

  switchTab('stats');
}

/* ── Tab 1: 调用统计 ── */
async function renderStats(el, days = 7) {
  el.innerHTML = '<div class="adm-loading">加载 AI 调用统计...</div>';
  const data = await api.get('/ai-stats?days=' + encodeURIComponent(days));
  if (!data) { el.innerHTML = '<div class="adm-empty">加载失败</div>'; return; }
  if (!data.success) { el.innerHTML = `<div class="adm-empty">${esc(data.error || '未知错误')}</div>`; return; }

  const stats = data.stats || [];
  const profiles = data.gatewayProfiles || {};
  const askResults = data.askResults;
  const askResultsAvailable = Boolean(askResults) && askResults.available !== false;
  const askOverview = {
    totalRequests: Number(askResults?.overview?.totalRequests) || 0,
    totalResults: Number(askResults?.overview?.totalResults) || 0,
    failedRequests: Number(askResults?.overview?.failedRequests) || 0,
    answerCount: Number(askResults?.overview?.answerCount) || 0,
    searchOnlyCount: Number(askResults?.overview?.searchOnlyCount) || 0,
    noResultCount: Number(askResults?.overview?.noResultCount) || 0,
    answerRate: Number(askResults?.overview?.answerRate) || 0,
    searchOnlyRate: Number(askResults?.overview?.searchOnlyRate) || 0,
    noResultRate: Number(askResults?.overview?.noResultRate) || 0,
    citationHitRate: Number(askResults?.overview?.citationHitRate) || 0,
    avgCitationCount: Number(askResults?.overview?.avgCitationCount) || 0,
  };
  const askModeBreakdown = Array.isArray(askResults?.modeBreakdown) ? askResults.modeBreakdown : [];
  const askDowngradeBreakdown = Array.isArray(askResults?.downgradeBreakdown) ? askResults.downgradeBreakdown : [];
  const askRouteBreakdown = Array.isArray(askResults?.routeBreakdown) ? askResults.routeBreakdown : [];
  const askModelBreakdown = Array.isArray(askResults?.modelBreakdown) ? askResults.modelBreakdown : [];

  // Aggregate totals
  let totalCalls = 0, totalSuccess = 0, totalCached = 0, totalDuration = 0;
  stats.forEach(r => {
    totalCalls += r.total_calls;
    totalSuccess += r.success_count;
    totalCached += r.cache_hits;
    totalDuration += (r.avg_duration_ms || 0) * r.total_calls;
  });
  const avgDuration = totalCalls ? Math.round(totalDuration / totalCalls) : 0;

  el.innerHTML = '';

  // Period selector + refresh
  const toolbar = document.createElement('div');
  toolbar.className = 'adm-toolbar';
  toolbar.innerHTML = `<div class="adm-text-muted">近 ${data.days} 天数据</div>
    <div style="display:flex;gap:6px">
      <button class="adm-btn adm-btn-sm${data.days === 1 ? ' active' : ''}" data-days="1">1天</button>
      <button class="adm-btn adm-btn-sm${data.days === 7 ? ' active' : ''}" data-days="7">7天</button>
      <button class="adm-btn adm-btn-sm${data.days === 30 ? ' active' : ''}" data-days="30">30天</button>
    </div>`;
  toolbar.querySelectorAll('[data-days]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await renderStats(el, Number.parseInt(btn.dataset.days, 10) || 7);
    });
  });
  el.appendChild(toolbar);

  const content = document.createElement('div');
  content.className = 'adm-ai-stats-shell';
  el.appendChild(content);

  // Metric cards
  const metrics = document.createElement('div');
  metrics.className = 'adm-metrics';
  metrics.innerHTML = [
    { label: '总调用', value: totalCalls },
    { label: '成功率', value: fmtPct(totalSuccess, totalCalls) },
    { label: '缓存命中率', value: fmtPct(totalCached, totalCalls) },
    { label: '平均耗时', value: fmtMs(avgDuration) },
  ].map(m =>
    `<div class="adm-metric"><div class="adm-metric-label">${m.label}</div><div class="adm-metric-value">${m.value}</div></div>`
  ).join('');
  content.appendChild(metrics);

  const askSection = document.createElement('div');
  askSection.className = 'adm-section';
  if (!askResultsAvailable) {
    askSection.classList.add('adm-ai-callout');
    askSection.innerHTML = `<div class="adm-ai-callout-body">
        <span class="adm-badge adm-badge-yellow">结果级统计未启用</span>
        <div class="adm-section-title" style="margin:0">问答结果质量</div>
        <div class="adm-text-muted">尚未应用 0030 migration / 暂无结果级统计。当前仅展示 Gateway 调用层统计；结果日志表可用后，这里会自动显示降级原因、引用命中率和接口结果质量。</div>
      </div>`;
    content.appendChild(askSection);
  } else {
    const topModels = askModelBreakdown.slice(0, 3).map(row => {
      const provider = row?.provider ? `${row.provider} · ` : '';
      const model = String(row?.model || 'unknown').split('/').pop();
      return `<span class="adm-badge adm-badge-accent">${esc(provider + model)} ${fmtCount(row?.total || 0)}</span>`;
    }).join('');

    askSection.classList.add('adm-ai-hero-card');
    askSection.innerHTML = `<div class="adm-ai-hero-layout">
        <div class="adm-ai-hero-main">
          <div class="adm-ai-hero-kicker">Grounded Answer</div>
          <div class="adm-section-title adm-ai-hero-title">问答结果质量</div>
          <p class="adm-ai-hero-copy">这里看的是最终用户能感知到的回答质量，不再只是模型调用是否成功，而是回答是否真正带出处、是否降级为检索，以及哪条接口更稳定。</p>
          <div class="adm-ai-chip-row">
            <span class="adm-badge adm-badge-green">直接回答 ${fmtPercentValue(askOverview.answerRate)}</span>
            <span class="adm-badge adm-badge-yellow">降级检索 ${fmtPercentValue(askOverview.searchOnlyRate)}</span>
            <span class="adm-badge adm-badge-accent">引用命中 ${fmtPercentValue(askOverview.citationHitRate)}</span>
            <span class="adm-badge">近 ${fmtCount(askResults?.days ?? data.days)} 天</span>
          </div>
          ${topModels ? `<div class="adm-ai-model-strip">
            <div class="adm-text-muted">最近命中模型</div>
            <div class="adm-ai-chip-row">${topModels}</div>
          </div>` : ''}
        </div>
        <div class="adm-ai-hero-side">
          ${renderAskResultHeroStat('成功结果', fmtCount(askOverview.totalResults), `总请求 ${fmtCount(askOverview.totalRequests)}`)}
          ${renderAskResultHeroStat('直接回答', fmtCount(askOverview.answerCount), `无结果 ${fmtCount(askOverview.noResultCount)}`)}
          ${renderAskResultHeroStat('失败请求', fmtCount(askOverview.failedRequests), `平均引用 ${fmtStatNumber(askOverview.avgCitationCount, 2)}`)}
        </div>
      </div>
      <div class="adm-metrics adm-metrics--compact">${[
        {
          label: '问答总数',
          value: fmtCount(askOverview.totalRequests),
          hint: `成功结果 ${fmtCount(askOverview.totalResults)}`,
        },
        {
          label: '回答占比',
          value: fmtPercentValue(askOverview.answerRate),
          hint: `${fmtCount(askOverview.answerCount)} 次直接回答`,
        },
        {
          label: '降级检索占比',
          value: fmtPercentValue(askOverview.searchOnlyRate),
          hint: `${fmtCount(askOverview.searchOnlyCount)} 次降级检索`,
        },
        {
          label: '引用命中率',
          value: fmtPercentValue(askOverview.citationHitRate),
          hint: `成功样本 ${fmtCount(askOverview.totalResults)}`,
        },
        {
          label: '平均引用数',
          value: fmtStatNumber(askOverview.avgCitationCount, 2),
          hint: '每条成功结果的平均 citation 数',
        },
        {
          label: '失败请求数',
          value: fmtCount(askOverview.failedRequests),
          hint: `占总请求 ${fmtPct(askOverview.failedRequests, askOverview.totalRequests)}`,
        },
      ].map(item => renderAskResultMetric(item.label, item.value, item.hint)).join('')}</div>`;
    content.appendChild(askSection);

    const insightGrid = document.createElement('div');
    insightGrid.className = 'adm-ai-grid-two';

    const modeSection = document.createElement('div');
    modeSection.className = 'adm-section';
    modeSection.innerHTML = `<div class="adm-section-title">结果模式分布</div>
      <div class="adm-table-wrap"><table class="adm-table">
        <thead><tr>
          <th>模式</th><th>数量</th><th>占比</th><th>引用命中率</th><th>平均引用数</th><th>平均置信度</th>
        </tr></thead>
        <tbody>${askModeBreakdown.length ? askModeBreakdown.map(row => `
          <tr class="no-click">
            <td><span class="${getAskResultModeBadgeClass(row.mode)}">${esc(getAskResultModeLabel(row.mode))}</span></td>
            <td>${fmtCount(row.total)}</td>
            <td>${fmtPercentValue(row.share)}</td>
            <td>${fmtPercentValue(row.citationHitRate)}</td>
            <td>${fmtStatNumber(row.avgCitationCount, 2)}</td>
            <td>${fmtPercentValue(row.avgConfidence)}</td>
          </tr>`).join('') : '<tr><td colspan="6" style="text-align:center">暂无结果模式统计</td></tr>'}</tbody>
      </table></div>`;
    insightGrid.appendChild(modeSection);

    const downgradeSection = document.createElement('div');
    downgradeSection.className = 'adm-section';
    downgradeSection.innerHTML = `<div class="adm-section-title">降级原因分布</div>
      <div class="adm-table-wrap"><table class="adm-table">
        <thead><tr><th>降级原因</th><th>次数</th><th>占比</th></tr></thead>
        <tbody>${askDowngradeBreakdown.length ? askDowngradeBreakdown.map(row => {
      const code = String(row?.downgradeReason || 'unknown');
      const label = getAskResultDowngradeLabel(code);
      const codeMeta = label !== code ? `<div class="adm-text-muted" style="font-size:.8rem;margin-top:4px">${esc(code)}</div>` : '';
      return `<tr class="no-click">
            <td><span class="adm-badge adm-badge-yellow">${esc(label)}</span>${codeMeta}</td>
            <td>${fmtCount(row.total)}</td>
            <td>${fmtPercentValue(row.share)}</td>
          </tr>`;
    }).join('') : '<tr><td colspan="3" style="text-align:center">暂无降级记录</td></tr>'}</tbody>
      </table></div>`;
    insightGrid.appendChild(downgradeSection);
    content.appendChild(insightGrid);

    const routeSection = document.createElement('div');
    routeSection.className = 'adm-section';
    routeSection.innerHTML = `<div class="adm-section-title">接口路由结果</div>
      <div class="adm-table-wrap"><table class="adm-table">
        <thead><tr>
          <th>接口</th><th>总请求</th><th>成功结果</th><th>失败</th><th>回答</th><th>降级检索</th><th>无结果</th><th>引用命中率</th><th>平均引用数</th>
        </tr></thead>
        <tbody>${askRouteBreakdown.length ? askRouteBreakdown.map(row => {
      const routeKey = normalizeAskResultRoute(row.route);
      const routeLabel = getAskResultRouteLabel(routeKey);
      const routeMeta = routeLabel !== routeKey ? `<div class="adm-text-muted" style="font-size:.8rem;margin-top:4px">${esc(routeKey)}</div>` : '';
      return `<tr class="no-click">
            <td><span class="adm-badge adm-badge-accent">${esc(routeLabel)}</span>${routeMeta}</td>
            <td>${fmtCount(row.totalRequests)}</td>
            <td>${fmtCount(row.totalResults)}</td>
            <td>${fmtCount(row.failedRequests)} <span class="adm-text-muted">(${fmtPct(row.failedRequests, row.totalRequests)})</span></td>
            <td>${fmtCount(row.answerCount)} <span class="adm-text-muted">(${fmtPct(row.answerCount, row.totalResults)})</span></td>
            <td>${fmtCount(row.searchOnlyCount)} <span class="adm-text-muted">(${fmtPct(row.searchOnlyCount, row.totalResults)})</span></td>
            <td>${fmtCount(row.noResultCount)} <span class="adm-text-muted">(${fmtPct(row.noResultCount, row.totalResults)})</span></td>
            <td>${fmtPercentValue(row.citationHitRate)}</td>
            <td>${fmtStatNumber(row.avgCitationCount, 2)}</td>
          </tr>`;
    }).join('') : '<tr><td colspan="9" style="text-align:center">暂无接口路由统计</td></tr>'}</tbody>
      </table></div>`;
    content.appendChild(routeSection);

    if (askModelBreakdown.length) {
      const modelSection = document.createElement('div');
      modelSection.className = 'adm-section';
      modelSection.innerHTML = `<div class="adm-section-title">回答模型概览</div>
        <div class="adm-table-wrap"><table class="adm-table">
          <thead><tr>
            <th>Provider</th><th>Model</th><th>结果数</th><th>直接回答</th><th>降级检索</th><th>无结果</th><th>最近命中</th>
          </tr></thead>
          <tbody>${askModelBreakdown.map(row => `
            <tr class="no-click">
              <td>${esc(row.provider || '--')}</td>
              <td><code style="font-size:.72rem">${esc(String(row.model || '--').split('/').pop())}</code></td>
              <td>${fmtCount(row.total)}</td>
              <td>${fmtCount(row.answerCount)}</td>
              <td>${fmtCount(row.searchOnlyCount)}</td>
              <td>${fmtCount(row.noResultCount)}</td>
              <td>${fmtDateTime(row.lastSeenAt)}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>`;
      content.appendChild(modelSection);
    }
  }

  // Stats table by scenario
  const section = document.createElement('div');
  section.className = 'adm-section';
  section.innerHTML = `<div class="adm-section-title">按场景 × 模型明细</div>
    <div class="adm-table-wrap"><table class="adm-table">
      <thead><tr>
        <th>场景</th><th>模型</th><th>调用</th><th>成功</th><th>缓存</th><th>平均耗时</th><th>最快</th><th>最慢</th>
      </tr></thead>
      <tbody>${stats.length ? stats.map(r => {
    const label = SCENARIO_LABELS[r.scenario] || r.scenario;
    const model = (r.model || '').split('/').pop();
    return `<tr class="no-click">
          <td>${esc(label)}</td>
          <td><code style="font-size:.72rem">${esc(model)}</code></td>
          <td>${r.total_calls}</td>
          <td>${r.success_count} <span class="adm-text-muted">(${fmtPct(r.success_count, r.total_calls)})</span></td>
          <td>${r.cache_hits} <span class="adm-text-muted">(${fmtPct(r.cache_hits, r.total_calls)})</span></td>
          <td>${fmtMs(r.avg_duration_ms)}</td>
          <td>${fmtMs(r.min_duration_ms)}</td>
          <td>${fmtMs(r.max_duration_ms)}</td>
        </tr>`;
  }).join('') : '<tr><td colspan="8" style="text-align:center">暂无数据（系统刚部署，请稍后再查看）</td></tr>'}</tbody>
    </table></div>`;
  content.appendChild(section);

  // Gateway profiles
  const profSection = document.createElement('div');
  profSection.className = 'adm-section';
  const entries = Object.entries(profiles);
  profSection.innerHTML = `<div class="adm-section-title">Gateway Profiles 配置</div>
    <div class="adm-table-wrap"><table class="adm-table">
      <thead><tr><th>Profile</th><th>场景</th><th>缓存策略</th><th>TTL</th></tr></thead>
      <tbody>${entries.map(([key, p]) => {
    const label = SCENARIO_LABELS[key] || key;
    const strategy = p.skipCache ? '<span class="adm-badge adm-badge-yellow">跳过缓存</span>' : '<span class="adm-badge adm-badge-green">启用缓存</span>';
    return `<tr class="no-click"><td><code style="font-size:.72rem">${key}</code></td><td>${esc(label)}</td><td>${strategy}</td><td>${fmtTtl(p.cacheTtl)}</td></tr>`;
  }).join('')}</tbody>
    </table></div>`;
  content.appendChild(profSection);
}

/* ── Tab 2: 运维操作 ── */
function renderOps(el) {
  el.innerHTML = '';

  const taskState = {
    transcript: null,
    brain: null,
    embedding: null,
  };

  const trackedStatusTexts = new Set([
    '',
    '读取任务状态...',
    '状态未确认，暂不可执行',
    '运行中，可执行',
    '已暂停，暂不可执行',
    '已暂停，后端拒绝执行',
  ]);

  const overviewCard = document.createElement('div');
  overviewCard.className = 'adm-section';
  overviewCard.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <div>
        <div class="adm-section-title">后台任务状态</div>
        <p class="adm-text-muted" style="margin:0">查看 Transcript、Brain、Embedding 三类任务的进度与是否已暂停</p>
      </div>
      <button class="adm-btn adm-btn-sm" id="refresh-ai-job-status">刷新状态</button>
    </div>
    <div id="ai-job-status-body" class="adm-loading" style="margin-top:12px">加载中...</div>`;
  el.appendChild(overviewCard);

  const statusCard = document.createElement('div');
  statusCard.className = 'adm-section';
  statusCard.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <div>
        <div class="adm-section-title">Embedding 构建详情</div>
        <p class="adm-text-muted" style="margin:0">查看当前已完成、失败和剩余待构建文档，便于安全续跑和全量重建</p>
        <div class="adm-text-muted" id="embedding-status-note" style="margin-top:6px"></div>
      </div>
      <button class="adm-btn adm-btn-sm" id="refresh-embedding-status">刷新状态</button>
    </div>
    <div id="embedding-status-body" class="adm-loading" style="margin-top:12px">加载中...</div>`;
  el.appendChild(statusCard);

  const ops = [
    {
      id: 'embedding', title: 'Embedding 向量构建',
      desc: '对文档生成向量，存入 Vectorize 索引；支持续跑、失败重试和全量重建',
      endpoint: '/embeddings/build', method: 'post',
      statusKey: 'embedding',
      params: [
        { key: 'limit', label: '每批数量', type: 'number', value: 3, min: 1, max: 10 },
        { key: 'offset', label: '偏移量', type: 'number', value: 0, min: 0 },
        { key: 'retry', label: '仅重试失败任务', type: 'checkbox', checked: false },
        { key: 'rebuild', label: '全量重建 metadata', type: 'checkbox', checked: false },
      ],
      queryMode: true,
    },
    {
      id: 'transcribe', title: '语音转写 (Whisper)',
      desc: '对无文本的音频单集进行增量 Whisper 转写',
      endpoint: '/transcript/transcribe', method: 'post',
      statusKey: 'transcript',
      params: [
        { key: 'limit', label: '每批数量', type: 'number', value: 3, min: 1, max: 10 },
      ],
    },
    {
      id: 'wenku-sync', title: '文库同步 (R2→D1)',
      desc: '扫描 R2 文库存储桶，将新文档同步到 D1 数据库',
      endpoint: '/wenku-sync', method: 'post', params: [],
    },
    {
      id: 'cleanup', title: '数据清理',
      desc: '清理过期限流记录、推荐缓存（7天）、AI 调用日志（30天）',
      endpoint: '/cleanup', method: 'post', params: [],
    },
  ];

  function syncActionButtons() {
    ops.forEach(op => {
      if (!op.statusKey) return;
      const btn = document.getElementById('run-' + op.id);
      const statusEl = document.getElementById('status-' + op.id);
      const state = taskState[op.statusKey];
      if (!btn || !statusEl) return;

      if (!state) {
        btn.disabled = true;
        statusEl.textContent = '读取任务状态...';
        statusEl.dataset.mode = 'status';
        return;
      }

      if (state.enabled === false) {
        btn.disabled = true;
        statusEl.textContent = '已暂停，暂不可执行';
        statusEl.dataset.mode = 'status';
        return;
      }

      if (state.enabled !== true) {
        btn.disabled = true;
        statusEl.textContent = '状态未确认，暂不可执行';
        statusEl.dataset.mode = 'status';
        return;
      }

      btn.disabled = false;
      if (statusEl.dataset.mode !== 'result' || trackedStatusTexts.has(statusEl.textContent)) {
        statusEl.textContent = '运行中，可执行';
        statusEl.dataset.mode = 'status';
      }
    });
  }

  function renderOverview(transcriptData, brainData, embeddingData) {
    const body = document.getElementById('ai-job-status-body');
    body.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">
      ${renderJobStatusBlock({
      title: 'Transcript',
      enabled: transcriptData?.enabled,
      statusCounts: transcriptData?.status_counts,
      metaItems: getTranscriptStatusMeta(transcriptData),
      error: transcriptData?.error,
    })}
      ${renderJobStatusBlock({
      title: 'Brain',
      enabled: brainData?.enabled,
      statusCounts: brainData?.status_counts,
      metaItems: getBrainStatusMeta(brainData),
      error: brainData?.error,
    })}
      ${renderJobStatusBlock({
      title: 'Embedding',
      enabled: embeddingData?.enabled,
      statusCounts: getEmbeddingStatusCounts(embeddingData),
      metaItems: getEmbeddingStatusMeta(embeddingData),
      error: embeddingData?.error,
    })}
    </div>`;
  }

  function renderEmbeddingDetail(data) {
    const body = document.getElementById('embedding-status-body');
    const noteEl = document.getElementById('embedding-status-note');
    noteEl.textContent = data?.enabled === false
      ? '任务已暂停，当前仅展示进度快照，手动构建按钮已禁用。'
      : data?.enabled === true
        ? '任务运行中，可结合下方按钮继续增量构建或失败重试。'
        : '状态暂未确认，手动构建按钮保持禁用。';

    const hasEmbeddingPayload = data && (
      data.success === true ||
      data.totalDocuments != null ||
      Array.isArray(data.latestCompleted) ||
      Array.isArray(data.latestFailed)
    );

    if (!hasEmbeddingPayload || data.success === false) {
      body.innerHTML = `<div class="adm-empty">${esc(data?.error || '加载失败')}</div>`;
      return;
    }

    const latestCompleted = data.latestCompleted || [];
    const latestFailed = data.latestFailed || [];
    body.innerHTML = `<div class="adm-metrics" style="margin-bottom:16px">
          <div class="adm-metric"><div class="adm-metric-label">任务状态</div><div class="adm-metric-value">${getJobStateText(data.enabled)}</div></div>
          <div class="adm-metric"><div class="adm-metric-label">总文档</div><div class="adm-metric-value">${fmtCount(data.totalDocuments)}</div></div>
          <div class="adm-metric"><div class="adm-metric-label">已完成</div><div class="adm-metric-value">${fmtProgress(data.completed, data.totalDocuments)}</div></div>
          <div class="adm-metric"><div class="adm-metric-label">失败</div><div class="adm-metric-value">${fmtCount(data.failed)}</div></div>
          <div class="adm-metric"><div class="adm-metric-label">剩余</div><div class="adm-metric-value">${fmtCount(data.remaining)}</div></div>
        </div>
        <div class="adm-table-wrap" style="margin-bottom:16px"><table class="adm-table">
          <thead><tr><th colspan="4">最近完成</th></tr><tr><th>文档</th><th>系列</th><th>Chunks</th><th>完成时间</th></tr></thead>
          <tbody>${latestCompleted.length ? latestCompleted.map(row => `<tr class="no-click"><td>${esc(row.title || row.document_id)}</td><td>${esc(row.series_name || '--')}</td><td>${fmtCount(row.chunks_count || 0)}</td><td>${esc(row.completed_at || '--')}</td></tr>`).join('') : '<tr><td colspan="4" style="text-align:center">暂无完成记录</td></tr>'}</tbody>
        </table></div>
        <div class="adm-table-wrap"><table class="adm-table">
          <thead><tr><th colspan="4">最近失败</th></tr><tr><th>文档</th><th>系列</th><th>失败时间</th><th>错误</th></tr></thead>
          <tbody>${latestFailed.length ? latestFailed.map(row => `<tr class="no-click"><td>${esc(row.title || row.document_id)}</td><td>${esc(row.series_name || '--')}</td><td>${esc(row.created_at || '--')}</td><td>${esc(row.error || '--')}</td></tr>`).join('') : '<tr><td colspan="4" style="text-align:center">暂无失败记录</td></tr>'}</tbody>
        </table></div>`;
  }

  async function loadOpsStatus() {
    const overviewBody = document.getElementById('ai-job-status-body');
    const embeddingBody = document.getElementById('embedding-status-body');
    const refreshOverviewBtn = document.getElementById('refresh-ai-job-status');
    const refreshEmbeddingBtn = document.getElementById('refresh-embedding-status');

    taskState.transcript = null;
    taskState.brain = null;
    taskState.embedding = null;
    syncActionButtons();

    refreshOverviewBtn.disabled = true;
    refreshEmbeddingBtn.disabled = true;
    overviewBody.innerHTML = '<div class="adm-loading">加载中...</div>';
    embeddingBody.innerHTML = '<div class="adm-loading">加载中...</div>';

    const [transcriptResult, brainResult, embeddingResult] = await Promise.allSettled([
      api.get('/transcript/status'),
      api.get('/brain/status'),
      api.get('/embeddings/status'),
    ]);

    const transcriptData = unwrapSettledData(transcriptResult, 'Transcript 状态加载失败');
    const brainData = unwrapSettledData(brainResult, 'Brain 状态加载失败');
    const embeddingData = unwrapSettledData(embeddingResult, 'Embedding 状态加载失败');

    taskState.transcript = transcriptData;
    taskState.brain = brainData;
    taskState.embedding = embeddingData;

    renderOverview(transcriptData, brainData, embeddingData);
    renderEmbeddingDetail(embeddingData);
    syncActionButtons();

    refreshOverviewBtn.disabled = false;
    refreshEmbeddingBtn.disabled = false;
  }

  ops.forEach(op => {
    const card = document.createElement('div');
    card.className = 'adm-section';
    card.innerHTML = `<div class="adm-section-title">${op.title}</div>
      <p class="adm-text-muted" style="margin:0 0 12px">${op.desc}</p>
      <div class="adm-ai-op-params" id="params-${op.id}">
        ${op.params.map(p => `<div class="adm-form-group" style="display:inline-block;margin-right:12px">
          <label class="adm-form-label">${p.label}</label>
          ${p.type === 'checkbox'
        ? `<label style="display:flex;align-items:center;gap:8px;height:38px"><input type="checkbox" data-key="${p.key}" ${p.checked ? 'checked' : ''}><span class="adm-text-muted">启用</span></label>`
        : `<input class="adm-input" style="width:100px" type="${p.type}" data-key="${p.key}" value="${p.value}" min="${p.min || ''}" max="${p.max || ''}">`}
        </div>`).join('')}
      </div>
      <div style="display:flex;align-items:center;gap:12px;margin-top:8px">
        <button class="adm-btn adm-btn-primary adm-btn-sm" id="run-${op.id}">执行</button>
        <span class="adm-text-muted" id="status-${op.id}"></span>
      </div>
      <pre class="adm-ai-result" id="result-${op.id}" style="display:none"></pre>`;
    el.appendChild(card);

    document.getElementById('run-' + op.id).addEventListener('click', async () => {
      const btn = document.getElementById('run-' + op.id);
      const statusEl = document.getElementById('status-' + op.id);
      const resultEl = document.getElementById('result-' + op.id);

      if (op.statusKey && taskState[op.statusKey]?.enabled === false) {
        statusEl.textContent = '已暂停，暂不可执行';
        statusEl.dataset.mode = 'status';
        resultEl.textContent = `${op.title} 当前已暂停，请先在后端重新启用任务后再执行。`;
        resultEl.style.display = 'block';
        return;
      }

      btn.disabled = true;
      statusEl.textContent = '执行中...';
      statusEl.dataset.mode = 'result';
      resultEl.style.display = 'none';

      try {
        let result;
        if (op.method === 'post') {
          if (op.queryMode) {
            const inputs = document.querySelectorAll(`#params-${op.id} input`);
            const qs = Array.from(inputs).flatMap(i => {
              if (i.type === 'checkbox') return i.checked ? [`${i.dataset.key}=true`] : [];
              return [`${i.dataset.key}=${encodeURIComponent(i.value)}`];
            }).join('&');
            result = await api.post(op.endpoint + '?' + qs, {});
          } else if (op.params.length) {
            const body = {};
            document.querySelectorAll(`#params-${op.id} input`).forEach(i => {
              body[i.dataset.key] = i.type === 'checkbox' ? i.checked : (i.type === 'number' ? parseInt(i.value, 10) : i.value);
            });
            result = await api.post(op.endpoint, body);
          } else {
            result = await api.post(op.endpoint, {});
          }
        }

        if (!result) return;

        if (result.enabled === false) {
          statusEl.textContent = '已暂停，后端拒绝执行';
          statusEl.dataset.mode = 'status';
          resultEl.textContent = `${op.title} 当前已暂停，后端已拒绝执行。\n${result.error || '请先启用任务后再试。'}`;
          resultEl.style.display = 'block';
          if (op.statusKey && taskState[op.statusKey]) {
            taskState[op.statusKey] = { ...taskState[op.statusKey], enabled: false, error: result.error };
          }
          syncActionButtons();
          await loadOpsStatus();
          return;
        }

        const ok = result.success !== false && !result.error;
        statusEl.textContent = ok ? '完成' : '失败';
        resultEl.textContent = JSON.stringify(result, null, 2);
        resultEl.style.display = 'block';

        if (op.statusKey) {
          await loadOpsStatus();
        }
      } catch (err) {
        statusEl.textContent = '出错';
        statusEl.dataset.mode = 'result';
        resultEl.textContent = err.message;
        resultEl.style.display = 'block';
      } finally {
        if (!op.statusKey || taskState[op.statusKey]?.enabled !== false) {
          btn.disabled = false;
        }
        syncActionButtons();
      }
    });
  });

  syncActionButtons();
  loadOpsStatus();

  document.getElementById('refresh-ai-job-status').addEventListener('click', loadOpsStatus);
  document.getElementById('refresh-embedding-status').addEventListener('click', loadOpsStatus);
}

/* ── Tab 3: 模型诊断 ── */
function renderDiag(el) {
  el.innerHTML = '';

  // Embedding test
  const embSection = document.createElement('div');
  embSection.className = 'adm-section';
  embSection.innerHTML = `<div class="adm-section-title">Embedding 模型测试 (BGE-M3)</div>
    <p class="adm-text-muted" style="margin:0 0 12px">发送测试文本到 BGE-M3 模型，验证向量生成是否正常</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="adm-btn adm-btn-sm" id="diag-emb-simple">简单测试</button>
      <button class="adm-btn adm-btn-sm" id="diag-emb-chunk">文档分块测试</button>
    </div>
    <pre class="adm-ai-result" id="result-diag-emb" style="display:none"></pre>`;
  el.appendChild(embSection);

  ['simple', 'chunk'].forEach(mode => {
    document.getElementById('diag-emb-' + mode).addEventListener('click', async () => {
      const btn = document.getElementById('diag-emb-' + mode);
      const resultEl = document.getElementById('result-diag-emb');
      btn.disabled = true;
      resultEl.style.display = 'block';
      resultEl.textContent = '测试中...';
      try {
        const data = await api.get('/test-embedding?mode=' + mode);
        resultEl.textContent = JSON.stringify(data, null, 2);
      } catch (err) {
        resultEl.textContent = '错误: ' + err.message;
      } finally {
        btn.disabled = false;
      }
    });
  });

  // Chat test
  const chatSection = document.createElement('div');
  chatSection.className = 'adm-section';
  chatSection.innerHTML = `<div class="adm-section-title">Chat 模型测试</div>
    <p class="adm-text-muted" style="margin:0 0 12px">发送测试问题到 Chat 模型，验证文本生成是否正常</p>
    <div class="adm-form-group">
      <label class="adm-form-label">测试问题</label>
      <input class="adm-input" id="diag-chat-q" value="请用一句话解释什么是净土宗。">
    </div>
    <div class="adm-form-group">
      <label class="adm-form-label">模型 ID</label>
      <input class="adm-input" id="diag-chat-model" placeholder="留空使用当前后台配置，例如 @cf/google/gemma-3-12b-it">
      <div class="adm-text-muted" style="margin-top:6px">后台可通过 AI_CHAT_MODEL / AI_CHAT_FALLBACK_MODEL 切换默认模型，这里可临时试跑候选模型</div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="adm-btn adm-btn-sm" id="diag-chat-run">运行测试</button>
    </div>
    <pre class="adm-ai-result" id="result-diag-chat" style="display:none"></pre>`;
  el.appendChild(chatSection);

  document.getElementById('diag-chat-run').addEventListener('click', async () => {
    const btn = document.getElementById('diag-chat-run');
    const resultEl = document.getElementById('result-diag-chat');
    const q = document.getElementById('diag-chat-q').value;
    const model = document.getElementById('diag-chat-model').value.trim();
    btn.disabled = true;
    resultEl.style.display = 'block';
    resultEl.textContent = '测试中...';
    try {
      const modelQuery = model ? '&model=' + encodeURIComponent(model) : '';
      const data = await api.get('/test-chat?q=' + encodeURIComponent(q) + modelQuery);
      resultEl.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
      resultEl.textContent = '错误: ' + err.message;
    } finally {
      btn.disabled = false;
    }
  });
}
