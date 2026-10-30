// Conta Rudge: login por e-mail (Supabase Auth), a mesma conta do Rudge Music. O e-mail traz
// um link de acesso e, quando o modelo de e-mail tiver {{ .Token }}, também o código de 6 dígitos. Depois de entrar, o servidor de avisos emite um token deste aparelho, que o
// service worker usa com o app fechado (o JWT da conta vence em 1 hora).
import { useSyncExternalStore } from 'react';
import type { Session as AuthSession } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { deviceId, PUSH_API, saveServiceWorkerConfig } from './push';

const SESSION_KEY = 'rudge:account';
/** sessão da época da senha única; o token dela migra os avisos para a conta no 1º login */
const LEGACY_KEY = 'rudge:session';

export interface Session {
  email: string;
  userId: string;
  at: number;
  /** token deste aparelho no servidor de avisos (só o hash fica no servidor) */
  token: string;
}

function readSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') as Session | null;
    if (s && s.token && s.userId) return s;
  } catch {
    /* ignora */
  }
  return null;
}

let session: Session | null = typeof window !== 'undefined' ? readSession() : null;
const listeners = new Set<() => void>();

function setSession(next: Session | null) {
  session = next;
  if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  else localStorage.removeItem(SESSION_KEY);
  listeners.forEach((l) => l());
}

export function useSession(): Session | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => session,
  );
}

export function getSession() {
  return session;
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

type Result = { ok: true } | { ok: false; error: string };

function authError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('signups not allowed') || m.includes('user not found')) {
    return 'Este e-mail ainda não tem conta Rudge. Peça um convite para criar a sua.';
  }
  if (m.includes('expired') || m.includes('invalid')) return 'Código ou link inválido ou vencido. Peça um novo.';
  if (m.includes('rate') || m.includes('seconds')) return 'Aguarde alguns segundos antes de pedir outro código.';
  return 'Não foi possível entrar agora. Confira a conexão e tente de novo.';
}

/** Envia o link de acesso (e o código, se houver) para o e-mail. Só contas existentes (criadas por convite). */
export async function sendCode(email: string): Promise<Result> {
  if (!isValidEmail(email)) return { ok: false, error: 'Digite um e-mail válido.' };
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname },
  });
  return error ? { ok: false, error: authError(error.message) } : { ok: true };
}

/** Confere o código digitado e registra este aparelho no servidor de avisos. */
export async function verifyCode(email: string, code: string): Promise<Result & { migrated?: boolean }> {
  const token = code.replace(/\D/g, '');
  if (token.length < 6) return { ok: false, error: 'Digite o código de 6 dígitos.' };
  const { data, error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token, type: 'email' });
  if (error || !data.session) return { ok: false, error: authError(error?.message ?? 'invalid') };
  return finishLogin(data.session);
}

let finishing: Promise<Result & { migrated?: boolean }> | null = null;

/** Com a conta confirmada (código ou link), registra este aparelho no servidor de avisos. */
function finishLogin(auth: AuthSession): Promise<Result & { migrated?: boolean }> {
  if (finishing) return finishing;
  finishing = (async (): Promise<Result & { migrated?: boolean }> => {
    let legacyToken: string | undefined;
    try {
      legacyToken = (JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null') as { token?: string } | null)?.token;
    } catch {
      /* ignora */
    }
    try {
      const res = await fetch(`${PUSH_API}/device`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${auth.access_token}` },
        body: JSON.stringify({ deviceId: deviceId(), legacyToken }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const r = (await res.json()) as { token: string; migrated?: boolean };
      localStorage.removeItem(LEGACY_KEY);
      setSession({ email: auth.user.email ?? '', userId: auth.user.id, at: Date.now(), token: r.token });
      void saveServiceWorkerConfig();
      return { ok: true, migrated: !!r.migrated };
    } catch {
      await supabase.auth.signOut({ scope: 'local' });
      return { ok: false, error: 'Conta confirmada, mas o servidor do Rudge não respondeu. Tente de novo.' };
    }
  })().finally(() => {
    finishing = null;
  });
  return finishing;
}

/* Link de acesso do e-mail: o Supabase lê a sessão do endereço ao abrir o app. */
const linkListeners = new Set<(r: Result & { migrated?: boolean }) => void>();
/** Resultado do login por link (para a tela de entrar mostrar erro ou aviso). */
export function onLinkLogin(fn: (r: Result & { migrated?: boolean }) => void) {
  linkListeners.add(fn);
  return () => {
    linkListeners.delete(fn);
  };
}

/** Erro devolvido no endereço quando o link venceu ou já foi usado. */
export function linkError(): string | null {
  if (typeof location === 'undefined') return null;
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  const code = p.get('error_code') || p.get('error');
  if (!code) return null;
  history.replaceState(null, '', location.pathname + location.search);
  return code.includes('expired') ? 'Este link venceu ou já foi usado. Peça um novo.' : 'Não foi possível entrar com este link. Peça um novo.';
}

if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event, auth) => {
    if (event !== 'SIGNED_IN' || !auth || session?.userId === auth.user.id) return;
    // o login por código já registra o aparelho em verifyCode
    if (finishing) return;
    void finishLogin(auth).then((r) => linkListeners.forEach((l) => l(r)));
  });
}

export async function logout() {
  const s = session;
  setSession(null);
  if (s) {
    fetch(`${PUSH_API}/signout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-rudge-token': s.token },
      body: JSON.stringify({ deviceId: deviceId() }),
    }).catch(() => {});
  }
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
}

// SHA-256 em JS puro para contextos sem crypto.subtle (ex.: http fora do localhost)
function sha256Fallback(bytes: Uint8Array): string {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const l = bytes.length;
  const withPad = new Uint8Array(((l + 9 + 63) >> 6) << 6);
  withPad.set(bytes);
  withPad[l] = 0x80;
  const view = new DataView(withPad.buffer);
  view.setUint32(withPad.length - 4, l * 8);
  const W = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < withPad.length; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  return [...H].map((x) => x.toString(16).padStart(8, '0')).join('');
}

export const __test = { sha256Fallback };
