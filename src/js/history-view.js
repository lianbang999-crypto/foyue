import { state } from './state.js';
import { t } from './i18n.js';
import { getDOM } from './dom.js';
import { getHistory, clearHistory, resolveHistoryTarget } from './history.js';
import { playList } from './player.js';
 import { escapeHtml, fmt } from './utils.js';

function fmtRelTime(ts) {
  const delta = Date.now() - ts;
  const day = 86400000;
  if (delta < day) return t('time_today');
  if (delta < 2 * day) return t('time_yesterday');
  const days = Math.floor(delta / day);
  return t('time_days_ago').replace('{n}', days);
}

function buildHistItem(item, index) {
   const pct = item.duration > 0
     ? Math.max(0, Math.min(100, Math.round(item.time / item.duration * 100)))
     : 0;
   const episodeNumber = item.episodeNum > 0 ? item.episodeNum : (item.epIdx >= 0 ? item.epIdx + 1 : 0);
   const episodeText = episodeNumber > 0 ? '第 ' + episodeNumber + ' 讲' : '';
   const progressText = item.time > 0
     ? (item.duration > 0 ? '已听 ' + pct + '%' : '播放到 ' + fmt(item.time))
     : t('my_history');
  return '<div class="my-history-item glass-panel" data-hid="' + index + '">'
     + '<div class="my-history-item-icon"><svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg></div>'
    + '<div class="my-history-body">'
     + '<div class="my-history-kicker"><span class="my-history-series">' + escapeHtml(item.seriesTitle) + '</span><span class="my-history-when">' + fmtRelTime(item.timestamp) + '</span></div>'
     + '<div class="my-history-title">' + escapeHtml(item.epTitle) + '</div>'
     + '<div class="my-history-meta">'
     + (episodeText ? '<span class="my-history-episode">' + episodeText + '</span>' : '')
     + '<span class="my-history-progress-text">' + progressText + '</span>'
     + '</div>'
    + '<div class="my-history-bar"><div class="my-history-bar-fill" style="width:' + pct + '%"></div></div>'
    + '</div>'
    + '</div>';
}

export function renderHistoryView(onBack) {
  const dom = getDOM();
  dom.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page').forEach(el => el.remove());

  const view = document.createElement('div');
  view.className = 'view active';
  const hist = getHistory();
  const subText = hist.length > 0
    ? t('my_history_desc').replace('{n}', hist.length)
    : '';

  view.innerHTML = `<div class="ep-header">
    <button class="btn-back" id="histBackBtn"><svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg></button>
    <div class="ep-header-info">
      <div class="ep-header-title">${t('my_history')}</div>
      <div class="ep-header-sub">${subText}</div>
    </div>
    ${hist.length ? '<button class="my-history-clear" id="histClearBtn">' + t('my_clear_history') + '</button>' : ''}
  </div>
  <div id="histSubviewList"></div>`;

  dom.contentArea.appendChild(view);

  const listEl = view.querySelector('#histSubviewList');
  if (hist.length === 0) {
    listEl.innerHTML = '<div class="my-history-empty">' + t('my_no_history') + '</div>';
  } else {
    listEl.innerHTML = '<div class="my-list">' + hist.map((item, index) => buildHistItem(item, index)).join('') + '</div>';
  }

  listEl.querySelectorAll('.my-history-item').forEach(el => {
    el.addEventListener('click', async () => {
      const index = parseInt(el.dataset.hid, 10);
      const item = getHistory()[index];
      if (!item) return;
      if (!state.isDataFull && state.ensureFullData) {
        await state.ensureFullData({ rerenderHome: false });
      }
      const target = resolveHistoryTarget(item);
      if (!target) return;
      playList(target.series.episodes, target.epIdx, target.series, item.time);
      dom.expPlayer.classList.add('show');
    });
  });

  view.querySelector('#histBackBtn').addEventListener('click', () => {
    if (typeof onBack === 'function') onBack();
  });

  const clearBtn = view.querySelector('#histClearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearHistory();
      renderHistoryView(onBack);
    });
  }
}
