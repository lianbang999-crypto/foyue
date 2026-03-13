/* ===== Home Page ===== */
import { state } from './state.js';
import { t, getLang } from './i18n.js';
import { getDOM } from './dom.js';
import { ICON_PLAY, ICON_PAUSE } from './icons.js';
import { playList, togglePlay, getIsSwitching } from './player.js';
import { getDailyRecommendation } from './ai-client.js';
import { getHistory } from './history.js';

/* ===== Home Page DOM Cache ===== */
// Keep the home page element alive across tab switches to avoid full re-renders.
let _homePageEl = null;
let _homeAudioListenerFn = null;

/** Call when category data changes so home page rebuilds on next visit. */
export function invalidateHomePage() {
  detachHomeAudioListeners();
  _homePageEl = null;
}

function detachHomeAudioListeners() {
  if (_homeAudioListenerFn) {
    try {
      const dom = getDOM();
      dom.audio.removeEventListener('play', _homeAudioListenerFn);
      dom.audio.removeEventListener('pause', _homeAudioListenerFn);
    } catch (e) { /* DOM may not be ready */ }
    _homeAudioListenerFn = null;
  }
}

/** Attach play/pause listeners that update home-page play-state indicators. */
function attachHomeAudioListeners(page) {
  detachHomeAudioListeners();
  const dom = getDOM();

  function updateHomePlayState() {
    if (getIsSwitching()) return;
    const curSid = state.epIdx >= 0 && state.playlist.length
      ? state.playlist[state.epIdx].seriesId : null;
    const playing = !dom.audio.paused;
    const contCard = page.querySelector('.home-continue-card');
    if (contCard) {
      const sid = contCard.dataset.sid;
      const idx = parseInt(contCard.dataset.idx) || 0;
      const active = curSid === sid && state.epIdx === idx && playing;
      contCard.classList.toggle('playing', active);
      const iconEl = contCard.querySelector('.home-continue-icon');
      if (iconEl) iconEl.innerHTML = active ? ICON_PAUSE : ICON_PLAY;
    }
    page.querySelectorAll('.home-chant-card').forEach(card => {
      const idx = parseInt(card.dataset.fhIdx);
      card.classList.toggle('playing',
        curSid === 'donglin-fohao' && state.epIdx === idx && playing);
    });
  }

  dom.audio.addEventListener('play', updateHomePlayState);
  dom.audio.addEventListener('pause', updateHomePlayState);
  _homeAudioListenerFn = updateHomePlayState;
  return updateHomePlayState;
}

const DAILY_QUOTES = [
  { zh: '若人但念阿弥陀，是名无上深妙禅。', en: 'To recite Amitabha is the supreme and profound meditation.', author: '永明延寿大师' },
  { zh: '得生与否，全由信愿之有无；品位高下，全由持名之深浅。', en: 'Rebirth depends on faith and vows; the grade depends on the depth of recitation.', author: '蕅益大师' },
  { zh: '念佛法门，别无奇特，只深信力行为要耳。', en: 'The Pure Land practice requires nothing special — just deep faith and earnest practice.', author: '印光大师' },
  { zh: '真为生死，发菩提心，以深信愿，持佛名号。', en: 'For the matter of birth and death, arouse Bodhi mind; with deep faith and vow, recite the Buddha\'s name.', author: '彻悟大师' },
  { zh: '一句弥陀，是佛王、是法王、是咒王、是功德之王。', en: 'One recitation of Amitabha is the king of Buddhas, king of Dharma, king of mantras, king of merit.', author: '莲池大师' },
  { zh: '阿弥陀佛，无上医王，舍此不求，是为痴狂。', en: 'Amitabha, the supreme healer; to abandon this and seek elsewhere is truly deluded.', author: '省庵大师' },
  { zh: '但得见弥陀，何愁不开悟。', en: 'If one can but meet Amitabha, why worry about not attaining awakening?', author: '大安法师' },
  { zh: '净土一法，乃十方三世一切诸佛上成佛道、下化众生之成始成终之大法也。', en: 'The Pure Land Dharma is the ultimate teaching by which all Buddhas attain Buddhahood and liberate sentient beings.', author: '印光大师' },
  { zh: '信愿持名，求生净土，乃佛教之特别法门。', en: 'Holding the name with faith and vow, seeking rebirth — this is the special Dharma gate of Buddhism.', author: '蕅益大师' },
  { zh: '如来所以兴出世，唯说弥陀本愿海。', en: 'The Tathagata appeared in this world solely to teach the ocean of Amitabha\'s primal vow.', author: '善导大师' },
  { zh: '世间一切重苦，悉由自心所现。心若灭时，苦亦灭。', en: 'All heavy sufferings in the world arise from one\'s own mind. When the mind ceases, suffering ceases.', author: '大安法师' },
  { zh: '厌离娑婆，欣求极乐。', en: 'Renounce the Saha world; aspire to the Land of Ultimate Bliss.', author: '善导大师' },
];

