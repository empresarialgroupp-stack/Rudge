import { describe, expect, it } from 'vitest';
import { detectBank, inheritBank, mapAccount } from '../../../supabase/functions/finance/map';
import { accountToCard } from './importer';
import { CATEGORY_LABEL } from './sample';
import { summarize } from './insights';

const NOW = new Date('2026-10-20T12:00:00').getTime();

describe('Pluggy → Carteira', () => {
  it('reconhece os bancos pelo conector ou nome da conta', () => {
    expect(detectBank('Nubank')).toBe('nubank');
    expect(detectBank(null, 'Conta Mercado Pago')).toBe('mercadopago');
    expect(detectBank('Banco Inter')).toBe('inter');
    expect(detectBank('Itaú')).toBe('outro');
  });

  it('cartão: DEBIT é compra, CREDIT é pagamento; saldo vira fatura atual', () => {
    const a = mapAccount(
      { id: 'acc1', type: 'CREDIT', number: '5162********0917', balance: 812.4, owner: 'André Silva', creditData: { creditLimit: 6000 } },
      { id: 'it1', connector: { name: 'Nubank' }, lastUpdatedAt: '2026-10-20T08:00:00Z' },
      [
        { id: 't1', date: '2026-10-05T10:00:00Z', description: 'Uber', amount: 27.4, type: 'DEBIT', status: 'POSTED' },
        { id: 't2', date: '2026-10-08T10:00:00Z', description: 'Pagamento recebido', amount: -900, type: 'CREDIT', status: 'POSTED' },
      ],
      NOW,
    );
    expect(a).toMatchObject({ bank: 'nubank', kind: 'credit', lastFour: '0917', holder: 'André', limit: 6000 });
    expect(a.txs.map((t) => t.amount)).toEqual([900, -27.4]);
    const card = accountToCard({ ...a, synced: true }, CATEGORY_LABEL, NOW);
    expect(card).toMatchObject({ balance: 812.4, balanceLabel: 'Fatura atual' });
  });

  it('conta: entrada conta para os 10%, pendente fica de fora', () => {
    const a = mapAccount(
      { id: 'acc2', type: 'BANK', name: 'Conta corrente', number: '0001/123456-7', balance: 4200 },
      { id: 'it2', connector: { name: 'Banco Inter' } },
      [
        { id: 't1', date: '2026-10-05T10:00:00Z', description: 'PIX RECEBIDO', amount: 3000, type: 'CREDIT', status: 'POSTED' },
        { id: 't2', date: '2026-10-06T10:00:00Z', description: 'Agendado', amount: -500, type: 'DEBIT', status: 'PENDING' },
      ],
      NOW,
    );
    expect(a.txs).toHaveLength(1);
    const s = summarize([accountToCard({ ...a, synced: true }, CATEGORY_LABEL, NOW)], NOW);
    expect(s.toSave).toBe(300);
  });
});

describe('inheritBank', () => {
  const item = { id: 'i1', connector: { name: 'MeuPluggy' } };
  it('o cartão "Gold" herda o banco da conta do mesmo item', () => {
    const conta = mapAccount({ id: 'a', type: 'BANK', name: 'Nubank' }, item, []);
    const cartao = mapAccount({ id: 'b', type: 'CREDIT', name: 'gold' }, item, []);
    expect(cartao.bank).toBe('outro');
    const [, c] = inheritBank([conta, cartao]);
    expect(c.bank).toBe('nubank');
    expect(c.label).toBeUndefined();
  });
  it('sem banco conhecido no item, mantém o nome do produto', () => {
    const [c] = inheritBank([mapAccount({ id: 'b', type: 'CREDIT', name: 'gold' }, item, [])]);
    expect(c.bank).toBe('outro');
    expect(c.label).toBe('gold');
  });
});
