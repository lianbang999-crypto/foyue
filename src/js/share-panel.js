/**
 * 统一分享面板 — 底部弹出式
 * 
 * 支持：生成海报、复制链接、保存图片、原生分享
 */

import { shareContent, showToast } from './utils.js';
import { generatePoster } from './share-poster.js';

let _panel = null;
let _blob = null;

// ============================================================
// 面板 HTML
// ============================================================

function createPanelHTML() {
    return `
<div class="share-backdrop" id="shareBackdrop"></div>
<div class="share-panel" id="sharePanel" role="dialog" aria-label="分享">
  <div class="share-handle"></div>
  <div class="share-preview" id="sharePosterPreview">
    <div class="share-preview-loading">生成海报中...</div>
  </div>
  <div class="share-actions">
    <button class="share-action-btn" id="shareNative" aria-label="分享">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
      </svg>
      <span>分享</span>
    </button>
    <button class="share-action-btn" id="shareCopy" aria-label="复制链接">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>
      <span>复制链接</span>
    </button>
    <button class="share-action-btn" id="shareSave" aria-label="保存图片">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <span>保存图片</span>
    </button>
  </div>
  <button class="share-cancel" id="shareCancel">取消</button>
</div>`;
}

// ============================================================
// 面板控制
// ============================================================

function ensurePanel() {
    if (_panel) return;
    const wrapper = document.createElement('div');
    wrapper.id = 'shareRoot';
    wrapper.innerHTML = createPanelHTML();
    document.body.appendChild(wrapper);
    _panel = wrapper;

    // 事件绑定
    wrapper.querySelector('#shareBackdrop').addEventListener('click', closeSharePanel);
    wrapper.querySelector('#shareCancel').addEventListener('click', closeSharePanel);

    wrapper.querySelector('#shareNative').addEventListener('click', () => {
        const config = _panel._config;
        if (!config) return;
        if (_blob && navigator.canShare) {
            const file = new File([_blob], 'foyue-share.png', { type: 'image/png' });
            if (navigator.canShare({ files: [file] })) {
                navigator.share({ title: config.title, files: [file] }).catch(() => { });
                return;
            }
        }
        shareContent(config.title, config.url);
    });

    wrapper.querySelector('#shareCopy').addEventListener('click', () => {
        const config = _panel._config;
        if (!config) return;
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(config.url).then(() => {
                showToast('链接已复制');
            }).catch(() => showToast('复制失败'));
        } else {
            // 降级：使用 execCommand 兼容旧浏览器
            const ta = document.createElement('textarea');
            ta.value = config.url;
            ta.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('链接已复制');
        }
    });

    wrapper.querySelector('#shareSave').addEventListener('click', () => {
        if (!_blob) { showToast('海报生成中，请稍候'); return; }
        const url = URL.createObjectURL(_blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'foyue-share.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('图片已保存');
    });
}

function closeSharePanel() {
    if (!_panel) return;
    const panel = _panel.querySelector('.share-panel');
    const backdrop = _panel.querySelector('.share-backdrop');
    panel.classList.remove('share-panel--in');
    backdrop.classList.remove('share-backdrop--in');
    setTimeout(() => {
        _panel.style.display = 'none';
    }, 250);
    _blob = null;
}

// ============================================================
// 公开 API
// ============================================================

/**
 * 显示分享面板
 * @param {Object} config
 * @param {'track'|'series'|'quote'|'practice'} config.type
 * @param {string} config.title
 * @param {string} [config.subtitle]
 * @param {string} [config.quote]
 * @param {string} [config.author]
 * @param {string} config.url - 完整分享链接
 * @param {number} [config.count] - 念佛计数
 * @param {number} [config.totalCount]
 * @param {string} [config.practice]
 */
export async function showSharePanel(config) {
    ensurePanel();
    _panel._config = config;
    _panel.style.display = '';
    _blob = null;

    const preview = _panel.querySelector('#sharePosterPreview');
    preview.innerHTML = '<div class="share-preview-loading">生成海报中...</div>';

    // 显示面板
    requestAnimationFrame(() => {
        _panel.querySelector('.share-backdrop').classList.add('share-backdrop--in');
        _panel.querySelector('.share-panel').classList.add('share-panel--in');
    });

    // 异步生成海报
    try {
        _blob = await generatePoster(config);
        const imgUrl = URL.createObjectURL(_blob);
        preview.innerHTML = `<img class="share-preview-img" src="${imgUrl}" alt="海报预览">`;
    } catch (err) {
        console.error('[Share] Poster generation failed:', err);
        preview.innerHTML = '<div class="share-preview-loading">海报生成失败</div>';
    }
}

/**
 * 快速分享链接（不生成海报），用于简单场景
 */
export function quickShare(title, url) {
    shareContent(title, url);
}