// Category icons for recommendation cards
const CAT_ICONS = {
  tingjingtai: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3v9l6 3"/></svg>',
  youshengshu: '<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M4 19.5V5a2 2 0 012-2h14v14H6.5"/></svg>',
  jingdiandusong: '<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>',
};

/* ---------- Skeleton placeholder ---------- */
function renderRecSkeletons(count) {
  return Array.from({ length: count }, () => `
    <div class="home-rec-card home-rec-skeleton">
      <div class="home-rec-icon skeleton-pulse"></div>
      <div class="home-rec-body">
        <div class="skeleton-line skeleton-pulse" style="width:60%"></div>
        <div class="skeleton-line skeleton-pulse" style="width:90%;margin-top:6px"></div>
        <div class="skeleton-line skeleton-pulse" style="width:40%;margin-top:4px"></div>
      </div>
    </div>
  `).join('');
}

/* ---------- Render a single AI recommendation card ---------- */
function renderAiRecCard(rec) {
  const icon = CAT_ICONS[rec.category_id] || CAT_ICONS.tingjingtai;
  return `
    <div class="home-rec-card" data-sid="${rec.series_id}" data-cat="${rec.category_id}"
         data-epnum="${rec.episode_num}" data-url="${rec.play_url || ''}">
      <div class="home-rec-icon">${icon}</div>
      <div class="home-rec-body">
        <div class="home-rec-title">${rec.series_title} · ${rec.episode_title}</div>
        <div class="home-rec-ai-intro">${rec.ai_intro}</div>
        <div class="home-rec-sub">${rec.speaker || ''} · ${rec.episode_num}/${rec.total_episodes} ${t('episodes')}</div>
      </div>
    </div>`;
}

/* ---------- Personalize order using listening history ---------- */
function personalizeOrder(recs) {
  const history = getHistory();
  if (!history.length) return recs;

  const recentSeriesIds = new Set(history.map(h => h.seriesId));
  const categoryCounts = {};
  for (const h of history) {
    if (h.catId) categoryCounts[h.catId] = (categoryCounts[h.catId] || 0) + 1;
  }

  const scored = recs.map(rec => {
    let score = 0;
    // Boost if user listens to this category
    if (categoryCounts[rec.category_id]) score += Math.min(categoryCounts[rec.category_id], 5) * 2;
    // Demote if user recently listened to this exact series (encourage discovery)
    if (recentSeriesIds.has(rec.series_id)) score -= 3;
    return { ...rec, _score: score };
  });

  scored.sort((a, b) => b._score - a._score);
  return scored.map(({ _score, ...rest }) => rest);
}

/* ---------- Wire click handlers on AI rec cards (event delegation) ---------- */
function wireAiRecClicks(container) {
  // Use a flag to avoid attaching duplicate listeners when re-rendering into the same element.
  if (container._aiRecClickWired) return;
  container._aiRecClickWired = true;
  container.addEventListener('click', e => {
    const card = e.target.closest('.home-rec-card[data-epnum]');
    if (!card) return;
    const sid = card.dataset.sid;
    const catId = card.dataset.cat;
    const epNum = parseInt(card.dataset.epnum);
    for (const cat of state.data.categories) {
      const sr = cat.series.find(s => s.id === sid);
      if (sr) {
        const epIdx = sr.episodes.findIndex(ep => ep.id === epNum);
        const idx = epIdx >= 0 ? epIdx : Math.max(0, epNum - 1);
        import('./pages-category.js').then(mod => {
          mod.showEpisodes(sr, catId);
          playList(sr.episodes, idx, sr);
        });
        return;
      }
    }
  });
}

