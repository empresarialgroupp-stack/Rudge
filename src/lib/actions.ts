// Mutações do estado. Toda escrita passa por aqui.
import type { AppState, Goal, Habit, InboxItem, Milestone, Reminder, Settings, Snooze, Task } from './types';
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
    let goals = s.goals;
    if (habit.goalId) {
      goals = patchList(goals, habit.goalId, (g) => {
        if (!g.habitCounts || g.kind !== 'numeric') return g;
        const cur = (g.current ?? g.startValue ?? 0) + (want ? 1 : -1);
        return finalizeGoal({ ...g, current: cur, log: [...g.log, { date: nowIso(), value: cur, note: habit.title }] });
      });
    }
    return { ...s, goals, habits: patchList(s.habits, id, { log }) };
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
