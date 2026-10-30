// O que a conta Rudge libera (plano) e as integrações entre Rudge app e Rudge Music.
// O servidor responde por public.my_access() e pela tabela public.integrations (RLS por usuário).
import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { getSession } from './auth';

export type PlanId = 'music_essencial' | 'music_plus' | 'music_max' | 'rudge_app' | 'combo' | string;

export interface Access {
  plan: PlanId | null;
  /** nome do plano para exibir (vem do servidor) */
  planName?: string;
  /** libera o Rudge Music */
  music: boolean;
  /** libera o Rudge app (este organizador) */
  app: boolean;
  storageGb?: number;
  /** administrador da plataforma: acesso aos dois apps */
  admin?: boolean;
}

export type AccessState =
  | { status: 'loading' }
  /** servidor ainda sem planos (ou fora do ar): o app segue liberado */
  | { status: 'unknown' }
  | { status: 'ready'; access: Access };

const CACHE_KEY = 'rudge:access';
const CACHE_MAX = 7 * 86_400_000;

function cached(): AccessState {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as { at: number; userId: string; access: Access } | null;
    if (c && c.userId === getSession()?.userId && Date.now() - c.at < CACHE_MAX) return { status: 'ready', access: c.access };
  } catch {
    /* ignora */
  }
  return { status: 'loading' };
}

let state: AccessState = typeof window !== 'undefined' ? cached() : { status: 'loading' };
const listeners = new Set<() => void>();
function set(next: AccessState) {
  state = next;
  listeners.forEach((l) => l());
}

export function parseAccess(raw: unknown): Access | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.app !== 'boolean' && typeof r.music !== 'boolean') return null;
  return {
    plan: typeof r.plan === 'string' ? r.plan : null,
    planName: typeof r.plan_name === 'string' ? r.plan_name : undefined,
    music: r.music === true,
    app: r.app === true,
    storageGb: typeof r.storage_gb === 'number' ? r.storage_gb : undefined,
  };
}

let inflight: Promise<void> | null = null;

/** Consulta o plano da conta. Sem resposta do servidor, mantém o último valor conhecido. */
export function refreshAccess(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) {
      if (state.status === 'loading') set({ status: 'unknown' });
      return;
    }
    const { data, error } = await supabase.rpc('my_access');
    const access = error ? null : parseAccess(data);
    // administradores usam os dois apps qualquer que seja o plano
    if (access && !access.app) {
      const { data: admin } = await supabase.rpc('is_admin');
      if (admin === true) Object.assign(access, { app: true, music: true, admin: true });
    }
    if (access) {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), userId: getSession()?.userId, access }));
      set({ status: 'ready', access });
    } else if (state.status === 'loading') {
      set({ status: 'unknown' });
    }
  })()
    .catch(() => {
      if (state.status === 'loading') set({ status: 'unknown' });
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useAccess(): AccessState {
  useEffect(() => {
    void refreshAccess();
  }, []);
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
  );
}

/** O organizador fica bloqueado só quando o servidor diz explicitamente que o plano não inclui o app. */
export function appBlocked(s: AccessState): boolean {
  return s.status === 'ready' && !s.access.app;
}

export const PLAN_LABEL: Record<string, string> = {
  music_essencial: 'Rudge Music Essencial',
  music_plus: 'Rudge Music Plus',
  music_max: 'Rudge Music Max',
  rudge_app: 'Rudge app',
  combo: 'Pacote Rudge (app + Music)',
};

export function planLabel(a: Access): string | null {
  return a.planName || (a.plan ? (PLAN_LABEL[a.plan] ?? a.plan) : null);
}

/* ---------------- integrações ---------------- */

export type Provider = 'rudge_app' | 'rudge_music';

export interface Integration {
  provider: Provider;
  enabled: boolean;
  settings: Record<string, unknown>;
}

/** Integrações da conta; null quando o servidor ainda não tem a tabela. */
export async function loadIntegrations(): Promise<Integration[] | null> {
  const { data, error } = await supabase.from('integrations').select('provider, enabled, settings');
  if (error) return null;
  return (data ?? []) as Integration[];
}

export async function setIntegration(provider: Provider, enabled: boolean, settings: Record<string, unknown> = {}) {
  const userId = getSession()?.userId;
  if (!userId) throw new Error('Entre na sua conta Rudge.');
  const { error } = await supabase
    .from('integrations')
    .upsert({ user_id: userId, provider, enabled, settings }, { onConflict: 'user_id,provider' });
  if (error) throw new Error(error.message);
}
