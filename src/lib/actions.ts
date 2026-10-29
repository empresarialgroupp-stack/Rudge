// Mutações do estado. Toda escrita passa por aqui.
import type { ActionLog, ActiveFocus, AppState, DayPlan, Goal, Habit, InboxItem, JournalEntry, Milestone, Place, Reminder, Settings, Snooze, Task } from './types';
import { setState, uid, getState } from './store';
import { addDaysKey, dateKey, DAY, parseKey, relativeDay, startOfDay, todayKey } from './date';
import { nextOccurrence } from './recurrence';
import { goalProgress } from './goals';
import { toast } from './ui';

const nowIso = () => new Date().toISOString();

function patchList<T extends { id: string }>(list: T[], id: string, patch: Partial<T> | ((x: T) => T)): T[] {
  return list.map((x) => (x.id === id ? (typeof patch === 'function' ? patch(x) : { ...x, ...patch }) : x));
}

/* ---------------- Tarefas ---------------- */

export function addTask(t: Partial<Task> & { title: string }): Task {
  const s = getState();
  const task: Task = {
    id: uid(),
    done: false,
    createdAt: nowIso(),
    priority: 0,
    remind: t.time ? s.settings.defaultTaskRemind : null,
    ...t,
  };
  setState((st) => ({ ...st, tasks: [task, ...st.tasks] }));
  return task;
}

export function updateTask(id: string, patch: Partial<Task>) {
  setState((s) => ({ ...s, tasks: patchList(s.tasks, id, patch) }));
}

export function toggleTask(id: string, done?: boolean) {
  const task = getState().tasks.find((t) => t.id === id);
  if (!task) return;
  const d = done ?? !task.done;
  // tarefa recorrente: concluir avança para a próxima ocorrência
  if (d && task.repeat && task.repeat !== 'none' && task.due) {
    const anchor = parseKey(task.due, task.time ?? '09:00').getTime();
    const next = nextOccurrence({ at: anchor, repeat: task.repeat, days: task.days }, Math.max(anchor, startOfDay(new Date()).getTime() + DAY - 1));
    if (next) {
      const due = dateKey(new Date(next));
      updateTask(id, { due, lastDoneAt: nowIso(), subtasks: task.subtasks?.map((x) => ({ ...x, done: false })) });
      toast({ title: 'Feito! Próxima ocorrência', body: `${task.title} — ${relativeDay(due).toLowerCase()}`, icon: 'check' });
      return;
    }
  }
  if (d) logAction({ kind: 'task', refId: id, action: 'done', scheduledAt: task.due && task.time ? parseKey(task.due, task.time).getTime() : undefined, at: Date.now() });
  setState((s) => ({
    ...s,
    tasks: patchList(s.tasks, id, (t) => ({ ...t, done: d, doneAt: d ? nowIso() : undefined })),
  }));
}

export function deleteTask(id: string) {
  const prev = getState().tasks.find((t) => t.id === id);
  setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
  if (prev)
    toast({
      title: 'Tarefa excluída',
      icon: 'info',
      actions: [{ label: 'Desfazer', run: () => setState((s) => ({ ...s, tasks: [prev, ...s.tasks] })) }],
    });
}

export function rescheduleTasks(ids: string[], due: string) {
  const set = new Set(ids);
  setState((s) => ({ ...s, tasks: s.tasks.map((t) => (set.has(t.id) ? { ...t, due } : t)) }));
}

/* ---------------- Lembretes ---------------- */

export function addReminder(r: Partial<Reminder> & { title: string; at: string }): Reminder {
  const rem: Reminder = { id: uid(), repeat: 'none', done: false, createdAt: nowIso(), ...r };
  setState((s) => ({ ...s, reminders: [rem, ...s.reminders] }));
  return rem;
}

export function updateReminder(id: string, patch: Partial<Reminder>) {
  setState((s) => ({ ...s, reminders: patchList(s.reminders, id, patch) }));
}

