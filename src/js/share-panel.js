/**
 * 统一分享面板 — 底部弹出式
 *
 * 支持：统一摘要、生成海报、复制链接、保存图片、原生分享
 */

import '../css/share.css';
import { shareContent, showToast } from './utils.js';
import { generatePoster } from './share-poster.js';

const SHARE_TYPE_META = {
  track: { label: '单集法音' },
  series: { label: '系列法音' },
  quote: { label: '每日法语' },
  practice: { label: '修持记录' },
  wenku: { label: '文库摘录' },
  ai: { label: 'AI 答疑' },
};

let _panel = null;
let _els = null;
let _blob = null;
let _previewUrl = null;
let _requestSeq = 0;
let _hideTimer = 0;

function normalizeText(value) {
  if (value == null) return '';
  return String(value)
    .replace(/\r/g, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function pickText(...values) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return '';
}

function truncateText(value, maxLength) {
  const text = normalizeText(value);
  if (!text || text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength - 1).replace(/[，。；：、,.!?！？\s]+$/u, '');
  return `${clipped}…`;
}

function formatCount(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return num.toLocaleString('zh-CN');
}

function getSummaryLimit(type) {
  switch (type) {
    case 'practice':
      return 52;
    case 'track':
      return 72;
    case 'series':
      return 76;
    case 'wenku':
      return 86;
    case 'quote':
      return 88;
    case 'ai':
      return 96;
    default:
      return 80;
  }
}

function derivePanelTitle(config) {
  switch (config.type) {
    case 'track':
      return pickText(config.subtitle, config.title, '单集法音');
    case 'wenku':
      return pickText(config.subtitle, config.title, '文库摘录');
    case 'practice':
      return pickText(config.practice, config.title, '修持记录');
    case 'series':
      return pickText(config.title, '系列法音');
    case 'quote':
      return pickText(config.title, '每日法语');
    case 'ai':
      return pickText(config.title, 'AI 答疑');
    default:
      return pickText(config.title, '净土法音');
  }
}

function derivePanelSubtitle(config) {
  const countText = formatCount(config.count);
  const totalText = formatCount(config.totalCount);

  switch (config.type) {
    case 'track':
      return config.title ? `选自《${config.title}》` : '';
    case 'series':
      return pickText(config.subtitle, '适合按次第连续收听');
    case 'quote':
      return pickText(config.author, config.subtitle, '一段法语，随时回照');
    case 'practice': {
      const parts = [];
      if (countText) parts.push(`今日 ${countText}`);
      if (totalText) parts.push(`累计 ${totalText}`);
      return parts.join(' · ') || '愿以修持长养正念';
    }
    case 'wenku':
      return config.title ? `摘录自《${config.title}》` : '开经释义，断疑生信';
    case 'ai':
      return pickText(config.subtitle, 'AI 内容仅供参考');
    default:
      return pickText(config.subtitle);
  }
}

function deriveShareTitle(config) {
  switch (config.type) {
    case 'track':
      return pickText(
        config.title && config.subtitle ? `《${config.title}》 ${config.subtitle}` : '',
        config.subtitle,
        config.title,
        '净土法音',
      );
    case 'series':
      return pickText(config.title ? `《${config.title}》` : '', config.title, '净土法音');
    case 'wenku':
      return pickText(
        config.title && config.subtitle ? `《${config.title}》 ${config.subtitle}` : '',
        config.subtitle,
        config.title,
        '净土文库',
      );
    case 'practice':
      return pickText(
        config.practice ? `${config.practice}修持记录` : '',
        config.title ? `${config.title}修持记录` : '',
        '修持记录',
      );
    case 'quote':
      return pickText(config.title, '每日法语');
    case 'ai':
      return pickText(config.title, 'AI 答疑');
    default:
      return pickText(config.title, '净土法音');
  }
}

function deriveShareSummary(config) {
  const maxLength = getSummaryLimit(config.type);
  const explicit = truncateText(config.summary, maxLength);
  if (explicit) return explicit;

  const title = normalizeText(config.title);
  const subtitle = normalizeText(config.subtitle);
  const quote = normalizeText(config.quote);
  const practice = pickText(config.practice, title, '修持');
  const countText = formatCount(config.count) || '0';
  const totalText = formatCount(config.totalCount);

  switch (config.type) {
    case 'track':
      return truncateText(
        quote || (
          subtitle && title
            ? `本期「${subtitle}」选自《${title}》，适合静心片刻时聆听。`
            : title
              ? `分享《${title}》中的一段净土法音，适合静心片刻时聆听。`
              : '一段适合静心片刻时聆听的净土法音。'
        ),
        maxLength,
      );
    case 'series':
      return truncateText(
        quote || (
          title && subtitle
            ? `《${title}》${subtitle}，适合按次第连续收听。`
            : title
              ? `《${title}》系列法音，适合按次第连续收听。`
              : '一组适合按次第连续收听的净土法音。'
        ),
        maxLength,
      );
    case 'quote':
      return truncateText(
        quote || (title ? `分享与「${title}」相关的一段法语，愿以此回照当下。` : '分享一段法语，愿以此回照当下。'),
        maxLength,
      );
    case 'practice':
      return truncateText(
        `${practice}今日已记录${countText}${totalText ? `，累计${totalText}` : ''}，愿以此长养正念。`,
        maxLength,
      );
    case 'wenku':
      return truncateText(
        quote || (
          title && subtitle
            ? `摘录自《${title}》〈${subtitle}〉，开经释义，断疑生信。`
            : title
              ? `摘录自《${title}》，开经释义，断疑生信。`
              : '开经释义，断疑生信。'
        ),
        maxLength,
      );
    case 'ai':
      return truncateText(
        quote || (title ? `围绕「${title}」整理了一段简明答复，供参考阅读。` : '一段供参考的 AI 答复摘要。'),
        maxLength,
      );
    default:
      return truncateText(pickText(quote, subtitle, title, '来自净土法音的一则分享。'), maxLength);
  }
}

function resolveShareConfig(config) {
  const type = SHARE_TYPE_META[config?.type] ? config.type : 'track';
  const normalized = {
    ...config,
    type,
    title: normalizeText(config?.title),
    subtitle: normalizeText(config?.subtitle),
    quote: normalizeText(config?.quote),
    author: normalizeText(config?.author),
    practice: normalizeText(config?.practice),
    summary: normalizeText(config?.summary),
    url: String(config?.url || window.location.href || '').trim(),
    count: config?.count,
    totalCount: config?.totalCount,
  };

  return {
    ...normalized,
    typeLabel: SHARE_TYPE_META[type].label,
    panelTitle: derivePanelTitle(normalized),
    panelSubtitle: derivePanelSubtitle(normalized),
    shareTitle: deriveShareTitle(normalized),
    summary: deriveShareSummary(normalized),
  };
}

function revokePreviewUrl() {
  if (!_previewUrl) return;
  URL.revokeObjectURL(_previewUrl);
  _previewUrl = null;
}

function clearHideTimer() {
  if (!_hideTimer) return;
  clearTimeout(_hideTimer);
  _hideTimer = 0;
}

function setButtonDisabled(button, disabled) {
  if (!button) return;
  button.disabled = disabled;
  button.classList.toggle('is-disabled', disabled);
}

function looksLikeQuickShareUrl(value) {
  const text = String(value || '').trim();
  if (!text || /\s/.test(text)) return false;
  return /^(https?:\/\/|\/|\?|#|mailto:|tel:)/i.test(text);
}

function resolveQuickShareUrl(value) {
  const text = String(value || '').trim();
  if (!text) return window.location.href;
  try {
    return new URL(text, window.location.href).toString();
  } catch {
    return window.location.href;
  }
}

function buildQuickShareClipboardText(title, text, url) {
  return [title, text && text !== title ? text : '', url].filter(Boolean).join('\n\n');
}

function copyQuickShareText(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('内容已复制');
    }).catch(() => {
      showToast('复制失败');
    });
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  showToast('内容已复制');
}

