// Notificações com o app fechado (Web Push via servidor Supabase).
//
// Cada aparelho:
//  1. assina o push do navegador (chave VAPID pública) e registra a assinatura no servidor;
//  2. envia a fila de avisos dos próximos 30 dias sempre que algo muda;
//  3. o servidor (pg_cron a cada minuto) dispara o que venceu — mesmo com o Rudge fechado.

import { useSyncExternalStore } from 'react';
import { getState, subscribe, uid } from './store';
import { buildQueue, setPushActive } from './scheduler';
import { getSession } from './auth';
import { idbSet } from './idb';
import { updateSettings } from './actions';

export const PUSH_API = 'https://btpbarqvsglqzpcpezvz.supabase.co/functions/v1/rudge';
export const VAPID_PUBLIC_KEY = 'BBkqaVKipby2_N-cQeXzVY8bU4I4jIBton5VMeqn8jjNclq7_L5V8ToJuqrmZSe9Aq2fHJ-wPXaPO8LpZDjaLtE';
const SYNC_WINDOW = 30 * 24 * 3_600_000;
const DEVICE_KEY = 'rudge:device';

export type PushState = 'unsupported' | 'off' | 'working' | 'on' | 'error';
export interface PushStatus {
  state: PushState;
  lastSync?: number;
  pending?: number;
  next?: string | null;
  error?: string;
  /** outro aparelho tem dados editados mais recentemente: ele programa os avisos */
  stale?: boolean;
}

let status: PushStatus = { state: 'off' };
const listeners = new Set<() => void>();
function setStatus(patch: Partial<PushStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}
export function usePushStatus() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => status,
  );
}

export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = uid();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function api<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
  const token = getSession()?.token;
  if (!token) throw new Error('Entre novamente no Rudge para ativar os avisos com o app fechado.');
  const res = await fetch(`${PUSH_API}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-rudge-token': token },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(res.status === 401 ? 'Sessão sem autorização no servidor — entre novamente.' : `Servidor respondeu ${res.status}`);
  return (await res.json()) as T;
}

function keyBytes(b64u: string): Uint8Array<ArrayBuffer> {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64u.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

/** Configuração que o service worker usa para falar com o servidor com o app fechado. */
export async function saveServiceWorkerConfig() {
  const token = getSession()?.token;
  if (token) await idbSet('push-config', { api: PUSH_API, token, deviceId: deviceId() });
}

let lastSignature = '';

/** Envia a fila dos próximos 30 dias deste aparelho para o servidor. */
export async function syncNow(force = false) {
  if (!getState().settings.push || status.state === 'unsupported') return;
  const now = Date.now();
  const items = buildQueue(getState(), now, SYNC_WINDOW)
    .filter((q) => q.at > now + 5_000)
    .map((q) => ({
      key: q.key,
      at: q.at,
      grace: q.grace,
      title: q.title,
      body: q.body,
      kind: q.kind,
      refId: q.refId,
      occ: q.occ,
      url: q.url,
      actions: q.actions,
      requireInteraction: !!q.requireInteraction,
      snoozeMin: q.snoozeMin,
    }));
  const editedAt = getState().editedAt ?? 0;
  const signature = JSON.stringify([editedAt, items]);
  if (!force && signature === lastSignature && status.lastSync && now - status.lastSync < 3_600_000) return;
  try {
    const r = await api<{ pending: number; next: string | null; stale?: boolean }>('sync', { deviceId: deviceId(), editedAt, items });
    lastSignature = signature;
    setStatus({ state: 'on', lastSync: Date.now(), pending: r.pending, next: r.next, stale: !!r.stale, error: undefined });
  } catch (e) {
    setStatus({ state: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}

/** Assina o push neste aparelho e registra no servidor. Requer permissão de notificação. */
export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) {
    setStatus({ state: 'unsupported' });
    return false;
  }
  if (Notification.permission !== 'granted') return false;
  setStatus({ state: 'working', error: undefined });
  try {
    const reg = await navigator.serviceWorker.ready;
    const key = keyBytes(VAPID_PUBLIC_KEY);
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub.options.applicationServerKey, key)) {
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await api('subscribe', { deviceId: deviceId(), subscription: sub.toJSON(), userAgent: navigator.userAgent });
    await saveServiceWorkerConfig();
    if (!getState().settings.push) updateSettings({ push: true });
    setPushActive(true);
    setStatus({ state: 'on' });
    await syncNow(true);
    return true;
  } catch (e) {
    setPushActive(false);
    setStatus({ state: 'error', error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api('unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
      await sub.unsubscribe();
    }
  } finally {
    await api('sync', { deviceId: deviceId(), items: [] }).catch(() => undefined);
    await idbSet('push-config', null);
    updateSettings({ push: false });
    setPushActive(false);
    lastSignature = '';
    setStatus({ state: 'off', pending: undefined, next: undefined, lastSync: undefined });
  }
}

/** Agenda um aviso de teste no servidor (para conferir com o app fechado). */
export async function serverTest(delaySec = 60) {
  return api<{ fireInSeconds: number }>('test', { delaySec });
}

export async function refreshServerStatus() {
  const r = await api<{ pending: number; next: string | null; this_device: number; source?: boolean }>('status', { deviceId: deviceId() });
  setStatus({ pending: r.pending, next: r.next, ...(typeof r.source === 'boolean' ? { stale: !r.source } : {}) });
  return r;
}

let started = false;

export async function startPush() {
  if (started) return;
  started = true;
  if (!pushSupported()) {
    setStatus({ state: 'unsupported' });
    return;
  }
  if (getState().settings.push && Notification.permission === 'granted') await enablePush();

  let timer: ReturnType<typeof setTimeout> | undefined;
  subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), 2_000);
  });
  setInterval(() => void syncNow(), 3 * 3_600_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
}