/** Conclui um lembrete único, ou confirma a ocorrência atual de um recorrente. */
export function completeReminder(id: string, occurrenceAt?: number) {
  const r0 = getState().reminders.find((r) => r.id === id);
  logAction({ kind: 'reminder', refId: id, action: 'done', scheduledAt: occurrenceAt ?? (r0 ? Date.parse(r0.at) : undefined), at: Date.now() });
  setState((s) => ({
    ...s,
    reminders: patchList(s.reminders, id, (r) =>
      r.repeat === 'none'
        ? { ...r, done: true, doneAt: nowIso() }
        : { ...r, ackUntil: new Date(occurrenceAt ?? Date.now()).toISOString() },
    ),
  }));
}

export function reopenReminder(id: string) {
  updateReminder(id, { done: false, doneAt: undefined });
}

export function deleteReminder(id: string) {
  const prev = getState().reminders.find((r) => r.id === id);
  setState((s) => ({ ...s, reminders: s.reminders.filter((r) => r.id !== id) }));
  if (prev)
    toast({
      title: 'Lembrete excluído',
      icon: 'info',
      actions: [{ label: 'Desfazer', run: () => setState((s) => ({ ...s, reminders: [prev, ...s.reminders] })) }],
    });
}

/** Adia um lembrete único para outro horário (move o próprio lembrete). */
export function postponeReminder(id: string, at: number) {
  const r0 = getState().reminders.find((r) => r.id === id);
  if (r0) logAction({ kind: 'reminder', refId: id, action: 'snooze', scheduledAt: Date.parse(r0.at), at: Date.now() });
  updateReminder(id, { at: new Date(at).toISOString(), done: false });
}

export function addSnooze(sn: Omit<Snooze, 'key'> & { key?: string }) {
  const item: Snooze = { ...sn, key: sn.key ?? `snz:${uid()}` };
  setState((s) => ({ ...s, snoozes: [...s.snoozes, item] }));
}

export function removeSnooze(key: string) {
  setState((s) => ({ ...s, snoozes: s.snoozes.filter((x) => x.key !== key) }));
}

/* ---------------- Metas ---------------- */

export function addGoal(
  g: Omit<Goal, 'id' | 'createdAt' | 'log' | 'status'> & Partial<Pick<Goal, 'log' | 'status'>>,
  extras: { habit?: Omit<Habit, 'id' | 'createdAt' | 'log' | 'goalId'>; firstStep?: string } = {},
): Goal {
  const goal: Goal = { id: uid(), createdAt: nowIso(), log: [], status: 'active', ...g };
  if (goal.kind === 'numeric') {
    goal.current = goal.current ?? goal.startValue ?? 0;
    goal.log = [{ date: nowIso(), value: goal.current, note: 'Início' }];
  }
  setState((s) => {
    let next: AppState = { ...s, goals: [goal, ...s.goals] };
    if (extras.habit) {
      const habit: Habit = { id: uid(), createdAt: nowIso(), log: [], goalId: goal.id, ...extras.habit };
      next = { ...next, habits: [...next.habits, habit] };
    }
    if (extras.firstStep) {
      const task: Task = {
        id: uid(),
        title: extras.firstStep,
        done: false,
        createdAt: nowIso(),
        due: todayKey(),
        priority: 2,
        goalId: goal.id,
        area: goal.area,
      };
      next = { ...next, tasks: [task, ...next.tasks] };
    }
    return next;
  });
  return goal;
}

function finalizeGoal(g: Goal): Goal {
  if (g.kind === 'numeric' && g.milestones.some((m) => m.value !== undefined)) {
    const cur = g.current ?? g.startValue ?? 0;
    const up = (g.target ?? 0) >= (g.startValue ?? 0);
    g = {
      ...g,
      milestones: g.milestones.map((m) => {
        if (m.value === undefined) return m;
        const reached = up ? cur >= m.value : cur <= m.value;
        return reached === m.done ? m : { ...m, done: reached, doneAt: reached ? nowIso() : undefined };
      }),
    };
  }
  if (g.status === 'active' && goalProgress(g) >= 1) {
    setTimeout(
      () =>
        toast({
          title: 'Meta concluída!',
          body: `“${g.title}” — parabéns pela consistência.`,
          icon: 'spark',
          duration: 6000,
        }),
      50,
    );
    return { ...g, status: 'done', completedAt: nowIso() };
  }
  if (g.status === 'done' && goalProgress(g) < 1) return { ...g, status: 'active', completedAt: undefined };
  return g;
}

