import { describe, expect, it } from 'vitest';
import type { AppState, Goal, Habit, Reminder, Task } from './types';
import { defaultSettings } from './store';
import { buildDayPlan, planSummary } from './planner';
import { retimeSuggestions } from './insights';
import { dueFromFactor, findBoleto, interpretScan, parseBoletoDigits } from './scan';
import { distanceM, parsePlacePhrase } from './geo';
import { recalcGoal } from './goals';
import { monthStats } from './retro';
import { journalHabitImpact } from './stats';
import { buildQueue } from './scheduler';

const iso = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m, d, h, min).toISOString();
const key = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function state(p: Partial<AppState> = {}): AppState {
  return {
    version: 1,
    tasks: [],
    goals: [],
    habits: [],
    reminders: [],
    snoozes: [],
    inbox: [],
    dismissedSuggestions: {},
    dayPlans: {},
    focusSessions: [],
    journal: {},
    places: [],
    history: [],
    settings: { ...defaultSettings },
    ...p,
  };
}
const task = (p: Partial<Task> & { id: string }): Task => ({ title: p.id, done: false, createdAt: iso(2026, 9, 1), priority: 1, ...p });

describe('plano do dia', () => {
  // segunda, 26/10/2026, 7h (antes da janela 9–18)
  const now = new Date(2026, 9, 26, 7, 0).getTime();
  const today = key(2026, 9, 26);
  const goal: Goal = { id: 'g', title: 'Meta', area: 'financas', kind: 'numeric', startValue: 0, target: 100, current: 5, start: key(2026, 9, 1), deadline: key(2026, 10, 1), milestones: [], log: [], checkin: { freq: 'none', time: '09:00', weekday: 0 }, status: 'active', createdAt: iso(2026, 9, 1) };
  const s = state({
    goals: [goal],
    tasks: [
      task({ id: 'atrasada', due: key(2026, 9, 22), priority: 1 }),
      task({ id: 'meta', due: today, goalId: 'g', priority: 1 }),
      task({ id: 'alta', due: today, priority: 3 }),
      task({ id: 'baixa', due: today, priority: 0 }),
      task({ id: 'reuniao', due: today, time: '10:00', priority: 2 }),
      task({ id: 'futura', due: key(2026, 10, 20), priority: 3 }),
    ],
    reminders: [{ id: 'r', title: 'Remédio', at: iso(2026, 9, 26, 9, 0), repeat: 'none', done: false, createdAt: iso(2026, 9, 20) } as Reminder],
  });
  const plan = buildDayPlan(s, today, now);

  it('escolhe 3 prioridades: meta atrasada, tarefa atrasada e alta prioridade', () => {
    expect(plan.priorities).toHaveLength(3);
    expect(plan.priorities).toContain('meta');
    expect(plan.priorities).toContain('atrasada');
    expect(plan.priorities).not.toContain('futura');
  });

  it('encaixa as tarefas nos horários livres, sem bater em lembretes ou compromissos', () => {
    const starts = plan.slots.map((x) => x.start);
    expect(starts[0] >= '09:00').toBe(true);
    for (const x of plan.slots) {
      // lembrete 9:00–9:15 e reunião 10:00–10:45 (+10 min de folga)
      const clash = (a: string, b: string) => x.start < b && x.end > a;
      expect(clash('08:50', '09:25')).toBe(false);
      expect(clash('09:50', '10:55')).toBe(false);
    }
    expect(plan.slots.some((x) => x.taskId === 'reuniao')).toBe(false); // já tem horário
    expect(planSummary(plan)).toMatch(/^3 prioridades, começa às 9h$/);
  });

  it('o aviso da manhã vira "Seu dia está pronto" com botão Aceitar', () => {
    const q = buildQueue(s, now, 24 * 3_600_000).find((i) => i.key === `brief:${today}`)!;
    expect(q.title).toContain('Seu dia está pronto');
    expect(q.body).toContain('3 prioridades');
    expect(q.actions[0].action).toBe('accept-plan');
  });
});

