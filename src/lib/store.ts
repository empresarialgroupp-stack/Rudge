import { useSyncExternalStore } from 'react';
import type { AppState, Settings } from './types';
import { todayKey } from './date';
import { mergeStates, stampChanges } from './merge';

const KEY = 'rudge:data:v1';
export const STATE_VERSION = 1;

export const defaultSettings: Settings = {
  theme: 'dark',
  name: '',
  notifications: false,
  push: false,
  sound: true,
  briefing: { enabled: true, time: '08:00' },
  review: { enabled: true, time: '21:00' },
  weekly: { enabled: true, weekday: 0, time: '18:00' },
  defaultTaskRemind: 10,
  plan: { enabled: true, start: '09:00', end: '18:00' },
  onboarded: false,
};

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function seed(): AppState {
  const now = new Date().toISOString();
  const today = todayKey();
  return {
    version: STATE_VERSION,
    tasks: [
      { id: uid(), title: 'Ativar as notificações do Rudge', done: false, createdAt: now, due: today, priority: 3 },
      { id: uid(), title: 'Instalar o Rudge no computador e no celular', done: false, createdAt: now, due: today, priority: 2 },
      { id: uid(), title: 'Criar minha primeira meta com o assistente', done: false, createdAt: now, due: today, priority: 2 },
    ],
    goals: [],
    habits: [],
    reminders: [],
    snoozes: [],
    inbox: [],
    dismissedSuggestions: {},
    settings: { ...defaultSettings },
    dayPlans: {},
    focus: null,
    focusSessions: [],
    journal: {},
    places: [],
    history: [],
    // 0 = ainda sem nada do usuário (não sobrepõe os dados da conta)
    editedAt: 0,
  };
}

/** Estado inicial (primeira vez neste aparelho). */
export function freshState(): AppState {
  return seed();
}

/** Para dados antigos sem editedAt: o registro mais recente que existir nos itens. */
export function inferEditedAt(s: Partial<AppState>): number {
  let max = 0;
  const see = (v?: string) => {
    const t = v ? Date.parse(v) : NaN;
    if (t > max && t <= Date.now()) max = t;
  };
  for (const t of s.tasks ?? []) (see(t.createdAt), see(t.doneAt), see(t.lastDoneAt));
  for (const g of s.goals ?? []) (see(g.createdAt), see(g.completedAt), g.log?.forEach((l) => see(l.date)));
  for (const h of s.habits ?? []) (see(h.createdAt), h.log?.forEach(see));
  for (const r of s.reminders ?? []) (see(r.createdAt), see(r.doneAt), see(r.ackUntil));
  return max;
}

const QUIET_SETTINGS = new Set(['theme', 'push', 'notifications', 'focusClock']);

/** Mudou algo que altera os avisos? (tema, permissões e caixa de entrada não contam) */
export function isEdit(a: AppState, b: AppState): boolean {
  if (a.tasks !== b.tasks || a.goals !== b.goals || a.habits !== b.habits || a.reminders !== b.reminders || a.snoozes !== b.snoozes) return true;
  if (a.lastWeeklyReview !== b.lastWeeklyReview) return true;
  if (a.dayPlans !== b.dayPlans || a.focus !== b.focus || a.journal !== b.journal || a.places !== b.places) return true;
  if (a.settings === b.settings) return false;
  const keys = new Set([...Object.keys(a.settings), ...Object.keys(b.settings)]) as Set<keyof Settings>;
  for (const k of keys) {
    if (QUIET_SETTINGS.has(k)) continue;
    if (JSON.stringify(a.settings[k]) !== JSON.stringify(b.settings[k])) return true;
  }
  return false;
}

function migrate(raw: Partial<AppState>): AppState {
  const base = seed();
  return {
    ...base,
    ...raw,
    tasks: raw.tasks ?? base.tasks,
    settings: {
      ...defaultSettings,
      ...(raw.settings ?? {}),
      briefing: { ...defaultSettings.briefing, ...(raw.settings?.briefing ?? {}) },
      review: { ...defaultSettings.review, ...(raw.settings?.review ?? {}) },
      weekly: { ...defaultSettings.weekly, ...(raw.settings?.weekly ?? {}) },
      plan: { ...defaultSettings.plan, ...(raw.settings?.plan ?? {}) },
    },
    dayPlans: raw.dayPlans ?? {},
    focusSessions: raw.focusSessions ?? [],
    journal: raw.journal ?? {},
    places: raw.places ?? [],
    history: raw.history ?? [],
    version: STATE_VERSION,
    editedAt: typeof raw.editedAt === 'number' ? raw.editedAt : inferEditedAt(raw),
  };
}

function load(): AppState {
  try {
    const txt = localStorage.getItem(KEY);
    if (txt) return migrate(JSON.parse(txt));
  } catch {
    /* armazenamento indisponível ou corrompido */
  }
  return seed();
}

let state: AppState = load();
const listeners = new Set<() => void>();
/** só alterações feitas neste aparelho (a sincronização da conta escuta isto) */
const localListeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* sem espaço / modo privado */
  }
}

export function getState(): AppState {
  return state;
}

/** Atualiza o estado de forma imutável. */
export function setState(updater: (s: AppState) => AppState) {
  let next = updater(state);
  if (next === state) return;
  next = stampChanges(state, next);
  if (isEdit(state, next)) next = { ...next, editedAt: Date.now() };
  state = next;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 80);
  listeners.forEach((l) => l());
  localListeners.forEach((l) => l());
}

/** Avisa a cada alteração feita neste aparelho (não as que chegam da conta). */
export function onLocalChange(fn: () => void): () => void {
  localListeners.add(fn);
  return () => localListeners.delete(fn);
}

const PREV_KEY = 'rudge:data:prev';

/**
 * Aplica os dados que vieram da conta (já juntados com os deste aparelho).
 * Antes guarda a cópia anterior deste aparelho, para nada se perder se algo der errado.
 */
export function applyRemote(next: AppState) {
  try {
    localStorage.setItem(PREV_KEY, JSON.stringify({ at: Date.now(), data: state }));
  } catch {
    /* sem espaço */
  }
  state = migrate(next);
  clearTimeout(saveTimer);
  persist();
  listeners.forEach((l) => l());
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useStore(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

/** Importar backup: junta com o que já existe (nada do que está no app é perdido). */
export function replaceState(raw: unknown) {
  const imported = migrate(raw as Partial<AppState>);
  setState((s) => ({ ...mergeStates(s, imported), editedAt: Date.now() }));
}

/** Apagar tudo: vale para todos os aparelhos da conta (a conta guarda cópias de segurança). */
export function resetState() {
  const fresh = seed();
  setState((s) => ({ ...fresh, settings: { ...s.settings, onboarded: false }, deleted: s.deleted }));
}

export function exportState(): string {
  return JSON.stringify({ app: 'rudge', exportedAt: new Date().toISOString(), data: state }, null, 2);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', persist);
  // sincroniza entre abas/janelas
  window.addEventListener('storage', (e) => {
    if (e.key === KEY && e.newValue) {
      try {
        state = migrate(JSON.parse(e.newValue));
        listeners.forEach((l) => l());
      } catch {
        /* ignora */
      }
    }
  });
}
