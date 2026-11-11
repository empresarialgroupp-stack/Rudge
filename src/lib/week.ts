// Cartão da semana: números dos últimos 7 dias a partir do estado (sem servidor, sem IA).
import type { AppState } from './types';
import { addDaysKey, dateKey, parseKey, todayKey } from './date';
import { habitStreak, isHabitDueOn } from './goals';
import { progressAt } from './retro';

export interface WeekStats {
  /** primeiro e último dia (YYYY-MM-DD) */
  from: string;
  to: string;
  tasksDone: number;
  remindersDone: number;
  habitCheckins: number;
  /** check-ins feitos / previstos (0 a 1); null sem hábitos previstos */
  habitRate: number | null;
  /** maior sequência atual entre os hábitos */
  bestStreak: { title: string; days: number } | null;
  /** metas que avançaram na semana, da que mais andou para a que menos andou */
  goals: { id: string; title: string; from: number; to: number }[];
  focusMinutes: number;
  activeDays: number;
  /** conclusões por dia (7 valores, do mais antigo ao de hoje) */
  perDay: number[];
  journalAvg: number | null;
}

export function weekStats(s: AppState, to = todayKey()): WeekStats {
  const from = addDaysKey(to, -6);
  const days = Array.from({ length: 7 }, (_, i) => addDaysKey(from, i));
  const inWeek = (iso?: string) => {
    if (!iso) return false;
    const k = dateKey(new Date(iso));
    return k >= from && k <= to;
  };
  const counts = new Map<string, number>(days.map((d) => [d, 0]));
  const bump = (k: string) => counts.has(k) && counts.set(k, counts.get(k)! + 1);

  const tasks = s.tasks.filter((t) => t.done && inWeek(t.doneAt));
  tasks.forEach((t) => bump(dateKey(new Date(t.doneAt!))));
  const reminders = s.reminders.filter((r) => r.done && inWeek(r.doneAt));
  reminders.forEach((r) => bump(dateKey(new Date(r.doneAt!))));

  let checkins = 0;
  let due = 0;
  let doneDue = 0;
  for (const h of s.habits) {
    for (const k of days) {
      const hit = h.log.includes(k);
      if (hit) {
        checkins++;
        bump(k);
      }
      if (!h.archived && isHabitDueOn(h, k) && k >= h.createdAt.slice(0, 10)) {
        due++;
        if (hit) doneDue++;
      }
    }
  }

  let bestStreak: WeekStats['bestStreak'] = null;
  for (const h of s.habits) {
    if (h.archived) continue;
    const n = habitStreak(h, to);
    if (n > (bestStreak?.days ?? 0)) bestStreak = { title: h.title, days: n };
  }

  const startIso = new Date(parseKey(from).getTime() - 1).toISOString();
  const endIso = new Date(parseKey(addDaysKey(to, 1)).getTime() - 1).toISOString();
  const goals = s.goals
    .filter((g) => g.createdAt < endIso)
    .map((g) => ({ id: g.id, title: g.title, from: g.createdAt >= startIso ? 0 : progressAt(g, startIso), to: progressAt(g, endIso) }))
    .filter((g) => g.to - g.from > 0.0001)
    .sort((a, b) => b.to - b.from - (a.to - a.from));

  const focusMinutes = s.focusSessions.filter((f) => inWeek(f.start)).reduce((n, f) => n + f.minutes, 0);
  const journal = days.map((k) => s.journal[k]).filter(Boolean);
  const perDay = days.map((k) => counts.get(k) ?? 0);

  return {
    from,
    to,
    tasksDone: tasks.length,
    remindersDone: reminders.length,
    habitCheckins: checkins,
    habitRate: due ? doneDue / due : null,
    bestStreak,
    goals,
    focusMinutes,
    activeDays: perDay.filter((n) => n > 0).length,
    perDay,
    journalAvg: journal.length ? journal.reduce((n, e) => n + e.score, 0) / journal.length : null,
  };
}
