import { useSyncExternalStore } from 'react';
import type { AppState, Settings } from './types';
import { todayKey } from './date';

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
  };
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
    },
    version: STATE_VERSION,
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
  const next = updater(state);
  if (next === state) return;
  state = next;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 80);
  listeners.forEach((l) => l());
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useStore(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function replaceState(raw: unknown) {
  state = migrate(raw as Partial<AppState>);
  persist();
  listeners.forEach((l) => l());
}

export function resetState() {
  state = seed();
  persist();
  listeners.forEach((l) => l());
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
