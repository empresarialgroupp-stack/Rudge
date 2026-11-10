import { beforeEach, describe, expect, it, vi } from 'vitest';

const toasts: { title: string; actions?: { label: string; run: () => void }[] }[] = [];
vi.mock('./ui', () => ({
  toast: (t: (typeof toasts)[number]) => {
    toasts.push(t);
    return toasts.length;
  },
  navigate: () => undefined,
}));

const { askAction } = await import('./scheduler');
const { getState, setState } = await import('./store');

const iso = (h: number) => new Date(2026, 10, 9, h).toISOString();

describe('tocar na notificação pergunta "Já concluí | Adiar"', () => {
  beforeEach(() => {
    toasts.length = 0;
    setState((s) => ({
      ...s,
      reminders: [{ id: 'r1', title: 'Ligar para o cliente', at: iso(15), repeat: 'none', done: false, createdAt: iso(8) }],
      snoozes: [],
    }));
  });

  it('mostra as duas opções e "Já concluí" conclui o lembrete', () => {
    const data = { key: 'rem:r1:a', kind: 'reminder' as const, refId: 'r1', occ: Date.parse(iso(15)), url: '#/lembretes', title: 'Ligar para o cliente', body: '', snoozeMin: 10 };
    expect(askAction(data)).toBe(true);
    expect(toasts[0].actions?.map((a) => a.label)).toEqual(['Já concluí', 'Adiar 10 min']);
    expect(askAction(data)).toBe(false); // não pergunta duas vezes
    toasts[0].actions![0].run();
    expect(getState().reminders[0].done).toBe(true);
  });

  it('"Adiar 10 min" cria o novo aviso para daqui a 10 minutos', () => {
    const data = { key: 'rem:r1:b', kind: 'reminder' as const, refId: 'r1', occ: Date.parse(iso(15)), url: '#/lembretes', title: 'Ligar para o cliente', body: '', snoozeMin: 10 };
    const before = Date.now();
    askAction(data);
    toasts[0].actions![1].run();
    const sn = getState().snoozes.find((x) => x.refId === 'r1');
    expect(sn).toBeTruthy();
    expect(sn!.at - before).toBeGreaterThanOrEqual(10 * 60_000 - 50);
  });

  it('não pergunta se o item já foi concluído (ex.: em outro aparelho)', () => {
    setState((s) => ({ ...s, reminders: s.reminders.map((r) => ({ ...r, done: true })) }));
    const data = { key: 'rem:r1:c', kind: 'reminder' as const, refId: 'r1', url: '#/lembretes', title: 'x', body: '', snoozeMin: 10 };
    expect(askAction(data)).toBe(false);
    expect(toasts).toHaveLength(0);
  });
});
