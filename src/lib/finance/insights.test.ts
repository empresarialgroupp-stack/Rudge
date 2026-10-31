import { describe, expect, it } from 'vitest';
import { sampleCards } from './sample';
import { summarize, tips } from './insights';
import type { FinanceCard } from './types';

const NOW = new Date('2026-10-20T12:00:00').getTime();

function card(transactions: FinanceCard['transactions'], extra: Partial<FinanceCard> = {}): FinanceCard {
  return { id: 'x', kind: 'debit', issuer: 'B', product: 'P', lastFour: '0000', holder: 'A', balance: 0, balanceLabel: '', transactions, ...extra };
}
const t = (id: string, amount: number, date: string, category: FinanceCard['transactions'][number]['category'] = 'outros') => ({
  id,
  amount,
  date,
  category,
  merchant: id,
  detail: '',
});

describe('summarize', () => {
  it('soma entradas e saídas só do mês atual', () => {
    const s = summarize([card([t('a', 1000, '2026-10-05T10:00:00', 'salario'), t('b', -200, '2026-10-06T10:00:00'), t('c', 500, '2026-09-30T10:00:00', 'pix')])], NOW);
    expect(s.received).toBe(1000);
    expect(s.spent).toBe(200);
    expect(s.net).toBe(800);
  });

  it('sugere guardar 10% de cada entrada', () => {
    const s = summarize([card([t('a', 1234.5, '2026-10-05T10:00:00', 'salario'), t('b', 300, '2026-10-07T10:00:00', 'pix')])], NOW);
    expect(s.inflows.map((i) => i.save)).toEqual([30, 123.45]);
    expect(s.toSave).toBe(153.45);
  });

  it('não conta estorno como entrada', () => {
    const s = summarize([card([t('a', 45, '2026-10-05T10:00:00', 'compras')])], NOW);
    expect(s.received).toBe(0);
    expect(s.inflows).toHaveLength(0);
  });

  it('dados de exemplo sempre caem no mês atual', () => {
    const s = summarize(sampleCards(NOW), NOW);
    expect(s.received).toBeGreaterThan(0);
    expect(s.spent).toBeGreaterThan(0);
  });
});

describe('tips', () => {
  it('avisa quando gastou mais do que recebeu', () => {
    const list = tips([card([t('a', 100, '2026-10-05T10:00:00', 'pix'), t('b', -300, '2026-10-06T10:00:00')])], NOW);
    expect(list[0].id).toBe('over');
  });

  it('avisa uso alto do limite do crédito', () => {
    const list = tips([card([], { kind: 'credit', limit: 1000, balance: 600 })], NOW);
    expect(list.some((x) => x.id.startsWith('limit'))).toBe(true);
  });

  it('marca a meta dos 10% como cumprida', () => {
    const list = tips([card([t('a', 1000, '2026-10-05T10:00:00', 'salario')])], NOW, 100);
    expect(list.some((x) => x.id === 'saved')).toBe(true);
  });
});