describe('horários aprendidos', () => {
  const now = new Date(2026, 9, 26, 12).getTime();
  const r: Reminder = { id: 'rem', title: 'Tomar remédio', at: iso(2026, 9, 1, 8, 0), repeat: 'daily', done: false, createdAt: iso(2026, 9, 1) };
  const history = [20, 21, 22, 23, 24].flatMap((d) => [
    { kind: 'reminder' as const, refId: 'rem', action: 'snooze' as const, scheduledAt: new Date(2026, 9, d, 8).getTime(), at: new Date(2026, 9, d, 8, 1).getTime() },
    { kind: 'reminder' as const, refId: 'rem', action: 'done' as const, scheduledAt: new Date(2026, 9, d, 8).getTime(), at: new Date(2026, 9, d, 8, 30).getTime() },
  ]);
  it('lembrete sempre adiado das 8h para 8h30 → sugere 08:30', () => {
    const [sg] = retimeSuggestions(state({ reminders: [r], history }), now);
    expect(sg).toMatchObject({ kind: 'reminder', id: 'rem', from: '08:00', to: '08:30' });
  });
  it('hábito feito sempre por volta das 7h, com lembrete às 21h → sugere 07:00', () => {
    const h: Habit = { id: 'h', title: 'Correr', days: [0, 1, 2, 3, 4, 5, 6], remind: true, time: '21:00', log: [], createdAt: iso(2026, 8, 1) };
    const hist = [20, 21, 22, 23].map((d) => ({ kind: 'habit' as const, refId: 'h', action: 'done' as const, scheduledAt: new Date(2026, 9, d, 21).getTime(), at: new Date(2026, 9, d, 7, 5).getTime() }));
    const [sg] = retimeSuggestions(state({ habits: [h], history: hist }), now);
    expect(sg).toMatchObject({ kind: 'habit', to: '07:00' });
  });
  it('sem padrão claro, não sugere nada', () => {
    expect(retimeSuggestions(state({ reminders: [r], history: history.slice(0, 2) }), now)).toEqual([]);
  });
});

describe('captura por foto: boleto', () => {
  // gera uma linha digitável válida (algoritmos FEBRABAN)
  const mod10 = (n: string) => {
    let sum = 0;
    let w = 2;
    for (let i = n.length - 1; i >= 0; i--) {
      let v = Number(n[i]) * w;
      if (v > 9) v -= 9;
      sum += v;
      w = 3 - w;
    }
    return (10 - (sum % 10)) % 10;
  };
  const mod11 = (n: string) => {
    let sum = 0;
    let w = 2;
    for (let i = n.length - 1; i >= 0; i--) {
      sum += Number(n[i]) * w;
      w = w === 9 ? 2 : w + 1;
    }
    const d = 11 - (sum % 11);
    return d === 0 || d >= 10 ? 1 : d;
  };
  function makeLine(due: Date, cents: number) {
    const factor = 1000 + Math.round((Date.UTC(due.getFullYear(), due.getMonth(), due.getDate()) - Date.UTC(2025, 1, 22)) / 86_400_000);
    const free = '1234567890123456789012345';
    const body = `3419${String(factor).padStart(4, '0')}${String(cents).padStart(10, '0')}${free}`;
    const dv = mod11(body);
    const bar = body.slice(0, 4) + dv + body.slice(4);
    const f1 = bar.slice(0, 4) + bar.slice(19, 24);
    const f2 = bar.slice(24, 34);
    const f3 = bar.slice(34, 44);
    return `${f1}${mod10(f1)}${f2}${mod10(f2)}${f3}${mod10(f3)}${bar[4]}${bar.slice(5, 19)}`;
  }
  const today = new Date(2026, 9, 26);
  const line = makeLine(new Date(2026, 10, 10), 12000);

  it('lê valor e vencimento da linha digitável (ciclo novo do fator)', () => {
    const b = parseBoletoDigits(line, today)!;
    expect(b.valid).toBe(true);
    expect(b.value).toBe(120);
    expect(b.due).toBe('2026-11-10');
    expect(dueFromFactor(1000, today)).toBe('2025-02-22');
  });

  it('acha o boleto no texto do OCR com pontos, espaços e quebras e monta a tarefa', () => {
    const fmt = `${line.slice(0, 5)}.${line.slice(5, 10)} ${line.slice(10, 15)}.${line.slice(15, 21)}\n${line.slice(21, 26)}.${line.slice(26, 32)} ${line[32]} ${line.slice(33)}`;
    const text = `CLARO S.A.\nBeneficiário: Claro S.A. CNPJ 40.432.544/0001-47\nVencimento 10/11/2026\nValor do documento R$ 120,00\n${fmt}`;
    const r = interpretScan(text, today);
    expect(r.boleto?.valid).toBe(true);
    expect(r.title).toMatch(/^Pagar Claro R\$\s120,00$/);
    expect(r.due).toBe('2026-11-10');
  });

  it('dígito errado do OCR é detectado', () => {
    const bad = line.slice(0, 40) + ((Number(line[40]) + 1) % 10) + line.slice(41);
    expect(parseBoletoDigits(bad, today)!.valid).toBe(false);
    expect(findBoleto('nada aqui')).toBeUndefined();
  });

  it('corrige confusões do OCR (7 lido como /) e não inventa boleto juntando números soltos', () => {
    const ocr = `${line.slice(0, 15)} ${line.slice(15, 20).replace('7', '/')}${line.slice(20)}`.replace(/7/, '/');
    const r = interpretScan(`Vencimento 10/11/2026\nValor R$ 120,00\n${ocr}`, today);
    expect(r.boleto?.valid).toBe(true);
    expect(r.boleto?.value).toBe(120);
    const spread = `CNPJ 02.558.157/0001-62 ${line.slice(0, 20)}\nTel ${line.slice(20, 35)} 1199\n${line.slice(35)} 2026`;
    expect(findBoleto(spread, today)?.valid).not.toBe(true);
  });

  it('papel/quadro vira lista de itens', () => {
    const r = interpretScan('Lista da semana\n- Comprar ração\n• Ligar pro contador sexta\n3. Pagar academia', today);
    expect(r.lines).toEqual(['Lista da semana', 'Comprar ração', 'Ligar pro contador sexta', 'Pagar academia']);
    expect(r.title).toBe('');
  });
});

