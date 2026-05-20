/* BACKLOG MALDITO — Storage Library v1.2.0 */

(function() {
  'use strict';

  var STORAGE_KEY = 'backlog_maldito_games';
  var SETTINGS_KEY = 'backlog_maldito_settings';
  var HISTORY_KEY = 'backlog_maldito_history';

  /* ─── Core Storage ─── */

  function getStorageItem(key) {
    return new Promise(function(resolve, reject) {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(key, function(result) {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result[key] || null);
          }
        });
      } else {
        // Fallback for side panel dev testing
        try {
          var data = localStorage.getItem(key);
          resolve(data ? JSON.parse(data) : null);
        } catch (e) {
          reject(e);
        }
      }
    });
  }

  function setStorageItem(key, value) {
    return new Promise(function(resolve, reject) {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ key: key, value: value }, function() {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      } else {
        try {
          localStorage.setItem(key, JSON.stringify(value));
          resolve();
        } catch (e) {
          reject(e);
        }
      }
    });
  }

  function setStorageItemDirect(key, value) {
    return new Promise(function(resolve, reject) {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        var obj = {};
        obj[key] = value;
        chrome.storage.local.set(obj, function() {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      } else {
        try {
          localStorage.setItem(key, JSON.stringify(value));
          resolve();
        } catch (e) {
          reject(e);
        }
      }
    });
  }

  /* ─── Game CRUD ─── */

  function getGames() {
    return getStorageItem(STORAGE_KEY).then(function(data) {
      return Array.isArray(data) ? data : [];
    });
  }

  function saveGame(game) {
    return getGames().then(function(games) {
      var exists = games.findIndex(function(g) { return g.id === game.id; });
      if (exists >= 0) {
        games[exists] = Object.assign({}, games[exists], game);
      } else {
        games.unshift(game);
      }
      return setStorageItemDirect(STORAGE_KEY, games).then(function() {
        return game;
      });
    });
  }

  function updateGame(id, updates) {
    return getGames().then(function(games) {
      var idx = games.findIndex(function(g) { return g.id === id; });
      if (idx >= 0) {
        games[idx] = Object.assign({}, games[idx], updates);
        return setStorageItemDirect(STORAGE_KEY, games).then(function() {
          return games[idx];
        });
      }
      return null;
    });
  }

  function deleteGame(id) {
    return getGames().then(function(games) {
      var filtered = games.filter(function(g) { return g.id !== id; });
      return setStorageItemDirect(STORAGE_KEY, filtered).then(function() {
        return filtered;
      });
    });
  }

  /* ─── Settings ─── */

  function getSettings() {
    return getStorageItem(SETTINGS_KEY).then(function(data) {
      return data || {
        platforms: ['PC', 'PlayStation', 'Xbox', 'Nintendo'],
        genres: ['Acción', 'RPG', 'Terror', 'Aventura'],
        rawgApiKey: 'faea405801b44b708d08022d4a61a0b2'
      };
    });
  }

  function saveSettings(settings) {
    return setStorageItemDirect(SETTINGS_KEY, settings);
  }

  /* ─── Export / Import ─── */

  function exportGames() {
    return getGames().then(function(games) {
      return JSON.stringify(games, null, 2);
    });
  }

  function importGames(jsonString) {
    return new Promise(function(resolve, reject) {
      try {
        var imported = JSON.parse(jsonString);
        if (!Array.isArray(imported)) {
          reject(new Error('Formato inválido: se esperaba un array'));
          return;
        }
        // Validate each item has at least a name
        var valid = imported.filter(function(g) {
          return g.name && typeof g.name === 'string';
        });
        // Add IDs to any items missing them
        valid = valid.map(function(g) {
          if (!g.id) g.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
          if (!g.addedAt) g.addedAt = new Date().toISOString();
          return g;
        });
        return getGames().then(function(existing) {
          var existingIds = existing.map(function(g) { return g.id; });
          var newGames = valid.filter(function(g) { return existingIds.indexOf(g.id) === -1; });
          var merged = newGames.concat(existing);
          return setStorageItemDirect(STORAGE_KEY, merged).then(function() {
            resolve({ imported: newGames.length, total: merged.length });
          });
        });
      } catch (e) {
        reject(new Error('JSON inválido: ' + e.message));
      }
    });
  }

  function clearAll() {
    return setStorageItemDirect(STORAGE_KEY, []).then(function() {
      return setStorageItemDirect(HISTORY_KEY, []);
    });
  }

  /* ─── Content History ─── */

  function getContentHistory() {
    return getStorageItem(HISTORY_KEY).then(function(data) {
      return Array.isArray(data) ? data : [];
    });
  }

  function addContentHistory(item) {
    return getContentHistory().then(function(history) {
      history.unshift({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        gameName: item.gameName || '',
        contentType: item.contentType || '',
        content: item.content || '',
        platform: item.platform || ''
      });
      // Keep last 50
      if (history.length > 50) history = history.slice(0, 50);
      return setStorageItemDirect(HISTORY_KEY, history).then(function() {
        return history[0];
      });
    });
  }

  function clearContentHistory() {
    return setStorageItemDirect(HISTORY_KEY, []);
  }

  /* ─── Expose ─── */

  window.BacklogStorage = {
    getGames: getGames,
    saveGame: saveGame,
    updateGame: updateGame,
    deleteGame: deleteGame,
    getSettings: getSettings,
    saveSettings: saveSettings,
    exportGames: exportGames,
    importGames: importGames,
    clearAll: clearAll,
    getContentHistory: getContentHistory,
    addContentHistory: addContentHistory,
    clearContentHistory: clearContentHistory
  };

})();