/* ---------- Fallback: day-rotated series (original logic, all categories) ---------- */
function renderFallbackRecs(recList) {
  const allSeries = [];
  for (const cat of state.data.categories) {
    if (cat.id === 'fohao') continue;
    for (const s of cat.series) allSeries.push({ ...s, catId: cat.id });
  }
  if (!allSeries.length) { recList.innerHTML = ''; return; }

  const dayOffset = Math.floor(Date.now() / 86400000) % allSeries.length;
  const rotated = [...allSeries.slice(dayOffset), ...allSeries.slice(0, dayOffset)];
  const picks = rotated.slice(0, 3);

  recList.innerHTML = picks.map(s => {
    const introHtml = s.intro ? `<div class="home-rec-intro">${s.intro}</div>` : '';
    return `
    <div class="home-rec-card" data-sid="${s.id}" data-cat="${s.catId}">
      <div class="home-rec-icon">${CAT_ICONS[s.catId] || CAT_ICONS.tingjingtai}</div>
      <div class="home-rec-body">
        <div class="home-rec-title">${s.title}</div>${introHtml}
        <div class="home-rec-sub">${s.speaker || ''} · ${s.totalEpisodes} ${t('episodes')}</div>
      </div>
    </div>`;
  }).join('');

  // Wire series-level clicks
  recList.querySelectorAll('.home-rec-card').forEach(card => {
    card.addEventListener('click', () => {
      const sid = card.dataset.sid;
      const catId = card.dataset.cat;
      const cat = state.data.categories.find(c => c.id === catId);
      if (cat) {
        const sr = cat.series.find(s => s.id === sid);
        if (sr) import('./pages-category.js').then(mod => mod.showEpisodes(sr, catId));
      }
    });
  });
}

/* ---------- Async loader for AI daily recommendations ---------- */
const DAILY_REC_CACHE_KEY = 'daily-rec-cache';
const DAILY_REC_CACHE_DURATION = 6 * 60 * 60 * 1000; // 6小时

/** Synchronously read cached recommendations if still fresh (returns array or null). */
function getCachedRecs() {
  try {
    const raw = localStorage.getItem(DAILY_REC_CACHE_KEY);
    if (!raw) return null;
    const { date, recommendations, timestamp } = JSON.parse(raw);
    const todayDate = new Date().toISOString().slice(0, 10);
    if (date === todayDate && Date.now() - timestamp < DAILY_REC_CACHE_DURATION
        && recommendations && recommendations.length) {
      return recommendations;
    }
  } catch (e) { /* ignore */ }
  return null;
}

/** Build the HTML for the continue-listening / new-user-guide section. */
function buildDynamicSectionHtml() {
  const dom = getDOM();
  let html = '';
  let hasPlayHistory = false;
  try {
    const st = JSON.parse(localStorage.getItem('pl-state'));
    if (st && st.seriesId) {
      let cSeries = null, cCat = null;
      for (const c of state.data.categories) {
        const s = c.series.find(x => x.id === st.seriesId);
        if (s) { cSeries = s; cCat = c; break; }
      }
      if (cSeries) {
        hasPlayHistory = true;
        const cIdx = st.idx || 0;
        const ep = cSeries.episodes[cIdx];
        const epTitle = ep ? (ep.title || ep.fileName) : '';
        const pct = st.duration > 0
          ? Math.min(100, Math.round((st.time || 0) / st.duration * 100)) : 0;
        const nowSid = state.epIdx >= 0 && state.playlist.length
          ? state.playlist[state.epIdx].seriesId : null;
        const isPlaying = nowSid === st.seriesId && state.epIdx === cIdx && !dom.audio.paused;
        const icon = isPlaying ? ICON_PAUSE : ICON_PLAY;
        html += `<div class="home-section home-section-tight"><div class="home-section-title">${t('home_continue')}</div>
          <div class="home-continue-card${isPlaying ? ' playing' : ''}" data-sid="${cSeries.id}" data-cat="${cCat.id}" data-idx="${cIdx}" data-time="${st.time || 0}">
            <div class="home-continue-icon">${icon}</div>
            <div class="home-continue-body">
              <div class="home-continue-title">${cSeries.title}</div>
              <div class="home-continue-sub">${epTitle} · ${cIdx + 1}/${cSeries.totalEpisodes}</div>
            </div>
            <div class="home-continue-progress"><div class="home-continue-progress-fill" style="width:${pct}%"></div></div>
          </div>
        </div>`;
      }
    }
  } catch (e) { /* ignore */ }

  if (!hasPlayHistory) {
    html += `<div class="home-section home-section-tight">
      <div class="home-guide-card" id="homeGuide">
        <div class="home-guide-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg></div>
        <div class="home-guide-body">
          <div class="home-guide-title">${t('home_guide_title')}</div>
          <div class="home-guide-sub">${t('home_guide_desc')}</div>
        </div>
      </div>
    </div>`;
  }
  return html;
}