export function updateGoal(id: string, patch: Partial<Goal>) {
  setState((s) => ({ ...s, goals: patchList(s.goals, id, (g) => ({ ...g, ...patch })) }));
}

export function setGoalValue(id: string, value: number, note?: string) {
  setState((s) => ({
    ...s,
    goals: patchList(s.goals, id, (g) =>
      finalizeGoal({ ...g, current: value, log: [...g.log, { date: nowIso(), value, note }] }),
    ),
  }));
}

export function bumpGoal(id: string, delta: number) {
  const g = getState().goals.find((x) => x.id === id);
  if (!g) return;
  setGoalValue(id, +(((g.current ?? g.startValue ?? 0) + delta).toFixed(2)));
}

export function toggleMilestone(goalId: string, mId: string) {
  setState((s) => ({
    ...s,
    goals: patchList(s.goals, goalId, (g) =>
      finalizeGoal({
        ...g,
        milestones: g.milestones.map((m) =>
          m.id === mId ? { ...m, done: !m.done, doneAt: !m.done ? nowIso() : undefined } : m,
        ),
        log: [...g.log, { date: nowIso(), value: 0, note: 'Etapa atualizada' }],
      }),
    ),
  }));
}

export function setMilestones(goalId: string, milestones: Milestone[]) {
  setState((s) => ({ ...s, goals: patchList(s.goals, goalId, (g) => finalizeGoal({ ...g, milestones })) }));
}

export function setGoalStatus(id: string, status: Goal['status']) {
  updateGoal(id, { status, completedAt: status === 'done' ? nowIso() : undefined });
}

export function deleteGoal(id: string) {
  const s0 = getState();
  const prev = s0.goals.find((g) => g.id === id);
  setState((s) => ({
    ...s,
    goals: s.goals.filter((g) => g.id !== id),
    habits: s.habits.map((h) => (h.goalId === id ? { ...h, goalId: undefined } : h)),
    tasks: s.tasks.map((t) => (t.goalId === id ? { ...t, goalId: undefined } : t)),
  }));
  if (prev)
    toast({
      title: 'Meta excluída',
      icon: 'info',
      actions: [{ label: 'Desfazer', run: () => setState((s) => ({ ...s, goals: [prev, ...s.goals] })) }],
    });
}

/* ---------------- Hábitos ---------------- */

export function addHabit(h: Partial<Habit> & { title: string }): Habit {
  const habit: Habit = {
    id: uid(),
    days: [0, 1, 2, 3, 4, 5, 6],
    remind: true,
    time: '09:00',
    log: [],
    createdAt: nowIso(),
    ...h,
  };
  setState((s) => ({ ...s, habits: [...s.habits, habit] }));
  return habit;
}

export function updateHabit(id: string, patch: Partial<Habit>) {
  setState((s) => ({ ...s, habits: patchList(s.habits, id, patch) }));
}

export function toggleHabit(id: string, date = todayKey(), done?: boolean) {
  setState((s) => {
    const habit = s.habits.find((h) => h.id === id);
    if (!habit) return s;
    const has = habit.log.includes(date);
    const want = done ?? !has;
    if (want === has) return s;
    const log = want ? [...habit.log, date] : habit.log.filter((d) => d !== date);
    let history = s.history;
    if (want && date === todayKey())
      history = [...history, { kind: 'habit' as const, refId: id, action: 'done' as const, scheduledAt: parseKey(date, habit.time).getTime(), at: Date.now() }].slice(-HISTORY_MAX);
    let goals = s.goals;
    if (habit.goalId) {
      goals = patchList(goals, habit.goalId, (g) => {
        if (!g.habitCounts || g.kind !== 'numeric') return g;
        const cur = (g.current ?? g.startValue ?? 0) + (want ? 1 : -1);
        return finalizeGoal({ ...g, current: cur, log: [...g.log, { date: nowIso(), value: cur, note: habit.title }] });
      });
    }
    return { ...s, goals, history, habits: patchList(s.habits, id, { log }) };
  });
}

export function deleteHabit(id: string) {
  const prev = getState().habits.find((h) => h.id === id);
  setState((s) => ({ ...s, habits: s.habits.filter((h) => h.id !== id) }));
  if (prev)
    toast({
      title: 'Hábito excluído',
      icon: 'info',
      actions: [{ label: 'Desfazer', run: () => setState((s) => ({ ...s, habits: [...s.habits, prev] })) }],
    });
}

