// Junta os dados de dois aparelhos da mesma conta sem perder nada.
// Regra: cada item (por id) fica com a versão alterada por último; um item só some quando foi
// apagado depois da última alteração dele. Nada que exista em um dos lados é descartado sem motivo.
import type { AppState, ID, InboxItem, Settings } from './types';

type Stamped = { id: ID; updatedAt?: number; createdAt?: string };

export const ITEM_LISTS = ['tasks', 'goals', 'habits', 'reminders', 'places', 'focusSessions'] as const;
type ListKey = (typeof ITEM_LISTS)[number];

/** Configurações que valem só para este aparelho (permissões do navegador). */
const DEVICE_SETTINGS: (keyof Settings)[] = ['push', 'notifications'];

/** Tarefas que o app cria na primeira vez; não contam como dados do usuário. */
export const SEED_TITLES = new Set([
  'Ativar as notificações do Rudge',
  'Instalar o Rudge no computador e no celular',
  'Criar minha primeira meta com o assistente',
]);

const TOMBSTONE_TTL = 180 * 86_400_000;
const INBOX_MAX = 300;
const HISTORY_MAX = 2000;

function ts(v?: string): number {
  const t = v ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/** Quando o item foi alterado (itens antigos, sem updatedAt, usam a data de criação). */
export function itemTime(x: Stamped & Record<string, unknown>): number {
  if (typeof x.updatedAt === 'number') return x.updatedAt;
  return Math.max(ts(x.createdAt), ts(x.doneAt as string), ts(x.completedAt as string), ts(x.start as string));
}

/** Aparelho sem nada do usuário (só as tarefas iniciais). */
export function isPristine(s: Partial<AppState>): boolean {
  const empty = (v?: unknown[]) => !v || v.length === 0;
  return (
    empty(s.goals) &&
    empty(s.habits) &&
    empty(s.reminders) &&
    empty(s.places) &&
    empty(s.focusSessions) &&
    Object.keys(s.journal ?? {}).length === 0 &&
    Object.keys(s.deleted ?? {}).length === 0 &&
    (s.tasks ?? []).every((t) => SEED_TITLES.has(t.title) && !t.done)
  );
}

/**
 * Marca o que mudou entre dois estados: itens novos/alterados recebem updatedAt e itens que
 * saíram viram "apagados". Chamado em toda alteração feita neste aparelho.
 */
export function stampChanges(prev: AppState, next: AppState, now = Date.now()): AppState {
  let out = next;
  const base = next.deleted ?? {};
  let deleted = base;
  const edit = () => {
    if (deleted === base) deleted = { ...base };
    return deleted;
  };
  for (const key of ITEM_LISTS) {
    const a = (prev[key] ?? []) as Stamped[];
    const b = next[key] as Stamped[];
    if (a === b || !Array.isArray(b)) continue;
    const before = new Map(a.map((x) => [x.id, x]));
    const ids = new Set<ID>();
    let changed = false;
    const list = b.map((x) => {
      ids.add(x.id);
      if (before.get(x.id) === x) return x;
      changed = true;
      // voltou (desfazer) ou foi editado depois de apagado: deixa de estar apagado
      if (deleted[x.id] !== undefined) delete edit()[x.id];
      return { ...x, updatedAt: now };
    });
    for (const id of before.keys()) if (!ids.has(id)) edit()[id] = now;
    if (changed) out = { ...out, [key]: list };
  }
  if (deleted !== base) out = { ...out, deleted };
  if (prev.settings !== next.settings) out = { ...out, settingsAt: now };
  return out;
}

/** Junta duas listas por id; empate (itens antigos sem updatedAt) fica com o lado editado por último. */
function mergeList<T extends Stamped>(a: T[], b: T[], deleted: Record<ID, number>, preferB: boolean): T[] {
  const byId = new Map<ID, T>();
  const order: ID[] = [];
  const fromB = new Set<T>(b ?? []);
  for (const x of [...(a ?? []), ...(b ?? [])]) {
    const cur = byId.get(x.id);
    if (!cur) {
      byId.set(x.id, x);
      order.push(x.id);
      continue;
    }
    const tx = itemTime(x as T & Record<string, unknown>);
    const tc = itemTime(cur as T & Record<string, unknown>);
    if (tx > tc || (tx === tc && preferB && fromB.has(x))) byId.set(x.id, x);
  }
  return order
    .map((id) => byId.get(id)!)
    .filter((x) => !(deleted[x.id] !== undefined && deleted[x.id] >= itemTime(x as T & Record<string, unknown>)));
}

function mergeRecord<V>(a: Record<string, V>, b: Record<string, V>, time: (v: V) => number, preferB: boolean): Record<string, V> {
  const out: Record<string, V> = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b ?? {})) {
    const cur = out[k];
    if (cur === undefined) out[k] = v;
    else {
      const tb = time(v);
      const ta = time(cur);
      if (tb > ta || (tb === ta && preferB)) out[k] = v;
    }
  }
  return out;
}

