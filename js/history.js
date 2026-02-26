/**
 * history.js — Play history CRUD + overlay
 * Depends on: state.js, i18n.js
 */
(function(){
'use strict';

var App = window.App;

function fmtRelTime(ts) {
  var d = Date.now() - ts, day = 86400000;
  if (d < day) return App.t('time_today');
  if (d < 2 * day) return App.t('time_yesterday');
  var n = Math.floor(d / day);
  return App.t('time_days_ago').replace('{n}', n);
}

function getHistory() {
  try {
    var h = JSON.parse(localStorage.getItem('pl-history')) || [];
    return h.filter(function(x) { return x.seriesTitle && x.epTitle && x.timestamp; });
  } catch (e) { return []; }
}

function addHistory(tr) {
  if (!tr || !tr.seriesId) return;
  try {
    var h = getHistory();
    h = h.filter(function(x) { return !(x.seriesId === tr.seriesId && x.epIdx === App.epIdx); });
    var catId = '';
    for (var ci = 0; ci < App.data.categories.length; ci++) {
      if (App.data.categories[ci].series.some(function(s) { return s.id === tr.seriesId; })) {
        catId = App.data.categories[ci].id; break;
      }
    }
    h.unshift({
      seriesId: tr.seriesId, seriesTitle: tr.seriesTitle || '', speaker: tr.speaker || '',
      catId: catId, epIdx: App.epIdx, epTitle: tr.title || tr.fileName || '',
      time: App.audio.currentTime || 0, duration: App.audio.duration || 0, timestamp: Date.now()
    });
    if (h.length > 20) h = h.slice(0, 20);
    localStorage.setItem('pl-history', JSON.stringify(h));
  } catch (e) {}
}

function syncHistoryProgress() {
  if (App.epIdx < 0 || !App.playlist[App.epIdx]) return;
  try {
    var h = getHistory();
    var tr = App.playlist[App.epIdx];
    for (var i = 0; i < h.length; i++) {
      if (h[i].seriesId === tr.seriesId && h[i].epIdx === App.epIdx) {
        h[i].time = App.audio.currentTime || 0;
        h[i].duration = App.audio.duration || 0;
        break;
      }
    }
    localStorage.setItem('pl-history', JSON.stringify(h));
  } catch (e) {}
}

function removeHistoryItem(idx) {
  try {
    var h = JSON.parse(localStorage.getItem('pl-history')) || [];
    h.splice(idx, 1);
    localStorage.setItem('pl-history', JSON.stringify(h));
  } catch (e) {}
}

function clearHistory() {
  localStorage.removeItem('pl-history');
}

function buildHistoryItemHTML(h, i, showDel) {
  var pct = h.duration > 0 ? Math.round(h.time / h.duration * 100) : 0;
  return '<div class="my-history-item" data-hid="' + i + '">'
    + '<div class="my-history-icon"><svg viewBox="0 0 24 24"><polygon points="8,4 20,12 8,20"/></svg></div>'
    + '<div class="my-history-body">'
    + '<div class="my-history-title">' + h.seriesTitle + '</div>'
    + '<div class="my-history-sub">' + h.epTitle + '</div>'
    + '<div class="my-history-progress"><div class="my-history-progress-fill" style="width:' + pct + '%"></div></div>'
    + '</div>'
    + '<div class="my-history-time">' + fmtRelTime(h.timestamp) + '</div>'
    + (showDel ? '<button class="history-del-btn" data-delidx="' + i + '"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' : '')
    + '</div>';
}

function renderHistoryOverlay() {
  var list = App.$('historyList');
  var h = getHistory();
  if (!h.length) {
    list.innerHTML = '<div class="history-empty" data-i18n="my_no_history">' + App.t('my_no_history') + '</div>';
    return;
  }
  list.innerHTML = h.map(function(item, i) { return buildHistoryItemHTML(item, i, true); }).join('');
  // Bind clicks
  list.querySelectorAll('.my-history-item').forEach(function(el) {
    el.addEventListener('click', function(e) {
      if (e.target.closest('.history-del-btn')) return;
      var idx = parseInt(el.dataset.hid);
      var item = getHistory()[idx];
      if (!item) return;
      var cat = App.data.categories.find(function(c) { return c.id === item.catId; });
      if (cat) {
        var sr = cat.series.find(function(s) { return s.id === item.seriesId; });
        if (sr) {
          App.$('historyOverlay').classList.remove('show');
          App.playList(sr.episodes, item.epIdx, sr, item.time);
          App.expPlayer.classList.add('show');
        }
      }
    });
  });
  list.querySelectorAll('.history-del-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var idx = parseInt(btn.dataset.delidx);
      removeHistoryItem(idx);
      renderHistoryOverlay();
      var myPage = App.contentArea.querySelector('.my-page');
      if (myPage) App.renderMyPage();
    });
  });
}

// Expose on App
App.fmtRelTime = fmtRelTime;
App.getHistory = getHistory;
App.addHistory = addHistory;
App.syncHistoryProgress = syncHistoryProgress;
App.removeHistoryItem = removeHistoryItem;
App.clearHistory = clearHistory;
App.buildHistoryItemHTML = buildHistoryItemHTML;
App.renderHistoryOverlay = renderHistoryOverlay;

})();
