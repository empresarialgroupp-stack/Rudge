import { describe, expect, it } from 'vitest';
import { activity, compactBRL, compareMonths, daily, filterActivity, totals, txKind } from './overview';
import { sampleCards } from './sample';
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

describe('totals', () => {
  it('soma contas e faturas separadas', () => {
    const r = totals([card([], { balance: 100 }), card([], { id: 'y', kind: 'credit', balance: 40, limit: 1000 })]);
    expect(r).toEqual({ cash: 100, accounts: 1, bills: 40, limit: 1000, credits: 1 });
  });
});

describe('daily', () => {
  const cards = [
    card([
      t('sal', 3000, '2026-10-05T10:00:00', 'salario'),
      t('m', -200, '2026-10-06T10:00:00', 'mercado'),
      t('fat', -500, '2026-10-07T10:00:00', 'fatura'),
      t('old', -999, '2026-09-30T10:00:00', 'mercado'),
    ]),
  ];
  it('acumula até hoje no mês atual e ignora pagamento de fatura', () => {
    const s = daily(cards, NOW, false, NOW);
    expect(s.days.length).toBe(20);
    expect(s.received[4]).toBe(3000);
    expect(s.spent[5]).toBe(200);
    expect(s.spent[19]).toBe(200);
  });
  it('mês passado vai até o último dia', () => {
    const s = daily(cards, new Date('2026-09-10').getTime(), false, NOW);
    expect(s.days.length).toBe(30);
    expect(s.spent[29]).toBe(999);
  });
});

describe('compareMonths', () => {
  it('compara com os mesmos dias do mês passado', () => {
    const c = compareMonths([card([t('a', -100, '2026-09-03T10:00:00', 'mercado'), t('b', -150, '2026-10-03T10:00:00', 'mercado')])], NOW);
    expect(c.spent).toBe(150);
    expect(c.spentDelta).toBeCloseTo(0.5);
    expect(c.receivedDelta).toBeNull();
  });
});

describe('activity', () => {
  const rows = activity(sampleCards(NOW));
  it('ordena da mais recente para a mais antiga', () => {
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].date >= rows[i].date).toBe(true);
  });
  it('filtra por texto sem acento, categoria e tipo', () => {
    expect(filterActivity(rows, { query: 'farmacia' }).map((r) => r.merchant)).toEqual(['Farmácia']);
    expect(filterActivity(rows, { category: 'assinatura' }).every((r) => r.category === 'assinatura')).toBe(true);
    expect(filterActivity(rows, { kind: 'in' }).every((r) => r.amount > 0)).toBe(true);
  });
  it('classifica estorno, entrada, saída e fatura', () => {
    expect(txKind(t('e', 45, '', 'compras'))).toBe('refund');
    expect(txKind(t('s', 5000, '', 'salario'))).toBe('in');
    expect(txKind(t('g', -5, '', 'mercado'))).toBe('out');
    expect(txKind(t('f', -5, '', 'fatura'))).toBe('bill');
  });
});

it('compactBRL', () => {
  expect(compactBRL(2500)).toBe('2,5 mil');
  expect(compactBRL(850.4)).toBe('850');
});