/* ---------------- Configurações / inbox ---------------- */

export function updateSettings(patch: Partial<Settings>) {
  setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}

export function pushInbox(items: Omit<InboxItem, 'id' | 'read'>[]) {
  if (!items.length) return;
  setState((s) => ({
    ...s,
    inbox: [...items.map((i) => ({ ...i, id: uid(), read: false })), ...s.inbox].slice(0, 60),
  }));
}

export function markInboxRead() {
  setState((s) => (s.inbox.some((i) => !i.read) ? { ...s, inbox: s.inbox.map((i) => ({ ...i, read: true })) } : s));
}

export function clearInbox() {
  setState((s) => ({ ...s, inbox: [] }));
}

export function dismissSuggestion(id: string) {
  setState((s) => ({ ...s, dismissedSuggestions: { ...s.dismissedSuggestions, [id]: todayKey() } }));
}

export function finishWeeklyReview() {
  setState((s) => ({ ...s, lastWeeklyReview: todayKey() }));
}

/** Move todas as tarefas atrasadas para hoje. */
export function moveOverdueToToday() {
  const today = todayKey();
  const ids = getState()
    .tasks.filter((t) => !t.done && t.due && t.due < today)
    .map((t) => t.id);
  rescheduleTasks(ids, today);
  toast({ title: `${ids.length} tarefa(s) movidas para hoje`, icon: 'check' });
}

export function moveTodayOpenToTomorrow() {
  const today = todayKey();
  const ids = getState()
    .tasks.filter((t) => !t.done && t.due && t.due <= today)
    .map((t) => t.id);
  rescheduleTasks(ids, addDaysKey(today, 1));
  toast({ title: `${ids.length} tarefa(s) movidas para amanhã`, icon: 'check' });
}

/* ---------------- Histórico (aprender horários) ---------------- */

const HISTORY_MAX = 400;

export function logAction(entry: ActionLog) {
  setState((s) => ({ ...s, history: [...s.history, entry].slice(-HISTORY_MAX) }));
}

/** Muda só o horário (HH:MM) de um lembrete, mantendo a data/recorrência. */
export function retimeReminder(id: string, time: string) {
  const r = getState().reminders.find((x) => x.id === id);
  if (!r) return;
  const d = new Date(r.at);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  updateReminder(id, { at: d.toISOString(), ackUntil: r.repeat !== 'none' ? new Date().toISOString() : r.ackUntil });
}

/* ---------------- Plano do dia ---------------- */

export function saveDayPlan(plan: DayPlan) {
  setState((s) => ({ ...s, dayPlans: pruneByDate({ ...s.dayPlans, [plan.date]: plan }, 14) }));
}

/** Aceita o plano: prioridades vão para o dia e as tarefas encaixadas recebem horário. */
export function acceptDayPlan(plan: DayPlan) {
  const st = getState();
  const slotOf = new Map(plan.slots.map((x) => [x.taskId, x]));
  const prio = new Set(plan.priorities);
  setState((s) => ({
    ...s,
    tasks: s.tasks.map((t) => {
      const slot = slotOf.get(t.id);
      if (!slot && !prio.has(t.id)) return t;
      return {
        ...t,
        due: plan.date,
        ...(slot ? { time: slot.start, remind: t.remind ?? st.settings.defaultTaskRemind } : {}),
        ...(prio.has(t.id) && t.priority < 3 ? { priority: 3 as const } : {}),
      };
    }),
    dayPlans: pruneByDate({ ...s.dayPlans, [plan.date]: { ...plan, status: 'accepted' } }, 14),
  }));
}

export function dismissDayPlan(plan: DayPlan) {
  saveDayPlan({ ...plan, status: 'dismissed' });
}

function pruneByDate<T>(rec: Record<string, T>, keep: number): Record<string, T> {
  const keys = Object.keys(rec).sort().slice(-keep);
  return Object.fromEntries(keys.map((k) => [k, rec[k]]));
}

/* ---------------- Modo foco ---------------- */

export function startFocus(f: { title: string; taskId?: string; goalId?: string; minutes: number }) {
  const now = Date.now();
  const focus: ActiveFocus = { ...f, start: now, until: now + f.minutes * 60_000 };
  setState((s) => ({ ...s, focus }));
}

