import { describe, expect, it } from 'vitest';
import { dailyCounts, periodSeries } from './stats';
import type { AppState } from './types';

const now = new Date(2026, 9, 26, 20, 0); // segunda, 26/10/2026
const at = (d: number, m = 9) => new Date(2026, m, d, 15).toISOString();
const state = {
  tasks: [
    { id: 'a', title: 'a', done: true, doneAt: at(26), createdAt: at(1), priority: 1 },
    { id: 'b', title: 'b', done: true, doneAt: at(25), createdAt: at(1), priority: 1 },
    { id: 'c', title: 'c', done: true, doneAt: at(10, 8), createdAt: at(1), priority: 1 },
    { id: 'd', title: 'd', done: false, createdAt: at(1), priority: 1 },
  ],
  habits: [{ id: 'h', title: 'h', days: [], remind: false, time: '08:00', log: ['2026-10-26', '2026-10-20', '2026-09-02'], createdAt: at(1) }],
  reminders: [{ id: 'r', title: 'r', at: at(24), repeat: 'none', done: true, doneAt: at(24), createdAt: at(1) }],
} as unknown as AppState;

describe('números do painel', () => {
  it('conta por dia (últimos 7, o último é hoje)', () => {
    const d = dailyCounts(state, 7, now);
    expect(d.keys.at(-1)).toBe('2026-10-26');
    expect(d.tasks).toEqual([0, 0, 0, 0, 0, 1, 1]);
    expect(d.habits).toEqual([1, 0, 0, 0, 0, 0, 1]);
  });

  it('agrupa por semana (tarefas + lembretes) e por mês', () => {
    const w = periodSeries(state, 'semanas', now);
    expect(w.labels).toHaveLength(8);
    expect(w.labels.at(-1)).toBe('26/10');
    expect(w.tasks.at(-1)).toBe(1); // só a de hoje é desta semana
    expect(w.tasks.at(-2)).toBe(2); // 25/10 + lembrete de 24/10
    const m = periodSeries(state, 'meses', now);
    expect(m.labels.slice(-2)).toEqual(['Set', 'Out']);
    expect(m.tasks.slice(-2)).toEqual([1, 3]);
    expect(m.habits.slice(-2)).toEqual([1, 2]);
  });
});
