/**
 * player-ui.js — Player UI interactions (progress drag, swipe dismiss, double-tap)
 * Depends on: state.js, player.js
 * NOTE: These are initialized from app.js via App.initPlayerUI()
 */
(function(){
'use strict';

var App = window.App;

function initPlayerUI() {
  var dragging = false;
  var seekTooltip = App.$('expSeekTooltip');

  function fmtTime(s) {
    if (!isFinite(s) || s < 0) s = 0;
    var m = Math.floor(s / 60);
    var sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function expSeek(e) {
    App.seekAt(e, App.expProgressBar);
    var r = App.expProgressBar.getBoundingClientRect();
    var p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    var seekTime = App.audio.duration && isFinite(App.audio.duration) ? p * App.audio.duration : 0;
    seekTooltip.textContent = fmtTime(seekTime);
    seekTooltip.style.left = (p * 100) + '%';
  }

  function startDrag(e) {
    dragging = true;
    App.expProgressThumb.classList.add('dragging');
    seekTooltip.classList.add('show');
    expSeek(e);
  }

  function stopDrag() {
    if (!dragging) return;
    dragging = false;
    App.expProgressThumb.classList.remove('dragging');
    seekTooltip.classList.remove('show');
  }

  App.expProgressBar.addEventListener('mousedown', function(e) { startDrag(e); });
  App.expProgressBar.addEventListener('touchstart', function(e) { startDrag(e.touches[0]); }, { passive: true });
  document.addEventListener('mousemove', function(e) { if (dragging) expSeek(e); });
  document.addEventListener('touchmove', function(e) { if (dragging) expSeek(e.touches[0]); }, { passive: true });
  document.addEventListener('mouseup', stopDrag);
  document.addEventListener('touchend', stopDrag);

  // Expose dragging state for swipe check
  App._isDragging = function() { return dragging; };

  // === Swipe down to close expanded player ===
  var swipeStartY = 0, swiping = false, swipeScrollTop = 0;

  App.expPlayerContent.addEventListener('touchstart', function(e) {
    if (dragging || App.playlistVisible) return;
    swipeScrollTop = App.expPlayerContent.scrollTop;
    if (swipeScrollTop > 0) return;
    swipeStartY = e.touches[0].clientY;
    swiping = false;
  }, { passive: true });

  App.expPlayerContent.addEventListener('touchmove', function(e) {
    if (dragging || App.playlistVisible || swipeScrollTop > 0) return;
    var dy = e.touches[0].clientY - swipeStartY;
    if (dy > 10 && !swiping) {
      swiping = true;
      App.expPlayer.classList.add('swiping');
    }
    if (swiping) {
      var offset = Math.max(0, dy);
      App.expPlayer.style.transform = 'translateY(' + offset + 'px)';
      App.expPlayer.style.opacity = Math.max(0.4, 1 - offset / 400);
      e.preventDefault();
    }
  }, { passive: false });

  App.expPlayerContent.addEventListener('touchend', function(e) {
    if (!swiping) return;
    var dy = parseInt(App.expPlayer.style.transform.replace(/[^0-9]/g, '')) || 0;
    App.expPlayer.classList.remove('swiping');
    if (dy > 120) {
      App.expPlayer.style.transform = 'translateY(100%)';
      App.expPlayer.style.opacity = '1';
      setTimeout(function() {
        App.expPlayer.classList.remove('show');
        App.expPlayer.style.transform = '';
        App.expPlayer.style.opacity = '';
        if (App.playlistVisible) {
          App.playlistVisible = false;
          App.playlistPanel.classList.remove('show');
          App.expPlayerContent.classList.remove('hide');
          App.expQueue.classList.remove('active');
        }
      }, 200);
    } else {
      App.expPlayer.classList.add('snap-back');
      App.expPlayer.style.transform = '';
      App.expPlayer.style.opacity = '';
      setTimeout(function() { App.expPlayer.classList.remove('snap-back'); }, 300);
    }
    swiping = false;
  });

  // === Double-tap to skip forward/back 15s ===
  var dblTapTimer = null, dblTapX = 0, dblTapY = 0;
  var dblIndicator = App.$('expDblIndicator');

  App.expPlayerContent.addEventListener('click', function(e) {
    if (e.target.closest('button,a,.exp-series-info')) return;
    var x = e.clientX, y = e.clientY;
    if (dblTapTimer && Math.abs(x - dblTapX) < 40 && Math.abs(y - dblTapY) < 40) {
      clearTimeout(dblTapTimer);
      dblTapTimer = null;
      if (!App.audio.duration || !isFinite(App.audio.duration)) return;
      var rect = App.expPlayerContent.getBoundingClientRect();
      var half = (x - rect.left) / rect.width;
      if (half < 0.5) {
        App.audio.currentTime = Math.max(0, App.audio.currentTime - 15);
        dblIndicator.textContent = '\u221215s';
        dblIndicator.className = 'exp-dbl-indicator left flash';
      } else {
        App.audio.currentTime = Math.min(App.audio.duration, App.audio.currentTime + 15);
        dblIndicator.textContent = '+15s';
        dblIndicator.className = 'exp-dbl-indicator right flash';
      }
      setTimeout(function() { dblIndicator.className = 'exp-dbl-indicator'; }, 600);
    } else {
      dblTapX = x; dblTapY = y;
      dblTapTimer = setTimeout(function() { dblTapTimer = null; }, 300);
    }
  });
}

App.initPlayerUI = initPlayerUI;

})();
