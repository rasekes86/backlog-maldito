/* BACKLOG MALDITO — Content Script v1.2.0
   Injects floating action button on any website to save games */

(function() {
  'use strict';

  if (window.__backlogMalditoInjected) return;
  window.__backlogMalditoInjected = true;

  var FAB_ID = 'bm-fab';
  var FAB_STYLE_ID = 'bm-fab-style';

  /* ─── Detect game name from page ─── */
  function detectGameName() {
    // Try meta tags first
    var ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && ogTitle.content) return ogTitle.content.trim();

    var titleTag = document.querySelector('title');
    if (titleTag && titleTag.textContent) return titleTag.textContent.trim();

    var h1 = document.querySelector('h1');
    if (h1 && h1.textContent) return h1.textContent.trim();

    return document.title || '';
  }

  /* ─── Create FAB ─── */
  function createFAB() {
    var fab = document.createElement('div');
    fab.id = FAB_ID;
    fab.className = 'bm-fab';
    fab.title = 'Guardar en BACKLOG MALDITO';
    fab.innerHTML = '<span class="bm-fab-icon">🎮</span>';
    fab.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var gameName = detectGameName();
      fab.classList.add('bm-fab-saving');
      fab.innerHTML = '<span class="bm-fab-icon">⏳</span>';

      chrome.runtime.sendMessage({
        action: 'SAVE_GAME_FROM_FAB',
        gameName: gameName,
        tabUrl: window.location.href,
        tabTitle: document.title
      }, function(response) {
        setTimeout(function() {
          fab.classList.remove('bm-fab-saving');
          fab.classList.add('bm-fab-saved');
          fab.innerHTML = '<span class="bm-fab-icon">✅</span>';
          setTimeout(function() {
            fab.classList.remove('bm-fab-saved');
            fab.innerHTML = '<span class="bm-fab-icon">🎮</span>';
          }, 2000);
        }, 500);
      });
    });

    document.body.appendChild(fab);
  }

  /* ─── Listen for messages from background ─── */
  chrome.runtime.onMessage.addListener(function(message) {
    if (message.action === 'GAME_SAVED_FROM_FAB') {
      var fab = document.getElementById(FAB_ID);
      if (fab) {
        fab.classList.remove('bm-fab-saving');
        fab.classList.add('bm-fab-saved');
        fab.innerHTML = '<span class="bm-fab-icon">✅</span>';
        setTimeout(function() {
          fab.classList.remove('bm-fab-saved');
          fab.innerHTML = '<span class="bm-fab-icon">🎮</span>';
        }, 2000);
      }
    }
  });

  /* ─── Init ─── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createFAB);
  } else {
    createFAB();
  }

})();
