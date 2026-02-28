/* ===== AI 摘要组件 ===== */
import { getEpisodeSummary } from './ai-client.js';
import { escapeHtml } from './utils.js';

/**
 * 在目标容器中挂载 AI 摘要按钮
 * @param {HTMLElement} container - 挂载容器
 * @param {string} documentId - 文档 ID
 */
export function mountSummary(container, documentId) {
  if (!documentId) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'ai-summary';
  wrapper.innerHTML = `
    <button class="ai-summary-btn" aria-expanded="false">
      <svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span>AI 摘要</span>
    </button>
    <div class="ai-summary-body hidden"></div>
  `;

  let loaded = false;
  let loading = false;
  const btn = wrapper.querySelector('.ai-summary-btn');
  const body = wrapper.querySelector('.ai-summary-body');

  btn.addEventListener('click', async () => {
    body.classList.toggle('hidden');
    const expanded = !body.classList.contains('hidden');
    btn.classList.toggle('active', expanded);
    btn.setAttribute('aria-expanded', String(expanded));

    if (!loaded && !loading && expanded) {
      loading = true;
      body.innerHTML = '<div class="ai-summary-loading"><span class="ai-loading-dot"></span>正在生成摘要...</div>';
      try {
        const data = await getEpisodeSummary(documentId);
        const summary = data.summary?.trim();
        if (!summary) throw new Error('empty');
        body.innerHTML = `<p>${escapeHtml(summary)}</p><p class="ai-disclaimer">${escapeHtml(data.disclaimer || 'AI生成，仅供参考')}</p>`;
        loaded = true;
      } catch (err) {
        body.innerHTML = '<p class="ai-error">摘要暂不可用，请稍后重试</p>';
      } finally {
        loading = false;
      }
    }
  });

  container.appendChild(wrapper);
}