function createPanelHTML() {
  return `
<div class="share-backdrop" id="shareBackdrop"></div>
<div class="share-panel" id="sharePanel" role="dialog" aria-modal="true" aria-labelledby="sharePanelTitle" aria-describedby="sharePanelSummary">
  <div class="share-handle"></div>

  <div class="share-header-card">
    <div class="share-meta-row">
      <span class="share-type-badge" id="shareTypeBadge">分享</span>
      <span class="share-meta-site">净土法音 · foyue.org</span>
    </div>
    <h2 class="share-panel-title" id="sharePanelTitle">净土法音</h2>
    <p class="share-panel-subtitle" id="sharePanelSubtitle" hidden></p>
    <p class="share-panel-summary" id="sharePanelSummary"></p>
  </div>

  <div class="share-preview-card">
    <div class="share-preview-top">
      <div>
        <div class="share-section-eyebrow">海报预览</div>
        <p class="share-section-note" id="sharePreviewHint">摘要与二维码会自动排入同一张海报</p>
      </div>
      <button class="share-inline-btn" id="shareRetry" type="button" hidden>重试</button>
    </div>

    <div class="share-preview-frame" id="sharePosterPreview" aria-live="polite"></div>

    <div class="share-status-card" id="sharePreviewStatus">
      <div class="share-status-kicker" id="shareStatusKicker"></div>
      <div class="share-status-title" id="shareStatusTitle"></div>
      <p class="share-status-text" id="shareStatusText"></p>
    </div>
  </div>

  <div class="share-actions">
    <button class="share-action-btn share-action-btn--primary" id="shareNative" type="button" aria-label="系统分享">
      <span class="share-action-icon">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="5" r="3"></circle>
          <circle cx="6" cy="12" r="3"></circle>
          <circle cx="18" cy="19" r="3"></circle>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
        </svg>
      </span>
      <span class="share-action-copy">
        <span class="share-action-title">系统分享</span>
        <span class="share-action-note">使用当前摘要与海报</span>
      </span>
    </button>

    <div class="share-secondary-actions">
      <button class="share-action-btn share-action-btn--secondary" id="shareCopy" type="button" aria-label="复制链接">
        <span class="share-action-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
        </span>
        <span class="share-action-copy">
          <span class="share-action-title">复制链接</span>
          <span class="share-action-note">适合单独转发</span>
        </span>
      </button>

      <button class="share-action-btn share-action-btn--secondary" id="shareSave" type="button" aria-label="保存图片">
        <span class="share-action-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </span>
        <span class="share-action-copy">
          <span class="share-action-title">保存图片</span>
          <span class="share-action-note">生成后可存入相册</span>
        </span>
      </button>
    </div>
  </div>

  <button class="share-cancel" id="shareCancel" type="button">收起</button>
</div>`;
}

