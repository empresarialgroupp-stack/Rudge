import type { AreaKey, Goal, Habit } from './types';
import { addDaysKey, diffDays, todayKey } from './date';

export const AREAS: { key: AreaKey; label: string }[] = [
  { key: 'saude', label: 'Saúde' },
  { key: 'financas', label: 'Finanças' },
  { key: 'carreira', label: 'Carreira' },
  { key: 'estudos', label: 'Estudos' },
  { key: 'pessoal', label: 'Pessoal' },
  { key: 'relacionamentos', label: 'Relações' },
  { key: 'casa', label: 'Casa' },
];

export const AREA_LABEL: Record<AreaKey, string> = Object.fromEntries(
  AREAS.map((a) => [a.key, a.label]),
) as Record<AreaKey, string>;

const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));

export function goalProgress(g: Goal): number {
  if (g.kind === 'numeric') {
    const start = g.startValue ?? 0;
    const target = g.target ?? 0;
    const cur = g.current ?? start;
    if (target === start) return cur === target ? 1 : 0;
    return clamp((cur - start) / (target - start));
  }
  if (!g.milestones.length) return g.status === 'done' ? 1 : 0;
  return g.milestones.filter((m) => m.done).length / g.milestones.length;
}

export type PaceStatus = 'done' | 'ahead' | 'on' | 'behind' | 'overdue' | 'open';

export interface Pace {
  status: PaceStatus;
  progress: number;
  expected: number;
  daysLeft?: number;
  /** quanto precisa avançar por semana (metas numéricas) */
  perWeek?: number;
  /** quanto precisa avançar por dia (metas numéricas) */
  perDay?: number;
  label: string;
  advice: string;
}

export function fmtNum(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: Math.abs(n) < 10 ? 1 : 0 });
}

export function goalPace(g: Goal, today = todayKey()): Pace {
  const progress = goalProgress(g);
  if (g.status === 'done' || progress >= 1) {
    return { status: 'done', progress: 1, expected: 1, label: 'Concluída', advice: 'Meta alcançada. Hora de definir o próximo nível.' };
  }
  if (!g.deadline) {
    return { status: 'open', progress, expected: progress, label: 'Sem prazo', advice: 'Defina um prazo para o Rudge calcular seu ritmo.' };
  }
  const total = Math.max(1, diffDays(g.deadline, g.start));
  const elapsed = clamp(diffDays(today, g.start), 0, total);
  const expected = clamp(elapsed / total);
  const daysLeft = diffDays(g.deadline, today);

  let perWeek: number | undefined;
  let perDay: number | undefined;
  if (g.kind === 'numeric' && g.target !== undefined) {
    const remaining = g.target - (g.current ?? g.startValue ?? 0);
    const d = Math.max(1, daysLeft);
    perDay = remaining / d;
    perWeek = remaining / Math.max(1, d / 7);
  }

  const unit = g.unit ? ` ${g.unit}` : '';
  let advice: string;
  if (g.kind === 'numeric' && perWeek !== undefined) {
    const abs = Math.abs(perWeek);
    advice =
      daysLeft <= 7
        ? `Faltam ${fmtNum(Math.abs(perDay ?? 0))}${unit} por dia para fechar no prazo.`
        : `Ritmo necessário: ${fmtNum(abs)}${unit} por semana até ${fmtDeadline(g.deadline)}.`;
  } else {
    const left = g.milestones.filter((m) => !m.done).length;
    const weeks = Math.max(1, Math.ceil(Math.max(daysLeft, 1) / 7));
    advice = left
      ? `Conclua ~${Math.ceil(left / weeks)} etapa(s) por semana — restam ${left}.`
      : 'Adicione etapas para acompanhar o progresso.';
  }

  if (daysLeft < 0) {
    return { status: 'overdue', progress, expected: 1, daysLeft, perWeek, perDay, label: 'Prazo vencido', advice: 'O prazo passou. Ajuste a data ou finalize a meta.' };
  }
  const delta = progress - expected;
  let status: PaceStatus = 'on';
  let label = 'No ritmo';
  if (delta >= 0.08) {
    status = 'ahead';
    label = 'Adiantada';
  } else if (delta < -0.1) {
    status = 'behind';
    label = `Atrasada ${Math.round(-delta * 100)}%`;
  }
  return { status, progress, expected, daysLeft, perWeek, perDay, label, advice };
}

function fmtDeadline(key: string) {
  const [y, m, d] = key.split('-');
  return `${d}/${m}${Number(y) !== new Date().getFullYear() ? `/${y}` : ''}`;
}

/** Sequência atual de um hábito (dias programados consecutivos concluídos). */
export function habitStreak(h: Habit, today = todayKey()): number {
  const set = new Set(h.log);
  let streak = 0;
  let key = today;
  // hoje ainda não feito não quebra a sequência
  if (!set.has(key)) key = addDaysKey(key, -1);
  for (let i = 0; i < 730; i++) {
    const dow = new Date(key + 'T12:00').getDay();
    if (h.days.includes(dow)) {
      if (set.has(key)) streak++;
      else break;
    }
    key = addDaysKey(key, -1);
  }
  return streak;
}