describe('lembrete por lugar', () => {
  const places = [
    { id: 'w', name: 'Trabalho', lat: -23.55, lng: -46.63, radius: 200 },
    { id: 'c', name: 'Casa', lat: -23.6, lng: -46.7, radius: 200 },
  ];
  it('entende "quando sair do trabalho" e "quando chegar em casa"', () => {
    expect(parsePlacePhrase('me lembra de comprar pão quando sair do trabalho', places)).toMatchObject({ title: 'Comprar pão', on: 'leave', placeId: 'w' });
    expect(parsePlacePhrase('lembrar de tirar o lixo quando eu chegar em casa', places)).toMatchObject({ title: 'Tirar o lixo', on: 'arrive', placeId: 'c' });
    expect(parsePlacePhrase('ligar pro João quando chegar na academia', places)).toMatchObject({ placeId: undefined, placeName: 'academia' });
    expect(parsePlacePhrase('pagar a conta amanhã às 9h', places)).toBeNull();
  });
  it('calcula distância em metros', () => {
    expect(Math.round(distanceM({ lat: -23.55, lng: -46.63 }, { lat: -23.551, lng: -46.63 }))).toBe(111);
  });
  it('lembretes por lugar não entram na fila de horários', () => {
    const r = { id: 'p', title: 'Pão', at: new Date().toISOString(), repeat: 'none', done: false, createdAt: new Date().toISOString(), place: { placeId: 'w', on: 'leave' } } as Reminder;
    expect(buildQueue(state({ reminders: [r], places })).some((q) => q.refId === 'p')).toBe(false);
  });
});

describe('metas que se recalculam', () => {
  const g: Goal = { id: 'g', title: '1000 reais', area: 'financas', kind: 'numeric', startValue: 0, target: 1000, current: 250, unit: 'R$', start: '2026-10-01', deadline: '2026-10-31', milestones: [], log: [], checkin: { freq: 'none', time: '09:00', weekday: 0 }, status: 'active', createdAt: iso(2026, 9, 1) };
  it('novo ritmo, novo prazo e etapas', () => {
    const r = recalcGoal(g, '2026-10-21')!;
    expect(r.perDayNow).toBe(75); // 750 em 10 dias
    expect(r.message).toContain('Agora são 75 R$ por dia');
    expect(r.newDeadline).toBe('2026-12-20'); // ritmo real 12,5/dia → 60 dias a partir de 21/10
    expect(r.steps.length).toBeGreaterThanOrEqual(2);
    expect(r.steps.at(-1)!.value).toBe(1000);
  });
  it('meta no ritmo não pede recálculo', () => {
    expect(recalcGoal({ ...g, current: 700 }, '2026-10-21')).toBeNull();
  });
});

describe('diário e retrospectiva', () => {
  const h: Habit = { id: 'h', title: 'Caminhar', days: [0, 1, 2, 3, 4, 5, 6], remind: false, time: '08:00', log: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05'], createdAt: iso(2026, 8, 1) };
  const journal = Object.fromEntries(
    ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06'].map((d, i) => [d, { good: i === 2 ? 'fechei contrato' : '', blocked: '', score: [5, 4, 5, 2, 4, 1][i], at: d }]),
  );
  it('mostra quais hábitos combinam com os melhores dias', () => {
    const [x] = journalHabitImpact(state({ habits: [h], journal }));
    expect(x.withAvg).toBe(4.5);
    expect(x.withoutAvg).toBe(1.5);
  });
  it('números do mês', () => {
    const s = state({
      habits: [h],
      journal,
      tasks: [task({ id: 'a', done: true, doneAt: iso(2026, 9, 5) }), task({ id: 'b', done: true, doneAt: iso(2026, 9, 6) }), task({ id: 'c', done: true, doneAt: iso(2026, 8, 30) })],
      focusSessions: [{ id: 'f', title: 'x', start: iso(2026, 9, 7), end: iso(2026, 9, 7), minutes: 90 }],
    });
    const st = monthStats(s, '2026-10');
    expect(st.tasksDone).toBe(2);
    expect(st.habitCheckins).toBe(4);
    expect(st.bestStreak).toEqual({ title: 'Caminhar', days: 3 });
    expect(st.focusMinutes).toBe(90);
    expect(st.journal?.days).toBe(6);
    expect(st.bestWeek?.count).toBeGreaterThan(0);
  });
});
