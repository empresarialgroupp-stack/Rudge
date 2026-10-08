// Motor de notificações do Rudge.
//
// 1. A partir do estado, monta uma fila com as próximas ocorrências (lembretes, tarefas,
//    hábitos, check-ins de metas, resumo diário, revisões).
// 2. A cada poucos segundos (e ao voltar para o app) dispara o que venceu — notificação do
//    sistema quando o app está em segundo plano, aviso interno quando está em foco.
// 3. A fila e o registro de disparos ficam no IndexedDB, compartilhados com o service worker,
//    que usa o mesmo registro em sincronizações periódicas e nos botões das notificações.

import type { AppState, NotifKind } from './types';
import { getState, subscribe } from './store';
import { occurrencesBetween } from './recurrence';
import { addDays, dateKey, parseKey, todayKey, WEEKDAYS } from './date';
import { goalPace, goalProgress, habitStreak, isHabitDueOn } from './goals';
import { idbGet, idbSet } from './idb';
import { playChime, showSystem } from './notify';
import {
  addSnooze,
  completeReminder,
  pushInbox,
  removeSnooze,
  toggleHabit,
  toggleTask,
} from './actions';
import { navigate, toast } from './ui';

export interface QueueItem {
  key: string;
  at: number;
  title: string;
  body: string;
  kind: NotifKind;
  refId?: string;
  occ?: number;
  url: string;
  actions: { action: string; title: string }[];
  /** até quanto tempo depois do horário ainda vale disparar (ms) */
  grace: number;
  snoozeMin: number;
  requireInteraction?: boolean;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const WINDOW_PAST = 24 * HOUR;
const WINDOW_FUTURE = 8 * 24 * HOUR;

const A_DONE = { action: 'done', title: 'Concluir' };
const A_SNOOZE = (label: string) => ({ action: 'snooze', title: label });
const A_OPEN = (label: string) => ({ action: 'open', title: label });

function daysInWindow(from: number, to: number): string[] {
  const out: string[] = [];
  let d = new Date(from);
  d.setHours(0, 0, 0, 0);
  while (d.getTime() <= to) {
    out.push(dateKey(d));
    d = addDays(d, 1);
  }
  return out;
}

function plural(n: number, s: string, p: string) {
  return `${n} ${n === 1 ? s : p}`;
}

/** Resumo de um dia para o briefing. */
export function dayPlan(s: AppState, key: string) {
  const today = todayKey();
  const tasks = s.tasks
    .filter((t) => !t.done && t.due && (t.due === key || (key === today && t.due < today)))
    .sort((a, b) => b.priority - a.priority || (a.time ?? '99').localeCompare(b.time ?? '99'));
  const start = parseKey(key).getTime();
  const end = start + 24 * HOUR - 1;
  const reminders = s.reminders
    .filter((r) => !r.done)
    .flatMap((r) => occurrencesBetween({ at: Date.parse(r.at), repeat: r.repeat, days: r.days }, start, end));
  const habits = s.habits.filter((h) => isHabitDueOn(h, key) && !h.log.includes(key));
  return { tasks, reminders: reminders.length, habits };
}

export function buildQueue(s: AppState, now = Date.now()): QueueItem[] {
  const from = now - WINDOW_PAST;
  const to = now + WINDOW_FUTURE;
  const q: QueueItem[] = [];
  const days = daysInWindow(from, to);
  const name = s.settings.name ? `, ${s.settings.name.split(' ')[0]}` : '';

  // Lembretes (ocorrências anteriores à criação não contam como atrasadas)
  for (const r of s.reminders) {
    if (r.done) continue;
    const rule = { at: Date.parse(r.at), repeat: r.repeat, days: r.days };
    const ack = r.ackUntil ? Date.parse(r.ackUntil) : 0;
    const created = (Date.parse(r.createdAt) || 0) - MIN;
    for (const at of occurrencesBetween(rule, from, to)) {
      if (at <= ack || at < created) continue;
      q.push({
        key: `rem:${r.id}:${at}`,
        at,
        title: r.title,
        body: r.notes?.trim() || (r.repeat === 'none' ? 'Lembrete do Rudge' : 'Lembrete recorrente'),
        kind: 'reminder',
        refId: r.id,
        occ: at,
        url: '#/lembretes',
        actions: [A_DONE, A_SNOOZE('Adiar 10 min')],
        grace: 24 * HOUR,
        snoozeMin: 10,
        requireInteraction: true,
      });
    }
  }

  // Tarefas com horário e lembrete
  for (const t of s.tasks) {
    if (t.done || !t.due || !t.time || t.remind == null) continue;
    const due = parseKey(t.due, t.time).getTime();
    const created = Date.parse(t.createdAt) || 0;
    let at = due - t.remind * MIN;
    // criada já dentro da antecedência: avisa no horário da tarefa
    if (at < created) {
      if (due < created) continue;
      at = due;
    }
    if (at < from || at > to) continue;
    q.push({
      key: `task:${t.id}:${at}`,
      at,
      title: t.title,
      body: at < due ? `Começa em ${Math.round((due - at) / MIN)} min — às ${t.time}` : `Agora — ${t.time}`,
      kind: 'task',
      refId: t.id,
      occ: due,
      url: '#/tarefas',
      actions: [A_DONE, A_SNOOZE('Adiar 10 min')],
      grace: 12 * HOUR,
      snoozeMin: 10,
      requireInteraction: true,
    });
  }

  for (const key of days) {
    const dow = parseKey(key).getDay();

    // Hábitos
    for (const h of s.habits) {
      if (!h.remind || !isHabitDueOn(h, key) || h.log.includes(key)) continue;
      const at = parseKey(key, h.time).getTime();
      if (at < (Date.parse(h.createdAt) || 0)) continue;
      const streak = habitStreak(h, key);
      q.push({
        key: `habit:${h.id}:${key}`,
        at,
        title: `Hábito: ${h.title}`,
        body: streak > 0 ? `Sequência de ${plural(streak, 'dia', 'dias')} — não quebre a corrente.` : 'Marque como feito quando concluir.',
        kind: 'habit',
        refId: h.id,
        occ: at,
        url: '#/habitos',
        actions: [{ action: 'done', title: 'Feito' }, A_SNOOZE('Adiar 30 min')],
        grace: 3 * HOUR,
        snoozeMin: 30,
      });
    }

    // Check-ins de metas
    for (const g of s.goals) {
      if (g.status !== 'active' || g.checkin.freq === 'none') continue;
      if (g.checkin.freq === 'weekly' && g.checkin.weekday !== dow) continue;
      if (key < g.start) continue;
      const at = parseKey(key, g.checkin.time).getTime();
      if (at < (Date.parse(g.createdAt) || 0)) continue;
      const pace = goalPace(g, key);
      q.push({
        key: `goal:${g.id}:${key}`,
        at,
        title: `Meta: ${g.title}`,
        body: `${Math.round(goalProgress(g) * 100)}% · ${pace.label}. ${pace.advice}`,
        kind: 'goal',
        refId: g.id,
        url: `#/metas?id=${g.id}`,
        actions: [A_OPEN('Registrar progresso'), A_SNOOZE('Mais tarde')],
        grace: 4 * HOUR,
        snoozeMin: 60,
      });
    }

    // Prazos de metas (7 dias, 1 dia e no dia)
    for (const g of s.goals) {
      if (g.status !== 'active' || !g.deadline) continue;
      for (const before of [7, 1, 0]) {
        const k = dateKey(addDays(parseKey(g.deadline), -before));
        if (k !== key) continue;
        const pct = Math.round(goalProgress(g) * 100);
        q.push({
          key: `deadline:${g.id}:${before}`,
          at: parseKey(key, '09:00').getTime(),
          title: before === 0 ? `Hoje é o prazo: ${g.title}` : `Faltam ${plural(before, 'dia', 'dias')}: ${g.title}`,
          body: `${pct}% concluída. ${goalPace(g, key).advice}`,
          kind: 'deadline',
          refId: g.id,
          url: `#/metas?id=${g.id}`,
          actions: [A_OPEN('Ver meta')],
          grace: 12 * HOUR,
          snoozeMin: 60,
        });
      }
    }

    // Resumo da manhã
    if (s.settings.briefing.enabled) {
      const plan = dayPlan(s, key);
      const parts = [
        plural(plan.tasks.length, 'tarefa', 'tarefas'),
        plural(plan.reminders, 'lembrete', 'lembretes'),
        plural(plan.habits.length, 'hábito', 'hábitos'),
      ];
      const top = plan.tasks[0];
      q.push({
        key: `brief:${key}`,
        at: parseKey(key, s.settings.briefing.time).getTime(),
        title: `${dow === 1 ? 'Boa semana' : 'Bom dia'}${name}! Seu plano de hoje`,
        body: plan.tasks.length || plan.reminders || plan.habits.length
          ? `${parts.join(' · ')}.${top ? ` Comece por: ${top.title}` : ''}`
          : 'Agenda livre. Que tal avançar em uma meta?',
        kind: 'briefing',
        url: '#/inicio',
        actions: [A_OPEN('Abrir meu dia')],
        grace: 3 * HOUR,
        snoozeMin: 30,
      });
    }

    // Revisão da noite
    if (s.settings.review.enabled) {
      const isToday = key === todayKey();
      const doneToday = s.tasks.filter((t) => t.done && t.doneAt && dateKey(new Date(t.doneAt)) === key).length;
      const open = s.tasks.filter((t) => !t.done && t.due && t.due <= key).length;
      q.push({
        key: `review:${key}`,
        at: parseKey(key, s.settings.review.time).getTime(),
        title: 'Hora de fechar o dia',
        body: isToday
          ? `${plural(doneToday, 'tarefa concluída', 'tarefas concluídas')}, ${plural(open, 'pendente', 'pendentes')}. Reagende e planeje amanhã.`
          : 'Revise o que ficou pendente e planeje amanhã em 2 minutos.',
        kind: 'review',
        url: '#/tarefas',
        actions: [A_OPEN('Planejar amanhã')],
        grace: 2 * HOUR,
        snoozeMin: 30,
      });
    }

    // Revisão semanal
    if (s.settings.weekly.enabled && s.settings.weekly.weekday === dow) {
      q.push({
        key: `weekly:${key}`,
        at: parseKey(key, s.settings.weekly.time).getTime(),
        title: 'Revisão semanal',
        body: `É ${WEEKDAYS[dow]}: revise a semana, ajuste metas e escolha 3 prioridades.`,
        kind: 'weekly',
        url: '#/revisao',
        actions: [A_OPEN('Começar revisão')],
        grace: 12 * HOUR,
        snoozeMin: 60,
      });
    }
  }

  // Adiados (ignora os que já foram resolvidos)
  for (const sn of s.snoozes) {
    if (sn.kind === 'reminder') {
      const r = s.reminders.find((x) => x.id === sn.refId);
      if (!r || r.done || (sn.occ && r.ackUntil && Date.parse(r.ackUntil) >= sn.occ)) continue;
    } else if (sn.kind === 'task') {
      const t = s.tasks.find((x) => x.id === sn.refId);
      if (!t || t.done || (sn.occ && t.due && parseKey(t.due, t.time).getTime() !== sn.occ)) continue;
    } else if (sn.kind === 'habit') {
      const h = s.habits.find((x) => x.id === sn.refId);
      if (!h || h.log.includes(dateKey(new Date(sn.occ ?? sn.at)))) continue;
    }
    q.push({
      key: sn.key,
      at: sn.at,
      title: sn.title,
      body: sn.body,
      kind: sn.kind,
      refId: sn.refId,
      occ: sn.occ,
      url: sn.url,
      actions:
        sn.kind === 'reminder' || sn.kind === 'task' || sn.kind === 'habit'
          ? [A_DONE, A_SNOOZE('Adiar 10 min')]
          : [A_OPEN('Abrir')],
      grace: 24 * HOUR,
      snoozeMin: 10,
      requireInteraction: true,
    });
  }

  return q.sort((a, b) => a.at - b.at);
}

/* ------------------------------------------------------------------ */

type Fired = Record<string, number>;

let queue: QueueItem[] = [];
let started = false;
let persistTimer: ReturnType<typeof setTimeout> | undefined;

export function getQueue() {
  return queue;
}

function rebuild() {
  queue = buildQueue(getState());
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void idbSet('queue', queue);
  }, 400);
}

