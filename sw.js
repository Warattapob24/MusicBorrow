const CACHE_NAME = 'music-borrow-v5.2.019'; // เปลี่ยนชื่อนี้ทุกครั้งที่ต้องการบังคับอัปเดตใหญ่
const urlsToCache = [
  '/',
  '/index.html',
  'https://unpkg.com/@picocss/pico@1.5.10/css/pico.min.css',
  'assets/logo.png',
  'assets/default-avatar.png',
  'assets/default-instrument.png'
];

// --- ส่วนจัดการ Cache และบังคับอัปเดต (จากผม) ---

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting(); // บังคับให้ Service Worker ใหม่ทำงานทันที
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache');
            return caches.delete(cache);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});


// --- ส่วนจัดการเมื่อคลิก Notification (จากโค้ดเดิมของคุณ) ---

self.addEventListener('notificationclick', event => {
    event.notification.close(); // ปิดการแจ้งเตือนที่คลิก

    // เปิดหน้าเว็บแอปขึ้นมาเมื่อผู้ใช้คลิก
    event.waitUntil(
        clients.openWindow(event.notification.data.url || '/')
    );
});