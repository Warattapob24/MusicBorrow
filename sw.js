// sw.js — Fixed & Push Notification Enabled Version
// Changes from original:
//   1. skipWaiting() moved inside waitUntil (prevents cache race condition)
//   2. activate handler consolidates clients.claim() inside waitUntil chain
//   3. fetch strategy is now network-first for HTML, cache-first for assets
//   4. Added message listener so the "update" button actually works
//   5. Supabase API calls are never intercepted by the SW
//   6. [NEW] Added 'push' event listener for background notifications
//   7. [NEW] Enhanced 'notificationclick' to focus existing tabs instead of always opening new ones

const CACHE_NAME = 'music-borrow-v6.0.079'; // Fix: autoCorrelate edge guard (T=0/overflow crash in tuner)

const PRECACHE_URLS = [
    '/',
    '/index.html',
    'https://unpkg.com/@picocss/pico@1.5.10/css/pico.min.css',
    'assets/logo.png',
    'assets/default-avatar.png',
    'assets/default-instrument.png'
];

// --- INSTALL ---
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting()) // ✅ FIX: was outside waitUntil in original
    );
});

// --- ACTIVATE ---
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames =>
                Promise.all(
                    cacheNames
                        .filter(name => name !== CACHE_NAME) // ✅ FIX: filter before map
                        .map(name => {
                            return caches.delete(name);
                        })
                )
            )
            .then(() => self.clients.claim()) // ✅ FIX: was outside waitUntil
    );
});

// --- FETCH HANDLER ---
self.addEventListener('fetch', event => {
    const url = event.request.url;
    const sameOrigin = new URL(url).origin === self.location.origin;

    // 1. ข้ามการดักจับ: non-GET, Supabase API, Extensions
    if (
        event.request.method !== 'GET' ||
        url.includes('supabase.co') ||
        url.includes('chrome-extension')
    ) {
        return;
    }

    // 2. ข้าม cross-origin requests ที่เราไม่ได้ตั้งใจ cache
    //    (Google Calendar widget, Vercel feedback, analytics ฯลฯ — ปล่อยให้ browser จัดการเอง)
    //    ยกเว้น Pico CSS CDN ที่อยู่ใน PRECACHE_URLS
    if (!sameOrigin && !url.includes('@picocss/pico')) {
        return;
    }

    // 3. Network-First (Fallback to Cache) สำหรับโหมด Navigate หรือไฟล์ประเภท HTML
    if (event.request.mode === 'navigate' || (event.request.headers.get('accept') || '').includes('text/html')) {
        event.respondWith(
            fetch(event.request).then(networkResponse => {
                const clone = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return networkResponse;
            }).catch(async () => {
                // Network failed — try cache; if cache also misses, return a clear error response
                const cached = await caches.match(event.request);
                return cached || new Response(
                    '<h1>ออฟไลน์</h1><p>ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ในขณะนี้</p>',
                    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                );
            })
        );
        return;
    }

    // 4a. JS / CSS files: Network-First so users always get the latest deploys.
    //     Was Cache-First — that caused stale ui.js / styles.css to keep being
    //     served even after fresh deploys, so colour fixes never took effect.
    if (url.endsWith('.js') || url.endsWith('.css')) {
        event.respondWith(
            fetch(event.request).then(networkResponse => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const clone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return networkResponse;
            }).catch(async () => {
                const cached = await caches.match(event.request);
                return cached || new Response('', { status: 504 });
            })
        );
        return;
    }

    // 4b. Other assets (images, fonts): Cache-First with network fallback
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) return cachedResponse;

            return fetch(event.request).then(networkResponse => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const clone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, clone).catch(err => console.error('Cache Error:', err));
                    });
                }
                return networkResponse;
            }).catch(err => {
                console.warn('[SW] Network fetch failed for', url, '-', err.message);
                // FIX: Must return a Response object, not undefined.
                // Returning undefined caused "Failed to convert value to 'Response'" errors.
                return new Response('', { status: 504, statusText: 'Gateway Timeout' });
            });
        })
    );
});