async function withLock(fn: () => Promise<void>) {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (locks?.request) {
    await locks.request('rudge-scheduler', { ifAvailable: true }, async (lock) => {
      if (lock) await fn();
    });
  } else {
    await fn();
  }
}

function isForeground() {
  return document.visibilityState === 'visible' && document.hasFocus();
}

/** Exibe a notificação: aviso interno se o app está em foco, senão notificação do sistema. */
export async function present(item: QueueItem, late = false) {
  const s = getState();
  const body = late ? `Atrasado · ${item.body}` : item.body;
  pushInbox([{ key: item.key, at: item.at, title: item.title, body, kind: item.kind, url: item.url }]);

  let shownBySystem = false;
  if (!isForeground() && s.settings.notifications) {
    shownBySystem = await showSystem({
      title: item.title,
      body,
      tag: item.key,
      data: notifData(item),
      actions: item.actions,
      requireInteraction: item.requireInteraction,
      timestamp: item.at,
    });
  }
  if (!shownBySystem) {
    if (s.settings.sound) playChime();
    toast({
      title: item.title,
      body,
      icon: 'bell',
      duration: item.requireInteraction ? 0 : 12000,
      actions: item.actions.map((a) => ({
        label: a.title,
        run: () => handleAction(a.action, notifData(item)),
      })),
    });
  }
}

