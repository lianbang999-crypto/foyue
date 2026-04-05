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

function fmtProgress(done, total) {
  if (!total) return '--';
  return `${done}/${total} (${fmtPct(done, total)})`;
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
  el.appendChild(metrics);

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
  el.appendChild(section);

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
  el.appendChild(profSection);
}

/* ── Tab 2: 运维操作 ── */
function renderOps(el) {
  el.innerHTML = '';

  const statusCard = document.createElement('div');
  statusCard.className = 'adm-section';
  statusCard.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <div>
        <div class="adm-section-title">Embedding 构建状态</div>
        <p class="adm-text-muted" style="margin:0">查看当前已完成、失败和剩余待构建文档，便于安全续跑和全量重建</p>
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
      btn.disabled = true;
      statusEl.textContent = '执行中...';
      resultEl.style.display = 'none';

      try {
        let result;
        if (op.method === 'post') {
          if (op.queryMode) {
            // embedding build uses query params on POST
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
        statusEl.textContent = result?.success ? '完成' : '失败';
        resultEl.textContent = JSON.stringify(result, null, 2);
        resultEl.style.display = 'block';
      } catch (err) {
        statusEl.textContent = '出错';
        resultEl.textContent = err.message;
        resultEl.style.display = 'block';
      } finally {
        btn.disabled = false;
      }
    });
  });

  loadEmbeddingStatus();

  async function loadEmbeddingStatus() {
    const body = document.getElementById('embedding-status-body');
    const refreshBtn = document.getElementById('refresh-embedding-status');
    refreshBtn.disabled = true;
    body.innerHTML = '<div class="adm-loading">加载中...</div>';
    try {
      const data = await api.get('/embeddings/status');
      if (!data?.success) {
        body.innerHTML = `<div class="adm-empty">${esc(data?.error || '加载失败')}</div>`;
        return;
      }

      const latestCompleted = data.latestCompleted || [];
      const latestFailed = data.latestFailed || [];
      body.innerHTML = `<div class="adm-metrics" style="margin-bottom:16px">
          <div class="adm-metric"><div class="adm-metric-label">总文档</div><div class="adm-metric-value">${data.totalDocuments}</div></div>
          <div class="adm-metric"><div class="adm-metric-label">已完成</div><div class="adm-metric-value">${fmtProgress(data.completed, data.totalDocuments)}</div></div>
          <div class="adm-metric"><div class="adm-metric-label">失败</div><div class="adm-metric-value">${data.failed}</div></div>
          <div class="adm-metric"><div class="adm-metric-label">剩余</div><div class="adm-metric-value">${data.remaining}</div></div>
        </div>
        <div class="adm-table-wrap" style="margin-bottom:16px"><table class="adm-table">
          <thead><tr><th colspan="4">最近完成</th></tr><tr><th>文档</th><th>系列</th><th>Chunks</th><th>完成时间</th></tr></thead>
          <tbody>${latestCompleted.length ? latestCompleted.map(row => `<tr class="no-click"><td>${esc(row.title || row.document_id)}</td><td>${esc(row.series_name || '--')}</td><td>${row.chunks_count || 0}</td><td>${esc(row.completed_at || '--')}</td></tr>`).join('') : '<tr><td colspan="4" style="text-align:center">暂无完成记录</td></tr>'}</tbody>
        </table></div>
        <div class="adm-table-wrap"><table class="adm-table">
          <thead><tr><th colspan="4">最近失败</th></tr><tr><th>文档</th><th>系列</th><th>失败时间</th><th>错误</th></tr></thead>
          <tbody>${latestFailed.length ? latestFailed.map(row => `<tr class="no-click"><td>${esc(row.title || row.document_id)}</td><td>${esc(row.series_name || '--')}</td><td>${esc(row.created_at || '--')}</td><td>${esc(row.error || '--')}</td></tr>`).join('') : '<tr><td colspan="4" style="text-align:center">暂无失败记录</td></tr>'}</tbody>
        </table></div>`;
    } catch (err) {
      body.innerHTML = `<div class="adm-empty">${esc(err.message)}</div>`;
    } finally {
      refreshBtn.disabled = false;
    }
  }

  document.getElementById('refresh-embedding-status').addEventListener('click', loadEmbeddingStatus);
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
