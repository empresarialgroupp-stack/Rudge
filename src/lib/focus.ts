// Modo foco: avisa o service worker (para silenciar pushes) e encerra a sessão no fim.
import { getState, subscribe } from './store';
import { finishFocus } from './actions';
import { idbSet } from './idb';
import { playChime } from './notify';
import { openModal, toast } from './ui';

let started = false;

export function focusLeft(now = Date.now()) {
  const f = getState().focus;
  if (!f) return 0;
  return f.pausedLeft ?? Math.max(0, f.until - now);
}

/** Termina e avisa (com o app aberto). */
export function completeFocus(manual = false) {
  const f = getState().focus;
  if (!f) return;
  const min = finishFocus();
  if (getState().settings.sound) playChime();
  toast({
    title: manual ? 'Foco encerrado' : 'Foco concluído',
    body: min ? `${min} min em “${f.title}”.` : 'Sessão curta demais para registrar.',
    icon: 'spark',
    duration: 9000,
    actions: f.taskId ? [{ label: 'Ver tarefa', run: () => openModal({ type: 'task', id: f.taskId }) }] : undefined,
  });
}

export function startFocusWatcher() {
  if (started) return;
  started = true;
  let last = '';
  const sync = () => {
    const f = getState().focus;
    const until = !f ? 0 : f.pausedLeft !== undefined ? Date.now() + 12 * 3_600_000 : f.until;
    const key = String(until);
    if (key !== last) {
      last = key;
      void idbSet('focus-until', until);
    }
  };
  subscribe(sync);
  sync();
  setInterval(() => {
    const f = getState().focus;
    if (f && f.pausedLeft === undefined && f.until <= Date.now()) completeFocus();
  }, 1000);
}
