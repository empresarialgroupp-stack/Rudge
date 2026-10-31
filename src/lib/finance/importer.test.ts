import { describe, expect, it } from 'vitest';
import { accountToCard, categorize, mergeAccount, parseDate, parseMoney, parseStatement } from './importer';
import { CATEGORY_LABEL } from './sample';
import { summarize } from './insights';

const OFX = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261005000000[-3:BRT]<TRNAMT>5200.00<FITID>a1<MEMO>Salario Empresa X
</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261006<TRNAMT>-49.90<FITID>a2<MEMO>Compra no debito - IFOOD
</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261010<TRNAMT>-1200.00<FITID>a3<MEMO>Pagamento de fatura
</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>3950.10<DTASOF>20261010</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const NU_CARD = `date,title,amount
2026-10-02,Uber *Trip,27.40
2026-10-03,Netflix.com,55.90
2026-10-08,Pagamento recebido,-1200.00`;

const NU_CONTA = `Data,Valor,Identificador,Descrição
05/10/2026,1800.00,abc,Transferência recebida pelo Pix - Cliente
06/10/2026,-86.20,def,Compra no débito - Drogaria`;

const INTER = `Extrato Conta Corrente
Conta ;123456
Período ;01/10/2026 a 31/10/2026
Saldo ;1.234,56

Data Lançamento;Histórico;Descrição;Valor;Saldo
05/10/2026;Pix recebido;"Cliente, Ltda";2.500,00;3.734,56
07/10/2026;Compra no debito;Supermercado Bom;-412,35;3.322,21`;

const MP = `INITIAL_BALANCE;CREDITS;DEBITS;FINAL_BALANCE
100,00;900,00;-50,00;950,00

RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE
05-10-2026;Rendimentos;111;0,35;100,35
06-10-2026;Transferência Pix recebida Fulano;222;899,65;1.000,00
07-10-2026;Pagamento Uber;333;-50,00;950,00`;

describe('parsers', () => {
  it('números e datas no formato brasileiro', () => {
    expect(parseMoney('1.234,56')).toBe(1234.56);
    expect(parseMoney('-R$ 12,00')).toBe(-12);
    expect(parseMoney('(12,00)')).toBe(-12);
    expect(parseMoney('1234.5')).toBe(1234.5);
    expect(parseDate('05-10-2026')).toBe('2026-10-05');
    expect(parseDate('20261005000000[-3:BRT]')).toBe('2026-10-05');
  });

  it('OFX com saldo', () => {
    const r = parseStatement(OFX);
    expect(r.format).toBe('ofx');
    expect(r.txs.map((t) => t.amount)).toEqual([5200, -49.9, -1200]);
    expect(r.balance).toBe(3950.1);
  });

  it('fatura do Nubank: compra positiva vira saída', () => {
    const r = parseStatement(NU_CARD);
    expect(r.txs.map((t) => t.amount)).toEqual([-27.4, -55.9, 1200]);
  });

  it('conta Nubank mantém o sinal', () => {
    expect(parseStatement(NU_CONTA).txs.map((t) => t.amount)).toEqual([1800, -86.2]);
  });

  it('Inter: cabeçalho depois do resumo, aspas e saldo', () => {
    const r = parseStatement(INTER);
    expect(r.txs).toHaveLength(2);
    expect(r.txs[0]).toMatchObject({ date: '2026-10-05', amount: 2500, description: 'Cliente, Ltda' });
    expect(r.balance).toBe(3322.21);
  });

  it('Mercado Pago: usa o valor líquido da transação', () => {
    const r = parseStatement(MP);
    expect(r.txs.map((t) => t.amount)).toEqual([0.35, 899.65, -50]);
    expect(r.balance).toBe(950);
  });
});

describe('contas importadas', () => {
  const NOW = new Date('2026-10-20T12:00:00').getTime();

  it('reimportar não duplica', () => {
    const base = { id: 'nubank-debit-x', bank: 'nubank' as const, kind: 'debit' as const, lastFour: '', holder: 'A' };
    const a = mergeAccount(undefined, base, parseStatement(NU_CONTA), NOW);
    const b = mergeAccount(a, base, parseStatement(NU_CONTA), NOW);
    expect(b.txs).toHaveLength(2);
  });

  it('pagamento da fatura não conta como gasto nem como entrada', () => {
    const conta = mergeAccount(undefined, { id: 'c', bank: 'inter', kind: 'debit', lastFour: '1', holder: 'A' }, parseStatement(OFX), NOW);
    const cartao = mergeAccount(undefined, { id: 'k', bank: 'nubank', kind: 'credit', lastFour: '2', holder: 'A' }, parseStatement(NU_CARD), NOW);
    const s = summarize([accountToCard(conta, CATEGORY_LABEL, NOW), accountToCard(cartao, CATEGORY_LABEL, NOW)], NOW);
    expect(s.received).toBe(5200);
    expect(s.spent).toBe(133.2);
    expect(s.toSave).toBe(520);
  });

  it('categorias por palavra-chave', () => {
    expect(categorize('Compra no debito - IFOOD', -10)).toBe('restaurante');
    expect(categorize('Uber *Trip', -10)).toBe('transporte');
    expect(categorize('Pagamento Mercado Pago', -10)).not.toBe('mercado');
    expect(categorize('Estorno compra', 10)).toBe('compras');
  });
});
