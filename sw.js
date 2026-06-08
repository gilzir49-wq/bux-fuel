// Service Worker — מאפשר התקנה למסך הבית ועבודה אופליין (לוגינג עובד בלי אינטרנט).
const CACHE = 'bux-fuel-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
  './logos/logo-header-yellow.png',
  './logos/logo-badge-green.png',
  './logos/logo-emblem.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // קריאות ל-AI (Worker) — תמיד דרך הרשת, לא מהמטמון.
  if (url.pathname.includes('/analyze-') || url.pathname.includes('/coach')) return;
  if (e.request.method !== 'GET') return;
  // אסטרטגיה: cache-first עם רענון ברקע (stale-while-revalidate)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetched = fetch(e.request).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
