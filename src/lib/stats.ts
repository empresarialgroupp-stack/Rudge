// Números do painel: conclusões por dia/semana/mês (tarefas, hábitos, lembretes).
import type { AppState } from './types';
import { addDays, capitalize, dateKey, MONTHS, startOfDay, startOfWeek } from './date';

/** Contagem diária dos últimos `days` dias (o último é hoje). */
export function dailyCounts(s: AppState, days: number, now = new Date()) {
  const keys = Array.from({ length: days }, (_, i) => dateKey(addDays(startOfDay(now), i - days + 1)));
  const idx = new Map(keys.map((k, i) => [k, i]));
  const tasks = new Array(days).fill(0);
  const habits = new Array(days).fill(0);
  for (const t of s.tasks) {
    const i = t.doneAt ? idx.get(dateKey(new Date(t.doneAt))) : undefined;
    if (i !== undefined) tasks[i]++;
  }
  for (const h of s.habits) for (const d of h.log) {
    const i = idx.get(d);
    if (i !== undefined) habits[i]++;
  }
  return { keys, tasks, habits };
}

export type PeriodMode = 'semanas' | 'meses';

/** Séries para o gráfico de barras: últimas 8 semanas ou últimos 6 meses. */
export function periodSeries(s: AppState, mode: PeriodMode, now = new Date()) {
  const n = mode === 'semanas' ? 8 : 6;
  const starts: Date[] = [];
  if (mode === 'semanas') {
    const w = startOfWeek(now);
    for (let i = n - 1; i >= 0; i--) starts.push(addDays(w, -7 * i));
  } else {
    for (let i = n - 1; i >= 0; i--) starts.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  }
  const ends = starts.map((d, i) => starts[i + 1] ?? (mode === 'semanas' ? addDays(d, 7) : new Date(d.getFullYear(), d.getMonth() + 1, 1)));
  const bucket = (ms: number) => {
    for (let i = 0; i < n; i++) if (ms >= starts[i].getTime() && ms < ends[i].getTime()) return i;
    return -1;
  };
  const tasks = new Array(n).fill(0);
  const habits = new Array(n).fill(0);
  for (const t of s.tasks) {
    if (!t.doneAt) continue;
    const i = bucket(Date.parse(t.doneAt));
    if (i >= 0) tasks[i]++;
  }
  for (const r of s.reminders) {
    if (!r.done || !r.doneAt) continue;
    const i = bucket(Date.parse(r.doneAt));
    if (i >= 0) tasks[i]++;
  }
  for (const h of s.habits) for (const d of h.log) {
    const [y, m, day] = d.split('-').map(Number);
    const i = bucket(new Date(y, m - 1, day, 12).getTime());
    if (i >= 0) habits[i]++;
  }
  const labels = starts.map((d) => (mode === 'semanas' ? `${d.getDate()}/${d.getMonth() + 1}` : capitalize(MONTHS[d.getMonth()].slice(0, 3))));
  return { labels, tasks, habits };
}

/** Série diária detalhada para gráficos de linha (últimos `days` dias). */
export function dailyBreakdown(s: AppState, days: number, now = new Date()) {
  const base = dailyCounts(s, days, now);
  const idx = new Map(base.keys.map((k, i) => [k, i]));
  const reminders = new Array(days).fill(0);
  for (const r of s.reminders) {
    const i = r.done && r.doneAt ? idx.get(dateKey(new Date(r.doneAt))) : undefined;
    if (i !== undefined) reminders[i]++;
  }
  // hábitos programados por dia (ativos, já criados, no dia da semana certo)
  const scheduled = base.keys.map((k) => {
    const [y, m, d] = k.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    return s.habits.filter((h) => !h.archived && h.days.includes(dow) && h.createdAt.slice(0, 10) <= k).length;
  });
  const labels = base.keys.map((k) => `${Number(k.slice(8))}/${Number(k.slice(5, 7))}`);
  return { ...base, labels, reminders, scheduled };
}
