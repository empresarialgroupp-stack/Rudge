/* Rudge — service worker
 * - Cache offline (app shell + assets)
 * - Clique e botões das notificações ("Concluir", "Adiar")
 * - Sincronização periódica: dispara lembretes vencidos mesmo com o app fechado (onde suportado)
 * - Push do servidor (Supabase): avisos com o app fechado
 */
const BUILD = '__BUILD_ID__';
const CACHE = `rudge-${BUILD}`;
const SCOPE = self.registration.scope;
const APPLE = /AppleWebKit/.test(self.navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg|Android/.test(self.navigator.userAgent);
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

/** Chama o servidor de notificações com a configuração salva pelo app. */
async function callServer(path, body) {
  try {
    const cfg = await idbGet('push-config');
    if (!cfg || !cfg.token) return false;
    const res = await fetch(`${cfg.api}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-rudge-token': cfg.token },
      body: JSON.stringify({ deviceId: cfg.deviceId, ...body }),
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

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
        // app fechado: avisa o servidor (adiar reagenda o push; concluir cancela pendências)
        const serverOk = await callServer('action', { action, data });
        // "concluir" sempre fica guardado para o app aplicar ao abrir; "adiar" só se o servidor falhou
        if (action === 'done' || !serverOk) {
          const pending = (await idbGet('pending-actions')) || [];
          pending.push({ action, data, at: Date.now() });
          await idbSet('pending-actions', pending);
        }
        return;
      }
      if (action === 'accept-plan') {
        const list = await windowClients();
        const client = list.find((c) => c.url.startsWith(SCOPE));
        if (client) {
          client.postMessage({ type: 'rudge-action', action, data });
          return;
        }
        // app fechado: guarda para aplicar ao abrir e abre o Início
        const pending = (await idbGet('pending-actions')) || [];
        pending.push({ action, data, at: Date.now() });
        await idbSet('pending-actions', pending);
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
        const cfg = await idbGet('push-config');
        if (!cfg && !list.some((c) => c.visibilityState === 'visible')) await fireDue();
      })(),
    );
  }
});

// Push do servidor (Supabase): chega mesmo com o Rudge fechado
self.addEventListener('push', (event) => {
  let item = {};
  try {
    item = event.data ? event.data.json() : {};
  } catch (e) {
    item = { title: 'Rudge', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    (async () => {
      const key = item.key || `push:${Date.now()}`;
      const fired = (await idbGet('fired')) || {};
      const already = !!fired[key];
      const now = Date.now();
      fired[key] = now;
      for (const k in fired) if (now - fired[k] > 3 * 86400000) delete fired[k];
      await idbSet('fired', fired);

      // app aberto e em foco: vira aviso interno (sem duplicar)
      const list = await windowClients();
      const focused = list.find((c) => c.focused && c.visibilityState === 'visible' && c.url.startsWith(SCOPE));
      if (focused) {
        if (!already) focused.postMessage({ type: 'rudge-push', item: { ...item, key } });
        // Safari/iOS cancela a assinatura de push quando um push não exibe notificação:
        // mostra uma silenciosa e fecha logo em seguida.
        if (APPLE) {
          const tag = `fg:${key}`;
          await self.registration.showNotification(item.title || 'Rudge', { body: item.body || '', tag, icon: ICON, badge: BADGE, silent: true });
          await new Promise((r) => setTimeout(r, 1500));
          (await self.registration.getNotifications({ tag })).forEach((n) => n.close());
        }
        return;
      }

      if (!already) {
        const inbox = (await idbGet('sw-inbox')) || [];
        inbox.push({ key, kind: item.kind || 'reminder', url: item.url || '#/inicio', title: item.title || 'Rudge', body: item.body || '' });
        await idbSet('sw-inbox', inbox.slice(-30));
      }
      // modo foco: chega sem som (fica na central do app)
      const focusUntil = (await idbGet('focus-until')) || 0;
      const quiet = item.kind !== 'focus' && focusUntil > Date.now();
      await self.registration.showNotification(item.title || 'Rudge', {
        body: item.body || '',
        tag: key,
        icon: ICON,
        badge: BADGE,
        silent: quiet,
        renotify: !already && !quiet,
        requireInteraction: !!item.requireInteraction,
        timestamp: item.at || Date.now(),
        actions: item.actions || [],
        ...(quiet ? {} : { vibrate: [120, 60, 120] }),
        data: {
          key,
          kind: item.kind || 'reminder',
          refId: item.refId,
          occ: item.occ,
          url: item.url || '#/inicio',
          title: item.title || 'Rudge',
          body: item.body || '',
          snoozeMin: item.snoozeMin || 10,
        },
      });
    })(),
  );
});

// a assinatura foi trocada pelo navegador: avisa o servidor com a nova
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const cfg = await idbGet('push-config');
      const opts = event.oldSubscription && event.oldSubscription.options;
      if (!cfg || !opts) return;
      const sub = await self.registration.pushManager.subscribe(opts);
      await callServer('subscribe', { subscription: sub.toJSON(), userAgent: 'renovada pelo service worker' });
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
  if (event.data === 'fire-due') event.waitUntil(fireDue());
});