/** Wire the continue-card click handler (called after each dynamic section rebuild). */
function wireContinueCard(page) {
  const contCard = page.querySelector('.home-continue-card');
  if (!contCard) return;
  contCard.addEventListener('click', () => {
    const dom = getDOM();
    const sid = contCard.dataset.sid;
    const catId = contCard.dataset.cat;
    const idx = parseInt(contCard.dataset.idx) || 0;
    const restoreTime = parseFloat(contCard.dataset.time) || 0;
    const curSid = state.epIdx >= 0 && state.playlist.length
      ? state.playlist[state.epIdx].seriesId : null;
    if (curSid === sid && state.epIdx === idx) {
      dom.expPlayer.classList.add('show');
      return;
    }
    const cat = state.data.categories.find(c => c.id === catId);
    if (cat) {
      const sr = cat.series.find(s => s.id === sid);
      if (sr) {
        playList(sr.episodes, idx, sr, restoreTime);
        dom.expPlayer.classList.add('show');
      }
    }
  });
}

/** Refresh only the continue/guide section inside the cached home page element. */
function refreshDynamicSection(page) {
  const dynWrap = page.querySelector('#homeDynamic');
  if (!dynWrap) return;
  dynWrap.innerHTML = buildDynamicSectionHtml();
  wireContinueCard(page);
}

async function loadDailyRecommendations(page) {
  const recList = page.querySelector('#homeRecList');
  if (!recList) return;

  // If the list already contains real (non-skeleton) cards, the content was
  // pre-rendered from cache.  Just ensure click delegation is wired and bail.
  if (recList.querySelector('.home-rec-card:not(.home-rec-skeleton)')) {
    wireAiRecClicks(recList);
    return;
  }

  const todayDate = new Date().toISOString().slice(0, 10);

  // 1. Check local cache
  try {
    const cached = localStorage.getItem(DAILY_REC_CACHE_KEY);
    if (cached) {
      const { date, recommendations, timestamp } = JSON.parse(cached);
      const age = Date.now() - timestamp;
      if (date === todayDate && age < DAILY_REC_CACHE_DURATION
          && recommendations && recommendations.length) {
        const recs = personalizeOrder(recommendations);
        recList.innerHTML = recs.map(renderAiRecCard).join('');
        wireAiRecClicks(recList);
        return;
      }
    }
  } catch (e) {
    console.warn('[Home] Cache read error:', e);
  }

  // 2. No valid cache — fetch from API
  let attempts = 0;
  const maxAttempts = 3;

  async function tryLoad() {
    try {
      const result = await getDailyRecommendation();

      if (result.generating && attempts < maxAttempts) {
        attempts++;
        setTimeout(tryLoad, 3000);
        return;
      }

      let recs = result.recommendations;
      if (!recs || !recs.length) {
        renderFallbackRecs(recList);
        return;
      }

      recs = personalizeOrder(recs);
      recList.innerHTML = recs.map(renderAiRecCard).join('');
      wireAiRecClicks(recList);

      try {
        localStorage.setItem(DAILY_REC_CACHE_KEY, JSON.stringify({
          date: result.date,
          recommendations: result.recommendations,
          timestamp: Date.now()
        }));
      } catch (e) {
        console.warn('[Home] Cache write error:', e);
      }
    } catch (err) {
      console.warn('[Home] AI recommendation fetch failed:', err);
      renderFallbackRecs(recList);
    }
  }

  tryLoad();
}

