import type { Repeat } from './types';
import { addDays, startOfDay } from './date';

export interface RecurrenceRule {
  /** âncora: data/hora da primeira ocorrência (ms) */
  at: number;
  repeat: Repeat;
  days?: number[];
}

export const REPEAT_LABEL: Record<Repeat, string> = {
  none: 'Não repetir',
  daily: 'Todo dia',
  weekdays: 'Dias úteis',
  weekly: 'Semanal',
  monthly: 'Mensal',
  yearly: 'Anual',
};

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

function matchesDay(rule: RecurrenceRule, day: Date, anchor: Date): boolean {
  const dow = day.getDay();
  switch (rule.repeat) {
    case 'daily':
      return true;
    case 'weekdays':
      return dow >= 1 && dow <= 5;
    case 'weekly': {
      const days = rule.days && rule.days.length ? rule.days : [anchor.getDay()];
      return days.includes(dow);
    }
    case 'monthly': {
      const target = Math.min(anchor.getDate(), daysInMonth(day.getFullYear(), day.getMonth()));
      return day.getDate() === target;
    }
    case 'yearly': {
      if (day.getMonth() !== anchor.getMonth()) return false;
      const target = Math.min(anchor.getDate(), daysInMonth(day.getFullYear(), day.getMonth()));
      return day.getDate() === target;
    }
    default:
      return false;
  }
}

function atTime(day: Date, anchor: Date): number {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    anchor.getHours(),
    anchor.getMinutes(),
    0,
    0,
  ).getTime();
}

/** Todas as ocorrências em [from, to] (inclusive). */
export function occurrencesBetween(rule: RecurrenceRule, from: number, to: number): number[] {
  if (rule.repeat === 'none') {
    return rule.at >= from && rule.at <= to ? [rule.at] : [];
  }
  const anchor = new Date(rule.at);
  const out: number[] = [];
  let day = startOfDay(new Date(Math.max(from, startOfDay(anchor).getTime())));
  const end = to;
  // limite de segurança (2 anos de dias)
  for (let i = 0; i < 800 && day.getTime() <= end; i++) {
    if (matchesDay(rule, day, anchor)) {
      const t = atTime(day, anchor);
      if (t >= from && t <= to && t >= rule.at) out.push(t);
    }
    day = addDays(day, 1);
  }
  return out;
}

/** Próxima ocorrência estritamente depois de `after` (ou null). */
export function nextOccurrence(rule: RecurrenceRule, after: number): number | null {
  if (rule.repeat === 'none') return rule.at > after ? rule.at : null;
  const list = occurrencesBetween(rule, after + 1, after + 400 * 86_400_000);
  return list.length ? list[0] : null;
}

/** Última ocorrência em ou antes de `before` (ou null). */
export function prevOccurrence(rule: RecurrenceRule, before: number): number | null {
  if (rule.repeat === 'none') return rule.at <= before ? rule.at : null;
  const list = occurrencesBetween(rule, Math.max(rule.at, before - 400 * 86_400_000), before);
  return list.length ? list[list.length - 1] : null;
}

export function describeRule(rule: RecurrenceRule): string {
  if (rule.repeat === 'weekly') {
    const names = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    const days = rule.days && rule.days.length ? rule.days : [new Date(rule.at).getDay()];
    if (days.length === 7) return 'Todo dia';
    return 'Toda ' + [...days].sort().map((d) => names[d]).join(', ');
  }
  return REPEAT_LABEL[rule.repeat];
}
