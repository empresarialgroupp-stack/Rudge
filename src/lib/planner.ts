// Plano do dia: escolhe 3 prioridades e encaixa as tarefas nos horários livres
// entre lembretes, compromissos com hora e hábitos.
import type { AppState, DayPlan, Task } from './types';
import { diffDays, parseKey, timeOf } from './date';
import { goalPace } from './goals';
import { occurrencesBetween } from './recurrence';

const MIN = 60_000;
const STEP = 15 * MIN;
const BUFFER = 10 * MIN;

/** Duração estimada de uma tarefa (min). */
export function estimateMinutes(t: Task): number {
  const subs = t.subtasks?.filter((x) => !x.done).length ?? 0;
  const base = t.priority === 3 ? 60 : t.priority === 2 ? 45 : 30;
  return Math.min(120, base + subs * 10);
}

/** Pontuação de importância para o dia. */
export function scoreTask(s: AppState, t: Task, date: string): number {
  let n = t.priority * 4;
  if (t.due) {
    const late = diffDays(date, t.due);
    if (late > 0) n += 6 + Math.min(late, 7) * 2; // atrasada
    else if (late === 0) n += 5;
    else n -= Math.min(-late, 7); // futura: perde força
  }
  const g = t.goalId ? s.goals.find((x) => x.id === t.goalId) : undefined;
  if (g && g.status === 'active') {
    const st = goalPace(g, date).status;
    n += st === 'behind' || st === 'overdue' ? 9 : 3;
  }
  return n;
}

interface Busy {
  start: number;
  end: number;
}

function busyBlocks(s: AppState, date: string): Busy[] {
  const dayStart = parseKey(date).getTime();
  const dayEnd = dayStart + 24 * 60 * MIN - 1;
  const out: Busy[] = [];
  for (const r of s.reminders) {
    if (r.done || r.place) continue;
    const ack = r.ackUntil ? Date.parse(r.ackUntil) : 0;
    for (const at of occurrencesBetween({ at: Date.parse(r.at), repeat: r.repeat, days: r.days }, dayStart, dayEnd)) if (at > ack) out.push({ start: at, end: at + 15 * MIN });
  }
  for (const t of s.tasks) {
    if (t.done || t.due !== date || !t.time) continue;
    const at = parseKey(date, t.time).getTime();
    out.push({ start: at, end: at + estimateMinutes(t) * MIN });
  }
  const dow = new Date(dayStart).getDay();
  for (const h of s.habits) {
    if (h.archived || !h.remind || !h.days.includes(dow) || h.log.includes(date)) continue;
    const at = parseKey(date, h.time).getTime();
    out.push({ start: at, end: at + 15 * MIN });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Monta o plano sugerido para o dia (não altera nada). */
export function buildDayPlan(s: AppState, date: string, now = Date.now()): DayPlan & { startsAt?: string } {
  const open = s.tasks.filter((t) => !t.done && (!t.due || t.due <= date));
  const ranked = [...open].sort((a, b) => scoreTask(s, b, date) - scoreTask(s, a, date));
  // tarefas sem data só entram se forem de meta ou alta prioridade
  const relevant = ranked.filter((t) => t.due || t.goalId || t.priority >= 2);
  const priorities = relevant.slice(0, 3).map((t) => t.id);

  const winStart = parseKey(date, s.settings.plan.start).getTime();
  const winEnd = parseKey(date, s.settings.plan.end).getTime();
  let cursor = Math.max(winStart, Math.ceil((now + 5 * MIN) / STEP) * STEP);
  const busy = busyBlocks(s, date);

  // o que precisa de horário: prioridades + o resto do dia, sem hora marcada
  const toPlace = relevant.filter((t) => !(t.due === date && t.time)).slice(0, 8);
  const slots: DayPlan['slots'] = [];
  for (const t of toPlace) {
    const dur = estimateMinutes(t) * MIN;
    let placed = false;
    while (cursor + dur <= winEnd) {
      const clash = busy.find((b) => b.start < cursor + dur + BUFFER && b.end + BUFFER > cursor);
      if (!clash) {
        slots.push({ taskId: t.id, start: timeOf(new Date(cursor)), end: timeOf(new Date(cursor + dur)) });
        busy.push({ start: cursor, end: cursor + dur });
        busy.sort((a, b) => a.start - b.start);
        cursor = Math.ceil((cursor + dur + BUFFER) / STEP) * STEP;
        placed = true;
        break;
      }
      cursor = Math.ceil((clash.end + BUFFER) / STEP) * STEP;
    }
    if (!placed) break;
  }

  const firsts = [...slots.map((x) => parseKey(date, x.start).getTime()), ...busy.filter((b) => b.start >= winStart).map((b) => b.start)];
  const startsAt = firsts.length ? timeOf(new Date(Math.min(...firsts))) : undefined;
  return { date, status: 'proposed', priorities, slots, createdAt: new Date(now).toISOString(), startsAt };
}

/** Plano salvo (ajustado/aceito) ou o sugerido agora. */
export function currentPlan(s: AppState, date: string, now = Date.now()) {
  const saved = s.dayPlans[date];
  if (saved) {
    // descarta itens que já não existem ou foram concluídos fora do plano
    const alive = (id: string) => s.tasks.some((t) => t.id === id);
    return { ...saved, priorities: saved.priorities.filter(alive), slots: saved.slots.filter((x) => alive(x.taskId)) };
  }
  return buildDayPlan(s, date, now);
}

/** "3 prioridades, começa às 9h" */
export function planSummary(plan: { priorities: string[]; slots: { start: string }[]; startsAt?: string }) {
  const n = plan.priorities.length;
  const start = plan.startsAt ?? plan.slots[0]?.start;
  const hour = start ? (start.endsWith(':00') ? `${Number(start.slice(0, 2))}h` : start) : '';
  if (!n && !start) return 'Dia livre — que tal avançar em uma meta?';
  return [n ? `${n} ${n === 1 ? 'prioridade' : 'prioridades'}` : '', hour ? `começa às ${hour}` : ''].filter(Boolean).join(', ');
}
