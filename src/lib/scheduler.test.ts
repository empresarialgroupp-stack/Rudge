import { describe, expect, it } from 'vitest';
import { buildQueue } from './scheduler';
import { defaultSettings } from './store';
import type { AppState } from './types';

// quinta-feira, 8 de outubro de 2026, 10:00 (fuso local)
const NOW = new Date(2026, 9, 8, 10, 0, 0).getTime();
const iso = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m, d, h, min).toISOString();

function state(patch: Partial<AppState> = {}): AppState {
  return {
    version: 1,
    tasks: [],
    goals: [],
    habits: [],
    reminders: [],
    snoozes: [],
    inbox: [],
    dismissedSuggestions: {},
    settings: { ...defaultSettings, briefing: { enabled: false, time: '08:00' }, review: { enabled: false, time: '21:00' }, weekly: { enabled: false, weekday: 0, time: '18:00' } },
    ...patch,
  };
}

describe('buildQueue', () => {
  it('lembrete único e recorrente', () => {
    const q = buildQueue(
      state({
        reminders: [
          { id: 'a', title: 'Pagar boleto', at: iso(2026, 9, 8, 15), repeat: 'none', done: false, createdAt: '' },
          { id: 'b', title: 'Remédio', at: iso(2026, 9, 1, 8), repeat: 'daily', done: false, createdAt: '' },
          { id: 'c', title: 'Feito', at: iso(2026, 9, 8, 16), repeat: 'none', done: true, createdAt: '' },
        ],
      }),
      NOW,
    );
    const titles = q.map((x) => x.title);
    expect(titles).toContain('Pagar boleto');
    expect(titles).not.toContain('Feito');
    // remédio: ontem 08:00 até +8 dias → inclui hoje 08:00 (passado, dentro da janela) e próximos
    expect(q.filter((x) => x.title === 'Remédio').length).toBeGreaterThanOrEqual(8);
    expect(q.find((x) => x.title === 'Pagar boleto')!.actions.map((a) => a.action)).toEqual(['done', 'snooze']);
  });

  it('recorrente criado depois do horário de hoje não gera aviso atrasado', () => {
    const q = buildQueue(
      state({ reminders: [{ id: 'w', title: 'Água', at: iso(2026, 9, 8, 8), repeat: 'daily', done: false, createdAt: new Date(NOW).toISOString() }] }),
      NOW,
    );
    const occ = q.filter((x) => x.title === 'Água').map((x) => new Date(x.at).getDate());
    expect(occ[0]).toBe(9);
  });

  it('tarefa criada dentro da antecedência avisa no horário', () => {
    const q = buildQueue(
      state({ tasks: [{ id: 't', title: 'Call', done: false, createdAt: new Date(NOW).toISOString(), due: '2026-10-08', time: '10:05', priority: 0, remind: 10 }] }),
      NOW,
    );
    const item = q.find((x) => x.kind === 'task')!;
    expect(new Date(item.at).getMinutes()).toBe(5);
    expect(item.body).toBe('Agora — 10:05');
  });

  it('tarefa com horário respeita a antecedência', () => {
    const q = buildQueue(
      state({ tasks: [{ id: 't', title: 'Reunião', done: false, createdAt: '', due: '2026-10-08', time: '14:00', priority: 2, remind: 15 }] }),
      NOW,
    );
    const item = q.find((x) => x.kind === 'task')!;
    expect(new Date(item.at).getHours()).toBe(13);
    expect(new Date(item.at).getMinutes()).toBe(45);
  });

  it('hábito já feito hoje não notifica hoje', () => {
    const q = buildQueue(
      state({
        habits: [{ id: 'h', title: 'Ler', days: [0, 1, 2, 3, 4, 5, 6], remind: true, time: '21:00', log: ['2026-10-08'], createdAt: '' }],
      }),
      NOW,
    );
    expect(q.some((x) => x.key === 'habit:h:2026-10-08')).toBe(false);
    expect(q.some((x) => x.key === 'habit:h:2026-10-09')).toBe(true);
  });

  it('resumo da manhã e revisão semanal quando ativos', () => {
    const s = state();
    s.settings = { ...s.settings, briefing: { enabled: true, time: '08:00' }, weekly: { enabled: true, weekday: 0, time: '18:00' } };
    const q = buildQueue(s, NOW);
    expect(q.some((x) => x.key === 'brief:2026-10-09')).toBe(true);
    expect(q.some((x) => x.key === 'weekly:2026-10-11')).toBe(true);
  });

  it('adiamento de lembrete concluído é descartado', () => {
    const q = buildQueue(
      state({
        reminders: [{ id: 'a', title: 'X', at: iso(2026, 9, 8, 9), repeat: 'none', done: true, createdAt: '' }],
        snoozes: [{ key: 'snz:1', at: NOW + 600_000, title: 'X', body: '', kind: 'reminder', refId: 'a', url: '#/lembretes' }],
      }),
      NOW,
    );
    expect(q.some((x) => x.key === 'snz:1')).toBe(false);
  });
});