export function habitBestStreak(h: Habit): number {
  if (!h.log.length) return 0;
  const set = new Set(h.log);
  const sorted = [...h.log].sort();
  let best = 0;
  let cur = 0;
  let key = sorted[0];
  const end = todayKey();
  for (let i = 0; i < 1500 && key <= end; i++) {
    const dow = new Date(key + 'T12:00').getDay();
    if (h.days.includes(dow)) {
      if (set.has(key)) {
        cur++;
        best = Math.max(best, cur);
      } else if (key !== end) cur = 0;
    }
    key = addDaysKey(key, 1);
  }
  return best;
}

/** Taxa de conclusão nos últimos N dias programados. */
export function habitRate(h: Habit, days = 30, today = todayKey()): number {
  const set = new Set(h.log);
  let scheduled = 0;
  let done = 0;
  for (let i = 0; i < days; i++) {
    const key = addDaysKey(today, -i);
    if (key < h.createdAt.slice(0, 10)) break;
    const dow = new Date(key + 'T12:00').getDay();
    if (!h.days.includes(dow)) continue;
    if (i === 0 && !set.has(key)) continue; // hoje ainda em aberto
    scheduled++;
    if (set.has(key)) done++;
  }
  return scheduled ? done / scheduled : 0;
}

export function isHabitDueOn(h: Habit, key: string): boolean {
  return !h.archived && h.days.includes(new Date(key + 'T12:00').getDay());
}

export interface Recalc {
  /** ritmo necessário agora (por dia / semana) para fechar no prazo */
  perDayNow: number;
  perWeekNow: number;
  /** ritmo planejado no início */
  perDayPlan: number;
  /** ritmo real até aqui (por dia) */
  perDayReal: number;
  /** prazo que mantém o seu ritmo real (YYYY-MM-DD) */
  newDeadline?: string;
  /** etapas sugeridas até o prazo atual */
  steps: { value: number; due: string; title: string }[];
  message: string;
}

/** Para metas fora do ritmo: novo ritmo, novo prazo e etapas menores. */
export function recalcGoal(g: Goal, today = todayKey()): Recalc | null {
  if (g.status !== 'active' || !g.deadline) return null;
  const pace = goalPace(g, today);
  if (pace.status !== 'behind' && pace.status !== 'overdue') return null;
  const unit = g.unit ? ` ${g.unit}` : '';
  const elapsed = Math.max(1, diffDays(today, g.start));
  const daysLeft = Math.max(1, diffDays(g.deadline, today));
  const total = Math.max(1, diffDays(g.deadline, g.start));

  if (g.kind === 'numeric' && g.target !== undefined) {
    const start = g.startValue ?? 0;
    const cur = g.current ?? start;
    const remaining = g.target - cur;
    const perDayNow = remaining / daysLeft;
    const perDayPlan = (g.target - start) / total;
    const perDayReal = (cur - start) / elapsed;
    const newDeadline = perDayReal > 0 && Math.sign(perDayReal) === Math.sign(remaining) ? addDaysKey(today, Math.ceil(remaining / perDayReal)) : undefined;
    const n = Math.max(2, Math.min(6, Math.round(daysLeft / 7) || 2));
    const steps = Array.from({ length: n }, (_, i) => {
      const value = +(cur + (remaining * (i + 1)) / n).toFixed(remaining / n >= 10 ? 0 : 1);
      return { value, due: addDaysKey(today, Math.round((daysLeft * (i + 1)) / n)), title: `Chegar a ${fmtNum(value)}${unit}` };
    });
    const msg =
      perDayPlan !== 0
        ? `Agora são ${fmtNum(Math.abs(perDayNow))}${unit} por dia (o plano era ${fmtNum(Math.abs(perDayPlan))}${unit}).`
        : `Faltam ${fmtNum(Math.abs(remaining))}${unit} em ${daysLeft} dias.`;
    return { perDayNow, perWeekNow: perDayNow * 7, perDayPlan, perDayReal, newDeadline: newDeadline && newDeadline > g.deadline ? newDeadline : undefined, steps, message: msg };
  }

  // metas por etapas: prazo pelo ritmo real de etapas concluídas
  const done = g.milestones.filter((m) => m.done).length;
  const left = g.milestones.length - done;
  const rate = done / elapsed;
  const newDeadline = rate > 0 ? addDaysKey(today, Math.ceil(left / rate)) : addDaysKey(g.deadline, Math.max(7, Math.round(total * 0.25)));
  return {
    perDayNow: left / daysLeft,
    perWeekNow: (left / daysLeft) * 7,
    perDayPlan: g.milestones.length / total,
    perDayReal: rate,
    newDeadline: newDeadline > g.deadline ? newDeadline : undefined,
    steps: [],
    message: `Faltam ${left} ${left === 1 ? 'etapa' : 'etapas'} em ${daysLeft} dias — cerca de ${fmtNum((left / daysLeft) * 7)} por semana.`,
  };
}
