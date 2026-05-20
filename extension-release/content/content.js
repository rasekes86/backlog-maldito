/* BACKLOG MALDITO — Content Script v1.3.0
   Injects floating action button on any website to save games
   with smart game name detection per store */

(function() {
  'use strict';

  if (window.__backlogMalditoInjected) return;
  window.__backlogMalditoInjected = true;

  var FAB_ID = 'bm-fab';
  var POPUP_ID = 'bm-popup';
  var TOAST_ID = 'bm-toast';

  /* ═══ SMART GAME NAME DETECTION ═══ */

  function cleanName(name) {
    if (!name) return '';
    // Remove common suffixes that stores add
    return name
      .replace(/\s*[-|–—]\s*(on\s+)?(Steam|Epic\s*Games?|GOG|PlayStation\s*Store|Xbox|Nintendo|Meta\s*Quest|itch\.io|Humble|Fanatical|Green\s*Man|Gaming|Store|PC).*$/i, '')
      .replace(/\s*[-|–—]\s*Save\s+\d+%.*$/i, '')
      .replace(/\s*[-|–—]\s*Free.*$/i, '')
      .replace(/\s*[-|–—]\s*Buy.*$/i, '')
      .replace(/\s*[-|–—]\s*Download.*$/i, '')
      .replace(/\s+on\s+(Steam|PC|PS5|PS4|Xbox|Switch|Epic)$/i, '')
      .replace(/\s+—\s+.*$/i, '')
      .replace(/\s*\|.*$/, '')
      .trim();
  }

  function detectGameName() {
    var url = window.location.href;
    var host = window.location.hostname;
    var raw = '';

    /* ── Steam ── */
    if (host.indexOf('store.steampowered.com') !== -1) {
      var steamApp = document.querySelector('#appHubAppName');
      if (steamApp) return steamApp.textContent.trim();
      var steamTitle = document.querySelector('.apphub_AppName');
      if (steamTitle) return steamTitle.textContent.trim();
      var ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) {
        raw = ogTitle.content.replace(/on\s+Steam.*$/i, '').trim();
        return cleanName(raw);
      }
    }

    /* ── Epic Games ── */
    if (host.indexOf('epicgames.com') !== -1) {
      var epicTitle = document.querySelector('[data-testid="game-title-text"]');
      if (epicTitle) return epicTitle.textContent.trim();
      var epicH1 = document.querySelector('h1');
      if (epicH1) return cleanName(epicH1.textContent.trim());
    }

    /* ── PlayStation Store ── */
    if (host.indexOf('store.playstation.com') !== -1) {
      var psH1 = document.querySelector('h1.psw-h1, h1');
      if (psH1) return cleanName(psH1.textContent.trim());
    }

    /* ── Xbox / Microsoft Store ── */
    if (host.indexOf('xbox.com') !== -1 || host.indexOf('microsoft.com') !== -1) {
      var xboxTitle = document.querySelector('[class*="ProductTitle"], [data-bi-id="title"]');
      if (xboxTitle) return cleanName(xboxTitle.textContent.trim());
    }

    /* ── Nintendo eShop ── */
    if (host.indexOf('nintendo.com') !== -1) {
      var ninTitle = document.querySelector('.title, h1');
      if (ninTitle) return cleanName(ninTitle.textContent.trim());
    }

    /* ── GOG ── */
    if (host.indexOf('gog.com') !== -1) {
      var gogTitle = document.querySelector('.productcard-basics__title, [class*="product-title"]');
      if (gogTitle) return gogTitle.textContent.trim();
      var gogH1 = document.querySelector('h1');
      if (gogH1) return cleanName(gogH1.textContent.trim());
    }

    /* ── Humble Bundle ── */
    if (host.indexOf('humblebundle.com') !== -1) {
      var hbTitle = document.querySelector('.human-name, [class*="title"]');
      if (hbTitle) return cleanName(hbTitle.textContent.trim());
    }

    /* ── Fanatical ── */
    if (host.indexOf('fanatical.com') !== -1) {
      var fanTitle = document.querySelector('.facade-game-title, h1');
      if (fanTitle) return cleanName(fanTitle.textContent.trim());
    }

    /* ── itch.io ── */
    if (host.indexOf('itch.io') !== -1) {
      var itchTitle = document.querySelector('.game_title, h1');
      if (itchTitle) return cleanName(itchTitle.textContent.trim());
    }

    /* ── Green Man Gaming ── */
    if (host.indexOf('greenmangaming.com') !== -1) {
      var gmgTitle = document.querySelector('.prod-title, h1');
      if (gmgTitle) return cleanName(gmgTitle.textContent.trim());
    }

    /* ── IGDB ── */
    if (host.indexOf('igdb.com') !== -1) {
      var igdbTitle = document.querySelector('.game-title, [class*="title"]');
      if (igdbTitle) return cleanName(igdbTitle.textContent.trim());
    }

    /* ── Metacritic ── */
    if (host.indexOf('metacritic.com') !== -1) {
      var metaH1 = document.querySelector('h1');
      if (metaH1) return cleanName(metaH1.textContent.trim());
    }

    /* ── HowLongToBeat ── */
    if (host.indexOf('howlongtobeat.com') !== -1) {
      var hltbTitle = document.querySelector('.game_title, [class*="shadow_text"]');
      if (hltbTitle) return cleanName(hltbTitle.textContent.trim());
    }

    /* ── Generic: try og:title ── */
    var ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && ogTitle.content) {
      raw = ogTitle.content.trim();
      if (raw.length > 2 && raw.length < 200) {
        return cleanName(raw);
      }
    }

    /* ── Generic: try schema.org Game name ── */
    var schemaGame = document.querySelector('[itemtype*="Game"] [itemprop="name"]');
    if (schemaGame) return cleanName(schemaGame.textContent.trim());

    var schemaName = document.querySelector('[itemtype*="VideoGame"] [itemprop="name"]');
    if (schemaName) return cleanName(schemaName.textContent.trim());

    /* ── Generic: try h1 ── */
    var h1 = document.querySelector('h1');
    if (h1 && h1.textContent.trim().length > 2) {
      return cleanName(h1.textContent.trim());
    }

    /* ── Fallback: page title ── */
    var title = document.title;
    if (title) {
      // Usually format is "GameName - SiteName" or "SiteName | GameName"
      var parts = title.split(/\s*[-|–—]\s*/);
      // Take the shortest part that looks like a game name (> 2 chars)
      var best = '';
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i].trim();
        if (p.length > 2 && (best === '' || p.length < best.length)) {
          best = p;
        }
      }
      return cleanName(best || title);
    }

    return '';
  }

  /* ═══ TOAST NOTIFICATION ═══ */

  function showToast(message, type) {
    var existing = document.getElementById(TOAST_ID);
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.id = TOAST_ID;
    toast.className = 'bm-toast';
    if (type === 'success') toast.classList.add('bm-toast-success');
    else if (type === 'error') toast.classList.add('bm-toast-error');
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(function() {
      toast.classList.add('bm-toast-out');
      setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
  }

  /* ═══ CONFIRMATION POPUP ═══ */

  function showSavePopup(gameName) {
    // Remove existing popup
    var existing = document.getElementById(POPUP_ID);
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = POPUP_ID;
    overlay.className = 'bm-popup-overlay';

    overlay.innerHTML =
      '<div class="bm-popup">' +
        '<div class="bm-popup-header">' +
          '<span class="bm-popup-logo">BACKLOG <span>MALDITO</span></span>' +
        '</div>' +
        '<div class="bm-popup-body">' +
          '<label class="bm-popup-label">Juego detectado</label>' +
          '<input type="text" id="bm-popup-input" class="bm-popup-input" value="' + gameName.replace(/"/g, '&quot;').replace(/</g, '&lt;') + '">' +
          '<div class="bm-popup-url">' + window.location.hostname + '</div>' +
        '</div>' +
        '<div class="bm-popup-actions">' +
          '<button id="bm-popup-cancel" class="bm-popup-btn bm-popup-btn-cancel">Cancelar</button>' +
          '<button id="bm-popup-save" class="bm-popup-btn bm-popup-btn-save">💾 Guardar en Backlog</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    // Focus input and select all text
    var input = document.getElementById('bm-popup-input');
    setTimeout(function() {
      input.focus();
      input.select();
    }, 100);

    // Cancel
    document.getElementById('bm-popup-cancel').addEventListener('click', function() {
      overlay.remove();
    });

    // Close on overlay click
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });

    // Close on Escape
    var escHandler = function(e) {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Save
    document.getElementById('bm-popup-save').addEventListener('click', function() {
      var name = input.value.trim();
      if (!name) {
        input.style.borderColor = '#ff2d55';
        return;
      }
      overlay.remove();
      saveGame(name);
    });

    // Save on Enter
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        document.getElementById('bm-popup-save').click();
      }
    });
  }

  /* ═══ SAVE GAME ═══ */

  function saveGame(gameName) {
    var fab = document.getElementById(FAB_ID);
    if (fab) {
      fab.classList.add('bm-fab-saving');
      fab.innerHTML = '<span class="bm-fab-icon bm-fab-spinner"></span>';
    }

    showToast('Buscando "' + gameName + '" en RAWG...', 'info');

    chrome.runtime.sendMessage({
      action: 'SAVE_GAME_FROM_FAB',
      gameName: gameName,
      tabUrl: window.location.href,
      tabTitle: document.title
    }, function(response) {
      setTimeout(function() {
        if (fab) {
          fab.classList.remove('bm-fab-saving');
          fab.classList.add('bm-fab-saved');
          fab.innerHTML = '<span class="bm-fab-icon">✅</span>';
          setTimeout(function() {
            fab.classList.remove('bm-fab-saved');
            fab.innerHTML = '<span class="bm-fab-icon">🎮</span>';
          }, 2000);
        }
        showToast('"' + gameName + '" guardado en tu backlog!', 'success');
      }, 300);
    });
  }

  /* ═══ CREATE FAB ═══ */

  function createFAB() {
    var fab = document.createElement('div');
    fab.id = FAB_ID;
    fab.className = 'bm-fab';
    fab.title = 'BACKLOG MALDITO — Guardar juego';
    fab.innerHTML = '<span class="bm-fab-icon">🎮</span>';

    fab.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var gameName = detectGameName();
      showSavePopup(gameName);
    });

    document.body.appendChild(fab);
  }

  /* ═══ LISTEN FOR MESSAGES ═══ */

  chrome.runtime.onMessage.addListener(function(message) {
    if (message.action === 'GAME_SAVED_FROM_FAB' && message.game) {
      showToast('"' + message.game.name + '" guardado en tu backlog!', 'success');
    }
  });

  /* ═══ INIT ═══ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createFAB);
  } else {
    createFAB();
  }

})();
