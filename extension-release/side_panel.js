/* ═══════════════════════════════════════════════════════════
   BACKLOG MALDITO — Side Panel Logic v1.2.0
   Complete interactive logic with RAWG API integration
   ═══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ═══ RAWG API (embedded) ═══ */
  var RAWG_KEY = 'faea405801b44b708d08022d4a61a0b2';
  var RAWG_BASE = 'https://api.rawg.io/api';
  var CACHE_TTL = 30 * 60 * 1000;
  var rawgCache = new Map();

  function rawgCachedFetch(key, ttl, fetchFn) {
    var cached = rawgCache.get(key);
    if (cached && Date.now() - cached.time < ttl) {
      return Promise.resolve(cached.data);
    }
    return fetchFn().then(function(data) {
      rawgCache.set(key, { data: data, time: Date.now() });
      if (rawgCache.size > 500) {
        var keys = rawgCache.keys();
        for (var i = 0; i < 100; i++) rawgCache.delete(keys.next().value);
      }
      return data;
    });
  }

  function rawgSearch(query) {
    if (!query || query.trim().length < 2) return Promise.resolve({ results: [] });
    var q = query.trim();
    return rawgCachedFetch('sp_search:' + q.toLowerCase(), CACHE_TTL, function() {
      return fetch(RAWG_BASE + '/games?key=' + RAWG_KEY + '&search=' + encodeURIComponent(q) + '&page_size=8')
        .then(function(r) { return r.json(); });
    });
  }

  function rawgGameDetails(id) {
    return rawgCachedFetch('sp_detail:' + id, CACHE_TTL, function() {
      return fetch(RAWG_BASE + '/games/' + id + '?key=' + RAWG_KEY)
        .then(function(r) { return r.json(); });
    });
  }

  function rawgGameSearch(gameName) {
    if (!gameName) return Promise.resolve(null);
    var name = gameName.trim();
    if (name.length < 2) return Promise.resolve(null);

    return rawgSearch(name).then(function(searchData) {
      var results = searchData.results || [];
      console.log('[BACKLOG MALDITO RAWG] Search "' + name + '" →', results.length, 'results');
      if (results.length === 0) return null;

      var nameLower = name.toLowerCase();
      var nameNoSpecial = nameLower.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
      var bestMatch = null;

      // 1. Exact match
      for (var i = 0; i < results.length; i++) {
        if (results[i].name.toLowerCase() === nameLower) {
          bestMatch = results[i]; break;
        }
      }
      // 2. Starts with
      if (!bestMatch) {
        for (var i = 0; i < results.length; i++) {
          if (results[i].name.toLowerCase().indexOf(nameLower) === 0) {
            bestMatch = results[i]; break;
          }
        }
      }
      // 3. Contains
      if (!bestMatch) {
        for (var i = 0; i < results.length; i++) {
          var rNameClean = results[i].name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
          if (rNameClean.indexOf(nameNoSpecial) !== -1 || nameNoSpecial.indexOf(rNameClean) !== -1) {
            bestMatch = results[i]; break;
          }
        }
      }
      // 4. First result
      if (!bestMatch) bestMatch = results[0];

      return rawgGameDetails(bestMatch.id).then(function(details) {
        return {
          rawgId: details.id,
          name: details.name,
          coverImage: details.background_image || '',
          bannerImage: details.background_image_additional || '',
          description: details.description || '',
          descriptionRaw: details.description_raw || '',
          rating: details.rating || 0,
          ratingTop: details.rating_top || 5,
          metacritic: details.metacritic || null,
          releaseDate: details.released || '',
          genres: (details.genres || []).map(function(g) { return g.name; }),
          genre: (details.genres || []).map(function(g) { return g.name; }).join(', '),
          developers: (details.developers || []).map(function(d) { return d.name; }),
          platforms: (details.platforms || []).map(function(p) { return p.platform.name; }),
          playtime: details.playtime || 0,
          website: details.website || '',
          rawgUrl: 'https://rawg.io/games/' + details.slug,
          enriched: true,
          enrichedAt: new Date().toISOString()
        };
      });
    }).catch(function() {
      return null;
    });
  }

  /* ═══ STATE ═══ */
  var games = [];
  var currentTab = 'radar';
  var currentFilter = 'all';
  var selectedRawgGame = null;
  var radarStars = 0;
  var radarPlatforms = [];
  var isEnriching = false;
  var editingGameId = null;
  var searchDebounceTimer = null;
  var toastTimer = null;
  var contentType = 'resumen';

  /* ═══ DOM REFS ═══ */
  function $(id) { return document.getElementById(id); }
  function $$(sel) { return document.querySelectorAll(sel); }

  /* ═══ INITIALIZATION ═══ */
  document.addEventListener('DOMContentLoaded', function() {
    initTabs();
    initRadar();
    initBacklog();
    initCreator();
    initSettings();
    listenForMessages();
    loadGames();
  });

  /* ═══ TAB SWITCHING ═══ */
  function initTabs() {
    var tabs = $$('.bm-tab');
    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        switchTab(this.getAttribute('data-tab'));
      });
    });
  }

  function switchTab(tabName) {
    currentTab = tabName;
    // Update tab buttons
    $$('.bm-tab').forEach(function(t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === tabName);
    });
    // Update tab content
    $$('.bm-tab-content').forEach(function(tc) {
      var id = tc.id.replace('tab-', '');
      if (id === tabName) {
        tc.classList.remove('hidden');
        tc.classList.add('active');
      } else {
        tc.classList.add('hidden');
        tc.classList.remove('active');
      }
    });
    // Refresh data on tab switch
    if (tabName === 'backlog') {
      renderGames();
      renderBacklogStats();
    } else if (tabName === 'creator') {
      refreshCreatorGameSelect();
    }
  }

  /* ═══ LOAD GAMES ═══ */
  function loadGames() {
    return window.BacklogStorage.getGames().then(function(data) {
      games = data;
    });
  }

  /* ═══ TOAST ═══ */
  function showToast(message) {
    var toast = $('bm-toast');
    var toastText = $('bm-toast-text');
    if (!toast || !toastText) return;

    if (toastTimer) clearTimeout(toastTimer);
    toast.classList.remove('hidden', 'toast-out');
    toastText.textContent = message;

    toastTimer = setTimeout(function() {
      toast.classList.add('toast-out');
      setTimeout(function() {
        toast.classList.add('hidden');
        toast.classList.remove('toast-out');
      }, 300);
    }, 3000);
  }

  /* ═══ CONFIRM DIALOG ═══ */
  function showConfirm(message) {
    return new Promise(function(resolve) {
      var overlay = $('bm-confirm-overlay');
      var text = $('bm-confirm-text');
      var yesBtn = $('bm-confirm-yes');
      var noBtn = $('bm-confirm-no');

      if (!overlay) { resolve(false); return; }

      text.textContent = message;
      overlay.classList.remove('hidden');

      function cleanup() {
        overlay.classList.add('hidden');
        yesBtn.removeEventListener('click', onYes);
        noBtn.removeEventListener('click', onNo);
      }

      function onYes() { cleanup(); resolve(true); }
      function onNo() { cleanup(); resolve(false); }

      yesBtn.addEventListener('click', onYes);
      noBtn.addEventListener('click', onNo);
    });
  }

  /* ═══ GENERATE ID ═══ */
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  /* ═══ SANITIZE HTML ═══ */
  function stripHtml(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  /* ═══ TRUNCATE TEXT ═══ */
  function truncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.substring(0, max) + '...' : str;
  }

  /* ═══ STATE LABELS ═══ */
  var stateLabels = {
    'pendiente': '⏳ Pendiente',
    'jugando': '🎮 Jugando',
    'completado': '✅ Completado',
    'abandonado': '💀 Abandonado',
    'oferta': '🏷️ Oferta'
  };

  /* ════════════════════════════════════════
     RADAR TAB
     ════════════════════════════════════════ */

  function initRadar() {
    var nameInput = $('radar-game-name');
    var autocomplete = $('rawg-autocomplete');

    // Autocomplete
    nameInput.addEventListener('input', function() {
      var query = this.value.trim();
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);

      if (query.length < 2) {
        autocomplete.classList.add('hidden');
        autocomplete.innerHTML = '';
        return;
      }

      searchDebounceTimer = setTimeout(function() {
        rawgSearch(query).then(function(data) {
          var results = data.results || [];
          if (results.length === 0) {
            autocomplete.innerHTML = '<div class="bm-autocomplete-no-results">No se encontraron juegos</div>';
            autocomplete.classList.remove('hidden');
            return;
          }
          autocomplete.innerHTML = results.map(function(r) {
            return '<div class="bm-autocomplete-item" data-rawg-id="' + r.id + '">' +
              '<img src="' + (r.background_image || '') + '" alt="" onerror="this.style.display=\'none\'">' +
              '<div class="bm-autocomplete-item-info">' +
                '<div class="bm-autocomplete-item-name">' + escapeHtml(r.name) + '</div>' +
                '<div class="bm-autocomplete-item-meta">' +
                  '<span class="bm-autocomplete-item-rating">★ ' + (r.rating || '—') + '</span>' +
                  '<span>' + (r.released ? r.released.substring(0, 4) : '—') + '</span>' +
                  '<span>' + ((r.genres || []).map(function(g) { return g.name; }).slice(0, 2).join(', ') || '—') + '</span>' +
                '</div>' +
              '</div>' +
            '</div>';
          }).join('');
          autocomplete.classList.remove('hidden');

          // Click handlers
          autocomplete.querySelectorAll('.bm-autocomplete-item').forEach(function(item) {
            item.addEventListener('click', function() {
              var rawgId = parseInt(this.getAttribute('data-rawg-id'));
              selectRawgGame(rawgId);
              autocomplete.classList.add('hidden');
            });
          });
        }).catch(function() {
          autocomplete.classList.add('hidden');
        });
      }, 400);
    });

    // Close autocomplete on outside click
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.bm-autocomplete-wrap')) {
        autocomplete.classList.add('hidden');
      }
    });

    // Platform toggles
    $$('#radar-platforms .bm-toggle-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        this.classList.toggle('active');
        var platform = this.getAttribute('data-platform');
        if (this.classList.contains('active')) {
          if (radarPlatforms.indexOf(platform) === -1) radarPlatforms.push(platform);
        } else {
          radarPlatforms = radarPlatforms.filter(function(p) { return p !== platform; });
        }
      });
    });

    // Star rating
    $$('#radar-stars .bm-star').forEach(function(star) {
      star.addEventListener('click', function() {
        radarStars = parseInt(this.getAttribute('data-star'));
        updateStarDisplay();
      });
      star.addEventListener('mouseenter', function() {
        var val = parseInt(this.getAttribute('data-star'));
        highlightStars(val);
      });
    });

    $('radar-stars').addEventListener('mouseleave', function() {
      highlightStars(radarStars);
    });

    // Save button
    $('btn-save-game').addEventListener('click', saveGame);
  }

  function selectRawgGame(rawgId) {
    showToast('📡 Cargando datos de RAWG...');
    rawgGameDetails(rawgId).then(function(details) {
      selectedRawgGame = {
        rawgId: details.id,
        name: details.name,
        coverImage: details.background_image || '',
        bannerImage: details.background_image_additional || '',
        description: details.description || '',
        descriptionRaw: details.description_raw || '',
        rating: details.rating || 0,
        ratingTop: details.rating_top || 5,
        metacritic: details.metacritic || null,
        releaseDate: details.released || '',
        genres: (details.genres || []).map(function(g) { return g.name; }),
        genre: (details.genres || []).map(function(g) { return g.name; }).join(', '),
        developers: (details.developers || []).map(function(d) { return d.name; }),
        platforms: (details.platforms || []).map(function(p) { return p.platform.name; }),
        playtime: details.playtime || 0,
        website: details.website || '',
        rawgUrl: 'https://rawg.io/games/' + details.slug,
        enriched: true,
        enrichedAt: new Date().toISOString()
      };

      // Fill input
      $('radar-game-name').value = details.name;

      // Show preview
      showRawgPreview(selectedRawgGame);

      // Pre-select platforms
      if (selectedRawgGame.platforms) {
        radarPlatforms = selectedRawgGame.platforms.filter(function(p) {
          var known = ['PC', 'PlayStation', 'Xbox', 'Nintendo', 'Mobile', 'VR'];
          return known.some(function(k) { return p.indexOf(k) !== -1; });
        });
        if (radarPlatforms.length === 0 && selectedRawgGame.platforms.length > 0) {
          radarPlatforms = [selectedRawgGame.platforms[0]];
        }
        $$('#radar-platforms .bm-toggle-btn').forEach(function(btn) {
          var p = btn.getAttribute('data-platform');
          btn.classList.toggle('active', radarPlatforms.some(function(rp) { return rp.indexOf(p) !== -1 || p.indexOf(rp) !== -1; }));
        });
      }

      showToast('✅ Datos cargados de RAWG');
    }).catch(function(err) {
      showToast('❌ Error cargando datos de RAWG');
    });
  }

  function showRawgPreview(data) {
    var preview = $('radar-rawg-preview');
    preview.classList.remove('hidden');

    // Banner
    var banner = $('radar-preview-banner');
    var img = $('radar-preview-img');
    if (data.bannerImage || data.coverImage) {
      img.src = data.bannerImage || data.coverImage;
      img.style.display = '';
      banner.style.display = '';
    } else {
      banner.style.display = 'none';
    }

    // Name
    $('radar-preview-name').textContent = data.name;

    // Rating
    var ratingBadge = $('radar-preview-rating');
    if (data.rating > 0) {
      ratingBadge.textContent = '★ ' + data.rating.toFixed(2);
      ratingBadge.style.display = '';
    } else {
      ratingBadge.style.display = 'none';
    }

    // Metacritic
    var metaBadge = $('radar-preview-metacritic');
    if (data.metacritic) {
      metaBadge.textContent = data.metacritic;
      metaBadge.className = 'bm-metacritic-badge';
      if (data.metacritic >= 75) metaBadge.classList.add('high');
      else if (data.metacritic >= 50) metaBadge.classList.add('mid');
      else metaBadge.classList.add('low');
      metaBadge.style.display = '';
    } else {
      metaBadge.style.display = 'none';
    }

    // Date
    var dateEl = $('radar-preview-date');
    if (data.releaseDate) {
      dateEl.textContent = data.releaseDate;
      dateEl.style.display = '';
    } else {
      dateEl.style.display = 'none';
    }

    // Genres
    var genresEl = $('radar-preview-genres');
    if (data.genres && data.genres.length > 0) {
      genresEl.innerHTML = data.genres.map(function(g) {
        return '<span class="bm-genre-tag">' + escapeHtml(g) + '</span>';
      }).join('');
      genresEl.style.display = '';
    } else {
      genresEl.innerHTML = '';
    }

    // Description
    var descEl = $('radar-preview-desc');
    if (data.description) {
      descEl.textContent = truncate(stripHtml(data.description), 200);
      descEl.style.display = '';
    } else {
      descEl.style.display = 'none';
    }

    // Platforms
    var platEl = $('radar-preview-platforms');
    if (data.platforms && data.platforms.length > 0) {
      platEl.innerHTML = data.platforms.slice(0, 6).map(function(p) {
        return '<span class="bm-platform-badge">' + escapeHtml(p) + '</span>';
      }).join('');
      platEl.style.display = '';
    } else {
      platEl.innerHTML = '';
    }
  }

  function updateStarDisplay() {
    $$('#radar-stars .bm-star').forEach(function(s) {
      var val = parseInt(s.getAttribute('data-star'));
      s.classList.toggle('active', val <= radarStars);
    });
  }

  function highlightStars(upTo) {
    $$('#radar-stars .bm-star').forEach(function(s) {
      var val = parseInt(s.getAttribute('data-star'));
      s.classList.toggle('active', val <= upTo);
    });
  }

  function saveGame() {
    var name = $('radar-game-name').value.trim();
    if (!name) {
      showToast('⚠️ Escribe el nombre del juego');
      return;
    }

    var game = {
      id: generateId(),
      name: name,
      state: $('radar-state').value,
      rating: radarStars,
      userNote: $('radar-note').value.trim(),
      platforms: radarPlatforms.slice(),
      genres: [],
      addedAt: new Date().toISOString()
    };

    // Merge RAWG data if selected
    if (selectedRawgGame) {
      game.rawgId = selectedRawgGame.rawgId;
      game.coverImage = selectedRawgGame.coverImage;
      game.bannerImage = selectedRawgGame.bannerImage;
      game.description = selectedRawgGame.description;
      game.descriptionRaw = selectedRawgGame.descriptionRaw;
      game.rawgRating = selectedRawgGame.rating;
      game.ratingTop = selectedRawgGame.ratingTop;
      game.metacritic = selectedRawgGame.metacritic;
      game.releaseDate = selectedRawgGame.releaseDate;
      game.genres = selectedRawgGame.genres || [];
      game.genre = selectedRawgGame.genre;
      game.developers = selectedRawgGame.developers;
      game.rawgPlatforms = selectedRawgGame.platforms;
      game.playtime = selectedRawgGame.playtime;
      game.website = selectedRawgGame.website;
      game.rawgUrl = selectedRawgGame.rawgUrl;
      game.enriched = true;
      game.enrichedAt = new Date().toISOString();
    }

    window.BacklogStorage.saveGame(game).then(function() {
      showToast('💾 "' + game.name + '" guardado en el backlog');
      resetRadarForm();
      loadGames();
      notifyBadgeUpdate();
    });
  }

  function resetRadarForm() {
    $('radar-game-name').value = '';
    $('radar-state').value = 'pendiente';
    $('radar-note').value = '';
    radarStars = 0;
    radarPlatforms = [];
    selectedRawgGame = null;
    updateStarDisplay();
    $$('#radar-platforms .bm-toggle-btn').forEach(function(b) { b.classList.remove('active'); });
    $('radar-rawg-preview').classList.add('hidden');
  }

  /* ════════════════════════════════════════
     BACKLOG TAB
     ════════════════════════════════════════ */

  function initBacklog() {
    // Search
    $('backlog-search').addEventListener('input', function() {
      renderGames();
    });

    // Filters
    $$('.bm-filter-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        $$('.bm-filter-btn').forEach(function(b) { b.classList.remove('active'); });
        this.classList.add('active');
        currentFilter = this.getAttribute('data-filter');
        renderGames();
      });
    });

    // Enrich all
    $('btn-enrich-all').addEventListener('click', function() {
      if (isEnriching) return;
      enrichAllGames();
    });
  }

  function getFilteredGames() {
    var query = ($('backlog-search') ? $('backlog-search').value : '').trim().toLowerCase();
    var filtered = games;

    // Filter
    if (currentFilter === 'pendiente') {
      filtered = filtered.filter(function(g) { return g.state === 'pendiente'; });
    } else if (currentFilter === 'terror') {
      filtered = filtered.filter(function(g) {
        return (g.genres || []).some(function(gn) {
          return gn.toLowerCase().indexOf('horror') !== -1 ||
                 gn.toLowerCase().indexOf('terror') !== -1 ||
                 gn.toLowerCase().indexOf('survival horror') !== -1;
        });
      });
    } else if (currentFilter === 'oferta') {
      filtered = filtered.filter(function(g) { return g.state === 'oferta'; });
    }

    // Search
    if (query) {
      filtered = filtered.filter(function(g) {
        return g.name.toLowerCase().indexOf(query) !== -1 ||
               (g.genres || []).join(' ').toLowerCase().indexOf(query) !== -1 ||
               (g.userNote || '').toLowerCase().indexOf(query) !== -1;
      });
    }

    return filtered;
  }

  function renderGames() {
    var list = $('backlog-games-list');
    if (!list) return;

    var filtered = getFilteredGames();

    if (filtered.length === 0) {
      list.innerHTML = '<div class="bm-empty-state">' +
        '<div class="bm-empty-icon">👾</div>' +
        '<p>' + (games.length === 0 ? 'Tu backlog está vacío' : 'Sin resultados') + '</p>' +
        '<p class="bm-empty-hint">' + (games.length === 0 ? 'Usa el Radar para añadir juegos' : 'Prueba con otro filtro o búsqueda') + '</p>' +
      '</div>';
      return;
    }

    list.innerHTML = filtered.map(function(game) {
      var coverHtml = '';
      if (game.coverImage) {
        coverHtml = '<img class="bm-game-cover" src="' + escapeHtml(game.coverImage) + '" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
          '<div class="bm-game-cover-placeholder" style="display:none;">🎮</div>';
      } else {
        coverHtml = '<div class="bm-game-cover-placeholder">🎮</div>';
      }

      var metaHtml = '<span class="bm-game-state ' + escapeHtml(game.state || 'pendiente') + '">' + (stateLabels[game.state || 'pendiente'] || game.state) + '</span>';
      if (game.rawgRating > 0) {
        metaHtml += ' <span class="bm-rating-badge">★ ' + game.rawgRating.toFixed(1) + '</span>';
      }
      if (game.metacritic) {
        var mcClass = game.metacritic >= 75 ? 'high' : (game.metacritic >= 50 ? 'mid' : 'low');
        metaHtml += ' <span class="bm-metacritic-badge ' + mcClass + '">' + game.metacritic + '</span>';
      }
      if (game.rating > 0) {
        metaHtml += ' <span style="color:var(--neon-yellow);font-size:10px;">' + '★'.repeat(game.rating) + '</span>';
      }

      var genresHtml = '';
      if (game.genres && game.genres.length > 0) {
        genresHtml = '<div class="bm-game-genres-mini">' +
          game.genres.slice(0, 3).map(function(g) {
            return '<span class="bm-genre-tag">' + escapeHtml(g) + '</span>';
          }).join('') +
        '</div>';
      }

      var errorHtml = '';
      if (game.enrichError) {
        errorHtml = '<div class="bm-game-enrich-error">⚠️ ' + escapeHtml(game.enrichError) + '</div>';
      }

      return '<div class="bm-game-card" data-game-id="' + game.id + '">' +
        '<div class="bm-game-card-header">' +
          coverHtml +
          '<div class="bm-game-info">' +
            '<div class="bm-game-title">' + escapeHtml(game.name) + '</div>' +
            '<div class="bm-game-meta">' + metaHtml + '</div>' +
            genresHtml +
            errorHtml +
          '</div>' +
        '</div>' +
        '<div class="bm-game-edit" id="edit-' + game.id + '" style="display:none;"></div>' +
      '</div>';
    }).join('');

    // Click to expand edit panel
    list.querySelectorAll('.bm-game-card-header').forEach(function(header) {
      header.addEventListener('click', function() {
        var card = this.closest('.bm-game-card');
        var gameId = card.getAttribute('data-game-id');
        toggleEditPanel(gameId);
      });
    });
  }

  function toggleEditPanel(gameId) {
    var editPanel = $('edit-' + gameId);
    if (!editPanel) return;

    // Close other panels
    $$('.bm-game-edit').forEach(function(p) {
      if (p.id !== 'edit-' + gameId) p.style.display = 'none';
    });

    if (editPanel.style.display !== 'none') {
      editPanel.style.display = 'none';
      editingGameId = null;
      return;
    }

    editingGameId = gameId;
    var game = games.find(function(g) { return g.id === gameId; });
    if (!game) return;

    var stateOptions = Object.keys(stateLabels).map(function(key) {
      return '<option value="' + key + '"' + (game.state === key ? ' selected' : '') + '>' + stateLabels[key] + '</option>';
    }).join('');

    editPanel.innerHTML =
      '<div class="bm-game-edit-row">' +
        '<label>Estado</label>' +
        '<select id="edit-state-' + gameId + '">' + stateOptions + '</select>' +
      '</div>' +
      '<div class="bm-game-edit-row">' +
        '<label>Rating</label>' +
        '<input type="number" id="edit-rating-' + gameId + '" min="0" max="5" value="' + (game.rating || 0) + '">' +
      '</div>' +
      '<textarea class="bm-game-edit-textarea" id="edit-note-' + gameId + '" placeholder="Nota...">' + escapeHtml(game.userNote || '') + '</textarea>' +
      '<div class="bm-game-edit-actions">' +
        '<button class="bm-btn bm-btn-sm bm-btn-outline" data-action="enrich" data-id="' + gameId + '">🔄 RAWG</button>' +
        '<button class="bm-btn bm-btn-sm bm-btn-outline" data-action="save" data-id="' + gameId + '">💾 Guardar</button>' +
        '<button class="bm-btn bm-btn-sm bm-btn-danger" data-action="delete" data-id="' + gameId + '">🗑️</button>' +
      '</div>';

    editPanel.style.display = '';

    // Button handlers
    editPanel.querySelectorAll('[data-action]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var action = this.getAttribute('data-action');
        var id = this.getAttribute('data-id');
        handleEditAction(action, id);
      });
    });
  }

  function handleEditAction(action, gameId) {
    var game = games.find(function(g) { return g.id === gameId; });
    if (!game) return;

    if (action === 'save') {
      var stateEl = $('edit-state-' + gameId);
      var ratingEl = $('edit-rating-' + gameId);
      var noteEl = $('edit-note-' + gameId);
      if (stateEl) game.state = stateEl.value;
      if (ratingEl) game.rating = Math.max(0, Math.min(5, parseInt(ratingEl.value) || 0));
      if (noteEl) game.userNote = noteEl.value.trim();

      window.BacklogStorage.updateGame(gameId, {
        state: game.state,
        rating: game.rating,
        userNote: game.userNote
      }).then(function() {
        showToast('💾 "' + game.name + '" actualizado');
        loadGames().then(function() {
          renderGames();
          renderBacklogStats();
          notifyBadgeUpdate();
        });
      });
    } else if (action === 'delete') {
      showConfirm('¿Borrar "' + game.name + '" del backlog?').then(function(confirmed) {
        if (confirmed) {
          window.BacklogStorage.deleteGame(gameId).then(function() {
            showToast('🗑️ "' + game.name + '" borrado');
            loadGames().then(function() {
              renderGames();
              renderBacklogStats();
              notifyBadgeUpdate();
            });
          });
        }
      });
    } else if (action === 'enrich') {
      enrichSingleGame(game);
    }
  }

  function renderBacklogStats() {
    var total = games.length;
    var pending = games.filter(function(g) { return g.state === 'pendiente'; }).length;
    var offers = games.filter(function(g) { return g.state === 'oferta'; }).length;
    var played = games.filter(function(g) { return g.state === 'jugando' || g.state === 'completado'; }).length;
    var covers = games.filter(function(g) { return g.coverImage; }).length;
    var ratings = games.filter(function(g) { return g.rating > 0; });
    var avgRating = ratings.length > 0
      ? (ratings.reduce(function(sum, g) { return sum + g.rating; }, 0) / ratings.length).toFixed(1)
      : '—';

    var el = function(id) { return $(id); };
    if (el('stat-total')) el('stat-total').textContent = total;
    if (el('stat-pending')) el('stat-pending').textContent = pending;
    if (el('stat-offers')) el('stat-offers').textContent = offers;
    if (el('stat-played')) el('stat-played').textContent = played;
    if (el('stat-covers')) el('stat-covers').textContent = covers;
    if (el('stat-rating')) el('stat-rating').textContent = avgRating;
  }

  /* ═══ ENRICHMENT (THE KEY FIX) ═══ */

  function enrichSingleGame(game) {
    console.log('[BACKLOG MALDITO] 🔄 Enriching:', game.name, '(id:', game.id + ')');
    showToast('🔍 Buscando "' + game.name + '" en RAWG...');
    var btn = document.querySelector('.bm-game-edit [data-action="enrich"][data-id="' + game.id + '"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳...';
    }

    return rawgGameSearch(game.name).then(function(rawgData) {
      console.log('[BACKLOG MALDITO] RAWG result for "' + game.name + '":', rawgData ? 'FOUND' : 'NOT FOUND', rawgData);
      if (rawgData) {
        // Map RAWG rating to rawgRating to not overwrite user rating
        var enrichData = Object.assign({}, rawgData);
        if (enrichData.rating !== undefined) {
          enrichData.rawgRating = enrichData.rating;
          delete enrichData.rating;
        }
        return window.BacklogStorage.updateGame(game.id, enrichData).then(function(updated) {
          console.log('[BACKLOG MALDITO] ✅ Saved enriched data for:', game.name, '→ cover:', enrichData.coverImage ? 'YES' : 'NO', 'rawgRating:', enrichData.rawgRating);
          showToast('✅ "' + game.name + '" enriquecido — cover + rating + géneros guardados');
          return loadGames().then(function() {
            renderGames();
            renderBacklogStats();
            // Re-open edit panel to show updated data
            if (editingGameId === game.id) {
              editingGameId = null; // reset so toggle will re-open
              toggleEditPanel(game.id);
            }
          });
        });
      } else {
        return window.BacklogStorage.updateGame(game.id, {
          enriched: false,
          enrichError: 'No encontrado en RAWG'
        }).then(function() {
          console.log('[BACKLOG MALDITO] ⚠️ Not found for:', game.name);
          showToast('⚠️ "' + game.name + '" no encontrado en RAWG — prueba con otro nombre');
          return loadGames().then(function() {
            renderGames();
            if (editingGameId === game.id) {
              editingGameId = null;
              toggleEditPanel(game.id);
            }
          });
        });
      }
    }).catch(function(err) {
      console.error('[BACKLOG MALDITO] ❌ Enrich error for "' + game.name + '":', err);
      showToast('❌ Error: ' + (err.message || 'Sin conexión'));
      return loadGames().then(function() {
        renderGames();
      });
    });
  }

  function enrichAllGames() {
    var unenriched = games.filter(function(g) {
      return !g.rawgId || (!g.rawgRating && !g.coverImage);
    });

    console.log('[BACKLOG MALDITO] 🔄 Enrich all — found', unenriched.length, 'unenriched games:', unenriched.map(function(g){return g.name;}));

    if (unenriched.length === 0) {
      showToast('✅ Todos los juegos ya tienen datos de RAWG');
      return;
    }

    isEnriching = true;
    updateEnrichButton(true, '⏳ Enriqueciendo 0/' + unenriched.length + '...');

    // Show progress bar
    var enrichBtn = $('btn-enrich-all');
    var progressDiv = document.createElement('div');
    progressDiv.className = 'enrich-progress';
    progressDiv.id = 'enrich-progress-bar';
    progressDiv.innerHTML =
      '<div class="enrich-progress-text">' +
        '<span class="enrich-progress-current" id="enrich-current-game">Preparando...</span>' +
        '<span id="enrich-counter">0/' + unenriched.length + '</span>' +
      '</div>' +
      '<div class="enrich-progress-bar"><div class="enrich-progress-fill" id="enrich-fill" style="width:0%"></div></div>';
    if (enrichBtn && enrichBtn.parentNode) {
      enrichBtn.parentNode.insertBefore(progressDiv, enrichBtn.nextSibling);
    }

    var successCount = 0;
    var failCount = 0;
    var i = 0;

    function processNext() {
      if (i >= unenriched.length) {
        // Done
        isEnriching = false;
        updateEnrichButton(false);
        var progDiv = $('enrich-progress-bar');
        if (progDiv) progDiv.remove();
        showToast('🎉 ¡Completado! ' + successCount + ' enriquecidos, ' + failCount + ' sin resultados');
        return;
      }

      var game = unenriched[i];
      var currentGameEl = $('enrich-current-game');
      var counterEl = $('enrich-counter');
      var fillEl = $('enrich-fill');

      if (currentGameEl) currentGameEl.textContent = '🔍 ' + truncate(game.name, 30);
      if (counterEl) counterEl.textContent = (i + 1) + '/' + unenriched.length;
      if (fillEl) fillEl.style.width = ((i + 1) / unenriched.length * 100) + '%';

      updateEnrichButton(true, '⏳ Enriqueciendo ' + (i + 1) + '/' + unenriched.length + '...');

      rawgGameSearch(game.name).then(function(rawgData) {
        if (rawgData) {
          successCount++;
          // Map RAWG rating to rawgRating to not overwrite user rating
          var enrichData = Object.assign({}, rawgData);
          if (enrichData.rating !== undefined) {
            enrichData.rawgRating = enrichData.rating;
            delete enrichData.rating;
          }
          return window.BacklogStorage.updateGame(game.id, enrichData);
        } else {
          failCount++;
          return window.BacklogStorage.updateGame(game.id, {
            enriched: false,
            enrichError: 'No encontrado en RAWG'
          });
        }
      }).catch(function() {
        failCount++;
      }).then(function() {
        i++;
        // Reload and re-render after each game
        loadGames().then(function() {
          if (currentTab === 'backlog') {
            renderGames();
            renderBacklogStats();
          }
          // Rate limit — wait before next
          setTimeout(processNext, 350);
        });
      });
    }

    processNext();
  }

  function updateEnrichButton(loading, text) {
    var btn = $('btn-enrich-all');
    if (!btn) return;
    if (loading) {
      btn.disabled = true;
      btn.textContent = text || '⏳ Enriqueciendo...';
      btn.classList.add('loading');
    } else {
      btn.disabled = false;
      btn.textContent = '🔄 Enriquecer todo con RAWG';
      btn.classList.remove('loading');
    }
  }

  /* ════════════════════════════════════════
     CREATOR TAB
     ════════════════════════════════════════ */

  function initCreator() {
    // Content type grid
    $$('.bm-content-type-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        $$('.bm-content-type-btn').forEach(function(b) { b.classList.remove('active'); });
        this.classList.add('active');
        contentType = this.getAttribute('data-type');
      });
    });

    // Generate
    $('btn-generate').addEventListener('click', generateContent);

    // Copy
    $('btn-copy-content').addEventListener('click', function() {
      var text = $('creator-result-text');
      if (text) {
        navigator.clipboard.writeText(text.textContent).then(function() {
          showToast('📋 Copiado al portapapeles');
        }).catch(function() {
          // Fallback
          var range = document.createRange();
          range.selectNode(text);
          window.getSelection().removeAllRanges();
          window.getSelection().addRange(range);
          document.execCommand('copy');
          showToast('📋 Copiado al portapapeles');
        });
      }
    });

    // History toggle
    $('btn-toggle-history').addEventListener('click', function() {
      var historyEl = $('creator-history');
      var isVisible = !historyEl.classList.contains('hidden');
      if (isVisible) {
        historyEl.classList.add('hidden');
        this.textContent = '📜 Ver historial de contenido';
      } else {
        historyEl.classList.remove('hidden');
        this.textContent = '📜 Ocultar historial';
        loadContentHistory();
      }
    });

    // Clear history
    $('btn-clear-history').addEventListener('click', function() {
      showConfirm('¿Limpiar todo el historial de contenido?').then(function(confirmed) {
        if (confirmed) {
          window.BacklogStorage.clearContentHistory().then(function() {
            showToast('🗑️ Historial limpiado');
            loadContentHistory();
          });
        }
      });
    });
  }

  function refreshCreatorGameSelect() {
    var select = $('creator-game-select');
    if (!select) return;
    var currentVal = select.value;
    select.innerHTML = '<option value="">— Selecciona un juego —</option>';
    games.forEach(function(game) {
      var opt = document.createElement('option');
      opt.value = game.id;
      opt.textContent = game.name;
      select.appendChild(opt);
    });
    if (currentVal) select.value = currentVal;
  }

  function generateContent() {
    var gameId = $('creator-game-select').value;
    if (!gameId) {
      showToast('⚠️ Selecciona un juego primero');
      return;
    }

    var game = games.find(function(g) { return g.id === gameId; });
    if (!game) {
      showToast('⚠️ Juego no encontrado');
      return;
    }

    var platform = $('creator-platform').value;
    var content = generateContentForType(game, contentType, platform);

    // Show result
    var resultDiv = $('creator-result');
    resultDiv.classList.remove('hidden');
    $('creator-result-type').textContent = contentType.toUpperCase();
    $('creator-result-text').textContent = content;

    // Save to history
    window.BacklogStorage.addContentHistory({
      gameName: game.name,
      contentType: contentType,
      content: content,
      platform: platform
    });
  }

  function generateContentForType(game, type, platform) {
    var name = game.name;
    var rating = game.rawgRating || 0;
    var metacritic = game.metacritic || 0;
    var genres = (game.genres || []).join(', ');
    var genre = game.genre || genres;
    var devs = (game.developers || []).join(', ');
    var platforms = (game.platforms || game.rawgPlatforms || []).join(', ');
    var releaseDate = game.releaseDate || '';
    var desc = game.descriptionRaw ? truncate(game.descriptionRaw, 300) : '';
    var playtime = game.playtime || 0;
    var userRating = game.rating || 0;
    var userNote = game.userNote || '';
    var stars = userRating > 0 ? '★'.repeat(userRating) + '☆'.repeat(5 - userRating) : '';

    switch (type) {
      case 'resumen':
        return '🎮 ' + name + '\n' +
          '━━━━━━━━━━━━━━━━━━\n' +
          (rating > 0 ? '⭐ Rating RAWG: ' + rating.toFixed(2) + '/5\n' : '') +
          (metacritic > 0 ? '📊 Metacritic: ' + metacritic + '/100\n' : '') +
          (genre ? '🏷️ Género: ' + genre + '\n' : '') +
          (devs ? '🏢 Developer: ' + devs + '\n' : '') +
          (releaseDate ? '📅 Fecha: ' + releaseDate + '\n' : '') +
          (platforms ? '🎮 Plataformas: ' + platforms + '\n' : '') +
          (playtime > 0 ? '⏱️ Playtime: ~' + playtime + 'h\n' : '') +
          '━━━━━━━━━━━━━━━━━━\n' +
          (stars ? 'Mi valoración: ' + stars + '\n' : '') +
          (userNote ? '📝 Nota: ' + userNote + '\n' : '');

      case 'tiktok':
        return '🎵 Hook (3 seg):\n' +
          '"' + name + '" — ' + (rating > 0 ? rating.toFixed(1) + '★ en RAWG' : '¿Merece la pena?') + '\n\n' +
          '🎤 Script (30-60 seg):\n' +
          '¿Habéis probado ' + name + '? ' +
          (genre ? 'Es un ' + genre.split(',')[0] + ' de ' : 'Un juego de ') +
          (devs ? devs.split(',')[0] : 'los creadores') + '. ' +
          (metacritic > 0 ? 'Metacritic le da un ' + metacritic + '. ' : '') +
          (rating > 0 ? 'La comunidad le da un ' + rating.toFixed(1) + '/5. ' : '') +
          (userRating > 0 ? 'Yo le doy ' + userRating + ' estrellas. ' : '') +
          (userNote ? userNote + '. ' : '') +
          '¿Lo añadiríais a vuestro backlog? 👇\n\n' +
          '#backlogmaldito #gaming #gamer #' + name.replace(/\s+/g, '') + (genre ? ' #' + genre.split(',')[0].replace(/\s+/g, '') : '');

      case 'seo':
        return 'Meta Title: ' + name + ' Review | ' + (genre ? genre.split(',')[0] + ' Game' : 'Videojuego') + ' | Backlog Maldito\n\n' +
          'Meta Description: ' +
          'Descubre todo sobre ' + name + (genre ? ', el ' + genre.split(',')[0] : '') +
          (devs ? ' de ' + devs.split(',')[0] : '') +
          '. ' + (rating > 0 ? 'Rating: ' + rating.toFixed(1) + '/5.' : '') +
          (metacritic > 0 ? ' Metacritic: ' + metacritic + '.' : '') +
          ' Review y opinión en Backlog Maldito.\n\n' +
          'Keywords sugeridas:\n' +
          '- ' + name + ' review\n' +
          '- ' + name + ' gameplay\n' +
          (genre ? '- ' + genre.split(',')[0] + ' games 2024\n' : '') +
          '- mejores juegos backlog\n' +
          (devs ? '- ' + devs.split(',')[0] + ' games\n' : '') +
          '- videojuegos recomendados';

      case 'hashtags':
        return '🏷️ Hashtags para ' + name + ':\n\n' +
          '#general:\n#' + name.replace(/\s+/g, '') + ' #gaming #videogames #gamer #games #gameplay\n\n' +
          (genre ? '#género:\n#' + genre.split(/,\s*/).map(function(g) { return g.replace(/\s+/g, ''); }).join(' #') + '\n\n' : '') +
          (devs ? '#developer:\n#' + devs.split(/,\s*/).map(function(d) { return d.replace(/\s+/g, ''); }).join(' #') + '\n\n' : '') +
          '#comunidad:\n#backlogmaldito #gamersespañol #gaminges #jugones #retrogaming #indiegames #pcgaming #consolas\n\n' +
          '#trending:\n#gamingcommunity #gameoftheday #gamenight #mustplay #backlog';

      case 'portada':
        return '🖼️ IDEAS DE PORTADA para "' + name + '"\n\n' +
          '📝 Textos principales:\n' +
          '1. "' + name + (rating > 0 ? ' — ' + rating.toFixed(1) + '★' : '') + '"\n' +
          '2. "¿' + name + ' merece la pena?"\n' +
          '3. "' + name + ' | ' + (genre ? genre.split(',')[0] : 'Review') + '"\n\n' +
          '🎨 Paleta sugerida:\n' +
          '- Fondo oscuro (#0d0d1a)\n' +
          '- Acento neón (#b026ff)\n' +
          '- Texto limpio blanco\n\n' +
          '📐 Composición:\n' +
          '- Título grande centrado\n' +
          (game.coverImage ? '- Imagen de cover como fondo (blur)\n' : '') +
          '- Rating badge esquina\n' +
          '- Logo Backlog Maldito pequeño';

      case 'guion':
        return '🎬 GUIÓN: ' + name + '\n' +
          '━━━━━━━━━━━━━━━━━━\n\n' +
          ' minuto 0:00 — INTRO\n' +
          '"Hoy hablamos de ' + name + (genre ? ', un ' + genre.split(',')[0] : '') + '". ' +
          (devs ? 'Desarrollado por ' + devs.split(',')[0] + '. ' : '') +
          (releaseDate ? 'Lanzado en ' + releaseDate.substring(0, 4) + '. ' : '') +
          '¿Merece estar en tu backlog? Vamos a verlo."\n\n' +
          ' minuto 0:30 — CONTEXTO\n' +
          (desc ? truncate(stripHtml(desc), 200) + '\n\n' : 'Sin descripción disponible.\n\n') +
          ' minuto 2:00 — DATOS Y OPINIÓN\n' +
          (rating > 0 ? 'La comunidad en RAWG le da un ' + rating.toFixed(1) + '/5. ' : '') +
          (metacritic > 0 ? 'Metacritic: ' + metacritic + '. ' : '') +
          (platforms ? 'Disponible en: ' + platforms + '. ' : '') +
          (playtime > 0 ? 'Duración aproximada: ' + playtime + ' horas. ' : '') +
          (userRating > 0 ? 'Mi nota personal: ' + userRating + '/5. ' : '') +
          (userNote ? '\n' + userNote : '') +
          '\n\n minuto 3:30 — CONCLUSIÓN\n' +
          '"¿Añadiríais ' + name + ' a vuestro backlog? Dejádmelo en comentarios y no olvidéis suscribiros."';

      case 'review':
        return '⭐ REVIEW: ' + name + '\n' +
          '━━━━━━━━━━━━━━━━━━\n\n' +
          '📌 Ficha técnica:\n' +
          (devs ? '🏢 Developer: ' + devs + '\n' : '') +
          (genre ? '🏷️ Género: ' + genre + '\n' : '') +
          (releaseDate ? '📅 Lanzamiento: ' + releaseDate + '\n' : '') +
          (platforms ? '🎮 Plataformas: ' + platforms + '\n' : '') +
          (playtime > 0 ? '⏱️ Duración: ~' + playtime + 'h\n' : '') +
          '\n📊 Puntuaciones:\n' +
          (rating > 0 ? '  RAWG: ' + rating.toFixed(2) + '/5\n' : '') +
          (metacritic > 0 ? '  Metacritic: ' + metacritic + '/100\n' : '') +
          (userRating > 0 ? '  Mi nota: ' + stars + ' (' + userRating + '/5)\n' : '') +
          '\n📝 Opinión:\n' +
          (userNote || 'Sin nota personal todavía.') +
          '\n\n━━━━━━━━━━━━━━━━━━\n' +
          '#review #backlogmaldito #gaming';

      case 'top5':
        var otherGames = games.filter(function(g) {
          return g.id !== game.id && (g.genres || []).some(function(gn) {
            return (game.genres || []).some(function(ogn) { return gn === ogn; });
          });
        }).slice(0, 4);

        var result = '🏆 TOP 5 ' + (genre ? genre.split(',')[0].toUpperCase() + 'S' : 'JUEGOS') + ' para tu backlog\n';
        result += '━━━━━━━━━━━━━━━━━━\n\n';
        result += '1️⃣ ' + name + (rating > 0 ? ' — ' + rating.toFixed(1) + '★' : '') + ' ⭐ DESTACADO\n';
        otherGames.forEach(function(g, idx) {
          result += (idx + 2) + '️⃣ ' + g.name + (g.rawgRating ? ' — ' + g.rawgRating.toFixed(1) + '★' : '') + '\n';
        });
        for (var j = otherGames.length + 2; j <= 5; j++) {
          result += j + '️⃣ ¿Qué juego pondrías aquí?\n';
        }
        result += '\n#backlogmaldito #top5 #gaming #' + (genre ? genre.split(',')[0].replace(/\s+/g, '') : 'games');
        return result;

      case 'thread':
        var parts = [];
        parts.push('🧵 THREAD: Todo sobre ' + name + ' 👇\n\n1/');
        if (devs) parts.push('🏢 Desarrollado por ' + devs + '\n\n2/');
        if (genre) parts.push('🏷️ Género: ' + genre + '\n\n3/');
        if (releaseDate) parts.push('📅 Lanzado: ' + releaseDate + '\n\n4/');
        if (rating > 0) parts.push('⭐ Rating RAWG: ' + rating.toFixed(2) + '/5\n\n5/');
        if (metacritic > 0) parts.push('📊 Metacritic: ' + metacritic + '/100\n\n6/');
        if (platforms) parts.push('🎮 Plataformas: ' + platforms + '\n\n7/');
        if (playtime > 0) parts.push('⏱️ Playtime: ~' + playtime + ' horas\n\n8/');
        if (desc) parts.push('📖 ' + truncate(stripHtml(desc), 250) + '\n\n9/');
        parts.push((userRating > 0 ? 'Mi valoración: ' + stars + '\n\n' : '') +
          (userNote ? '📝 ' + userNote + '\n\n' : '') +
          '¿Lo tienes en tu backlog? 🎮\n\n' +
          '#backlogmaldito #' + name.replace(/\s+/g, '') + ' #gaming 🧵✅');

        // Renumber
        var count = 1;
        var finalParts = parts.map(function(p) {
          if (p.indexOf('/\n') === -1) return p;
          return p.replace(/\d+\//, count++ + '/');
        });

        return finalParts.join('\n');

      default:
        return 'Contenido no disponible para "' + type + '"';
    }
  }

  function loadContentHistory() {
    window.BacklogStorage.getContentHistory().then(function(history) {
      var list = $('creator-history-list');
      if (!list) return;

      if (history.length === 0) {
        list.innerHTML = '<div class="bm-empty-state" style="padding:16px"><p style="font-size:11px;color:var(--text-muted)">No hay contenido generado aún</p></div>';
        return;
      }

      list.innerHTML = history.map(function(item) {
        var time = new Date(item.timestamp);
        var timeStr = time.toLocaleDateString('es-ES') + ' ' + time.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        return '<div class="bm-history-item" data-content="' + encodeURIComponent(item.content) + '">' +
          '<div class="bm-history-item-header">' +
            '<span class="bm-history-item-game">' + escapeHtml(item.gameName) + '</span>' +
            '<span class="bm-history-item-type">' + escapeHtml(item.contentType) + '</span>' +
          '</div>' +
          '<div class="bm-history-item-preview">' + escapeHtml(truncate(item.content, 80)) + '</div>' +
          '<div class="bm-history-item-time">' + timeStr + '</div>' +
        '</div>';
      }).join('');

      // Click to load
      list.querySelectorAll('.bm-history-item').forEach(function(item) {
        item.addEventListener('click', function() {
          var content = decodeURIComponent(this.getAttribute('data-content'));
          $('creator-result').classList.remove('hidden');
          $('creator-result-text').textContent = content;
        });
      });
    });
  }

  /* ════════════════════════════════════════
     SETTINGS TAB
     ════════════════════════════════════════ */

  function initSettings() {
    // Load saved settings
    window.BacklogStorage.getSettings().then(function(settings) {
      if (settings.platforms) {
        $$('#settings-platforms .bm-toggle-btn').forEach(function(btn) {
          var p = btn.getAttribute('data-platform');
          btn.classList.toggle('active', settings.platforms.indexOf(p) !== -1);
        });
      }
      if (settings.genres) {
        $$('#settings-genres .bm-toggle-btn').forEach(function(btn) {
          var g = btn.getAttribute('data-genre');
          btn.classList.toggle('active', settings.genres.indexOf(g) !== -1);
        });
      }
    });

    // Platform toggles
    $$('#settings-platforms .bm-toggle-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        this.classList.toggle('active');
        saveCurrentSettings();
      });
    });

    // Genre toggles
    $$('#settings-genres .bm-toggle-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        this.classList.toggle('active');
        saveCurrentSettings();
      });
    });

    // Export
    $('btn-export').addEventListener('click', function() {
      window.BacklogStorage.exportGames().then(function(json) {
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'backlog-maldito-export-' + new Date().toISOString().substring(0, 10) + '.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('📤 Backlog exportado');
      });
    });

    // Import
    $('btn-import').addEventListener('click', function() {
      $('import-file').click();
    });

    $('import-file').addEventListener('change', function() {
      var file = this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(e) {
        window.BacklogStorage.importGames(e.target.result).then(function(result) {
          showToast('📥 ' + result.imported + ' juegos importados (' + result.total + ' total)');
          loadGames().then(function() {
            renderGames();
            renderBacklogStats();
            refreshCreatorGameSelect();
          });
        }).catch(function(err) {
          showToast('❌ Error importando: ' + err.message);
        });
      };
      reader.readAsText(file);
      this.value = '';
    });

    // Clear all
    $('btn-clear-all').addEventListener('click', function() {
      showConfirm('⚠️ ¿BORRAR TODO el backlog? Esta acción no se puede deshacer.').then(function(confirmed) {
        if (confirmed) {
          window.BacklogStorage.clearAll().then(function() {
            showToast('🗑️ Backlog borrado completamente');
            loadGames().then(function() {
              renderGames();
              renderBacklogStats();
              refreshCreatorGameSelect();
            });
          });
        }
      });
    });
  }

  function saveCurrentSettings() {
    var platforms = [];
    $$('#settings-platforms .bm-toggle-btn.active').forEach(function(btn) {
      platforms.push(btn.getAttribute('data-platform'));
    });
    var genres = [];
    $$('#settings-genres .bm-toggle-btn.active').forEach(function(btn) {
      genres.push(btn.getAttribute('data-genre'));
    });
    window.BacklogStorage.saveSettings({
      platforms: platforms,
      genres: genres,
      rawgApiKey: RAWG_KEY
    });
  }

  /* ═══ MESSAGES ═══ */

  function listenForMessages() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;

    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
      if (message.action === 'GAME_SAVED_FROM_FAB') {
        showToast('🎮 "' + (message.game ? message.game.name : 'Juego') + '" guardado desde la web');
        loadGames().then(function() {
          renderGames();
          renderBacklogStats();
          refreshCreatorGameSelect();
          notifyBadgeUpdate();
        });
        sendResponse({ status: 'ok' });
      }
      return false;
    });
  }

  function notifyBadgeUpdate() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'UPDATE_BADGE' }).catch(function() {});
    }
  }

  /* ═══ UTILITIES ═══ */

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

})();
