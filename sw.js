// sw.js — Fixed Version
// Changes from original:
//   1. skipWaiting() moved inside waitUntil (prevents cache race condition)
//   2. activate handler consolidates clients.claim() inside waitUntil chain
//   3. fetch strategy is now network-first for HTML, cache-first for assets
//   4. Added message listener so the "update" button actually works
//   5. Supabase API calls are never intercepted by the SW

const CACHE_NAME = 'music-borrow-v6.0.0'; // ✨ Bumped from v5.2.042 to force all clients to update

const PRECACHE_URLS = [
    '/',
    '/index.html',
    'https://unpkg.com/@picocss/pico@1.5.10/css/pico.min.css',
    'assets/logo.png',
    'assets/default-avatar.png',
    'assets/default-instrument.png'
];

// --- INSTALL ---
// Opens cache and pre-caches core assets BEFORE activating.
// skipWaiting() is called ONLY after cache is fully populated to avoid race condition.
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting()) // ✅ FIX: was outside waitUntil in original
    );
});

// --- ACTIVATE ---
// Cleans up old caches, THEN claims clients.
// Both operations are chained inside a single waitUntil to guarantee order.
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames =>
                Promise.all(
                    cacheNames
                        .filter(name => name !== CACHE_NAME) // ✅ FIX: filter before map (no undefined returns)
                        .map(name => {
                            console.log('Service Worker: Removing old cache:', name);
                            return caches.delete(name);
                        })
                )
            )
            .then(() => self.clients.claim()) // ✅ FIX: was 'return self.clients.claim()' outside waitUntil
    );
});

// --- FETCH ---
// Strategy:
//   - Supabase API calls: BYPASS (never cache auth/data requests)
//   - HTML navigation requests: NETWORK FIRST (always get latest app code)
//   - Static assets (CSS, JS, images): CACHE FIRST with network fallback
self.addEventListener('fetch', event => {
    const url = event.request.url;

    // ✅ FIX: Never intercept non-GET requests or Supabase API/auth calls
    if (event.request.method !== 'GET') return;
    if (url.includes('supabase.co')) return;
    if (url.includes('cdn.jsdelivr.net') && url.includes('supabase-js')) return;

    // Navigation requests (loading the HTML page itself): Network-first
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then(networkResponse => {
                    // Cache a fresh copy for offline fallback
                    if (networkResponse && networkResponse.status === 200) {
                        const clone = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // Network failed — serve from cache as offline fallback
                    return caches.match(event.request);
                })
        );
        return;
    }

    // Static assets: Cache-first with network fallback and cache update
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) return cachedResponse;

            return fetch(event.request).then(networkResponse => {
                if (networkResponse && networkResponse.status === 200) {
                    const clone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return networkResponse;
            });
        })
    );
});

// --- MESSAGE ---
// ✅ FIX: Handles 'skipWaiting' message from the update notification button in index.html
// Without this, the update button posts a message into a void and the old SW stays in control.
self.addEventListener('message', event => {
    if (event.data && event.data.action === 'skipWaiting') {
        console.log('Service Worker: Received skipWaiting message. Activating new version now.');
        self.skipWaiting();
    }
});

// --- NOTIFICATION CLICK ---
// Opens the app when a push notification is clicked.
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data?.url || '/')
    );
});