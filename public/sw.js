/* Rudge — service worker
 * - Cache offline (app shell + assets)
 * - Clique e botões das notificações ("Concluir", "Adiar")
 * - Sincronização periódica: dispara lembretes vencidos mesmo com o app fechado (onde suportado)
 * - Push (preparado para um servidor de push no futuro)
 */
const BUILD = '__BUILD_ID__';
const CACHE = `rudge-${BUILD}`;
const SCOPE = self.registration.scope;
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/badge-96.png'];

/* ---------- IndexedDB (mesmo banco do app) ---------- */
function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('rudge', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  const db = await idb();
  return new Promise((resolve) => {
    const req = db.transaction('kv', 'readonly').objectStore('kv').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });
}
async function idbSet(key, value) {
  const db = await idb();
  return new Promise((resolve) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/* ---------- Instalação / cache ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(CORE).catch(() => {});
      // pré-carrega os assets referenciados no index.html
      try {
        const res = await fetch('./index.html', { cache: 'no-store' });
        const html = await res.text();
        const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((m) => m[1]);
        await cache.addAll(assets);
        // fontes (alfabeto latino) referenciadas no CSS
        for (const css of assets.filter((a) => a.endsWith('.css'))) {
          const text = await (await cache.match(css)).text();
          const fonts = [...text.matchAll(/url\(\.\/([^)]*latin[^)]*\.woff2)\)/g)].map((m) => `./assets/${m[1]}`);
          await cache.addAll(fonts).catch(() => {});
        }
      } catch (e) {
        /* offline durante a instalação */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('rudge-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // navegação: rede primeiro (sempre a versão mais nova), cache quando offline
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put('./index.html', res.clone());
          return res;
        } catch (e) {
          return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
        }
      })(),
    );
    return;
  }

  // assets: cache primeiro
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok && (url.pathname.includes('/assets/') || url.pathname.includes('/icons/'))) {
          const cache = await caches.open(CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch (e) {
        return Response.error();
      }
    })(),
  );
});

/* ---------- Notificações ---------- */
const ICON = new URL('icons/icon-192.png', SCOPE).href;
const BADGE = new URL('icons/badge-96.png', SCOPE).href;

async function windowClients() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
}

async function openApp(hash) {
  const list = await windowClients();
  const target = new URL(SCOPE);
  target.hash = (hash || '#/inicio').replace(/^#/, '');
  for (const client of list) {
    if (client.url.startsWith(SCOPE)) {
      await client.focus();
      client.postMessage({ type: 'rudge-action', action: 'open', data: { url: hash, key: '', kind: 'test', title: '', body: '', snoozeMin: 0 } });
      return;
    }
  }
  await self.clients.openWindow(target.href);
}

self.addEventListener('notificationclick', (event) => {
  const n = event.notification;
  const data = n.data || {};
  const action = event.action || 'open';
  n.close();
  event.waitUntil(
    (async () => {
      if (action === 'done' || action === 'snooze') {
        const list = await windowClients();
        const client = list.find((c) => c.url.startsWith(SCOPE));
        if (client) {
          client.postMessage({ type: 'rudge-action', action, data });
          return;
        }
        // app fechado: guarda a ação (com o horário do clique) para aplicar quando abrir
        const pending = (await idbGet('pending-actions')) || [];
        pending.push({ action, data, at: Date.now() });
        await idbSet('pending-actions', pending);
        return;
      }
      await openApp(data.url);
    })(),
  );
});

/** Dispara itens vencidos da fila (usado na sincronização periódica). */
async function fireDue() {
  const queue = (await idbGet('queue')) || [];
  const fired = (await idbGet('fired')) || {};
  const inbox = (await idbGet('sw-inbox')) || [];
  const now = Date.now();
  let changed = false;
  for (const item of queue) {
    if (item.at > now || fired[item.key]) continue;
    fired[item.key] = now;
    changed = true;
    if (now - item.at > item.grace) continue;
    await self.registration.showNotification(item.title, {
      body: now - item.at > 300000 ? `Atrasado · ${item.body}` : item.body,
      tag: item.key,
      icon: ICON,
      badge: BADGE,
      renotify: true,
      requireInteraction: !!item.requireInteraction,
      timestamp: item.at,
      actions: item.actions || [],
      data: {
        key: item.key, kind: item.kind, refId: item.refId, occ: item.occ,
        url: item.url, title: item.title, body: item.body, snoozeMin: item.snoozeMin,
      },
    });
    inbox.push({ key: item.key, kind: item.kind, url: item.url, title: item.title, body: item.body });
  }
  if (changed) {
    await idbSet('fired', fired);
    await idbSet('sw-inbox', inbox.slice(-30));
  }
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'rudge-reminders') {
    event.waitUntil(
      (async () => {
        // se o app está aberto ele mesmo cuida dos disparos
        const list = await windowClients();
        if (!list.some((c) => c.visibilityState === 'visible')) await fireDue();
      })(),
    );
  }
});

// Push de um servidor (opcional, para lembretes com o app 100% fechado no celular)
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'Rudge', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Rudge', {
      body: payload.body || '',
      tag: payload.tag || `push:${Date.now()}`,
      icon: ICON,
      badge: BADGE,
      data: payload.data || { url: '#/inicio' },
      actions: payload.actions || [],
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
  if (event.data === 'fire-due') event.waitUntil(fireDue());
});
