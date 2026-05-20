/* BACKLOG MALDITO — Background Service Worker v1.2.0 */

var RAWG_KEY = 'faea405801b44b708d08022d4a61a0b2';
var RAWG_BASE = 'https://api.rawg.io/api';
var CACHE_TTL = 30 * 60 * 1000; // 30 minutes
var rawgCache = new Map();

/* ─── Extension Lifecycle ─── */

chrome.runtime.onInstalled.addListener(function(details) {
  if (details.reason === 'install') {
    chrome.storage.local.set({ backlog_maldito_settings: {
      platforms: ['PC', 'PlayStation', 'Xbox', 'Nintendo'],
      genres: ['Acción', 'RPG', 'Terror', 'Aventura'],
      rawgApiKey: RAWG_KEY
    }});
  }
  updateBadge();
});

/* ─── Icon Click → Open Side Panel ─── */

chrome.action.onClicked.addListener(function(tab) {
  chrome.sidePanel.open({ tabId: tab.id });
});

/* ─── Message Handling ─── */

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  switch (message.action) {
    case 'SAVE_GAME_FROM_FAB':
      handleSaveFromFab(message, sender);
      sendResponse({ status: 'ok' });
      return false;

    case 'ENRICH_GAME':
      enrichGameFromPanel(message).then(sendResponse);
      return true;

    case 'ENRICH_ALL_GAMES':
      enrichAllGamesFromPanel(message).then(sendResponse);
      return true;

    case 'GET_TAB_INFO':
      getTabInfo(sender.tab ? sender.tab.id : null).then(sendResponse);
      return true;

    case 'UPDATE_BADGE':
      updateBadge();
      sendResponse({ status: 'ok' });
      return false;

    case 'GAME_SAVED_FROM_FAB':
      // Forward to side panel
      chrome.runtime.sendMessage(message).catch(function() {});
      sendResponse({ status: 'forwarded' });
      return false;

    default:
      sendResponse({ error: 'Unknown action' });
      return false;
  }
});

/* ─── Tab Info ─── */

function getTabInfo(tabId) {
  return new Promise(function(resolve) {
    if (!tabId) {
      resolve({ title: '', url: '', favIconUrl: '' });
      return;
    }
    chrome.tabs.get(tabId, function(tab) {
      resolve({
        title: tab ? tab.title || '' : '',
        url: tab ? tab.url || '' : '',
        favIconUrl: tab ? tab.favIconUrl || '' : ''
      });
    });
  });
}

/* ─── Handle Save from FAB ─── */

function handleSaveFromFab(message, sender) {
  var gameName = message.gameName || 'Unknown Game';
  var tabUrl = message.tabUrl || '';
  var tabTitle = message.tabTitle || '';

  // Enrich from RAWG before saving
  rawgGameSearch(gameName).then(function(rawgData) {
    var game = {
      id: generateId(),
      name: gameName,
      sourceUrl: tabUrl,
      sourceTitle: tabTitle,
      addedAt: new Date().toISOString(),
      state: 'pendiente',
      rating: 0,
      userNote: '',
      platforms: [],
      genres: []
    };

    if (rawgData) {
      Object.keys(rawgData).forEach(function(key) {
        game[key] = rawgData[key];
      });
    } else {
      game.enriched = false;
      game.enrichError = 'No encontrado en RAWG';
    }

    saveGameToStorage(game).then(function() {
      updateBadge();
      // Notify side panel
      chrome.runtime.sendMessage({
        action: 'GAME_SAVED_FROM_FAB',
        game: game
      }).catch(function() {});
    });
  }).catch(function(err) {
    // Save without RAWG data
    var game = {
      id: generateId(),
      name: gameName,
      sourceUrl: tabUrl,
      sourceTitle: tabTitle,
      addedAt: new Date().toISOString(),
      state: 'pendiente',
      rating: 0,
      userNote: '',
      platforms: [],
      genres: [],
      enriched: false,
      enrichError: err.message || 'Error de RAWG'
    };
    saveGameToStorage(game).then(function() {
      updateBadge();
      chrome.runtime.sendMessage({
        action: 'GAME_SAVED_FROM_FAB',
        game: game
      }).catch(function() {});
    });
  });
}

/* ─── Enrich Single Game from Panel ─── */