// --- MESSAGE ---
self.addEventListener('message', event => {
    if (event.data && event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});

// ==========================================
// 🔔 PUSH NOTIFICATION SYSTEM (PHASE 2)
// ==========================================

// --- PUSH ---
// รับ Event จาก Web Push Service และแสดงการแจ้งเตือน
self.addEventListener('push', event => {
    console.log('[SW Push] received');

    // กำหนดค่าเริ่มต้นป้องกันกรณี Payload ว่างเปล่าหรือเกิด Error
    let data = {
        title: 'การแจ้งเตือนใหม่',
        body:  'คุณมีข้อความใหม่จากระบบ',
        icon:  '/assets/logo.png',
        badge: '/assets/logo.png',
        url:   '/'
    };

    if (event.data) {
        try {
            const payload = event.data.json();
            data = { ...data, ...payload };
            console.log('[SW Push] payload:', payload);
        } catch (e) {
            try {
                data.body = event.data.text();
                console.log('[SW Push] text payload:', data.body);
            } catch (e2) {
                console.warn('[SW Push] failed to parse payload:', e2);
            }
        }
    }

    const title = data.title || 'การแจ้งเตือน';
    const options = {
        body:  data.body || '',
        icon:  data.icon  || '/assets/logo.png',
        badge: data.badge || '/assets/logo.png',
        // FIX: `renotify` requires a non-empty `tag`. If the payload didn't
        // send one, we omit both — Chrome was throwing
        // "Notifications which set the renotify flag must specify a non-empty tag".
        ...(data.tag ? { tag: data.tag, renotify: true } : {}),
        vibrate: [200, 100, 200],
        requireInteraction: false,           // auto-dismiss after a few seconds
        data: {
            url: data.url || '/',
            dateOfArrival: Date.now(),
        }
    };

    // ✅ Must call showNotification(); otherwise some browsers will show a
    // generic "This site has been updated in the background" message.
    event.waitUntil(
        self.registration.showNotification(title, options)
            .then(() => console.log('[SW Push] showNotification done:', title))
            .catch(err => console.error('[SW Push] showNotification failed:', err))
    );
});

// --- PUSH SUBSCRIPTION CHANGE ---
// บางเบราว์เซอร์จะรีเฟรช subscription เป็นระยะ (กันการขโมย token).
// เมื่อเกิด → เราต้อง re-subscribe และส่งให้ server บันทึก subscription ใหม่
self.addEventListener('pushsubscriptionchange', event => {
    console.warn('[SW PushSubChange] subscription expired/rotated — attempting re-subscribe');
    event.waitUntil((async () => {
        try {
            const old = event.oldSubscription;
            // We don't have the VAPID key here — best-effort: post a message
            // to any open client so the page can re-call requestPushPermission().
            const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            for (const c of clientsList) {
                c.postMessage({ type: 'PUSH_SUBSCRIPTION_LOST', oldEndpoint: old?.endpoint });
            }
        } catch (err) {
            console.error('[SW PushSubChange] handler failed:', err);
        }
    })());
});

// --- NOTIFICATION CLICK ---
// จัดการเมื่อผู้ใช้กดที่การแจ้งเตือน
self.addEventListener('notificationclick', event => {
    event.notification.close(); // ปิดกล่องการแจ้งเตือนทันทีที่กด

    const urlToOpen = new URL(event.notification.data?.url || '/', self.location.origin).href;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            // 💡 [Creative Problem-Solving] 
            // ตรวจสอบก่อนว่าผู้ใช้เปิดแท็บของแอปเราค้างไว้อยู่แล้วหรือไม่
            // หากมีให้ทำการ Focus กลับไปที่แท็บนั้นเพื่อป้องกันการเปิดแท็บซ้ำซ้อน
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            // หากไม่พบแท็บที่เปิดอยู่ ให้เปิดหน้าต่าง/แท็บใหม่
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});