function renderHeader(config) {
  if (!_els) return;
  _els.panel.dataset.type = config.type;
  _els.typeBadge.textContent = config.typeLabel;
  _els.title.textContent = config.panelTitle;
  _els.summary.textContent = config.summary;

  if (config.panelSubtitle) {
    _els.subtitle.hidden = false;
    _els.subtitle.textContent = config.panelSubtitle;
  } else {
    _els.subtitle.hidden = true;
    _els.subtitle.textContent = '';
  }
}

function renderLoadingPreview() {
  _els.preview.dataset.state = 'loading';
  _els.preview.innerHTML = `
    <div class="share-preview-placeholder share-preview-placeholder--loading" aria-hidden="true">
      <div class="share-preview-sheet">
        <span class="share-preview-chip"></span>
        <span class="share-preview-line share-preview-line--title"></span>
        <span class="share-preview-line share-preview-line--subtitle"></span>
        <span class="share-preview-line"></span>
        <span class="share-preview-line share-preview-line--short"></span>
        <span class="share-preview-qrcode"></span>
      </div>
    </div>`;
}

function renderFailurePreview() {
  _els.preview.dataset.state = 'error';
  _els.preview.innerHTML = `
    <div class="share-preview-placeholder share-preview-placeholder--error">
      <div class="share-preview-seal">福</div>
      <div class="share-preview-fallback-title">海报暂未生成</div>
      <div class="share-preview-fallback-text">可重试一次，或先直接分享链接与摘要。</div>
    </div>`;
}

