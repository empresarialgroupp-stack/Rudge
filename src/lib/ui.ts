// Barramento de UI: modais globais, toasts e roteamento por hash.
import { useSyncExternalStore } from 'react';

function createAtom<T>(initial: T) {
  let value = initial;
  const ls = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      ls.forEach((l) => l());
    },
    subscribe(fn: () => void) {
      ls.add(fn);
      return () => ls.delete(fn);
    },
  };
}

/* ---------------- Modais ---------------- */

export type ModalSpec =
  | { type: 'task'; id?: string; defaults?: { due?: string; time?: string; title?: string; goalId?: string } }
  | { type: 'reminder'; id?: string; defaults?: { title?: string; at?: number } }
  | { type: 'habit'; id?: string; defaults?: { title?: string; goalId?: string } }
  | { type: 'goal-wizard'; templateId?: string }
  | { type: 'goal-detail'; id: string }
  | { type: 'goal-edit'; id: string }
  | { type: 'command' }
  | { type: 'voice' }
  | { type: 'onboarding' }
  | { type: 'quick-add'; mode?: 'task' | 'reminder' }
  | { type: 'focus'; taskId?: string; goalId?: string }
  | { type: 'photo' }
  | { type: 'retro'; month?: string };

const modals = createAtom<ModalSpec[]>([]);

export function openModal(spec: ModalSpec) {
  modals.set([...modals.get().filter((m) => m.type !== spec.type), spec]);
}
export function closeModal(type?: ModalSpec['type']) {
  const list = modals.get();
  if (!type) modals.set(list.slice(0, -1));
  else modals.set(list.filter((m) => m.type !== type));
}
export function closeAllModals() {
  modals.set([]);
}
export function useModals() {
  return useSyncExternalStore(modals.subscribe, modals.get);
}

/* ---------------- Toasts ---------------- */

export interface ToastAction {
  label: string;
  run: () => void;
}
export interface Toast {
  id: number;
  title: string;
  body?: string;
  icon?: 'bell' | 'check' | 'info' | 'error' | 'spark';
  actions?: ToastAction[];
  duration?: number;
}

const toasts = createAtom<Toast[]>([]);
let toastId = 1;

export function toast(t: Omit<Toast, 'id'>) {
  const id = toastId++;
  toasts.set([...toasts.get().slice(-3), { ...t, id }]);
  const ms = t.duration ?? (t.actions?.length ? 9000 : 3800);
  if (ms > 0) setTimeout(() => dismissToast(id), ms);
  return id;
}
export function dismissToast(id: number) {
  toasts.set(toasts.get().filter((t) => t.id !== id));
}
export function useToasts() {
  return useSyncExternalStore(toasts.subscribe, toasts.get);
}

/* ---------------- Rotas ---------------- */

export type RouteName =
  | 'inicio'
  | 'tarefas'
  | 'metas'
  | 'habitos'
  | 'lembretes'
  | 'agenda'
  | 'revisao'
  | 'diario'
  | 'instalar'
  | 'configuracoes';

export interface Route {
  name: RouteName;
  params: URLSearchParams;
}

const ROUTES: RouteName[] = ['inicio', 'tarefas', 'metas', 'habitos', 'lembretes', 'agenda', 'revisao', 'diario', 'instalar', 'configuracoes'];

function parseHash(): Route {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace(/^#\/?/, '');
  const [path, query] = h.split('?');
  const name = (ROUTES as string[]).includes(path) ? (path as RouteName) : 'inicio';
  return { name, params: new URLSearchParams(query ?? '') };
}

const route = createAtom<Route>(parseHash());
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => route.set(parseHash()));
}

export function useRoute() {
  return useSyncExternalStore(route.subscribe, route.get);
}

export function navigate(to: string) {
  const target = to.startsWith('#') ? to : `#/${to.replace(/^\//, '')}`;
  if (location.hash === target) route.set(parseHash());
  else location.hash = target;
}

/* ---------------- Tela estreita ---------------- */

const NARROW = '(max-width: 560px)';

function subscribeNarrow(fn: () => void) {
  const mq = window.matchMedia?.(NARROW);
  mq?.addEventListener?.('change', fn);
  return () => mq?.removeEventListener?.('change', fn);
}

/** true em celulares (mesmo limite do CSS), para encurtar textos. */
export function useNarrow() {
  return useSyncExternalStore(subscribeNarrow, () => !!window.matchMedia?.(NARROW).matches, () => false);
}
