/* ===== Home Page ===== */
import { state, getCurrentTrack } from './state.js';
import { t, getLang } from './i18n.js';
import { getDOM } from './dom.js';
import { ICON_PLAY, ICON_PAUSE, HOME_CATEGORY_ICONS } from './icons.js';
import { playList, togglePlay, getIsSwitching } from './player.js';
import { getDailyRecommendation } from './ai-client.js';
import { getHistory } from './history.js';
import { get as storeGet } from './store.js';
import { escapeHtml } from './utils.js';

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
    const curTrack = getCurrentTrack();
    const curSid = curTrack ? curTrack.seriesId : null;
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

/* ---------- Skeleton placeholder ---------- */
function renderRecSkeletons(count) {
  return Array.from({ length: count }, (_, idx) => `
    <div class="home-rec-card home-rec-skeleton stagger-${Math.min(idx + 1, 4)}">
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
function renderAiRecCard(rec, idx) {
  const icon = HOME_CATEGORY_ICONS[rec.category_id] || HOME_CATEGORY_ICONS.tingjingtai;
  return `
    <div class="home-rec-card stagger-${Math.min(idx + 1, 4)}" data-sid="${escapeHtml(rec.series_id)}" data-cat="${escapeHtml(rec.category_id)}"
         data-epnum="${rec.episode_num}" data-url="${escapeHtml(rec.play_url || '')}">
      <div class="home-rec-icon">${icon}</div>
      <div class="home-rec-body">
        <div class="home-rec-title">${escapeHtml(rec.series_title)} · ${escapeHtml(rec.episode_title)}</div>
        <div class="home-rec-ai-intro">${escapeHtml(rec.ai_intro)}</div>
        <div class="home-rec-sub">${escapeHtml(rec.speaker || '')} · ${rec.episode_num}/${rec.total_episodes} ${t('episodes')}</div>
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
  container.addEventListener('click', async e => {
    const card = e.target.closest('.home-rec-card[data-epnum]');
    if (!card) return;
    const sid = card.dataset.sid;
    const catId = card.dataset.cat;
    const epNum = parseInt(card.dataset.epnum);
    if (!state.isDataFull && state.ensureFullData) {
      await state.ensureFullData({ rerenderHome: false });
    }
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

  recList.innerHTML = picks.map((s, idx) => {
    const pc = s.playCount ? " · " + (s.playCount >= 10000 ? (s.playCount / 10000).toFixed(1) + "w" : s.playCount) + (t("play_count_unit") || "次") : "";
    const introHtml = s.intro ? `<div class="home-rec-intro">${escapeHtml(s.intro)}</div>` : '';
    return `
    <div class="home-rec-card stagger-${Math.min(idx + 1, 4)}" data-sid="${escapeHtml(s.id)}" data-cat="${escapeHtml(s.catId)}">
      <div class="home-rec-icon">${HOME_CATEGORY_ICONS[s.catId] || HOME_CATEGORY_ICONS.tingjingtai}</div>
      <div class="home-rec-body">
        <div class="home-rec-title">${escapeHtml(s.title)}</div>${introHtml}
        <div class="home-rec-sub">${escapeHtml(s.speaker || '')} · ${s.totalEpisodes} ${t('episodes')}${pc}</div>
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



function getResumeState() {
  const playerState = storeGet('player');
  return playerState && playerState.seriesId ? playerState : null;
}

function playDefaultHomeTrack() {
  const fohaoCat = state.data?.categories?.find(cat => cat.id === 'fohao');
  const fohaoSeries = fohaoCat?.series?.find(series => series.id === 'donglin-fohao');
  if (!fohaoSeries?.episodes?.length) return false;
  const defaultIdx = fohaoSeries.episodes.length > 3 ? 3 : 0;
  playList(fohaoSeries.episodes, defaultIdx, fohaoSeries);
  return true;
}

/** Build the HTML for the continue-listening / new-user-guide section. */
function buildDynamicSectionHtml() {
  const dom = getDOM();
  let html = '';
  let hasPlayHistory = false;
  try {
    const st = getResumeState();
    if (st && st.seriesId) {
      let cSeries = null, cCat = null;
      for (const c of state.data.categories) {
        const s = c.series.find(x => x.id === st.seriesId);
        if (s) { cSeries = s; cCat = c; break; }
      }
      if (cSeries && cSeries.episodes?.length) {
        hasPlayHistory = true;
        const cIdx = Math.min(
          Number.isInteger(st.epIdx) ? st.epIdx : (st.idx || 0),
          cSeries.episodes.length - 1
        );
        const ep = cSeries.episodes[cIdx];
        const epTitle = ep ? (ep.title || ep.fileName) : '';
        const duration = ep?.duration || 0;
        const pct = duration > 0
          ? Math.min(100, Math.round((st.time || 0) / duration * 100)) : 0;
        const nowTrack = getCurrentTrack();
        const nowSid = nowTrack ? nowTrack.seriesId : null;
        const isPlaying = nowSid === st.seriesId && state.epIdx === cIdx && !dom.audio.paused;
        const icon = isPlaying ? ICON_PAUSE : ICON_PLAY;
        html += `<div class="home-section home-section-tight"><div class="home-section-title">${t('home_continue')}</div>
          <div class="home-continue-card${isPlaying ? ' playing' : ''}" data-sid="${escapeHtml(cSeries.id)}" data-cat="${escapeHtml(cCat.id)}" data-idx="${cIdx}" data-time="${st.time || 0}">
            <div class="home-continue-icon">${icon}</div>
            <div class="home-continue-body">
              <div class="home-continue-title">${escapeHtml(cSeries.title)}</div>
              <div class="home-continue-sub">${escapeHtml(epTitle)} · ${cIdx + 1}/${cSeries.totalEpisodes}</div>
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
  contCard.addEventListener('click', async () => {
    const dom = getDOM();
    const sid = contCard.dataset.sid;
    const catId = contCard.dataset.cat;
    const idx = parseInt(contCard.dataset.idx) || 0;
    const restoreTime = parseFloat(contCard.dataset.time) || 0;
    const curTrack = getCurrentTrack();
    const curSid = curTrack ? curTrack.seriesId : null;
    if (curSid === sid && state.epIdx === idx) {
      dom.expPlayer.classList.add('show');
      return;
    }
    if (!state.isDataFull && state.ensureFullData) {
      await state.ensureFullData({ rerenderHome: false });
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

function wireGuideCard(page) {
  const guideCard = page.querySelector('#homeGuide');
  if (!guideCard) return;
  guideCard.addEventListener('click', () => {
    const dom = getDOM();
    if (getCurrentTrack()) {
      dom.expPlayer.classList.add('show');
      togglePlay();
      return;
    }

    if (!playDefaultHomeTrack()) return;
    dom.expPlayer.classList.add('show');
  });
}

/** Refresh only the continue/guide section inside the cached home page element. */
function refreshDynamicSection(page) {
  const dynWrap = page.querySelector('#homeDynamic');
  if (!dynWrap) return;
  dynWrap.innerHTML = buildDynamicSectionHtml();
  wireContinueCard(page);
  wireGuideCard(page);
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
  let fetchDone = false;

  // Fallback timer: if API hasn't responded in 2.5 seconds, show fallback content
  // immediately so the user sees something useful.  The background fetch continues
  // and will update the list if/when it succeeds.
  const fallbackTimer = setTimeout(() => {
    if (!fetchDone && recList.querySelector('.home-rec-skeleton')) {
      renderFallbackRecs(recList);
    }
  }, 2500);

  async function tryLoad() {
    try {
      const result = await getDailyRecommendation();

      if (result.generating && attempts < maxAttempts) {
        attempts++;
        setTimeout(tryLoad, 3000);
        return;
      }

      fetchDone = true;
      clearTimeout(fallbackTimer);

      let recs = result.recommendations;
      if (!recs || !recs.length) {
        // Only replace content if still showing skeleton/fallback (not already replaced)
        if (!recList.querySelector('.home-rec-card[data-epnum]')) renderFallbackRecs(recList);
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
      fetchDone = true;
      clearTimeout(fallbackTimer);
      console.warn('[Home] AI recommendation fetch failed:', err);
      // Only replace if still showing skeleton
      if (recList.querySelector('.home-rec-skeleton')) renderFallbackRecs(recList);
    }
  }

  tryLoad();
}

/* ========== MAIN RENDER ========== */
export function renderHomePage() {
  const dom = getDOM();
  dom.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page').forEach(el => el.remove());

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
  const fohaoTrack = getCurrentTrack();
  const nowSid = fohaoTrack ? fohaoTrack.seriesId : null;

  const chantCards = fohaoEps.map((ep, idx) => {
    const isPlaying = nowSid === 'donglin-fohao' && state.epIdx === idx;
    return `<div class="home-chant-card stagger-${Math.min(idx + 1, 4)}${isPlaying ? ' playing' : ''}" data-fh-idx="${idx}">
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

  page.innerHTML = `
    <div class="home-quote-callout" id="homeQuoteCallout">
      <div class="home-quote-text">${quoteText}</div>
      <div class="home-quote-author">— ${quote.author}</div>
    </div>

    <div id="homeDynamic">${buildDynamicSectionHtml()}</div>

    <div class="home-section home-section-tight">
      <div class="home-section-header">
        <div class="home-section-title">${t('home_chanting')}</div>
        <div class="home-chant-count">${fohaoEps.length}${lang === 'zh' ? ' 首' : ''}</div>
      </div>
      <div class="home-chanting-wrap">
        <div class="home-chanting-scroll">${chantCards}</div>
        <div class="home-chanting-arrow"><svg viewBox="0 0 24 24" width="16" height="16"><polyline points="9,6 15,12 9,18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      </div>
    </div>

    ${recHtml}
  `;
  dom.contentArea.appendChild(page);

  // Wire quote callout — click to cycle through quotes
  const quoteEl = page.querySelector('#homeQuoteCallout');
  if (quoteEl) {
    let quoteIdx = dayIdx;
    quoteEl.addEventListener('click', () => {
      quoteIdx = (quoteIdx + 1) % DAILY_QUOTES.length;
      const q = DAILY_QUOTES[quoteIdx];
      const txt = lang === 'zh' ? q.zh : q.en;
      quoteEl.style.opacity = '0';
      setTimeout(() => {
        quoteEl.querySelector('.home-quote-text').textContent = txt;
        quoteEl.querySelector('.home-quote-author').textContent = '— ' + q.author;
        quoteEl.style.opacity = '';
      }, 150);
    });
  }

  // Wire chanting cards
  page.querySelectorAll('.home-chant-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.fhIdx);
      if (!fohaoSeries) return;
      const curTrack = getCurrentTrack();
      if (curTrack && curTrack.seriesId === 'donglin-fohao' && state.epIdx === idx) { togglePlay(); return; }
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
  wireGuideCard(page);

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