function renderSuccessPreview() {
  _els.preview.dataset.state = 'ready';
  _els.preview.innerHTML = '';
  const img = document.createElement('img');
  img.className = 'share-preview-img';
  img.src = _previewUrl;
  img.alt = '分享海报预览';
  _els.preview.appendChild(img);
}

function renderStatus(state) {
  if (!_els) return;

  const copy = {
    loading: {
      hint: '摘要、标题与二维码会自动排入同一张海报',
      kicker: '海报准备中',
      title: '正在生成纸感海报',
      text: '同一份摘要会同时用于弹层展示、海报内容和系统分享文案，通常只需片刻。',
    },
    ready: {
      hint: '当前摘要已同步到海报与系统分享文案',
      kicker: '已准备妥当',
      title: '海报已生成',
      text: '现在可以直接调用系统分享，或保存海报后再转发给同修。',
    },
    error: {
      hint: '本次未成功生成，可重试或先复制链接',
      kicker: '需要重试',
      title: '海报生成失败',
      text: '可重试生成海报，或先直接分享链接与当前摘要，不影响正常转发。',
    },
  }[state];

  _els.previewHint.textContent = copy.hint;
  _els.status.className = `share-status-card share-status-card--${state}`;
  _els.statusKicker.textContent = copy.kicker;
  _els.statusTitle.textContent = copy.title;
  _els.statusText.textContent = copy.text;
  _els.retry.hidden = state !== 'error';
}

function resetPreviewState() {
  _blob = null;
  revokePreviewUrl();
  renderLoadingPreview();
  renderStatus('loading');
  setButtonDisabled(_els.save, true);
}

async function handleNativeShare() {
  const config = _panel?._config;
  if (!config) return;

  if (_blob && typeof navigator.canShare === 'function' && typeof navigator.share === 'function') {
    const file = new File([_blob], 'foyue-share.jpg', { type: 'image/jpeg' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ title: config.shareTitle, text: config.summary, files: [file] });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
        try {
          await navigator.share({ title: config.shareTitle, files: [file] });
          return;
        } catch (fallbackErr) {
          if (fallbackErr?.name === 'AbortError') return;
        }
      }
    }
  }

  shareContent(config.shareTitle, config.url, config.summary);
}

function handleCopy() {
  const config = _panel?._config;
  if (!config) return;

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(config.url).then(() => {
      showToast('链接已复制');
    }).catch(() => showToast('复制失败'));
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = config.url;
  textarea.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  showToast('链接已复制');
}