export interface NotifData {
  key: string;
  kind: NotifKind;
  refId?: string;
  occ?: number;
  url: string;
  title: string;
  body: string;
  snoozeMin: number;
}

function notifData(item: QueueItem): NotifData {
  return {
    key: item.key,
    kind: item.kind,
    refId: item.refId,
    occ: item.occ,
    url: item.url,
    title: item.title,
    body: item.body,
    snoozeMin: item.snoozeMin,
  };
}

/** Executa a ação de um botão de notificação (vindo do toast ou do service worker). */
export function handleAction(action: string, data: NotifData, baseAt = Date.now()) {
  if (action === 'done') {
    if (data.kind === 'reminder' && data.refId) completeReminder(data.refId, data.occ);
    else if (data.kind === 'task' && data.refId) toggleTask(data.refId, true);
    else if (data.kind === 'habit' && data.refId) toggleHabit(data.refId, dateKey(new Date(data.occ ?? Date.now())), true);
    // remove adiamentos pendentes do mesmo item
    for (const sn of getState().snoozes) if (sn.refId && sn.refId === data.refId) removeSnooze(sn.key);
    if (data.key.startsWith('snz:')) removeSnooze(data.key);
    toast({ title: 'Concluído', body: data.title, icon: 'check' });
    return;
  }
  if (action === 'snooze') {
    const min = data.snoozeMin || 10;
    if (data.key.startsWith('snz:')) removeSnooze(data.key);
    addSnooze({
      at: baseAt + min * MIN,
      title: data.title,
      body: data.body,
      kind: data.kind,
      refId: data.refId,
      occ: data.occ,
      url: data.url,
    });
    toast({ title: `Adiado por ${min} min`, body: data.title, icon: 'bell' });
    return;
  }
  navigate(data.url);
}

