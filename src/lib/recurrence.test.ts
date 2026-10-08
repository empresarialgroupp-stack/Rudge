import { describe, expect, it } from 'vitest';
import { nextOccurrence, occurrencesBetween } from './recurrence';

const at = new Date(2026, 9, 8, 9, 0).getTime(); // qui 08/10/2026 09:00
const DAY = 86_400_000;

describe('recurrence', () => {
  it('única', () => {
    expect(nextOccurrence({ at, repeat: 'none' }, at - 1)).toBe(at);
    expect(nextOccurrence({ at, repeat: 'none' }, at)).toBeNull();
  });

  it('diária', () => {
    const next = nextOccurrence({ at, repeat: 'daily' }, at);
    expect(new Date(next!).getDate()).toBe(9);
    expect(new Date(next!).getHours()).toBe(9);
  });

  it('dias úteis pula o fim de semana', () => {
    const fri = new Date(2026, 9, 9, 9, 0).getTime();
    const next = nextOccurrence({ at, repeat: 'weekdays' }, fri);
    expect(new Date(next!).getDay()).toBe(1);
    expect(new Date(next!).getDate()).toBe(12);
  });

  it('semanal com dias', () => {
    const list = occurrencesBetween({ at, repeat: 'weekly', days: [1, 5] }, at, at + 7 * DAY);
    expect(list.map((t) => new Date(t).getDate())).toEqual([9, 12]);
  });

  it('mensal no dia 31 respeita meses curtos', () => {
    const a = new Date(2026, 0, 31, 8, 0).getTime();
    const next = nextOccurrence({ at: a, repeat: 'monthly' }, a);
    expect(new Date(next!).getMonth()).toBe(1);
    expect(new Date(next!).getDate()).toBe(28);
  });

  it('não gera ocorrências antes da âncora', () => {
    const list = occurrencesBetween({ at, repeat: 'daily' }, at - 5 * DAY, at + DAY);
    expect(list.length).toBe(2);
  });
});
