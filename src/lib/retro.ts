// Retrospectiva do mês ("Wrapped"): números do mês a partir do estado.
import type { AppState, Goal } from './types';
import { addDays, dateKey, MONTHS, startOfWeek } from './date';
import { AREA_LABEL, goalProgress } from './goals';

export interface MonthStats {
  month: string; // YYYY-MM
  label: string; // "outubro"
  year: number;
  tasksDone: number;
  remindersDone: number;
  habitCheckins: number;
  activeDays: number;
  bestStreak: { title: string; days: number } | null;
  topGoal: { id: string; title: string; from: number; to: number } | null;
  bestWeek: { start: string; count: number; weeks: { start: string; count: number }[] } | null;
  focusMinutes: number;
  journal: { avg: number; days: number; best?: string } | null;
  topArea: string | null;
  busiestWeekday: string | null;
}

export const prevMonth = (d = new Date()) => {
  const p = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}`;
};

/** Progresso de uma meta numa data (pelo histórico de registros). */
function progressAt(g: Goal, iso: string): number {
  if (g.kind !== 'numeric') {
    const done = g.milestones.filter((m) => m.done && m.doneAt && m.doneAt <= iso).length;
    return g.milestones.length ? done / g.milestones.length : 0;
  }
  const logs = g.log.filter((l) => l.date <= iso && !(l.value === 0 && l.note === 'Etapa atualizada'));
  const value = logs.length ? logs[logs.length - 1].value : (g.startValue ?? 0);
  return goalProgress({ ...g, current: value });
}

export function monthStats(s: AppState, month: string): MonthStats {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  const inMonth = (iso?: string) => !!iso && Date.parse(iso) >= start.getTime() && Date.parse(iso) < end.getTime();
  const keyIn = (k: string) => k.startsWith(month);

  const tasks = s.tasks.filter((t) => t.done && inMonth(t.doneAt));
  const remindersDone = s.reminders.filter((r) => r.done && inMonth(r.doneAt)).length;
  const habitCheckins = s.habits.reduce((n, h) => n + h.log.filter(keyIn).length, 0);

  // dias com alguma conclusão + dia da semana mais produtivo
  const perDay = new Map<string, number>();
  const bump = (k: string) => perDay.set(k, (perDay.get(k) ?? 0) + 1);
  tasks.forEach((t) => bump(dateKey(new Date(t.doneAt!))));
  s.habits.forEach((h) => h.log.filter(keyIn).forEach(bump));
  const byDow = new Array(7).fill(0);
  for (const [k, n] of perDay) byDow[new Date(k + 'T12:00').getDay()] += n;
  const maxDow = Math.max(...byDow);
  const WD = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  // maior sequência de um hábito dentro do mês
  let bestStreak: MonthStats['bestStreak'] = null;
  for (const h of s.habits) {
    const set = new Set(h.log);
    let cur = 0;
    let best = 0;
    for (let d = new Date(start); d < end; d = addDays(d, 1)) {
      if (!h.days.includes(d.getDay())) continue;
      if (set.has(dateKey(d))) best = Math.max(best, ++cur);
      else cur = 0;
    }
    if (best > (bestStreak?.days ?? 0)) bestStreak = { title: h.title, days: best };
  }

  // meta que mais avançou
  let topGoal: MonthStats['topGoal'] = null;
  const startIso = new Date(start.getTime() - 1).toISOString();
  const endIso = new Date(end.getTime() - 1).toISOString();
  for (const g of s.goals) {
    if (g.createdAt >= endIso) continue;
    const from = g.createdAt >= startIso ? 0 : progressAt(g, startIso);
    const to = progressAt(g, endIso);
    if (to - from > (topGoal ? topGoal.to - topGoal.from : 0.0001)) topGoal = { id: g.id, title: g.title, from, to };
  }

  // melhor semana
  const weeks: { start: string; count: number }[] = [];
  for (let w = startOfWeek(start); w < end; w = addDays(w, 7)) {
    let c = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(w, i);
      if (d >= start && d < end) c += perDay.get(dateKey(d)) ?? 0;
    }
    weeks.push({ start: dateKey(w), count: c });
  }
  const top = weeks.reduce<{ start: string; count: number } | null>((b, w) => (!b || w.count > b.count ? w : b), null);

  const focusMinutes = s.focusSessions.filter((f) => inMonth(f.start)).reduce((n, f) => n + f.minutes, 0);
  const jEntries = Object.entries(s.journal).filter(([k]) => keyIn(k));
  const journal = jEntries.length
    ? {
        avg: jEntries.reduce((n, [, e]) => n + e.score, 0) / jEntries.length,
        days: jEntries.length,
        best: [...jEntries].sort((a, b) => b[1].score - a[1].score)[0]?.[1].good || undefined,
      }
    : null;

  // área com mais conclusões
  const areaCount: Record<string, number> = {};
  for (const t of tasks) {
    const a = t.area ?? (t.goalId ? s.goals.find((g) => g.id === t.goalId)?.area : undefined);
    if (a) areaCount[a] = (areaCount[a] ?? 0) + 1;
  }
  for (const h of s.habits) {
    const a = h.area ?? (h.goalId ? s.goals.find((g) => g.id === h.goalId)?.area : undefined);
    if (a) areaCount[a] = (areaCount[a] ?? 0) + h.log.filter(keyIn).length;
  }
  const topAreaKey = Object.entries(areaCount).sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    month,
    label: MONTHS[m - 1],
    year: y,
    tasksDone: tasks.length,
    remindersDone,
    habitCheckins,
    activeDays: perDay.size,
    bestStreak,
    topGoal,
    bestWeek: top && top.count > 0 ? { ...top, weeks } : null,
    focusMinutes,
    journal,
    topArea: topAreaKey ? AREA_LABEL[topAreaKey as keyof typeof AREA_LABEL] : null,
    busiestWeekday: maxDow > 0 ? WD[byDow.indexOf(maxDow)] : null,
  };
}