export async function tick() {
  await withLock(async () => {
    rebuild();
    const now = Date.now();
    const fired = (await idbGet<Fired>('fired')) ?? {};
    const due = queue.filter((q) => q.at <= now && !fired[q.key]);
    for (const item of due) {
      fired[item.key] = now;
      if (item.key.startsWith('snz:')) removeSnooze(item.key);
      if (now - item.at > item.grace) continue; // antigo demais: descarta em silêncio
      await present(item, now - item.at > 5 * MIN);
    }
    // limpeza de registros antigos
    for (const [k, t] of Object.entries(fired)) if (now - t > 3 * 24 * HOUR) delete fired[k];
    if (due.length || Math.random() < 0.05) await idbSet('fired', fired);
  });
}

/** Aplica ações/disparos feitos pelo service worker enquanto o app estava fechado. */
export async function syncFromServiceWorker() {
  const pending = (await idbGet<{ action: string; data: NotifData; at?: number }[]>('pending-actions')) ?? [];
  if (pending.length) {
    await idbSet('pending-actions', []);
    for (const p of pending) handleAction(p.action, p.data, p.at);
  }
  const swInbox = (await idbGet<NotifData[]>('sw-inbox')) ?? [];
  if (swInbox.length) {
    await idbSet('sw-inbox', []);
    pushInbox(swInbox.map((d) => ({ key: d.key, at: Date.now(), title: d.title, body: d.body, kind: d.kind, url: d.url })));
  }
}

export async function startScheduler() {
  if (started) return;
  started = true;
  rebuild();

  // primeira execução: não dispara itens antigos de uma vez
  if (!(await idbGet<boolean>('fired-init'))) {
    const now = Date.now();
    const fired: Fired = {};
    for (const q of queue) if (q.at <= now) fired[q.key] = now;
    await idbSet('fired', fired);
    await idbSet('fired-init', true);
  }

  await syncFromServiceWorker();

  let pending: ReturnType<typeof setTimeout> | undefined;
  subscribe(() => {
    clearTimeout(pending);
    pending = setTimeout(() => void tick(), 300);
  });

  navigator.serviceWorker?.addEventListener('message', (e) => {
    const msg = e.data as { type?: string; action?: string; data?: NotifData };
    if (msg?.type === 'rudge-action' && msg.data) handleAction(msg.action ?? 'open', msg.data);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void syncFromServiceWorker();
      void tick();
    }
  });
  window.addEventListener('focus', () => void tick());

  setInterval(() => void tick(), 10_000);
  void tick();
}

/** Notificação de teste imediata. */
export async function testNotification() {
  const item: QueueItem = {
    key: `test:${Date.now()}`,
    at: Date.now(),
    title: 'Rudge está pronto para lembrar você',
    body: 'As notificações estão funcionando. Toque para abrir.',
    kind: 'test',
    url: '#/inicio',
    actions: [],
    grace: HOUR,
    snoozeMin: 10,
  };
  const s = getState();
  const ok = await showSystem({ title: item.title, body: item.body, tag: item.key, data: notifData(item) });
  if (!ok) {
    if (s.settings.sound) playChime();
    toast({ title: item.title, body: 'Permissão de notificação não concedida — exibindo aviso interno.', icon: 'info' });
  }
  return ok;
}