async function enrichGameFromPanel(message) {
  var gameId = message.gameId;
  var gameName = message.gameName;

  try {
    var rawgData = await rawgGameSearch(gameName);
    if (rawgData) {
      await updateGameInStorage(gameId, rawgData);
      updateBadge();
      return { success: true, game: gameName, data: rawgData };
    } else {
      await updateGameInStorage(gameId, { enriched: false, enrichError: 'No encontrado en RAWG' });
      return { success: false, game: gameName, error: 'No encontrado en RAWG' };
    }
  } catch (err) {
    return { success: false, game: gameName, error: err.message };
  }
}

/* ─── Enrich All Games from Panel ─── */

async function enrichAllGamesFromPanel(message) {
  var games = await getGamesFromStorage();
  var unenriched = games.filter(function(g) {
    return !g.rawgId || (!g.rating && !g.coverImage);
  });

  var results = [];
  for (var i = 0; i < unenriched.length; i++) {
    var game = unenriched[i];
    try {
      var rawgData = await rawgGameSearch(game.name);
      if (rawgData) {
        await updateGameInStorage(game.id, rawgData);
        results.push({ success: true, game: game.name, index: i + 1 });
      } else {
        await updateGameInStorage(game.id, { enriched: false, enrichError: 'No encontrado en RAWG' });
        results.push({ success: false, game: game.name, error: 'No encontrado', index: i + 1 });
      }
    } catch (err) {
      results.push({ success: false, game: game.name, error: err.message, index: i + 1 });
    }
    // Rate limit
    await new Promise(function(r) { setTimeout(r, 300); });
  }

  updateBadge();
  return {
    total: unenriched.length,
    results: results
  };
}

/* ─── Badge Management ─── */

function updateBadge() {
  getGamesFromStorage().then(function(games) {
    var pending = games.filter(function(g) { return g.state === 'pendiente'; }).length;
    if (pending > 0) {
      chrome.action.setBadgeText({ text: String(pending) });
      chrome.action.setBadgeBackgroundColor({ color: '#b026ff' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  });
}

/* ─── Storage Helpers ─── */

function getGamesFromStorage() {
  return new Promise(function(resolve) {
    chrome.storage.local.get('backlog_maldito_games', function(data) {
      resolve(data.backlog_maldito_games || []);
    });
  });
}

function saveGameToStorage(game) {
  return new Promise(function(resolve) {
    getGamesFromStorage().then(function(games) {
      var exists = games.findIndex(function(g) { return g.id === game.id; });
      if (exists >= 0) {
        games[exists] = game;
      } else {
        games.unshift(game);
      }
      chrome.storage.local.set({ backlog_maldito_games: games }, resolve);
    });
  });
}

function updateGameInStorage(id, updates) {
  return new Promise(function(resolve) {
    getGamesFromStorage().then(function(games) {
      var idx = games.findIndex(function(g) { return g.id === id; });
      if (idx >= 0) {
        Object.keys(updates).forEach(function(key) {
          games[idx][key] = updates[key];
        });
        chrome.storage.local.set({ backlog_maldito_games: games }, resolve);
      } else {
        resolve();
      }
    });
  });
}

/* ─── RAWG API ─── */

function cachedFetch(key, ttl, fetchFn) {
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
  return cachedFetch('search:' + q.toLowerCase(), CACHE_TTL, function() {
    return fetch(RAWG_BASE + '/games?key=' + RAWG_KEY + '&search=' + encodeURIComponent(q) + '&page_size=8')
      .then(function(r) { return r.json(); });
  });
}

function rawgGameDetails(id) {
  return cachedFetch('detail:' + id, CACHE_TTL, function() {
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
    if (results.length === 0) return null;

    // Find best match
    var nameLower = name.toLowerCase();
    var nameNoSpecial = nameLower.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

    var bestMatch = null;

    // 1. Exact match
    for (var i = 0; i < results.length; i++) {
      if (results[i].name.toLowerCase() === nameLower) {
        bestMatch = results[i];
        break;
      }
    }

    // 2. Starts with
    if (!bestMatch) {
      for (var i = 0; i < results.length; i++) {
        if (results[i].name.toLowerCase().indexOf(nameLower) === 0) {
          bestMatch = results[i];
          break;
        }
      }
    }

    // 3. Contains
    if (!bestMatch) {
      for (var i = 0; i < results.length; i++) {
        var rNameClean = results[i].name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
        if (rNameClean.indexOf(nameNoSpecial) !== -1 || nameNoSpecial.indexOf(rNameClean) !== -1) {
          bestMatch = results[i];
          break;
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
        rawgUrl: details.website || 'https://rawg.io/games/' + details.slug,
        enriched: true,
        enrichedAt: new Date().toISOString()
      };
    });
  }).catch(function() {
    return null;
  });
}

/* ─── Utilities ─── */

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}
