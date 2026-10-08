// Textos de resumo do dia (topo do Início).
import type { AppState } from './types';
import { fromNow, greeting, longDate, todayKey } from './date';
import { occurrencesBetween } from './recurrence';

export function displayName(s: AppState, email = ''): string {
  const raw = s.settings.name.trim() || email.split('@')[0].replace(/[._-]+/g, ' ');
  const first = raw.split(' ')[0] ?? '';
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
}

export function greetingTitle(s: AppState, email = ''): string {
  const n = displayName(s, email);
  return `${greeting()}${n ? `, ${n}` : ''}.`;
}

export function nextReminderAt(s: AppState, now = Date.now()): number | undefined {
  let best: number | undefined;
  for (const r of s.reminders) {
    if (r.done) continue;
    const ack = r.ackUntil ? Date.parse(r.ackUntil) : 0;
    for (const at of occurrencesBetween({ at: Date.parse(r.at), repeat: r.repeat, days: r.days }, now - 6 * 3_600_000, now + 3 * 86_400_000)) {
      if (at > ack && (at > now || r.repeat === 'none') && (best === undefined || at < best)) best = at;
    }
  }
  return best;
}

export function todaySummary(s: AppState): string {
  const today = todayKey();
  const n = s.tasks.filter((t) => !t.done && t.due && t.due <= today).length;
  const next = nextReminderAt(s);
  const parts = [longDate(), n ? `${n} ${n === 1 ? 'tarefa' : 'tarefas'} para hoje` : 'nenhuma tarefa pendente para hoje'];
  if (next !== undefined) parts.push(`próximo lembrete ${fromNow(next)}`);
  return parts.join(' · ');
}
