import { describe, expect, it } from 'vitest';
import { weekStats } from './week';
import type { AppState } from './types';

const at = (d: number, h = 15) => new Date(2026, 10, d, h).toISOString();
const ALL = [0, 1, 2, 3, 4, 5, 6];
const state = {
  tasks: [
    { id: 'a', title: 'a', done: true, doneAt: at(10), createdAt: at(1), priority: 1 },
    { id: 'b', title: 'b', done: true, doneAt: at(4), createdAt: at(1), priority: 1 },
    { id: 'c', title: 'c', done: true, doneAt: at(3), createdAt: at(1), priority: 1 }, // fora da semana
    { id: 'd', title: 'd', done: false, createdAt: at(1), priority: 1 },
  ],
  reminders: [{ id: 'r', title: 'r', at: at(8), repeat: 'none', done: true, doneAt: at(8), createdAt: at(1) }],
  habits: [
    { id: 'h', title: 'Ler', days: ALL, remind: false, time: '08:00', log: ['2026-11-08', '2026-11-09', '2026-11-10'], createdAt: at(1) },
    { id: 'x', title: 'Velho', days: ALL, remind: false, time: '08:00', log: [], createdAt: at(1), archived: true },
  ],
  goals: [
    {
      id: 'g', title: 'Ler 12 livros', area: 'estudos', kind: 'numeric', startValue: 0, target: 10, current: 4, start: '2026-10-01',
      milestones: [], log: [{ date: at(1), value: 2 }, { date: at(9), value: 4 }], checkin: { freq: 'none', time: '19:00', weekday: 0 }, status: 'active', createdAt: at(1),
    },
  ],
  focusSessions: [{ id: 'f', title: 'f', start: at(9), end: at(9), minutes: 25 }],
  journal: { '2026-11-09': { good: '', blocked: '', score: 4, at: at(9) }, '2026-11-01': { good: '', blocked: '', score: 1, at: at(1) } },
} as unknown as AppState;

describe('cartão da semana', () => {
  const w = weekStats(state, '2026-11-10');
  it('pega só os últimos 7 dias', () => {
    expect(w.from).toBe('2026-11-04');
    expect(w.tasksDone).toBe(2);
    expect(w.remindersDone).toBe(1);
    expect(w.focusMinutes).toBe(25);
    expect(w.journalAvg).toBe(4);
  });
  it('conta hábitos, sequência e dias ativos', () => {
    expect(w.habitCheckins).toBe(3);
    expect(w.habitRate).toBeCloseTo(3 / 7);
    expect(w.bestStreak).toEqual({ title: 'Ler', days: 3 });
    expect(w.perDay).toEqual([1, 0, 0, 0, 2, 1, 2]);
    expect(w.activeDays).toBe(4);
  });
  it('mostra quanto cada meta andou', () => {
    expect(w.goals).toHaveLength(1);
    expect(w.goals[0].from).toBeCloseTo(0.2);
    expect(w.goals[0].to).toBeCloseTo(0.4);
  });
});
