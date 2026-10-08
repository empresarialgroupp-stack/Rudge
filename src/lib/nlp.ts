// Interpretador de linguagem natural em português para criação rápida.
// Ex.: "me lembre de pagar o boleto amanhã às 10h" → título + data + hora.

import type { AreaKey, Priority, Repeat } from './types';
import { addDays, dateKey, timeOf } from './date';

export interface Parsed {
  title: string;
  /** YYYY-MM-DD */
  date?: string;
  /** HH:MM */
  time?: string;
  repeat: Repeat;
  days?: number[];
  priority?: Priority;
  area?: AreaKey;
  /** trechos reconhecidos (para exibir como chips) */
  tokens: string[];
}

const WD: Record<string, number> = {
  domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
};
const MONTHS: Record<string, number> = {
  janeiro: 0, fevereiro: 1, marco: 2, abril: 3, maio: 4, junho: 5, julho: 6,
  agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};
const NUMS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7,
  oito: 8, nove: 9, dez: 10, quinze: 15, vinte: 20, trinta: 30, quarenta: 40, meia: 0.5,
};
const AREAS: Record<string, AreaKey> = {
  saude: 'saude', treino: 'saude', financas: 'financas', dinheiro: 'financas', financeiro: 'financas',
  carreira: 'carreira', trabalho: 'carreira', estudos: 'estudos', estudo: 'estudos',
  pessoal: 'pessoal', relacionamentos: 'relacionamentos', familia: 'relacionamentos', casa: 'casa',
};

const WD_RX = '(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:s)?(?:-feiras?)?';
const MONTH_RX =
  '(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)';

/** Remove acentos mantendo o mesmo comprimento da string (índices continuam válidos). */
function normalize(s: string): string {
  let out = '';
  for (const c of s) {
    out += c.length > 1 ? c : c.normalize('NFD').charAt(0).toLowerCase();
  }
  return out;
}

function num(v: string): number {
  return v in NUMS ? NUMS[v] : Number(v);
}

