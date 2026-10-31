// Resumo do mês, regra dos 10% e dicas. Funções puras: valem para dados de exemplo e reais.
import { CATEGORY_LABEL } from './sample';
import type { Category, FinanceCard, FinanceTransaction } from './types';

export const SAVE_RATE = 0.1;

const FIXED: Category[] = ['casa', 'assinatura'];

const round2 = (n: number) => Math.round(n * 100) / 100;

export function monthKey(d: Date | number | string) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
}

export function monthTransactions(cards: FinanceCard[], now = Date.now()) {
  const key = monthKey(now);
  return cards.flatMap((c) => c.transactions.filter((t) => monthKey(t.date) === key));
}

/** Entradas que contam para os 10%: dinheiro novo (estornos não contam). */
export function isIncome(t: FinanceTransaction) {
  return t.amount > 0 && t.category !== 'compras';
}

export interface Inflow {
  id: string;
  merchant: string;
  date: string;
  amount: number;
  /** 10% da entrada */
  save: number;
}

export interface MonthSummary {
  received: number;
  spent: number;
  net: number;
  inflows: Inflow[];
  /** total a guardar no mês (10% das entradas) */
  toSave: number;
  byCategory: { category: Category; label: string; total: number; share: number }[];
}

export function summarize(cards: FinanceCard[], now = Date.now()): MonthSummary {
  const txs = monthTransactions(cards, now);
  const inflows = txs
    .filter(isIncome)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((t) => ({ id: t.id, merchant: t.merchant, date: t.date, amount: t.amount, save: round2(t.amount * SAVE_RATE) }));
  const received = round2(inflows.reduce((n, t) => n + t.amount, 0));
  const spent = round2(txs.filter((t) => t.amount < 0).reduce((n, t) => n - t.amount, 0));
  const cats = new Map<Category, number>();
  for (const t of txs) if (t.amount < 0) cats.set(t.category, (cats.get(t.category) ?? 0) - t.amount);
  const byCategory = [...cats]
    .map(([category, total]) => ({ category, label: CATEGORY_LABEL[category], total: round2(total), share: spent ? total / spent : 0 }))
    .sort((a, b) => b.total - a.total);
  return { received, spent, net: round2(received - spent), inflows, toSave: round2(inflows.reduce((n, t) => n + t.save, 0)), byCategory };
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export interface Tip {
  id: string;
  text: string;
  tone?: 'warn' | 'good';
}

/** Até 3 dicas, da mais urgente para a menos. */
export function tips(cards: FinanceCard[], now = Date.now(), saved = 0): Tip[] {
  const s = summarize(cards, now);
  const out: Tip[] = [];
  const txs = monthTransactions(cards, now);

  if (s.spent > s.received && s.received > 0)
    out.push({ id: 'over', tone: 'warn', text: `Você gastou ${brl(s.spent - s.received)} a mais do que recebeu este mês. Segure gastos variáveis até a próxima entrada.` });

  for (const c of cards) {
    if (c.kind === 'credit' && c.limit && c.balance / c.limit > 0.3)
      out.push({
        id: `limit-${c.id}`,
        tone: 'warn',
        text: `A fatura do ${c.product} já usa ${Math.round((c.balance / c.limit) * 100)}% do limite. Acima de 30% pesa no seu score.`,
      });
  }

  // custo fixo (aluguel, assinaturas) não se corta com teto semanal: olha só os variáveis
  const top = s.byCategory.find((c) => !FIXED.includes(c.category));
  if (top && top.share >= 0.3)
    out.push({ id: 'top', text: `${top.label} levou ${Math.round(top.share * 100)}% dos gastos (${brl(top.total)}). Defina um teto semanal para essa categoria.` });

  const small = txs.filter((t) => t.amount < 0 && -t.amount <= 30);
  if (small.length >= 3) {
    const total = small.reduce((n, t) => n - t.amount, 0);
    out.push({ id: 'small', text: `${small.length} gastos pequenos (até R$ 30) somam ${brl(total)}. São os mais fáceis de cortar.` });
  }

  const subs = txs.filter((t) => t.category === 'assinatura');
  if (subs.length >= 2) out.push({ id: 'subs', text: `${subs.length} assinaturas cobradas: ${brl(subs.reduce((n, t) => n - t.amount, 0))}. Revise as que não usou no mês.` });

  if (s.toSave > 0 && saved >= s.toSave) out.push({ id: 'saved', tone: 'good', text: `Meta dos 10% cumprida: ${brl(saved)} guardados este mês.` });
  else if (s.toSave > 0) out.push({ id: 'save', text: `Faltam ${brl(s.toSave - saved)} para guardar 10% do que entrou. Faça um Pix para a reserva no dia em que o dinheiro cai.` });

  return out.slice(0, 3);
}

export { brl };
