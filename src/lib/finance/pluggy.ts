// Sincronização automática pela Pluggy (Meu Pluggy). O app só fala com a função "finance" do
// Supabase; credenciais da Pluggy nunca ficam no aparelho. O último retrato fica em cache para
// a Carteira abrir na hora, e a sincronização roda ao abrir, ao voltar para o app e a cada 30 min.
import { useSyncExternalStore } from 'react';
import { SUPABASE_URL } from '../supabase';
import { getSession } from '../auth';
import type { ImportedAccount } from './importer';

const API = `${SUPABASE_URL}/functions/v1/finance`;
const KEY = 'rudge.wallet.pluggy.v1';

export interface PluggyState {
  /** null = ainda não sabemos (primeira sincronização) */
  linked: boolean | null;
  accounts: ImportedAccount[];
  at: number;
  syncing: boolean;
  error?: string;
  /** contas que falharam (ex.: autorização vencida em um banco) */
  errors?: string[];
}

function read(): PluggyState {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '') as PluggyState;
    return { linked: v.linked ?? null, accounts: v.accounts ?? [], at: v.at ?? 0, syncing: false, errors: v.errors };
  } catch {
    return { linked: null, accounts: [], at: 0, syncing: false };
  }
}

let state = read();
const listeners = new Set<() => void>();

function set(patch: Partial<PluggyState>) {
  state = { ...state, ...patch };
  try {
    const { linked, accounts, at, errors } = state;
    localStorage.setItem(KEY, JSON.stringify({ linked, accounts, at, errors }));
  } catch {
    /* sem armazenamento: segue sem cache */
  }
  listeners.forEach((l) => l());
}

export function usePluggy() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
  );
}

interface Snapshot {
  linked: boolean;
  accounts?: Omit<ImportedAccount, 'synced'>[];
  errors?: string[];
  at?: number;
  error?: string;
}

async function call(route: string, body: Record<string, unknown> = {}): Promise<Snapshot> {
  const token = getSession()?.token;
  if (!token) throw new Error('Entre na sua conta Rudge.');
  const res = await fetch(`${API}/${route}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-rudge-token': token }, body: JSON.stringify(body) });
  // função ainda não publicada no Supabase: segue com extratos ou dados de exemplo
  if (res.status === 404 && route === 'cards') return { linked: false };
  const data = (await res.json().catch(() => ({}))) as Snapshot;
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

function apply(s: Snapshot) {
  set({
    linked: s.linked,
    accounts: s.linked ? (s.accounts ?? state.accounts).map((a) => ({ ...a, synced: true })) : [],
    at: s.at ?? Date.now(),
    errors: s.errors?.length ? s.errors : undefined,
    error: s.error,
    syncing: false,
  });
}

let inflight: Promise<void> | null = null;

export function syncPluggy(force = false) {
  if (inflight) return inflight;
  set({ syncing: true, error: undefined });
  inflight = call('cards', { force })
    .then(apply)
    .catch((e: unknown) => set({ syncing: false, error: e instanceof Error ? e.message : String(e) }))
    .finally(() => (inflight = null));
  return inflight;
}

export async function linkPluggy(input: { clientId: string; clientSecret: string; itemIds: string }) {
  apply(await call('link', input));
}

export async function unlinkPluggy() {
  await call('unlink');
  apply({ linked: false });
}

let started = false;
/** Sincroniza agora, ao voltar para o app e a cada 30 minutos com ele aberto. */
export function startPluggySync() {
  if (started) return;
  started = true;
  void syncPluggy();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - state.at > 5 * 60_000) void syncPluggy();
  });
  setInterval(() => document.visibilityState === 'visible' && void syncPluggy(), 30 * 60_000);
}
