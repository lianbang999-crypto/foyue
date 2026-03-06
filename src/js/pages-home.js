/* ===== Home Page ===== */
import { state } from './state.js';
import { t, getLang } from './i18n.js';
import { getDOM } from './dom.js';
import { ICON_PLAY, ICON_PAUSE } from './icons.js';
import { playList, togglePlay, getIsSwitching } from './player.js';

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

export function renderHomePage() {
  const dom = getDOM();
  const lang = getLang();
  dom.contentArea.querySelectorAll('.view,.ep-view,.my-page,.home-page').forEach(el => el.remove());
  const page = document.createElement('div');
  page.className = 'home-page active';

  // 1. Daily Quote
  const dayIdx = Math.floor(Date.now() / 86400000) % DAILY_QUOTES.length;
  const quote = DAILY_QUOTES[dayIdx];
  const quoteText = lang === 'zh' ? quote.zh : quote.en;

  // 2. Chanting data
  const fohaoCat = state.data.categories.find(c => c.id === 'fohao');
  const fohaoSeries = fohaoCat ? fohaoCat.series.find(s => s.id === 'donglin-fohao') : null;
  const fohaoEps = fohaoSeries ? fohaoSeries.episodes : [];
  const nowSid = state.epIdx >= 0 && state.playlist.length ? state.playlist[state.epIdx].seriesId : null;

  // 3. Continue listening (or new user guide)
  let continueHtml = '';
  let hasPlayHistory = false;
  try {
    const st = JSON.parse(localStorage.getItem('pl-state'));
    if (st && st.seriesId) {
      let cSeries = null, cCat = null;
      for (const c of state.data.categories) { const s = c.series.find(x => x.id === st.seriesId); if (s) { cSeries = s; cCat = c; break; } }
      if (cSeries) {
        hasPlayHistory = true;
        const cIdx = st.idx || 0;
        const ep = cSeries.episodes[cIdx];
        const epTitle = ep ? (ep.title || ep.fileName) : '';
        const pct = st.duration > 0 ? Math.min(100, Math.round((st.time || 0) / st.duration * 100)) : 0;
        const isPlaying = nowSid === st.seriesId && state.epIdx === cIdx && !dom.audio.paused;
        const icon = isPlaying ? ICON_PAUSE : ICON_PLAY;
        continueHtml = `<div class="home-section home-section-tight"><div class="home-section-title">${t('home_continue')}</div>
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

  // New user guide card (shown when no play history)
  let guideHtml = '';
  if (!hasPlayHistory) {
    guideHtml = `<div class="home-section home-section-tight">
      <div class="home-guide-card" id="homeGuide">
        <div class="home-guide-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg></div>
        <div class="home-guide-body">
          <div class="home-guide-title">${t('home_guide_title')}</div>
          <div class="home-guide-sub">${t('home_guide_desc')}</div>
        </div>
      </div>
    </div>`;
  }

  // 4. Recommended series — shuffle based on day to vary content
  const lectCat = state.data.categories.find(c => c.id === 'tingjingtai');
  let recSeries = [];
  if (lectCat && lectCat.series.length > 0) {
    const allSeries = [...lectCat.series];
    // Simple day-based shuffle: rotate start index by day
    const dayOffset = Math.floor(Date.now() / 86400000) % allSeries.length;
    const rotated = [...allSeries.slice(dayOffset), ...allSeries.slice(0, dayOffset)];
    recSeries = rotated.slice(0, 3);
  }
  let recHtml = '';
  if (recSeries.length) {
    recHtml = `<div class="home-section">
      <div class="home-section-header">
        <div class="home-section-title">${t('home_recommended')}</div>
        <div class="home-section-more" id="homeRecMore">${t('home_view_more') || '查看更多'} ›</div>
      </div>
      <div class="home-rec-list">${recSeries.map(s => {
        const introHtml = s.intro ? `<div class="home-rec-intro">${s.intro}</div>` : '';
        return `
        <div class="home-rec-card" data-sid="${s.id}" data-cat="tingjingtai">
          <div class="home-rec-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3v9l6 3"/></svg></div>
          <div class="home-rec-body">
            <div class="home-rec-title">${s.title}</div>${introHtml}
            <div class="home-rec-sub">${s.speaker || ''} · ${s.totalEpisodes} ${t('episodes')}</div>
          </div>
        </div>`;
      }).join('')}
      </div>
    </div>`;
  }

  // Chanting cards — play button + text design
  const chantCards = fohaoEps.map((ep, idx) => {
    const isPlaying = nowSid === 'donglin-fohao' && state.epIdx === idx;
    return `<div class="home-chant-card${isPlaying ? ' playing' : ''}" data-fh-idx="${idx}">
      <div class="home-chant-play"><svg viewBox="0 0 24 24"><polygon points="8,4 20,12 8,20"/></svg></div>
      <div class="home-chant-name">${ep.title}</div>
    </div>`;
  }).join('');

  // Layout: daily dharma → chanting → continue/guide → recommended
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
    ${continueHtml}
    ${guideHtml}
    <div class="home-section home-section-tight">
      <div class="home-wenku-card" id="homeWenkuCard">
        <div class="home-wenku-icon">
          <svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        </div>
        <div class="home-wenku-body">
          <div class="home-wenku-title">${t('my_wenku')}</div>
          <div class="home-wenku-sub">${t('my_wenku_desc')}</div>
        </div>
        <svg class="home-wenku-arrow" viewBox="0 0 24 24"><polyline points="9,6 15,12 9,18"/></svg>
      </div>
    </div>
    ${recHtml}
  `;
  dom.contentArea.appendChild(page);

  // Wire up chanting cards
  page.querySelectorAll('.home-chant-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.fhIdx);
      if (!fohaoSeries) return;
      const curSid = state.epIdx >= 0 && state.playlist.length ? state.playlist[state.epIdx].seriesId : null;
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

  // Wire up "view more" in recommended section
  const recMore = page.querySelector('#homeRecMore');
  if (recMore) {
    recMore.addEventListener('click', () => {
      const tab = document.querySelector('.tab[data-tab="tingjingtai"]');
      if (tab) tab.click();
    });
  }

  // Wire up continue card
  const contCard = page.querySelector('.home-continue-card');
  if (contCard) {
    contCard.addEventListener('click', () => {
      const sid = contCard.dataset.sid;
      const catId = contCard.dataset.cat;
      const idx = parseInt(contCard.dataset.idx) || 0;
      const restoreTime = parseFloat(contCard.dataset.time) || 0;
      const curSid = state.epIdx >= 0 && state.playlist.length ? state.playlist[state.epIdx].seriesId : null;
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

  // Live-update home page play states
  function updateHomePlayState() {
    if (getIsSwitching()) return;
    const curSid = state.epIdx >= 0 && state.playlist.length ? state.playlist[state.epIdx].seriesId : null;
    const playing = !dom.audio.paused;
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
      card.classList.toggle('playing', curSid === 'donglin-fohao' && state.epIdx === idx && playing);
    });
  }
  dom.audio.addEventListener('play', updateHomePlayState);
  dom.audio.addEventListener('pause', updateHomePlayState);
  const homeObs = new MutationObserver(() => {
    if (!page.parentNode) { dom.audio.removeEventListener('play', updateHomePlayState); dom.audio.removeEventListener('pause', updateHomePlayState); homeObs.disconnect(); }
  });
  homeObs.observe(dom.contentArea, { childList: true });

  // Wire up recommended cards
  page.querySelectorAll('.home-rec-card').forEach(card => {
    card.addEventListener('click', () => {
      const sid = card.dataset.sid;
      const catId = card.dataset.cat;
      const cat = state.data.categories.find(c => c.id === catId);
      if (cat) {
        const sr = cat.series.find(s => s.id === sid);
        if (sr) {
          import('./pages-category.js').then(mod => mod.showEpisodes(sr, catId));
        }
      }
    });
  });

  // Wire up wenku card
  const wenkuCard = page.querySelector('#homeWenkuCard');
  if (wenkuCard) {
    wenkuCard.addEventListener('click', () => {
      import('./wenku.js').then(mod => mod.renderWenkuHome(() => renderHomePage()));
    });
  }
}
