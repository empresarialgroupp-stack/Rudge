// Utilitários de data — sempre no fuso local do usuário.

export const DAY = 86_400_000;
export const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const WEEKDAYS_MIN = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
export const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD no fuso local */
export function dateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(): string {
  return dateKey(new Date());
}

/** Converte YYYY-MM-DD (+ HH:MM opcional) em Date local */
export function parseKey(key: string, time?: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  const [hh, mm] = (time ?? '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function addDaysKey(key: string, n: number): string {
  return dateKey(addDays(parseKey(key), n));
}

export function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

/** Segunda-feira da semana de `d` */
export function startOfWeek(d: Date): Date {
  const r = startOfDay(d);
  const wd = (r.getDay() + 6) % 7; // segunda = 0
  r.setDate(r.getDate() - wd);
  return r;
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseKey(a).getTime() - parseKey(b).getTime()) / DAY);
}

export function timeOf(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "hoje", "amanhã", "ontem", "seg, 12 out" */
export function relativeDay(key: string): string {
  const diff = diffDays(key, todayKey());
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';
  const d = parseKey(key);
  if (diff > 1 && diff < 7) return capitalize(WEEKDAYS[d.getDay()]);
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

export function longDate(d: Date = new Date()): string {
  return `${capitalize(WEEKDAYS[d.getDay()])}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export function shortDate(key: string): string {
  const d = parseKey(key);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}${sameYear ? '' : ` ${d.getFullYear()}`}`;
}

/** "Hoje às 14:30", "Amanhã às 09:00", "Seg, 12 out às 10:00" */
export function formatWhen(ms: number): string {
  const d = new Date(ms);
  return `${relativeDay(dateKey(d))} às ${timeOf(d)}`;
}

/** "em 12 min", "há 3 h" */
export function fromNow(ms: number, now = Date.now()): string {
  const diff = ms - now;
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60_000);
  let txt: string;
  if (min < 1) txt = 'agora';
  else if (min < 60) txt = `${min} min`;
  else if (min < 60 * 24) txt = `${Math.round(min / 60)} h`;
  else txt = `${Math.round(min / 1440)} d`;
  if (txt === 'agora') return 'agora';
  return diff >= 0 ? `em ${txt}` : `há ${txt}`;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function greeting(d: Date = new Date()): string {
  const h = d.getHours();
  if (h < 5) return 'Boa noite';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** dd/mm/aaaa → valor de <input type="date"> já é YYYY-MM-DD; helper para datetime-local */
export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  return `${dateKey(d)}T${timeOf(d)}`;
}

export function fromLocalInput(v: string): number {
  const [k, t] = v.split('T');
  return parseKey(k, t).getTime();
}