export function pauseFocus() {
  setState((s) => (s.focus && s.focus.pausedLeft === undefined ? { ...s, focus: { ...s.focus, pausedLeft: Math.max(0, s.focus.until - Date.now()) } } : s));
}

export function resumeFocus() {
  setState((s) => (s.focus && s.focus.pausedLeft !== undefined ? { ...s, focus: { ...s.focus, until: Date.now() + s.focus.pausedLeft, pausedLeft: undefined } } : s));
}

export function extendFocus(min: number) {
  setState((s) =>
    s.focus
      ? {
          ...s,
          focus: {
            ...s.focus,
            minutes: s.focus.minutes + min,
            ...(s.focus.pausedLeft !== undefined ? { pausedLeft: s.focus.pausedLeft + min * 60_000 } : { until: s.focus.until + min * 60_000 }),
          },
        }
      : s,
  );
}

/** metas medidas em tempo recebem os minutos focados */
const TIME_UNIT = /^(h|hs|hr|hrs|hora|horas|min|mins|minuto|minutos)$/i;

/** Encerra o foco. Retorna os minutos registrados. */
export function finishFocus(): number {
  const s0 = getState();
  const f = s0.focus;
  if (!f) return 0;
  const now = Date.now();
  const left = f.pausedLeft ?? Math.max(0, f.until - now);
  const minutes = Math.max(0, Math.round((f.minutes * 60_000 - left) / 60_000));
  const goalId = f.goalId ?? (f.taskId ? s0.tasks.find((t) => t.id === f.taskId)?.goalId : undefined);
  setState((s) => ({
    ...s,
    focus: null,
    focusSessions:
      minutes > 0
        ? [...s.focusSessions, { id: uid(), title: f.title, taskId: f.taskId, goalId, start: new Date(f.start).toISOString(), end: new Date(now).toISOString(), minutes }].slice(-500)
        : s.focusSessions,
  }));
  if (goalId && minutes > 0) {
    const g = getState().goals.find((x) => x.id === goalId);
    if (g && g.kind === 'numeric' && g.status === 'active' && TIME_UNIT.test((g.unit ?? '').trim())) {
      const hours = /^h/i.test(g.unit!.trim());
      bumpGoal(goalId, hours ? +(minutes / 60).toFixed(2) : minutes);
    }
  }
  return minutes;
}

/* ---------------- Diário ---------------- */

export function saveJournal(date: string, e: Omit<JournalEntry, 'at'>) {
  setState((s) => ({ ...s, journal: { ...s.journal, [date]: { ...e, at: nowIso() } } }));
}

/* ---------------- Lugares ---------------- */

export function addPlace(p: Omit<Place, 'id'>): Place {
  const place = { ...p, id: uid() };
  setState((s) => ({ ...s, places: [...s.places, place] }));
  return place;
}

export function deletePlace(id: string) {
  setState((s) => ({
    ...s,
    places: s.places.filter((p) => p.id !== id),
    reminders: s.reminders.filter((r) => r.place?.placeId !== id || r.done),
  }));
}

/* ---------------- Metas: recálculo ---------------- */

export function changeGoalDeadline(id: string, deadline: string) {
  updateGoal(id, { deadline });
  toast({ title: 'Prazo atualizado', body: relativeDay(deadline), icon: 'check' });
}

/** Quebra o que falta de uma meta numérica em etapas com valor e data. */
export function splitGoalIntoSteps(id: string, steps: { value: number; due: string; title: string }[]) {
  setState((s) => ({
    ...s,
    goals: patchList(s.goals, id, (g) =>
      finalizeGoal({
        ...g,
        milestones: [...g.milestones.filter((m) => m.done || m.value === undefined), ...steps.map((x) => ({ id: uid(), title: x.title, done: false, due: x.due, value: x.value }))],
      }),
    ),
  }));
  toast({ title: `${steps.length} etapas criadas`, body: 'O Rudge marca cada uma sozinho quando você chegar lá.', icon: 'check' });
}

export function markRetroSeen(month: string) {
  setState((s) => (s.seenRetro && s.seenRetro >= month ? s : { ...s, seenRetro: month }));
}
