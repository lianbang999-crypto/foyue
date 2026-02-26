/**
 * render.js — Page rendering (home, category, episodes, my page, search)
 * Depends on: state.js, i18n.js, player.js, history.js
 */
(function(){
'use strict';

var App = window.App;

/* ===== Daily Quotes ===== */
var DAILY_QUOTES = [
  {zh:'若人但念阿弥陀，是名无上深妙禅。',en:'To recite Amitabha is the supreme and profound meditation.',author:'永明延寿大师'},
  {zh:'得生与否，全由信愿之有无；品位高下，全由持名之深浅。',en:'Rebirth depends on faith and vows; the grade depends on the depth of recitation.',author:'蕅益大师'},
  {zh:'念佛法门，别无奇特，只深信力行为要耳。',en:'The Pure Land practice requires nothing special — just deep faith and earnest practice.',author:'印光大师'},
  {zh:'真为生死，发菩提心，以深信愿，持佛名号。',en:'For the matter of birth and death, arouse Bodhi mind; with deep faith and vow, recite the Buddha\'s name.',author:'彻悟大师'},
  {zh:'一句弥陀，是佛王、是法王、是咒王、是功德之王。',en:'One recitation of Amitabha is the king of Buddhas, king of Dharma, king of mantras, king of merit.',author:'莲池大师'},
  {zh:'阿弥陀佛，无上医王，舍此不求，是为痴狂。',en:'Amitabha, the supreme healer; to abandon this and seek elsewhere is truly deluded.',author:'省庵大师'},
  {zh:'但得见弥陀，何愁不开悟。',en:'If one can but meet Amitabha, why worry about not attaining awakening?',author:'大安法师'},
  {zh:'净土一法，乃十方三世一切诸佛上成佛道、下化众生之成始成终之大法也。',en:'The Pure Land Dharma is the ultimate teaching by which all Buddhas attain Buddhahood and liberate sentient beings.',author:'印光大师'},
  {zh:'信愿持名，求生净土，乃佛教之特别法门。',en:'Holding the name with faith and vow, seeking rebirth — this is the special Dharma gate of Buddhism.',author:'蕅益大师'},
  {zh:'如来所以兴出世，唯说弥陀本愿海。',en:'The Tathagata appeared in this world solely to teach the ocean of Amitabha\'s primal vow.',author:'善导大师'},
  {zh:'世间一切重苦，悉由自心所现。心若灭时，苦亦灭。',en:'All heavy sufferings in the world arise from one\'s own mind. When the mind ceases, suffering ceases.',author:'大安法师'},
  {zh:'厌离娑婆，欣求极乐。',en:'Renounce the Saha world; aspire to the Land of Ultimate Bliss.',author:'善导大师'},
];

function renderCategory(tabId) {
  App.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page').forEach(function(el) { el.remove(); });
  var cat = App.data.categories.find(function(c) { return c.id === tabId; });
  if (!cat) { App.contentArea.innerHTML = '<div class="loader-text">' + App.t('no_content') + '</div>'; return; }
  var wrap = document.createElement('div'); wrap.className = 'view active';
  var list = document.createElement('div'); list.className = 'series-list';
  var unit = tabId === 'fohao' ? App.t('tracks') : App.t('episodes');
  var nowSid = App.epIdx >= 0 && App.playlist.length ? App.playlist[App.epIdx].seriesId : null;

  cat.series.forEach(function(s) {
    var card = document.createElement('div');
    var isPlaying = s.id === nowSid;
    card.className = 'card' + (isPlaying ? ' now-playing' : '');
    var introHtml = s.intro ? '<div class="card-intro">' + s.intro + '</div>' : '';
    var playTag = isPlaying ? '<span class="card-playing-tag">' + App.t('now_playing') + '</span>' : '';
    card.innerHTML = '<div class="card-icon">' + (App.ICONS[tabId] || App.ICONS.tingjingtai) + '</div>'
      + '<div class="card-body"><div class="card-title">' + s.title + playTag + '</div>' + introHtml + '<div class="card-meta">' + (s.speaker || '') + ' \u00B7 ' + s.totalEpisodes + ' ' + unit + '</div></div>'
      + '<span class="card-arrow"><svg viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18"/></svg></span>';
    card.addEventListener('click', function() { showEpisodes(s, tabId); });
    list.appendChild(card);
  });
  wrap.appendChild(list); App.contentArea.appendChild(wrap);
}

function showEpisodes(series, tabId) {
  App.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page').forEach(function(el) { el.remove(); });
  App.seriesId = series.id;
  var unit = tabId === 'fohao' ? App.t('tracks') : App.t('episodes');
  var introHdr = series.intro ? '<div class="ep-header-intro">' + series.intro + '</div>' : '';
  var view = document.createElement('div'); view.className = 'view active ep-view';
  view.innerHTML = '<div class="ep-header">'
    + '<button class="btn-back" id="backBtn"><svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg></button>'
    + '<div class="ep-header-info"><div class="ep-header-title">' + series.title + '</div><div class="ep-header-sub">' + (series.speaker || '') + ' \u00B7 ' + series.totalEpisodes + ' ' + unit + '</div>' + introHdr + '</div>'
    + '<button class="btn-play-all" id="playAllBtn" aria-label="' + App.t('play_all') + '"><svg viewBox="0 0 24 24"><polygon points="8,4 20,12 8,20"/></svg></button>'
    + '</div><ul class="ep-list" id="epList"></ul>';
  App.contentArea.appendChild(view);

  view.querySelector('#backBtn').addEventListener('click', function() {
    App.seriesId = null;
    if (App.tab === 'home') renderHomePage();
    else renderCategory(App.tab);
  });

  var playAllBtn = view.querySelector('#playAllBtn');
  function updatePlayAllBtn() {
    if (App.isSwitching) return;
    var isThisSeries = App.playlist.length && App.epIdx >= 0 && App.playlist[App.epIdx] && App.playlist[App.epIdx].seriesId === series.id;
    var playing = isThisSeries && !App.audio.paused;
    playAllBtn.innerHTML = playing ? App.ICON_PAUSE_FILLED : App.ICON_PLAY_FILLED;
  }
  updatePlayAllBtn();
  App.audio.addEventListener('play', updatePlayAllBtn);
  App.audio.addEventListener('pause', updatePlayAllBtn);
  var obs = new MutationObserver(function() {
    if (!view.parentNode) { App.audio.removeEventListener('play', updatePlayAllBtn); App.audio.removeEventListener('pause', updatePlayAllBtn); obs.disconnect(); }
  });
  obs.observe(App.contentArea, { childList: true });

  playAllBtn.addEventListener('click', function() {
    var isThisSeries = App.playlist.length && App.epIdx >= 0 && App.playlist[App.epIdx] && App.playlist[App.epIdx].seriesId === series.id;
    if (isThisSeries) { App.togglePlay(); }
    else { App.playList(series.episodes, 0, series); }
  });

  var hasAudio = !!App.audio.src;
  var alreadyPlaying = App.playlist.length && App.epIdx >= 0 && App.playlist[App.epIdx] && App.playlist[App.epIdx].seriesId === series.id;
  if (!hasAudio && !alreadyPlaying && series.episodes.length) App.playList(series.episodes, 0, series);

  var ul = view.querySelector('#epList');
  series.episodes.forEach(function(ep, idx) {
    var li = document.createElement('li');
    li.className = 'ep-item' + (App.isCurrentTrack(series.id, idx) ? ' playing' : '');
    var introHtml = ep.intro ? '<span class="ep-intro">' + ep.intro + '</span>' : '';
    li.innerHTML = '<span class="ep-num">' + (ep.id || idx + 1) + '</span>'
      + '<div class="eq-bars"><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span></div>'
      + '<div class="ep-text"><span class="ep-title">' + (ep.title || ep.fileName) + '</span>' + introHtml + '</div>';
    li.addEventListener('click', function() {
      if (App.isCurrentTrack(series.id, idx)) { App.togglePlay(); return; }
      App.playList(series.episodes, idx, series);
    });
    ul.appendChild(li);
  });
}

function doSearch(q) {
  if (!q || !App.data) { if (App.tab === 'home') renderHomePage(); else renderCategory(App.tab); return; }
  App.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page').forEach(function(el) { el.remove(); });
  var ql = q.toLowerCase(); var results = [];
  App.data.categories.forEach(function(cat) {
    cat.series.forEach(function(s) {
      if (s.title.toLowerCase().includes(ql) || (s.titleEn || '').toLowerCase().includes(ql))
        results.push({ type: 'series', series: s, catId: cat.id });
      s.episodes.forEach(function(ep, idx) {
        if ((ep.title || ep.fileName || '').toLowerCase().includes(ql))
          results.push({ type: 'ep', series: s, ep: ep, idx: idx, catId: cat.id });
      });
    });
  });
  var wrap = document.createElement('div'); wrap.className = 'view active';
  if (!results.length) { wrap.innerHTML = '<div class="loader-text">' + App.t('no_results') + '</div>'; }
  else {
    wrap.innerHTML = '<div class="search-label">' + App.t('search_results') + ' (' + results.length + ')</div>';
    var ul = document.createElement('ul'); ul.className = 'ep-list';
    results.slice(0, 50).forEach(function(r) {
      var li = document.createElement('li'); li.className = 'ep-item';
      if (r.type === 'series') {
        li.innerHTML = '<span class="ep-num" style="color:var(--accent)">\u2022</span><span class="ep-title">' + r.series.title + ' <small style="color:var(--text-muted)">(' + r.series.totalEpisodes + App.t('episodes') + ')</small></span>';
        li.addEventListener('click', function() { App.searchInput.value = ''; App.searchRow.classList.remove('show'); App.$('btnSearch').classList.remove('active'); showEpisodes(r.series, r.catId); });
      } else {
        li.innerHTML = '<span class="ep-num">' + (r.ep.id || r.idx + 1) + '</span><span class="ep-title">' + (r.ep.title || r.ep.fileName) + ' <small style="color:var(--text-muted)">\u00B7 ' + r.series.title + '</small></span>';
        li.addEventListener('click', function() { App.playList(r.series.episodes, r.idx, r.series); });
      }
      ul.appendChild(li);
    });
    wrap.appendChild(ul);
  }
  App.contentArea.appendChild(wrap);
}

function renderHomePage() {
  App.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page').forEach(function(el) { el.remove(); });
  var page = document.createElement('div'); page.className = 'home-page active';

  var dayIdx = Math.floor(Date.now() / 86400000) % DAILY_QUOTES.length;
  var quote = DAILY_QUOTES[dayIdx];
  var quoteText = App.lang === 'zh' ? quote.zh : quote.en;

  var fohaoCat = App.data.categories.find(function(c) { return c.id === 'fohao'; });
  var fohaoSeries = fohaoCat ? fohaoCat.series.find(function(s) { return s.id === 'donglin-fohao'; }) : null;
  var fohaoEps = fohaoSeries ? fohaoSeries.episodes : [];
  var nowSid = App.epIdx >= 0 && App.playlist.length ? App.playlist[App.epIdx].seriesId : null;

  var continueHtml = '';
  try {
    var st = JSON.parse(localStorage.getItem('pl-state'));
    if (st && st.seriesId) {
      var cSeries = null, cCat = null;
      for (var ci = 0; ci < App.data.categories.length; ci++) {
        var s = App.data.categories[ci].series.find(function(x) { return x.id === st.seriesId; });
        if (s) { cSeries = s; cCat = App.data.categories[ci]; break; }
      }
      if (cSeries) {
        var cIdx = st.idx || 0;
        var ep = cSeries.episodes[cIdx];
        var epTitle = ep ? (ep.title || ep.fileName) : '';
        var pct = st.duration > 0 ? Math.min(100, Math.round((st.time || 0) / st.duration * 100)) : 0;
        var isPlaying = nowSid === st.seriesId && App.epIdx === cIdx && !App.audio.paused;
        var icon = isPlaying ? App.ICON_PAUSE : App.ICON_PLAY;
        continueHtml = '<div class="home-section"><div class="home-section-title">' + App.t('home_continue') + '</div>'
          + '<div class="home-continue-card' + (isPlaying ? ' playing' : '') + '" data-sid="' + cSeries.id + '" data-cat="' + cCat.id + '" data-idx="' + cIdx + '" data-time="' + (st.time || 0) + '">'
          + '<div class="home-continue-icon">' + icon + '</div>'
          + '<div class="home-continue-body">'
          + '<div class="home-continue-title">' + cSeries.title + '</div>'
          + '<div class="home-continue-sub">' + epTitle + ' \u00B7 ' + (cIdx + 1) + '/' + cSeries.totalEpisodes + '</div>'
          + '</div>'
          + '<div class="home-continue-progress"><div class="home-continue-progress-fill" style="width:' + pct + '%"></div></div>'
          + '</div></div>';
      }
    }
  } catch (e) {}

  var lectCat = App.data.categories.find(function(c) { return c.id === 'tingjingtai'; });
  var recSeries = lectCat ? lectCat.series.slice(0, 3) : [];
  var recHtml = '';
  if (recSeries.length) {
    recHtml = '<div class="home-section">'
      + '<div class="home-section-title">' + App.t('home_recommended') + '</div>'
      + '<div class="home-rec-list">' + recSeries.map(function(s) {
        return '<div class="home-rec-card" data-sid="' + s.id + '" data-cat="tingjingtai">'
          + '<div class="home-rec-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3v9l6 3"/></svg></div>'
          + '<div class="home-rec-body">'
          + '<div class="home-rec-title">' + s.title + '</div>'
          + '<div class="home-rec-sub">' + (s.speaker || '') + ' \u00B7 ' + s.totalEpisodes + ' ' + App.t('episodes') + '</div>'
          + '</div></div>';
      }).join('') + '</div></div>';
  }

  var chantCards = fohaoEps.map(function(ep, idx) {
    var isPlaying = nowSid === 'donglin-fohao' && App.epIdx === idx;
    return '<div class="home-chant-card' + (isPlaying ? ' playing' : '') + '" data-fh-idx="' + idx + '">'
      + '<div class="home-chant-icon"><svg viewBox="0 0 24 24"><path d="M12 3c0 0-5 7-5 13s5 5 5 5 5 1 5-5S12 3 12 3z"/></svg></div>'
      + '<div class="home-chant-name">' + ep.title + '</div></div>';
  }).join('');

  page.innerHTML = '<div class="home-section">'
    + '<div class="home-section-title">' + App.t('home_daily_quote') + '</div>'
    + '<div class="home-quote"><div class="home-quote-text">' + quoteText + '</div>'
    + '<div class="home-quote-author">\u2014 ' + quote.author + '</div></div></div>'
    + '<div class="home-section"><div class="home-section-title">' + App.t('home_chanting') + '</div>'
    + '<div class="home-chanting-scroll">' + chantCards + '</div></div>'
    + continueHtml + recHtml;
  App.contentArea.appendChild(page);

  // Wire chanting cards
  page.querySelectorAll('.home-chant-card').forEach(function(card) {
    card.addEventListener('click', function() {
      var idx = parseInt(card.dataset.fhIdx);
      if (!fohaoSeries) return;
      var curSid = App.epIdx >= 0 && App.playlist.length ? App.playlist[App.epIdx].seriesId : null;
      if (curSid === 'donglin-fohao' && App.epIdx === idx) { App.togglePlay(); return; }
      App.playList(fohaoSeries.episodes, idx, fohaoSeries);
    });
  });

  // Wire continue card
  var contCard = page.querySelector('.home-continue-card');
  if (contCard) {
    contCard.addEventListener('click', function() {
      var sid = contCard.dataset.sid;
      var catId = contCard.dataset.cat;
      var idx = parseInt(contCard.dataset.idx) || 0;
      var restoreTime = parseFloat(contCard.dataset.time) || 0;
      var curSid = App.epIdx >= 0 && App.playlist.length ? App.playlist[App.epIdx].seriesId : null;
      if (curSid === sid && App.epIdx === idx) { App.expPlayer.classList.add('show'); return; }
      var cat = App.data.categories.find(function(c) { return c.id === catId; });
      if (cat) {
        var sr = cat.series.find(function(s) { return s.id === sid; });
        if (sr) { App.playList(sr.episodes, idx, sr, restoreTime); App.expPlayer.classList.add('show'); }
      }
    });
  }

  // Live-update play states
  function updateHomePlayState() {
    if (App.isSwitching) return;
    var curSid = App.epIdx >= 0 && App.playlist.length ? App.playlist[App.epIdx].seriesId : null;
    var playing = !App.audio.paused;
    if (contCard) {
      var sid = contCard.dataset.sid;
      var idx = parseInt(contCard.dataset.idx) || 0;
      var active = curSid === sid && App.epIdx === idx && playing;
      contCard.classList.toggle('playing', active);
      var iconEl = contCard.querySelector('.home-continue-icon');
      if (iconEl) iconEl.innerHTML = active ? App.ICON_PAUSE : App.ICON_PLAY;
    }
    page.querySelectorAll('.home-chant-card').forEach(function(card) {
      var idx = parseInt(card.dataset.fhIdx);
      card.classList.toggle('playing', curSid === 'donglin-fohao' && App.epIdx === idx && playing);
    });
  }
  App.audio.addEventListener('play', updateHomePlayState);
  App.audio.addEventListener('pause', updateHomePlayState);
  var homeObs = new MutationObserver(function() {
    if (!page.parentNode) { App.audio.removeEventListener('play', updateHomePlayState); App.audio.removeEventListener('pause', updateHomePlayState); homeObs.disconnect(); }
  });
  homeObs.observe(App.contentArea, { childList: true });

  // Wire recommended cards
  page.querySelectorAll('.home-rec-card').forEach(function(card) {
    card.addEventListener('click', function() {
      var sid = card.dataset.sid;
      var catId = card.dataset.cat;
      var cat = App.data.categories.find(function(c) { return c.id === catId; });
      if (cat) {
        var sr = cat.series.find(function(s) { return s.id === sid; });
        if (sr) showEpisodes(sr, catId);
      }
    });
  });
}

function renderMyPage() {
  App.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page').forEach(function(el) { el.remove(); });
  var page = document.createElement('div'); page.className = 'my-page active';
  var themeText = App.dark ? App.t('theme_dark') : App.t('theme_light');
  var langText = { zh: '\u4E2D\u6587', en: 'English', fr: 'Fran\u00E7ais' }[App.lang] || '\u4E2D\u6587';

  var hist = App.getHistory();
  var histHTML = '';
  if (hist.length) {
    var show = hist.slice(0, 3);
    histHTML = show.map(function(h, i) { return App.buildHistoryItemHTML(h, i, false); }).join('');
    if (hist.length > 3) {
      histHTML += '<div class="my-history-more" id="myHistoryMore">' + App.t('my_history_all') + ' (' + hist.length + ')</div>';
    }
  } else {
    histHTML = '<div class="my-history-empty" data-i18n="my_no_history">' + App.t('my_no_history') + '</div>';
  }

  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  var ua = navigator.userAgent;
  var isInApp = /MicroMessenger|WeChat|QQ\/|Weibo|DingTalk|Alipay|baiduboxapp/i.test(ua);
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|Chrome/.test(ua);
  var installHTML = '';
  if (!isStandalone && !isInApp) {
    var stepsHTML = '';
    if (isIOS && isSafari) {
      stepsHTML = '<div class="my-install-steps"><svg class="ios-icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12l7-7 7 7" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> ' + App.t('my_install_ios') + '</div>';
    } else {
      stepsHTML = '<div class="my-install-steps">' + App.t('my_install_android') + '</div>'
        + '<button class="my-install-btn" id="myInstallBtn" data-i18n="my_install_btn">' + App.t('my_install_btn') + '</button>';
    }
    installHTML = '<div class="my-section">'
      + '<div class="my-section-title" data-i18n="my_install">' + App.t('my_install') + '</div>'
      + '<div class="my-install-card">'
      + '<div class="my-install-top">'
      + '<div class="my-install-icon"><svg viewBox="0 0 24 24"><path d="M12 15V3m0 12l-4-4m4 4l4-4"/><path d="M2 17l.621 2.485A2 2 0 0 0 4.561 21h14.878a2 2 0 0 0 1.94-1.515L22 17"/></svg></div>'
      + '<div class="my-install-text">'
      + '<div class="my-install-text-title" data-i18n="my_install">' + App.t('my_install') + '</div>'
      + '<div class="my-install-text-desc" data-i18n="my_install_desc">' + App.t('my_install_desc') + '</div>'
      + '</div></div>'
      + '<div class="my-install-benefit" data-i18n="my_install_benefit">' + App.t('my_install_benefit') + '</div>'
      + stepsHTML
      + '</div></div>';
  }

  page.innerHTML = '<div class="my-profile">'
    + '<div class="my-avatar"><img src="/icons/logo.png" alt="\u51C0\u571F\u6CD5\u97F3" style="width:100%;height:100%;object-fit:contain;"></div>'
    + '<div class="my-name" data-i18n="my_greeting">' + App.t('my_greeting') + '</div>'
    + '<div class="my-subtitle" data-i18n="my_subtitle">' + App.t('my_subtitle') + '</div>'
    + '</div>'
    + '<div class="my-section">'
    + '<div class="my-section-title" data-i18n="my_history">' + App.t('my_history') + '</div>'
    + '<div class="my-list" id="myHistoryList">' + histHTML + '</div>'
    + '</div>'
    + '<div class="my-section">'
    + '<div class="my-section-title" data-i18n="my_settings">' + App.t('my_settings') + '</div>'
    + '<div class="my-list">'
    + '<div class="my-item" id="myLangItem">'
    + '<svg class="my-item-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'
    + '<span class="my-item-label" data-i18n="my_lang">' + App.t('my_lang') + '</span>'
    + '<span class="my-item-value" id="myLangValue">' + langText + '</span>'
    + '<svg class="my-item-arrow" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18"/></svg>'
    + '</div>'
    + '<div class="my-item" id="myThemeItem">'
    + '<svg class="my-item-icon" viewBox="0 0 24 24">' + (App.dark ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>' : '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>') + '</svg>'
    + '<span class="my-item-label" data-i18n="my_theme">' + App.t('my_theme') + '</span>'
    + '<span class="my-item-value" id="myThemeValue">' + themeText + '</span>'
    + '<svg class="my-item-arrow" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18"/></svg>'
    + '</div></div></div>'
    + '<div class="my-section"><div class="my-list">'
    + '<div class="my-item" id="myAboutItem">'
    + '<svg class="my-item-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    + '<span class="my-item-label" data-i18n="my_about">' + App.t('my_about') + '</span>'
    + '<svg class="my-item-arrow" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18"/></svg>'
    + '</div></div></div>'
    + installHTML
    + '<div class="my-namo">\u5357\u65E0\u963F\u5F25\u9640\u4F5B</div>';
  App.contentArea.appendChild(page);

  // Wire history items
  page.querySelectorAll('.my-history-item').forEach(function(el) {
    el.addEventListener('click', function() {
      var idx = parseInt(el.dataset.hid);
      var h = App.getHistory()[idx];
      if (!h) return;
      var cat = App.data.categories.find(function(c) { return c.id === h.catId; });
      if (cat) {
        var sr = cat.series.find(function(s) { return s.id === h.seriesId; });
        if (sr) { App.playList(sr.episodes, h.epIdx, sr, h.time); App.expPlayer.classList.add('show'); }
      }
    });
  });

  // Wire "View All" link
  var moreBtn = page.querySelector('#myHistoryMore');
  if (moreBtn) {
    moreBtn.addEventListener('click', function() {
      App.renderHistoryOverlay();
      App.$('historyOverlay').classList.add('show');
    });
  }

  // Wire install button
  var installBtn = page.querySelector('#myInstallBtn');
  if (installBtn) {
    installBtn.addEventListener('click', async function() {
      if (App.deferredPrompt) {
        App.deferredPrompt.prompt();
        var result = await App.deferredPrompt.userChoice;
        App.deferredPrompt = null;
        if (result.outcome === 'accepted') localStorage.setItem('pl-install-dismissed', String(Date.now()));
      } else {
        App.showToast(App.t('install_menu_hint'));
      }
    });
  }

  // Wire settings
  page.querySelector('#myLangItem').addEventListener('click', function() {
    var langs = ['zh', 'en', 'fr'];
    var i = (langs.indexOf(App.lang) + 1) % langs.length;
    App.setLang(langs[i]);
    renderMyPage();
  });
  page.querySelector('#myThemeItem').addEventListener('click', function() {
    App.dark = !App.dark; App.applyTheme(); renderMyPage();
  });
  page.querySelector('#myAboutItem').addEventListener('click', function() {
    App.$('aboutOverlay').classList.add('show');
  });
}

// Expose on App
App.renderCategory = renderCategory;
App.showEpisodes = showEpisodes;
App.doSearch = doSearch;
App.renderHomePage = renderHomePage;
App.renderMyPage = renderMyPage;

})();
