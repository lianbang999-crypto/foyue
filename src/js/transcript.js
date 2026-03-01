/* ===== 讲义文稿组件 ===== */
import { getTranscript } from './ai-client.js';
import { escapeHtml } from './utils.js';
import { t } from './i18n.js';

/**
 * 在目标容器中挂载讲义文稿展开按钮
 * @param {HTMLElement} container - 挂载容器（ep-item 的 .ep-text div）
 * @param {string} seriesId - 音频系列 ID
 * @param {number} episodeNum - 集数编号
 */
export function mountTranscript(container, seriesId, episodeNum) {
  if (!seriesId || !episodeNum) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'transcript-wrap';
  wrapper.innerHTML = `
    <button class="transcript-btn" aria-expanded="false">
      <svg viewBox="0 0 24 24" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><polyline points="14,2 14,8 20,8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      <span>${t('view_transcript')}</span>
    </button>
    <div class="transcript-body hidden"></div>
  `;

  let loaded = false;
  let loading = false;
  const btn = wrapper.querySelector('.transcript-btn');
  const body = wrapper.querySelector('.transcript-body');

  btn.addEventListener('click', async (e) => {
    e.stopPropagation(); // 防止冒泡触发 ep-item 的播放事件

    body.classList.toggle('hidden');
    const expanded = !body.classList.contains('hidden');
    btn.classList.toggle('active', expanded);
    btn.setAttribute('aria-expanded', String(expanded));

    if (!loaded && !loading && expanded) {
      loading = true;
      body.innerHTML = `<div class="transcript-loading"><span class="ai-loading-dot"></span>${escapeHtml(t('transcript_loading'))}</div>`;
      try {
        const data = await getTranscript(seriesId, episodeNum);
        const content = data.content?.trim();
        if (!content) throw new Error('empty');

        // 按双换行分段，单换行转 <br>
        const paragraphs = content.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
        const html = paragraphs.map(p =>
          `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`
        ).join('');

        body.innerHTML = `<div class="transcript-content">${html}</div>
          <div class="transcript-meta">${escapeHtml(data.title || '')}</div>`;
        loaded = true;
      } catch {
        body.innerHTML = `<p class="transcript-error">${escapeHtml(t('transcript_unavailable'))}</p>`;
      } finally {
        loading = false;
      }
    }
  });

  // 阻止 wrapper 上的点击事件冒泡
  wrapper.addEventListener('click', (e) => e.stopPropagation());

  container.appendChild(wrapper);
}