export function parseInput(input: string, now: Date = new Date()): Parsed {
  let norm = normalize(input);
  const spans: [number, number][] = [];
  const tokens: string[] = [];

  /** Aplica a regex sobre o texto normalizado; ao encontrar, "consome" o trecho. */
  function take(rx: RegExp, opts: { token?: boolean } = {}): RegExpExecArray | null {
    const m = rx.exec(norm);
    if (!m) return null;
    const start = m.index;
    const end = start + m[0].length;
    spans.push([start, end]);
    if (opts.token !== false) tokens.push(input.slice(start, end).trim());
    norm = norm.slice(0, start) + ' '.repeat(end - start) + norm.slice(end);
    return m;
  }

  // 1) prefixos tipo "me lembre de", "lembrete:"
  take(
    /^\s*(?:lembrete\s*:?\s*|(?:me\s+)?lembr(?:e|a|ar)(?:-me)?\s+(?:de\s+|que\s+|para\s+|pra\s+)?|nao\s+(?:me\s+deixe\s+)?esquecer\s+(?:de\s+)?)/,
    { token: false },
  );

  let date: Date | undefined;
  let time: string | undefined;
  let repeat: Repeat = 'none';
  let days: number[] | undefined;
  let priority: Priority | undefined;
  let area: AreaKey | undefined;
  let exact: Date | undefined;

  // 2) relativo: "em 10 min", "daqui a 2 horas", "em meia hora", "em 3 dias"
  const rel = take(
    /\b(?:em|daqui\s+a|daqui)\s+(\d+|uma?|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte|trinta|quarenta|meia)\s*(minutos?|mins?|m|horas?|hrs?|hs?|h|dias?|semanas?)\b/,
  );
  if (rel) {
    const n = num(rel[1]);
    const unit = rel[2];
    if (/^m/.test(unit)) exact = new Date(now.getTime() + n * 60_000);
    else if (/^h/.test(unit)) exact = new Date(now.getTime() + n * 3_600_000);
    else if (/^d/.test(unit)) date = addDays(now, n);
    else if (/^s/.test(unit)) date = addDays(now, n * 7);
  }

  // 3) recorrência
  let m: RegExpExecArray | null;
  if ((m = take(/\btodo\s+dia\s+(\d{1,2})\b/))) {
    repeat = 'monthly';
    const d = Number(m[1]);
    const cand = new Date(now.getFullYear(), now.getMonth(), d);
    date = cand < startOf(now) ? new Date(now.getFullYear(), now.getMonth() + 1, d) : cand;
  } else if (take(/\b(?:todos\s+os\s+dias|todo\s+dia|diariamente|cada\s+dia)\b/)) {
    repeat = 'daily';
  } else if (take(/\b(?:dias\s+uteis|de\s+segunda\s+a\s+sexta)\b/)) {
    repeat = 'weekdays';
  } else if (
    (m = take(new RegExp(`\\b(?:toda|todo|todas\\s+as|todos\\s+os)\\s+${WD_RX}(?:\\s*(?:,|e)\\s*${WD_RX})*`)))
  ) {
    repeat = 'weekly';
    days = Array.from(m[0].matchAll(new RegExp(WD_RX, 'g'))).map((x) => WD[x[1]]);
  } else if (take(/\b(?:toda\s+semana|semanalmente|todas\s+as\s+semanas)\b/)) {
    repeat = 'weekly';
  } else if (take(/\b(?:todo\s+mes|mensalmente|todos\s+os\s+meses)\b/)) {
    repeat = 'monthly';
  } else if (take(/\b(?:todo\s+ano|anualmente|todos\s+os\s+anos)\b/)) {
    repeat = 'yearly';
  }

  // 4) datas
  if (!date) {
    if (take(/\bdepois\s+de\s+amanha\b/)) date = addDays(now, 2);
    else if (take(/\bamanha\b/)) date = addDays(now, 1);
    else if (take(/\bhoje\b/)) date = new Date(now);
    else if (take(/\b(?:semana\s+que\s+vem|proxima\s+semana)\b/)) {
      date = addDays(now, ((8 - now.getDay()) % 7) || 7);
    } else if (take(/\b(?:mes\s+que\s+vem|proximo\s+mes)\b/)) {
      date = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
    } else if (take(/\b(?:(?:no\s+|neste\s+|nesse\s+)?fi(?:m|nal)\s+de\s+semana)\b/)) {
      date = addDays(now, ((6 - now.getDay() + 7) % 7) || 7);
    } else if ((m = take(new RegExp(`\\b(\\d{1,2})\\s+de\\s+${MONTH_RX}(?:\\s+de\\s+(\\d{4}))?\\b`)))) {
      date = futureDate(now, Number(m[1]), MONTHS[m[2]], m[3] ? Number(m[3]) : undefined);
    } else if ((m = take(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
      let y = m[3] ? Number(m[3]) : undefined;
      if (y !== undefined && y < 100) y += 2000;
      date = futureDate(now, Number(m[1]), Number(m[2]) - 1, y);
    } else if ((m = take(/\b(?:no\s+)?dia\s+(\d{1,2})\b/))) {
      const d = Number(m[1]);
      const cand = new Date(now.getFullYear(), now.getMonth(), d);
      date = cand < startOf(now) ? new Date(now.getFullYear(), now.getMonth() + 1, d) : cand;
    } else if (
      repeat === 'none' &&
      (m = take(new RegExp(`\\b(?:(?:na|no|nesta|neste|nessa|nesse|essa|esta|proxima|proximo)\\s+)?${WD_RX}\\b`)))
    ) {
      const target = WD[m[1]];
      date = addDays(now, ((target - now.getDay() + 7) % 7) || 7);
    }
  }

  // 5) horários
  let hour: number | undefined;
  let minute = 0;
  if ((m = take(/\b(?:as|a|ao|pelas|pela|por\s+volta\s+das)?\s*(\d{1,2})(?::|h)(\d{2})\b/))) {
    hour = Number(m[1]);
    minute = Number(m[2]);
  } else if ((m = take(/\b(?:as|a|pelas|por\s+volta\s+das)?\s*(\d{1,2})\s*(?:h|hs|hrs?|horas?)\b/))) {
    hour = Number(m[1]);
  } else if ((m = take(/\b(?:as|pelas|por\s+volta\s+das)\s+(\d{1,2})\b(?!\s*(?:\/|de\s|dias?|min))/))) {
    hour = Number(m[1]);
  } else if (take(/\bmeio[-\s]dia\b/)) {
    hour = 12;
  } else if (take(/\bmeia[-\s]noite\b/)) {
    hour = 23;
    minute = 59;
  }
  if (hour !== undefined) {
    const per = take(/\b(?:da|de)\s+(manha|tarde|noite|madrugada)\b/);
    if (per && (per[1] === 'tarde' || per[1] === 'noite') && hour < 12) hour += 12;
    if (hour <= 23 && minute <= 59) time = `${pad(hour)}:${pad(minute)}`;
  } else {
    const p = take(/\b(?:de|pela|a|na|hoje\s+a)\s+(manha|tarde|noite)\b/);
    if (p) time = p[1] === 'manha' ? '09:00' : p[1] === 'tarde' ? '15:00' : '20:00';
  }

  // 6) prioridade
  if ((m = take(/(?:^|\s)(!{1,3})(?=\s|$)/))) priority = m[1].length as Priority;
  else if ((m = take(/(?:^|\s)!(alta|media|baixa)\b/)))
    priority = m[1] === 'alta' ? 3 : m[1] === 'media' ? 2 : 1;
  else if ((m = take(/\bp([1-3])\b/))) priority = (4 - Number(m[1])) as Priority;
  else if (/\burgente\b/.test(norm)) priority = 3;

  // 7) área via #tag
  if ((m = take(/(?:^|\s)#(\w+)/))) {
    const a = AREAS[m[1]];
    if (a) area = a;
  }

  // Resultado
  if (exact) {
    date = exact;
    time = timeOf(exact);
  }
  if (!date && time) {
    // sem data mas com horário: hoje, ou amanhã se o horário já passou (só para itens sem repetição)
    const [hh, mm] = time.split(':').map(Number);
    const t = new Date(now);
    t.setHours(hh, mm, 0, 0);
    date = t.getTime() <= now.getTime() && repeat === 'none' ? addDays(now, 1) : now;
  }
  if (repeat !== 'none' && !date) date = new Date(now);
  if (repeat === 'weekly' && days?.length && date) {
    // ancora no próximo dia válido
    for (let i = 0; i < 7; i++) {
      const d = addDays(startOf(now), i);
      if (days.includes(d.getDay())) {
        date = d;
        break;
      }
    }
  }

  return {
    title: cleanTitle(input, spans),
    date: date ? dateKey(date) : undefined,
    time,
    repeat,
    days,
    priority,
    area,
    tokens,
  };
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function startOf(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function futureDate(now: Date, day: number, month: number, year?: number): Date {
  if (year !== undefined) return new Date(year, month, day);
  const cand = new Date(now.getFullYear(), month, day);
  return cand < startOf(now) ? new Date(now.getFullYear() + 1, month, day) : cand;
}

function cleanTitle(input: string, spans: [number, number][]): string {
  const chars = input.split('');
  for (const [s, e] of spans) for (let i = s; i < e; i++) chars[i] = ' ';
  let t = chars.join('').replace(/\s+/g, ' ').trim();
  const dangling = /(?:^|\s)(?:às|as|a|à|para|pra|de|do|da|no|na|em|até|ate|e|,|-|–|:)$/i;
  const leading = /^(?:de|que|para|pra|,|-|–|:)\s+/i;
  for (let i = 0; i < 4; i++) {
    t = t.replace(dangling, '').trim();
    t = t.replace(leading, '').trim();
  }
  t = t.replace(/\s+([,.!?])/g, '$1');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}
