// Aprende os horários reais: quando você conclui ou adia lembretes e hábitos,
// o Rudge propõe um horário melhor.
import type { AppState } from './types';
import { timeOf } from './date';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

export interface RetimeSuggestion {
  kind: 'reminder' | 'habit';
  id: string;
  title: string;
  from: string;
  to: string;
  reason: string;
}

const minutesOfDay = (ms: number) => {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
};
const toHHMM = (m: number) => {
  const r = Math.round(m / 15) * 15;
  const c = ((r % 1440) + 1440) % 1440;
  return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`;
};
const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const fmt = (hhmm: string) => (hhmm.endsWith(':00') ? `${Number(hhmm.slice(0, 2))}h` : hhmm.replace(':', 'h'));

/** Atraso real (min) de cada ocorrência: do horário programado até concluir. */
function delaysFor(s: AppState, kind: 'reminder' | 'habit', id: string, since: number) {
  const byOcc = new Map<number, { snoozes: number; doneAt?: number }>();
  for (const h of s.history) {
    if (h.kind !== kind || h.refId !== id || !h.scheduledAt || h.at < since) continue;
    const occ = byOcc.get(h.scheduledAt) ?? { snoozes: 0 };
    if (h.action === 'snooze') occ.snoozes++;
    else occ.doneAt = h.at;
    byOcc.set(h.scheduledAt, occ);
  }
  const out: { delay: number; snoozes: number }[] = [];
  for (const [at, o] of byOcc) {
    const delay = o.doneAt !== undefined ? (o.doneAt - at) / MIN : NaN;
    if (o.doneAt !== undefined && Math.abs(delay) > 8 * 60) continue; // outro dia: ignora
    out.push({ delay, snoozes: o.snoozes });
  }
  return out;
}

export function retimeSuggestions(s: AppState, now = Date.now()): RetimeSuggestion[] {
  const since = now - 30 * DAY;
  const out: RetimeSuggestion[] = [];

  // lembretes recorrentes que você sempre resolve mais tarde
  for (const r of s.reminders) {
    if (r.done || r.repeat === 'none' || r.place) continue;
    const occ = delaysFor(s, 'reminder', r.id, since);
    const done = occ.filter((o) => !Number.isNaN(o.delay));
    const late = done.filter((o) => o.delay >= 15);
    const snoozed = occ.filter((o) => o.snoozes > 0).length;
    if (done.length < 3 || (late.length < 3 && snoozed < 3) || late.length / done.length < 0.6) continue;
    const shift = median(late.map((o) => o.delay));
    const from = timeOf(new Date(r.at));
    const to = toHHMM(minutesOfDay(Date.parse(r.at)) + shift);
    if (to === from) continue;
    out.push({
      kind: 'reminder',
      id: r.id,
      title: r.title,
      from,
      to,
      reason: snoozed >= 3 ? `Você adiou ${snoozed} vezes nas últimas semanas e costuma resolver por volta das ${fmt(to)}.` : `Nas últimas ${done.length} vezes você resolveu, em média, ${Math.round(shift)} min depois.`,
    });
  }

  // hábitos feitos em outro horário (ou nunca no horário do lembrete)
  const allDone = s.history.filter((h) => h.action === 'done' && h.at >= since).map((h) => minutesOfDay(h.at));
  for (const h of s.habits) {
    if (h.archived || !h.remind) continue;
    const times = s.history.filter((x) => x.kind === 'habit' && x.refId === h.id && x.action === 'done' && x.at >= since).map((x) => minutesOfDay(x.at));
    const [hh, mm] = h.time.split(':').map(Number);
    const set = hh * 60 + mm;
    if (times.length >= 4) {
      const med = median(times);
      if (Math.abs(med - set) >= 45) {
        const to = toHHMM(med);
        out.push({ kind: 'habit', id: h.id, title: h.title, from: h.time, to, reason: `Você costuma fazer por volta das ${fmt(to)}, não às ${fmt(h.time)}.` });
      }
      continue;
    }
    // 14+ dias programados sem nenhum check-in: propõe o horário em que você mais conclui coisas
    const createdDaysAgo = (now - (Date.parse(h.createdAt) || now)) / DAY;
    const recent = h.log.filter((d) => Date.parse(d) >= now - 14 * DAY).length;
    if (createdDaysAgo >= 14 && recent === 0 && allDone.length >= 8) {
      const med = median(allDone);
      const to = toHHMM(med);
      if (Math.abs(med - set) >= 60)
        out.push({ kind: 'habit', id: h.id, title: h.title, from: h.time, to, reason: `Às ${fmt(h.time)} não tem funcionado. ${fmt(to)} é quando você mais conclui coisas.` });
    }
  }
  return out;
}