function maxStr(a?: string, b?: string) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/** Tarefas iniciais repetidas (cada aparelho criou as suas): fica uma de cada. */
function dedupeSeed(tasks: AppState['tasks']) {
  const seen = new Set<string>();
  return tasks.filter((t) => {
    if (!SEED_TITLES.has(t.title) || t.done) return true;
    if (seen.has(t.title)) return false;
    seen.add(t.title);
    return true;
  });
}

/**
 * Junta o estado deste aparelho (local) com o da conta (remote).
 * As permissões de notificação continuam as deste aparelho.
 */
export function mergeStates(local: AppState, remote: AppState, now = Date.now()): AppState {
  const keepDevice = (s: Settings): Settings => {
    const out = { ...s };
    for (const k of DEVICE_SETTINGS) (out as Record<string, unknown>)[k] = local.settings[k];
    return out;
  };
  if (isPristine(local) && !isPristine(remote)) {
    return { ...remote, settings: keepDevice({ ...remote.settings, onboarded: remote.settings.onboarded || local.settings.onboarded }), inbox: mergeInbox(local.inbox, remote.inbox) };
  }
  // a conta só tem as tarefas iniciais (outro aparelho novo subiu antes): vale o que está aqui
  if (isPristine(remote) && !isPristine(local)) {
    return { ...local, inbox: mergeInbox(local.inbox, remote.inbox) };
  }

  const deleted: Record<ID, number> = {};
  for (const src of [remote.deleted ?? {}, local.deleted ?? {}]) {
    for (const [id, t] of Object.entries(src)) if (now - t < TOMBSTONE_TTL && !(deleted[id] >= t)) deleted[id] = t;
  }
  const remoteNewer = (remote.editedAt ?? 0) > (local.editedAt ?? 0);
  const out: AppState = { ...local };
  for (const key of ITEM_LISTS) {
    (out as unknown as Record<ListKey, Stamped[]>)[key] = mergeList(local[key] as Stamped[], remote[key] as Stamped[], deleted, remoteNewer);
  }
  out.tasks = dedupeSeed(out.tasks);
  out.deleted = deleted;

  const settingsRemote = (remote.settingsAt ?? 0) > (local.settingsAt ?? 0);
  out.settings = keepDevice({
    ...(settingsRemote ? remote.settings : local.settings),
    onboarded: local.settings.onboarded || remote.settings.onboarded,
  });
  out.settingsAt = Math.max(local.settingsAt ?? 0, remote.settingsAt ?? 0) || undefined;

  out.journal = mergeRecord(local.journal, remote.journal, (e) => ts(e.at), remoteNewer);
  out.dayPlans = mergeRecord(local.dayPlans, remote.dayPlans, () => 0, remoteNewer);
  out.dismissedSuggestions = { ...(remote.dismissedSuggestions ?? {}), ...(local.dismissedSuggestions ?? {}) };
  out.inbox = mergeInbox(local.inbox, remote.inbox);

  const snoozes = new Map(remote.snoozes.map((s) => [s.key, s]));
  for (const s of local.snoozes) if (!snoozes.has(s.key) || s.at > snoozes.get(s.key)!.at) snoozes.set(s.key, s);
  out.snoozes = [...snoozes.values()];

  const hist = new Map<string, AppState['history'][number]>();
  for (const h of [...remote.history, ...local.history]) hist.set(`${h.kind}|${h.refId}|${h.action}|${h.at}`, h);
  out.history = [...hist.values()].sort((x, y) => x.at - y.at).slice(-HISTORY_MAX);

  out.focus = remoteNewer ? (remote.focus ?? null) : (local.focus ?? null);
  out.lastWeeklyReview = maxStr(local.lastWeeklyReview, remote.lastWeeklyReview);
  out.seenRetro = maxStr(local.seenRetro, remote.seenRetro);
  out.editedAt = Math.max(local.editedAt ?? 0, remote.editedAt ?? 0);
  return out;
}

function mergeInbox(a: InboxItem[] = [], b: InboxItem[] = []): InboxItem[] {
  const byKey = new Map<string, InboxItem>();
  for (const x of [...b, ...a]) {
    const cur = byKey.get(x.key);
    byKey.set(x.key, cur ? { ...cur, ...x, read: cur.read || x.read } : x);
  }
  return [...byKey.values()].sort((x, y) => y.at - x.at).slice(0, INBOX_MAX);
}

/** Resumo para mostrar e comparar cópias. */
export function counts(s: Partial<AppState>) {
  return {
    tasks: s.tasks?.length ?? 0,
    goals: s.goals?.length ?? 0,
    habits: s.habits?.length ?? 0,
    reminders: s.reminders?.length ?? 0,
  };
}
