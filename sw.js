// 814 表現紀錄 — 離線快取。改版時把 VERSION 加 1，重新整理後會自動換新。
const VERSION = 'v18';
const CACHE = 'cls814-' + VERSION;
// HTML 走「網路優先」：一上傳新版就立刻看到；離線時才用快取。
const DOCS = ['./', './index.html', './app.html', './本週家長聯繫單.html'];
const STATIC = ['./manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => {
      // DOCS 是必要資產：抓不到就讓安裝失敗，避免離線時開不起來
      const must = Promise.all(DOCS.map(u =>
        fetch(new Request(u, { cache: 'reload' })).then(r => {
          if (!r || !r.ok) throw new Error('cache fail: ' + u);
          return c.put(u, r);
        })
      ));
      const opt = Promise.all(STATIC.map(u =>
        fetch(new Request(u, { cache: 'reload' })).then(r => (r && r.ok ? c.put(u, r) : null)).catch(() => {})
      ));
      return must.then(() => opt);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

const isDoc = req =>
  req.mode === 'navigate' ||
  (req.headers.get('accept') || '').indexOf('text/html') >= 0;

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  if (isDoc(req)) {
    // 網路優先，成功就順手更新快取；失敗（離線）才回快取
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req)
            .then(hit => hit || caches.match('./app.html'))
            .then(hit => hit || caches.match('./index.html'))
        )
    );
    return;
  }

  // 圖示、manifest 等靜態檔：快取優先
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