/* ========== MAIN RENDER ========== */
export function renderHomePage() {
  const dom = getDOM();
  dom.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page,.wenku-page').forEach(el => el.remove());

  // ── Fast path: reuse cached home page element ──
  if (_homePageEl) {
    refreshDynamicSection(_homePageEl);     // Update continue/guide card
    dom.contentArea.appendChild(_homePageEl);
    const updateFn = attachHomeAudioListeners(_homePageEl);
    updateFn();                             // Sync play-state indicators immediately
    loadDailyRecommendations(_homePageEl);  // No-op if content already rendered + cache fresh
    return;
  }

  // ── Full render (first visit this session) ──
  const lang = getLang();
  const page = document.createElement('div');
  page.className = 'home-page active';

  // Daily Quote
  const dayIdx = Math.floor(Date.now() / 86400000) % DAILY_QUOTES.length;
  const quote = DAILY_QUOTES[dayIdx];
  const quoteText = lang === 'zh' ? quote.zh : quote.en;

  // Chanting data
  const fohaoCat = state.data.categories.find(c => c.id === 'fohao');
  const fohaoSeries = fohaoCat ? fohaoCat.series.find(s => s.id === 'donglin-fohao') : null;
  const fohaoEps = fohaoSeries ? fohaoSeries.episodes : [];
  const nowSid = state.epIdx >= 0 && state.playlist.length
    ? state.playlist[state.epIdx].seriesId : null;

  const chantCards = fohaoEps.map((ep, idx) => {
    const isPlaying = nowSid === 'donglin-fohao' && state.epIdx === idx;
    return `<div class="home-chant-card${isPlaying ? ' playing' : ''}" data-fh-idx="${idx}">
      <div class="home-chant-play"><svg viewBox="0 0 24 24"><polygon points="8,4 20,12 8,20"/></svg></div>
      <div class="home-chant-name">${ep.title}</div>
    </div>`;
  }).join('');

  // AI recommendations — render inline from cache, otherwise show skeleton
  const cachedRecs = getCachedRecs();
  const initialRecContent = cachedRecs
    ? personalizeOrder(cachedRecs).map(renderAiRecCard).join('')
    : renderRecSkeletons(3);

  const recHtml = `<div class="home-section" id="homeAiRec">
    <div class="home-section-header">
      <div class="home-section-title">${t('home_recommended')}</div>
      <div class="home-ai-badge">AI</div>
    </div>
    <div class="home-rec-list" id="homeRecList">${initialRecContent}</div>
  </div>`;

  // Layout: quote → chanting → dynamic (continue/guide) → recommended
  page.innerHTML = `
    <div class="home-section home-section-tight">
      <div class="home-section-title">${t('home_daily_quote')}</div>
      <div class="home-quote home-quote-compact">
        <div class="home-quote-text">${quoteText}</div>
        <div class="home-quote-author">— ${quote.author}</div>
      </div>
    </div>
    <div class="home-section home-section-tight">
      <div class="home-section-title">${t('home_chanting')}</div>
      <div class="home-chanting-wrap">
        <div class="home-chanting-scroll">${chantCards}</div>
      </div>
    </div>
    <div id="homeDynamic">${buildDynamicSectionHtml()}</div>
    ${recHtml}
  `;
  dom.contentArea.appendChild(page);

  // Wire chanting cards
  page.querySelectorAll('.home-chant-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.fhIdx);
      if (!fohaoSeries) return;
      const curSid = state.epIdx >= 0 && state.playlist.length
        ? state.playlist[state.epIdx].seriesId : null;
      if (curSid === 'donglin-fohao' && state.epIdx === idx) { togglePlay(); return; }
      playList(fohaoSeries.episodes, idx, fohaoSeries);
    });
  });

  // Chanting scroll — hide fade hint when scrolled to end
  const chantWrap = page.querySelector('.home-chanting-wrap');
  const chantScroll = page.querySelector('.home-chanting-scroll');
  if (chantWrap && chantScroll) {
    chantScroll.addEventListener('scroll', () => {
      const atEnd = chantScroll.scrollLeft + chantScroll.clientWidth >= chantScroll.scrollWidth - 8;
      chantWrap.classList.toggle('scrolled-end', atEnd);
    }, { passive: true });
  }

  // Wire continue card
  wireContinueCard(page);

  // Wire AI rec clicks if pre-rendered from cache
  if (cachedRecs) {
    const recList = page.querySelector('#homeRecList');
    if (recList) wireAiRecClicks(recList);
  }

  // Attach audio listeners + set initial play-state
  const updateFn = attachHomeAudioListeners(page);
  updateFn();

  // Cache page element for fast re-use on subsequent tab switches
  _homePageEl = page;

  // Load recommendations from API if cache was empty/stale
  if (!cachedRecs) loadDailyRecommendations(page);
}