function handleSave() {
  if (!_blob) {
    showToast('海报生成中，请稍候');
    return;
  }

  const url = URL.createObjectURL(_blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'foyue-share.jpg';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('图片已保存');
}

async function loadPosterPreview(config, requestSeq) {
  resetPreviewState();

  try {
    const blob = await generatePoster(config);
    if (requestSeq !== _requestSeq) return;

    _blob = blob;
    revokePreviewUrl();
    _previewUrl = URL.createObjectURL(blob);
    renderSuccessPreview();
    renderStatus('ready');
    setButtonDisabled(_els.save, false);
  } catch (err) {
    if (requestSeq !== _requestSeq) return;
    console.error('[Share] Poster generation failed:', err);
    renderFailurePreview();
    renderStatus('error');
    setButtonDisabled(_els.save, true);
  }
}

function retryPosterGeneration() {
  const config = _panel?._config;
  if (!config) return;
  const requestSeq = ++_requestSeq;
  void loadPosterPreview(config, requestSeq);
}

function ensurePanel() {
  if (_panel) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'shareRoot';
  wrapper.style.display = 'none';
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.innerHTML = createPanelHTML();
  document.body.appendChild(wrapper);
  _panel = wrapper;

  _els = {
    backdrop: wrapper.querySelector('#shareBackdrop'),
    panel: wrapper.querySelector('#sharePanel'),
    typeBadge: wrapper.querySelector('#shareTypeBadge'),
    title: wrapper.querySelector('#sharePanelTitle'),
    subtitle: wrapper.querySelector('#sharePanelSubtitle'),
    summary: wrapper.querySelector('#sharePanelSummary'),
    preview: wrapper.querySelector('#sharePosterPreview'),
    previewHint: wrapper.querySelector('#sharePreviewHint'),
    status: wrapper.querySelector('#sharePreviewStatus'),
    statusKicker: wrapper.querySelector('#shareStatusKicker'),
    statusTitle: wrapper.querySelector('#shareStatusTitle'),
    statusText: wrapper.querySelector('#shareStatusText'),
    retry: wrapper.querySelector('#shareRetry'),
    native: wrapper.querySelector('#shareNative'),
    copy: wrapper.querySelector('#shareCopy'),
    save: wrapper.querySelector('#shareSave'),
    cancel: wrapper.querySelector('#shareCancel'),
  };

  _els.backdrop.addEventListener('click', closeSharePanel);
  _els.cancel.addEventListener('click', closeSharePanel);
  _els.retry.addEventListener('click', retryPosterGeneration);
  _els.native.addEventListener('click', () => { void handleNativeShare(); });
  _els.copy.addEventListener('click', handleCopy);
  _els.save.addEventListener('click', handleSave);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && _panel?.style.display !== 'none') {
      closeSharePanel();
    }
  });

  renderFailurePreview();
  renderStatus('error');
  setButtonDisabled(_els.save, true);
}

function closeSharePanel() {
  if (!_panel || !_els) return;

  _requestSeq += 1;
  clearHideTimer();
  _panel.setAttribute('aria-hidden', 'true');
  _els.panel.classList.remove('share-panel--in');
  _els.backdrop.classList.remove('share-backdrop--in');
  _hideTimer = window.setTimeout(() => {
    _panel.style.display = 'none';
    _hideTimer = 0;
  }, 250);

  _panel._config = null;
  _blob = null;
  revokePreviewUrl();
}

/**
 * 显示分享面板
 * @param {Object} config
 * @param {'track'|'series'|'quote'|'practice'|'wenku'|'ai'} config.type
 * @param {string} config.title
 * @param {string} [config.subtitle]
 * @param {string} [config.quote]
 * @param {string} [config.author]
 * @param {string} config.url - 完整分享链接
 * @param {number} [config.count] - 念佛计数
 * @param {number} [config.totalCount]
 * @param {string} [config.practice]
 * @param {string} [config.summary]
 */
export async function showSharePanel(config) {
  ensurePanel();
  clearHideTimer();

  const resolvedConfig = resolveShareConfig(config || {});
  const requestSeq = ++_requestSeq;

  _panel._config = resolvedConfig;
  _panel.style.display = '';
  _panel.setAttribute('aria-hidden', 'false');

  renderHeader(resolvedConfig);

  requestAnimationFrame(() => {
    _els.backdrop.classList.add('share-backdrop--in');
    _els.panel.classList.add('share-panel--in');
  });

  await loadPosterPreview(resolvedConfig, requestSeq);
}

/**
 * 快速分享链接（不生成海报），用于简单场景
 */
export function quickShare(title, urlOrText, text) {
  const hasUrl = looksLikeQuickShareUrl(urlOrText);
  const shareUrl = hasUrl ? resolveQuickShareUrl(urlOrText) : window.location.href;
  const shareText = pickText(text, hasUrl ? '' : urlOrText, title);

  if (navigator.share) {
    navigator.share({ title, text: shareText, url: shareUrl }).catch((err) => {
      if (err?.name === 'AbortError') return;
      copyQuickShareText(buildQuickShareClipboardText(title, shareText, shareUrl));
    });
    return;
  }

  copyQuickShareText(buildQuickShareClipboardText(title, shareText, shareUrl));
}
