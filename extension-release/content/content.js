/* BACKLOG MALDITO — Content Script v1.3.1
   Floating action button with smart game name detection.
   Uses MutationObserver + retries for dynamic sites (React/Next). */

(function() {
  'use strict';

  if (window.__backlogMalditoInjected) return;
  window.__backlogMalditoInjected = true;

  var FAB_ID = 'bm-fab';
  var POPUP_ID = 'bm-popup';
  var TOAST_ID = 'bm-toast';
  var detectedName = '';

  /* ═══ CLEAN STORE NAME FROM TITLE ═══ */

  var STORE_SUFFIXES = [
    /\s*[-|–—|]\s*Steam\b.*/i,
    /\s*[-|–—|]\s*Epic\s*Games?.*/i,
    /\s*[-|–—|]\s*PlayStation\s*Store.*/i,
    /\s*[-|–—|]\s*GOG\b.*/i,
    /\s*[-|–—|]\s*Xbox\b.*/i,
    /\s*[-|–—|]\s*Nintendo\b.*/i,
    /\s*[-|–—|]\s*itch\.io\b.*/i,
    /\s*[-|–—|]\s*Humble\s*Bundle.*/i,
    /\s*[-|–—|]\s*Fanatical.*/i,
    /\s*[-|–—|]\s*Green\s*Man\s*Gaming.*/i,
    /\s*[-|–—|]\s*Microsoft\s*Store.*/i,
    /\s*[-|–—|]\s*Official\s*Site.*/i,
    /\s*[-|–—|]\s*Meta\s*Critic.*/i,
    /\s*[-|–—|]\s*HowLongToBeat.*/i,
    /\s*[-|–—|]\s*IGDB.*/i,
    /\s*[-|–—|]\s*Save\s+\d+%.*/i,
    /\s*[-|–—|]\s*Buy.*/i,
    /\s*[-|–—|]\s*Download.*/i,
    /\s*[-|–—|]\s*Free.*/i,
    /\s*[-|–—|]\s*PC\b.*/i,
    /\s*[-|–—|]\s*PS[45]\b.*/i,
    /\s*[-|–—|]\s*Switch\b.*/i,
    /\s*\|.*/,
    /\s*—\s+[^A-Z0-9].*$/  // "— everything after em dash that's not uppercase"
  ];

  function cleanName(raw) {
    if (!raw) return '';
    var name = raw.trim();
    for (var i = 0; i < STORE_SUFFIXES.length; i++) {
      name = name.replace(STORE_SUFFIXES[i], '');
    }
    // Collapse whitespace
    name = name.replace(/\s+/g, ' ').trim();
    return name;
  }

  /* ═══ DETECT FROM TITLE TAG (always reliable) ═══ */

  function detectFromTitle() {
    var title = document.title;
    if (!title || title.length < 2) return '';
    return cleanName(title);
  }

  /* ═══ DETECT FROM META TAGS (always in initial HTML) ═══ */

  function detectFromMeta() {
    // og:title is the most reliable
    var og = document.querySelector('meta[property="og:title"]');
    if (og && og.content && og.content.length > 2) {
      return cleanName(og.content);
    }
    // twitter:title
    var tw = document.querySelector('meta[name="twitter:title"]');
    if (tw && tw.content && tw.content.length > 2) {
      return cleanName(tw.content);
    }
    // description sometimes has game name
    var desc = document.querySelector('meta[name="description"]');
    if (desc && desc.content) {
      var m = desc.content.match(/^([A-Z][^.\n]{2,60}?)[\s.\-|]/);
      if (m) return cleanName(m[1]);
    }
    return '';
  }

  /* ═══ DETECT FROM PAGE ELEMENTS (may need retries) ═══ */

  function detectFromPage() {
    var host = window.location.hostname;
    var el = null;

    /* Steam */
    if (host.indexOf('store.steampowered.com') !== -1) {
      el = document.querySelector('#appHubAppName')
         || document.querySelector('.apphub_AppName')
         || document.querySelector('.game_title')
         || document.querySelector('[data-content="apphub_AppName"]');
    }
    /* Epic Games */
    else if (host.indexOf('epicgames.com') !== -1) {
      el = document.querySelector('[data-testid="game-title-text"]')
         || document.querySelector('.game-purchase__title')
         || document.querySelector('h1');
    }
    /* PlayStation Store */
    else if (host.indexOf('store.playstation.com') !== -1) {
      el = document.querySelector('h1.psw-t-title')
         || document.querySelector('.psw-t-title')
         || document.querySelector('h1');
    }
    /* Xbox / Microsoft */
    else if (host.indexOf('xbox.com') !== -1 || host.indexOf('microsoft.com') !== -1) {
      el = document.querySelector('[class*="ProductTitle"]')
         || document.querySelector('[class*="TitleHeading"]')
         || document.querySelector('h1[class*="title"]')
         || document.querySelector('h1');
    }
    /* Nintendo */
    else if (host.indexOf('nintendo.com') !== -1) {
      el = document.querySelector('.title')
         || document.querySelector('h1');
    }
    /* GOG */
    else if (host.indexOf('gog.com') !== -1) {
      el = document.querySelector('.productcard-basics__title')
         || document.querySelector('[class*="product-title"]')
         || document.querySelector('.underlined-links')
         || document.querySelector('h1');
    }
    /* Humble */
    else if (host.indexOf('humblebundle.com') !== -1) {
      el = document.querySelector('.human-name')
         || document.querySelector('[class*="js-entity-name"]');
    }
    /* Fanatical */
    else if (host.indexOf('fanatical.com') !== -1) {
      el = document.querySelector('.facade-game-title')
         || document.querySelector('h1');
    }
    /* itch.io */
    else if (host.indexOf('itch.io') !== -1) {
      el = document.querySelector('.game_title')
         || document.querySelector('h1');
    }
    /* Green Man Gaming */
    else if (host.indexOf('greenmangaming.com') !== -1) {
      el = document.querySelector('.prod-title')
         || document.querySelector('h1');
    }
    /* Metacritic */
    else if (host.indexOf('metacritic.com') !== -1) {
      el = document.querySelector('h1')
         || document.querySelector('.product-title');
    }
    /* HowLongToBeat */
    else if (host.indexOf('howlongtobeat.com') !== -1) {
      el = document.querySelector('.game_title')
         || document.querySelector('[class*="shadow_text"]');
    }
    /* IGDB */
    else if (host.indexOf('igdb.com') !== -1) {
      el = document.querySelector('[class*="game-title"]')
         || document.querySelector('h1');
    }
    /* Generic */
    else {
      // schema.org
      el = document.querySelector('[itemtype*="VideoGame"] [itemprop="name"]')
         || document.querySelector('[itemtype*="Game"] [itemprop="name"]')
         || document.querySelector('h1');
    }

    if (el) {
      var text = el.textContent.trim();
      if (text.length > 1 && text.length < 200) {
        return cleanName(text);
      }
    }
    return '';
  }

  /* ═══ MAIN DETECTION (tries multiple strategies) ═══ */

  function detectGameName() {
    // 1. Try page elements (most accurate for known stores)
    var fromPage = detectFromPage();
    if (fromPage.length > 2) {
      console.log('[BACKLOG MALDITO] Detected from page element:', fromPage);
      return fromPage;
    }

    // 2. Try meta tags (always in HTML)
    var fromMeta = detectFromMeta();
    if (fromMeta.length > 2) {
      console.log('[BACKLOG MALDITO] Detected from meta tag:', fromMeta);
      return fromMeta;
    }

    // 3. Try title tag (always available)
    var fromTitle = detectFromTitle();
    if (fromTitle.length > 2) {
      console.log('[BACKLOG MALDITO] Detected from title tag:', fromTitle);
      return fromTitle;
    }

    console.log('[BACKLOG MALDITO] No game name detected on:', window.location.href);
    return '';
  }

  /* ═══ DETECT WITH RETRIES (for dynamic React/Next pages) ═══ */

  function detectWithRetries() {
    detectedName = detectGameName();
    if (detectedName.length > 2) {
      updateFabIndicator();
      return;
    }

    // Retry after 1s (dynamic content may not be ready)
    setTimeout(function() {
      detectedName = detectGameName();
      if (detectedName.length > 2) {
        updateFabIndicator();
        return;
      }

      // Retry after 3s
      setTimeout(function() {
        detectedName = detectGameName();
        updateFabIndicator();
      }, 2000);
    }, 1000);
  }

  /* ═══ FAB INDICATOR ═══ */

  function updateFabIndicator() {
    var badge = document.getElementById('bm-fab-badge');
    if (!badge) return;
    if (detectedName.length > 2) {
      badge.textContent = '✓';
      badge.className = 'bm-fab-badge bm-fab-badge-ok';
      badge.title = 'Detectado: ' + detectedName;
    } else {
      badge.textContent = '?';
      badge.className = 'bm-fab-badge bm-fab-badge-unknown';
      badge.title = 'No se detectó el nombre — puedes escribirlo manualmente';
    }
  }

  /* ═══ TOAST ═══ */

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

  /* ═══ SAVE POPUP ═══ */

  function showSavePopup() {
    var existing = document.getElementById(POPUP_ID);
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = POPUP_ID;
    overlay.className = 'bm-popup-overlay';

    var detected = detectedName || '';
    var hint = detected.length > 0
      ? 'Detectado desde ' + window.location.hostname
      : 'No se detectó automaticamente — escribe el nombre del juego';

    overlay.innerHTML =
      '<div class="bm-popup">' +
        '<div class="bm-popup-header">' +
          '<span class="bm-popup-logo">BACKLOG <span>MALDITO</span></span>' +
        '</div>' +
        '<div class="bm-popup-body">' +
          '<label class="bm-popup-label">Nombre del juego</label>' +
          '<input type="text" id="bm-popup-input" class="bm-popup-input" placeholder="Escribe el nombre del juego..." value="' + detected.replace(/"/g, '&quot;').replace(/</g, '&lt;') + '">' +
          '<div class="bm-popup-hint">' + hint + '</div>' +
        '</div>' +
        '<div class="bm-popup-actions">' +
          '<button id="bm-popup-cancel" class="bm-popup-btn bm-popup-btn-cancel">Cancelar</button>' +
          '<button id="bm-popup-save" class="bm-popup-btn bm-popup-btn-save">💾 Guardar en Backlog</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    var input = document.getElementById('bm-popup-input');
    setTimeout(function() {
      input.focus();
      if (detected) input.select();
    }, 100);

    document.getElementById('bm-popup-cancel').addEventListener('click', function() {
      overlay.remove();
    });

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });

    var escHandler = function(e) {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    document.getElementById('bm-popup-save').addEventListener('click', function() {
      var name = input.value.trim();
      if (!name) {
        input.style.borderColor = '#ff2d55';
        input.setAttribute('placeholder', 'Escribe un nombre...');
        return;
      }
      overlay.remove();
      doSave(name);
    });

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        document.getElementById('bm-popup-save').click();
      }
    });
  }

  /* ═══ SAVE GAME ═══ */

  function doSave(gameName) {
    var fab = document.getElementById(FAB_ID);
    if (fab) {
      fab.classList.add('bm-fab-saving');
      fab.innerHTML = '<span class="bm-fab-icon bm-fab-spinner"></span>';
    }

    showToast('Guardando "' + gameName + '"...', 'info');

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
            fab.innerHTML = '<span class="bm-fab-icon">🎮</span><span class="bm-fab-badge"></span>';
            updateFabIndicator();
          }, 2500);
        }
        showToast('"' + gameName + '" guardado en tu backlog!', 'success');
      }, 400);
    });
  }

  /* ═══ CREATE FAB ═══ */

  function createFAB() {
    console.log('[BACKLOG MALDITO] Content script loaded on:', window.location.href);

    var fab = document.createElement('div');
    fab.id = FAB_ID;
    fab.className = 'bm-fab';
    fab.title = 'BACKLOG MALDITO — Guardar juego';
    fab.innerHTML = '<span class="bm-fab-icon">🎮</span><span class="bm-fab-badge"></span>';

    fab.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      // Re-detect in case DOM changed since initial load
      detectedName = detectGameName();
      showSavePopup();
    });

    document.body.appendChild(fab);

    // Start detection with retries for dynamic pages
    detectWithRetries();
  }

  /* ═══ LISTEN FOR MESSAGES ═══ */

  chrome.runtime.onMessage.addListener(function(message) {
    if (message.action === 'GAME_SAVED_FROM_FAB' && message.game) {
      showToast('"' + message.game.name + '" guardado!', 'success');
    }
  });

  /* ═══ INIT ═══ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createFAB);
  } else {
    createFAB();
  }

  // Also try again after full load (catches late React renders)
  if (document.readyState !== 'complete') {
    window.addEventListener('load', function() {
      setTimeout(function() {
        detectedName = detectGameName();
        updateFabIndicator();
      }, 500);
    });
  }

})();
