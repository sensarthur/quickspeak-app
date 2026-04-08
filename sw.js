// ═══════════════════════════════════════════════
//  QuickSpeak — Service Worker
//  Stratégie : Cache-first, mise à jour en arrière-plan
//
//  - Au premier chargement : met tout en cache
//  - Ensuite : sert depuis le cache (instantané, offline)
//  - En arrière-plan : vérifie s'il y a une mise à jour
//  - Si mise à jour détectée : notifie la webapp
// ═══════════════════════════════════════════════

var CACHE_NAME = 'quickspeak-v5-100';

var ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ── Installation : pré-cache des assets ──
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    }).then(function() {
      // Activer immédiatement (pas d'attente)
      return self.skipWaiting();
    })
  );
});

// ── Activation : nettoyer les anciens caches ──
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) {
          return name !== CACHE_NAME;
        }).map(function(name) {
          return caches.delete(name);
        })
      );
    }).then(function() {
      // Prendre le contrôle de toutes les pages immédiatement
      return self.clients.claim();
    })
  );
});

// ── Fetch : cache-first + mise à jour réseau en arrière-plan ──
self.addEventListener('fetch', function(e) {
  // Ignorer les requêtes non-GET (ex: POST)
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(function(cached) {
      // Toujours lancer une requête réseau en arrière-plan
      var networkFetch = fetch(e.request).then(function(response) {
        // Ne cacher que les réponses valides
        if (response && response.status === 200 && response.type === 'basic') {
          var responseClone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, responseClone);
          });

          // Si le contenu a changé et qu'on avait un cache,
          // notifier la page qu'une mise à jour est dispo
          if (cached) {
            self.clients.matchAll().then(function(clients) {
              clients.forEach(function(client) {
                client.postMessage({ type: 'UPDATE_AVAILABLE' });
              });
            });
          }
        }
        return response;
      }).catch(function() {
        // Réseau indisponible — pas grave, on a le cache
        return cached;
      });

      // Retourner le cache si dispo, sinon attendre le réseau
      return cached || networkFetch;
    })
  );
});
