// PIN de entrada: 6 dígitos para abrir o app quando a conta já está conectada neste aparelho.
//
// - O PIN fica em settings.lock, que sincroniza com a conta: o mesmo PIN vale no celular e no
//   computador. Só o hash (PBKDF2-SHA256 com sal) é guardado, nunca o PIN.
// - Bloqueia ao abrir o app e ao voltar para ele depois de 5 min fora.
// - Errou 5 vezes: espera 30 s (dobra a cada nova rodada de erros).
// - Esqueceu: sai da conta e entra de novo pelo e-mail; depois cria um PIN novo.
// - É uma trava de abertura do app, não substitui o login da conta.
import { useSyncExternalStore } from 'react';
import type { PinLock } from './types';
import { getState } from './store';
import { updateSettings } from './actions';
import { getSession, logout } from './auth';
export { newerLock } from './merge';

export const PIN_LENGTH = 6;
const ITER = 150_000;
const RESUME_LOCK_MS = 5 * 60_000;
const FAILS_KEY = 'rudge:pin-fails';
/** depois de "Esqueci o PIN": ao entrar de novo, pede um PIN novo */
const RESET_KEY = 'rudge:pin-reset';

export function pinSupported() {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}

export function hasPin(lock = getState().settings.lock): lock is PinLock & { hash: string; salt: string } {
  return !!lock && !lock.off && !!lock.hash && !!lock.salt;
}

/** A conta ainda não decidiu (nem criou nem dispensou o PIN). */
export function pinUndecided() {
  return !getState().settings.lock;
}

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(pin: string, salt: Uint8Array, iter: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iter }, key, 256);
  return b64(bits);
}

export async function makeLock(pin: string, now = Date.now()): Promise<PinLock> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { hash: await derive(pin, salt, ITER), salt: b64(salt), iter: ITER, at: now };
}

export async function checkPin(pin: string, lock: PinLock | undefined = getState().settings.lock): Promise<boolean> {
  if (!hasPin(lock)) return false;
  const h = await derive(pin, unb64(lock.salt), lock.iter ?? ITER);
  // comparação em tempo constante
  if (h.length !== lock.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ lock.hash.charCodeAt(i);
  return diff === 0;
}

export async function savePin(pin: string) {
  updateSettings({ lock: await makeLock(pin) });
  clearFails();
  try {
    localStorage.removeItem(RESET_KEY);
  } catch {
    /* ignora */
  }
}

/** "Agora não" / desligar: vale para a conta toda, dá para criar depois em Configurações. */
export function turnOffPin() {
  updateSettings({ lock: { off: true, at: Date.now() } });
  clearFails();
}

/* ---------------- tentativas ---------------- */

interface Fails {
  n: number;
  until?: number;
}
function readFails(): Fails {
  try {
    const f = JSON.parse(localStorage.getItem(FAILS_KEY) || 'null') as Fails | null;
    if (f && typeof f.n === 'number') return f;
  } catch {
    /* ignora */
  }
  return { n: 0 };
}
function clearFails() {
  try {
    localStorage.removeItem(FAILS_KEY);
  } catch {
    /* ignora */
  }
}
/** Registra um erro; devolve até quando precisa esperar (ms), se for o caso. */
export function registerFail(now = Date.now()): number | undefined {
  const f = readFails();
  const n = f.n + 1;
  const rounds = Math.floor(n / 5);
  const until = n % 5 === 0 ? now + 30_000 * 2 ** (rounds - 1) : f.until;
  try {
    localStorage.setItem(FAILS_KEY, JSON.stringify({ n, until }));
  } catch {
    /* ignora */
  }
  return until && until > now ? until : undefined;
}
export function waitUntil(now = Date.now()): number | undefined {
  const u = readFails().until;
  return u && u > now ? u : undefined;
}

/* ---------------- estado de bloqueio ---------------- */

let locked = typeof window !== 'undefined' && !!getSession() && hasPin() && pinSupported();
const listeners = new Set<() => void>();
function setLocked(v: boolean) {
  if (locked === v) return;
  locked = v;
  listeners.forEach((l) => l());
}

export function useLocked() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => locked,
  );
}

export function lockNow() {
  if (getSession() && hasPin() && pinSupported()) setLocked(true);
}

export function unlock() {
  clearFails();
  setLocked(false);
}

/** Esqueci o PIN: sai da conta; ao entrar de novo pelo e-mail, cria um PIN novo. Os dados ficam. */
export async function forgotPin() {
  try {
    localStorage.setItem(RESET_KEY, '1');
  } catch {
    /* ignora */
  }
  clearFails();
  setLocked(false);
  await logout();
}

export function pinResetPending() {
  try {
    return localStorage.getItem(RESET_KEY) === '1';
  } catch {
    return false;
  }
}

if (typeof document !== 'undefined') {
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt >= RESUME_LOCK_MS) lockNow();
  });
}

export const __test = { derive, ITER };
