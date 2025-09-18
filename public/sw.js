// sw.js
const CACHE_VERSION = 'v0.1.2 '; // Increment this with each deployment
const CACHE_NAME = `OpenBinder-cache-${CACHE_VERSION}`;

// Assets to cache immediately on install
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/share.html',
  '/styles.css',
  '/app.js',
  '/share.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install event - cache core assets
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing new version');
  
  // Force activation without waiting
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching core assets');
        return cache.addAll(CORE_ASSETS);
      })
      .catch(error => {
        console.error('[Service Worker] Install failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating new version');
  
  // Take control of all clients immediately
  event.waitUntil(
    clients.claim()
      .then(() => {
        // Remove old caches
        return caches.keys().then(cacheNames => {
          return Promise.all(
            cacheNames
              .filter(cacheName => cacheName.startsWith('bookmark-cache-') && cacheName !== CACHE_NAME)
              .map(cacheName => {
                console.log('[Service Worker] Deleting old cache:', cacheName);
                return caches.delete(cacheName);
              })
          );
        });
      })
      .catch(error => {
        console.error('[Service Worker] Activation failed:', error);
      })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', event => {
  // Skip non-GET requests and Firebase API calls
  if (event.request.method !== 'GET' || 
      event.request.url.includes('firestore.googleapis.com') ||
      event.request.url.includes('firebase')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Return cached response if found
        if (cachedResponse) {
          return cachedResponse;
        }

        // Otherwise fetch from network
        return fetch(event.request)
          .then(response => {
            // Don't cache if not a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response - one to return, one to cache
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              })
              .catch(error => {
                console.error('[Service Worker] Cache write failed:', error);
              });

            return response;
          })
          .catch(error => {
            console.error('[Service Worker] Fetch failed:', error);
            
            // If HTML request fails, return offline page
            if (event.request.headers.get('Accept').includes('text/html')) {
              return caches.match('/index.html');
            }
            
            // Otherwise just propagate the error
            throw error;
          });
      })
  );
});

// Handle messages from clients
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
