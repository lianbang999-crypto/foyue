/**
 * data.js — Audio data loading with retry
 * Depends on: state.js, i18n.js
 */
(function(){
'use strict';

var App = window.App;
var loadAttempts = 0;

async function loadData() {
  try {
    var r = await fetch('/data/audio-data.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    App.data = await r.json();
    App.loader.style.display = 'none';
    if (App.tab === 'home') App.renderHomePage();
    else App.renderCategory(App.tab);
    App.restoreState();
    // Default play on first visit
    if (App.isFirstVisit && App.epIdx < 0) playDefaultTrack();
  } catch (e) {
    loadAttempts++;
    if (loadAttempts < 3) { setTimeout(loadData, 1500 * loadAttempts); return; }
    App.loader.innerHTML = '<div class="error-msg">' + App.t('loading_fail') + '<br><button onclick="location.reload()">' + App.t('retry') + '</button></div>';
  }
}

function playDefaultTrack() {
  if (!App.data) return;
  var cat = App.data.categories.find(function(c) { return c.id === 'fohao'; });
  if (!cat) return;
  var sr = cat.series.find(function(s) { return s.id === 'donglin-fohao'; });
  if (!sr || !sr.episodes || sr.episodes.length < 4) return;
  App.playList(sr.episodes, 3, sr);
}

App.loadData = loadData;
App.playDefaultTrack = playDefaultTrack;

})();
