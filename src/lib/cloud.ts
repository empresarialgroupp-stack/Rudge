// Dados na conta: metas, tarefas, hábitos, lembretes, diário, avisos e configurações ficam salvos
// no servidor e iguais em todos os aparelhos que entram com a mesma conta.
//
// - Ao abrir (e a cada 30 s com o app na tela) busca a versão da conta e junta com a deste aparelho
//   (mergeStates: nada que exista em um dos lados se perde).
// - Cada alteração feita aqui sobe em ~2 s. Se outro aparelho salvou antes, junta e tenta de novo.
// - O servidor guarda cópias de segurança (Configurações → Dados na conta) e nunca apaga a última
//   cópia de cada aparelho.
// - Sem internet, as alterações ficam marcadas e sobem quando a conexão voltar.
import { useSyncExternalStore } from 'react';
import type { AppState } from './types';
import { applyRemote, freshState, getState, onLocalChange } from './store';
import { mergeStates } from './merge';
import { getSession } from './auth';
import { deviceId, PUSH_API } from './push';

const META_KEY = 'rudge:cloud';
const STASH_PREFIX = 'rudge:data:owner:';
const PUSH_DELAY = 2_000;
const POLL = 30_000;

interface Meta {
  owner?: string;
  rev: number;
  dirty: boolean;
}

export type CloudState = 'off' | 'syncing' | 'ok' | 'offline' | 'error';
export interface CloudStatus {
  state: CloudState;
  at?: number;
  error?: string;
}

let status: CloudStatus = { state: 'off' };
const listeners = new Set<() => void>();
function setStatus(patch: Partial<CloudStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}
export function useCloudStatus() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => status,
  );
}

function readMeta(): Meta {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) || 'null') as Meta | null;
    if (m && typeof m.rev === 'number') return m;
  } catch {
    /* ignora */
  }
  return { rev: 0, dirty: true };
}
let meta = readMeta();
function saveMeta(patch: Partial<Meta>) {
  meta = { ...meta, ...patch };
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* ignora */
  }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const token = getSession()?.token;
  if (!token) throw new Error('sem sessão');
  const res = await fetch(`${PUSH_API}/state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-rudge-token': token },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Servidor respondeu ${res.status}`);
  return (await res.json()) as T;
}

type GetResult = { rev: number; same?: boolean; data?: AppState };
type PutResult = { ok?: boolean; rev: number; conflict?: boolean; data?: AppState };

/** JSON com as chaves em ordem: dois aparelhos com os mesmos dados dão o mesmo texto. */
export function stable(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(',')}}`;
}
const same = (a: unknown, b: unknown) => stable(a) === stable(b);

let running: Promise<void> | null = null;
let again = false;

/** Busca a conta, junta com este aparelho e sobe o resultado se houver algo novo aqui. */
export function syncAccount(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await round();
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

async function round() {
  const session = getSession();
  if (!session) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setStatus({ state: 'offline' });
    return;
  }
  switchOwner(session.userId);
  setStatus({ state: 'syncing' });
  try {
    const got = await call<GetResult>({ op: 'get', since: meta.rev });
    let base = got.rev;
    let remote = got.data;
    if (got.same && !meta.dirty) {
      setStatus({ state: 'ok', at: Date.now(), error: undefined });
      return;
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const local = getState();
      const merged = remote ? mergeStates(local, remote) : local;
      if (remote && !same(merged, local)) applyRemote(merged);
      // a conta já tem exatamente o que está aqui: nada a subir
      if (remote && same(getState(), remote)) {
        saveMeta({ rev: base, dirty: false });
        break;
      }
      const sent = getState();
      const put = await call<PutResult>({ op: 'put', baseRev: base, deviceId: deviceId(), data: sent });
      if (put.conflict) {
        base = put.rev;
        remote = put.data;
        continue;
      }
      // alterações feitas enquanto subia continuam marcadas para a próxima rodada
      saveMeta({ rev: put.rev, dirty: getState() !== sent });
      if (meta.dirty) again = true;
      break;
    }
    setStatus({ state: 'ok', at: Date.now(), error: undefined });
  } catch (e) {
    setStatus({ state: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Outra conta neste aparelho: guarda os dados da anterior à parte (voltam quando ela entrar de
 * novo) e começa do zero para a nova, que recebe os dados dela da conta.
 */
function switchOwner(userId: string) {
  if (meta.owner === userId) return;
  if (meta.owner) {
    try {
      localStorage.setItem(STASH_PREFIX + meta.owner, JSON.stringify(getState()));
    } catch {
      /* sem espaço */
    }
    let next = freshState();
    try {
      const stash = localStorage.getItem(STASH_PREFIX + userId);
      if (stash) next = JSON.parse(stash) as AppState;
    } catch {
      /* ignora */
    }
    applyRemote(next);
    saveMeta({ owner: userId, rev: 0, dirty: true });
    return;
  }
  // primeira vez com esta versão: os dados deste aparelho são da conta que está aqui
  saveMeta({ owner: userId, rev: 0, dirty: true });
}

let pushTimer: ReturnType<typeof setTimeout> | undefined;
let started = false;

export function startCloud() {
  if (started) return;
  started = true;
  onLocalChange(() => {
    saveMeta({ dirty: true });
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void syncAccount(), PUSH_DELAY);
  });
  const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';
  setInterval(() => {
    if (visible()) void syncAccount();
  }, POLL);
  document.addEventListener('visibilitychange', () => {
    if (visible()) void syncAccount();
    // saindo do app: sobe o que estiver pendente
    else if (meta.dirty) void syncAccount();
  });
  window.addEventListener('online', () => void syncAccount());
  window.addEventListener('focus', () => void syncAccount());
  void syncAccount();
}

/* ---------- Cópias de segurança da conta ---------- */

export interface Snapshot {
  id: number;
  at: string;
  deviceId: string;
  thisDevice: boolean;
  tasks: number;
  goals: number;
  habits: number;
  reminders: number;
}

export async function listSnapshots(): Promise<Snapshot[]> {
  const r = await call<{ items: Omit<Snapshot, 'thisDevice'>[] }>({ op: 'snapshots' });
  const me = deviceId();
  return r.items.map((s) => ({ ...s, thisDevice: s.deviceId === me }));
}

/** Traz de volta o que havia numa cópia, juntando com o que existe hoje (nada é apagado). */
export async function restoreSnapshot(id: number): Promise<void> {
  const r = await call<{ data: AppState }>({ op: 'snapshot', id });
  if (!r.data) throw new Error('cópia não encontrada');
  const now = Date.now();
  // os itens da cópia valem como recém-alterados, para voltarem mesmo se apagados depois
  const revived: AppState = {
    ...r.data,
    tasks: r.data.tasks.map((x) => ({ ...x, updatedAt: now })),
    goals: r.data.goals.map((x) => ({ ...x, updatedAt: now })),
    habits: r.data.habits.map((x) => ({ ...x, updatedAt: now })),
    reminders: r.data.reminders.map((x) => ({ ...x, updatedAt: now })),
    deleted: {},
  };
  const merged = mergeStates(getState(), revived, now);
  const deleted = { ...(merged.deleted ?? {}) };
  for (const k of ['tasks', 'goals', 'habits', 'reminders'] as const) for (const x of revived[k]) delete deleted[x.id];
  applyRemote({ ...merged, deleted, editedAt: now });
  saveMeta({ dirty: true });
  await syncAccount();
}
