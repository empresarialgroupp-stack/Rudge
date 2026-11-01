// Visão geral da Carteira: totais dos cartões, curva do mês e lista de transações.
// Funções puras, valem para dados de exemplo, extratos importados e Meu Pluggy.
import { CATEGORY_LABEL } from './sample';
import { isIncome, monthKey, summarize } from './insights';
import type { Category, FinanceCard, FinanceTransaction } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pagar a fatura não é gasto novo (mesma regra do resumo do mês). */
export const isSpend = (t: FinanceTransaction) => t.amount < 0 && t.category !== 'fatura';

export interface Totals {
  /** soma do disponível nas contas */
  cash: number;
  accounts: number;
  /** soma das faturas abertas */
  bills: number;
  /** soma dos limites dos cartões de crédito */
  limit: number;
  credits: number;
}

export function totals(cards: FinanceCard[]): Totals {
  const debit = cards.filter((c) => c.kind === 'debit');
  const credit = cards.filter((c) => c.kind === 'credit');
  return {
    cash: round2(debit.reduce((n, c) => n + c.balance, 0)),
    accounts: debit.length,
    bills: round2(credit.reduce((n, c) => n + Math.max(0, c.balance), 0)),
    limit: round2(credit.reduce((n, c) => n + (c.limit ?? 0), 0)),
    credits: credit.length,
  };
}

/** Um dia do mês anterior, para reaproveitar summarize() no mês passado. */
export function previousMonth(now = Date.now()) {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth() - 1, 15, 12).getTime();
}

export interface MonthCompare {
  received: number;
  spent: number;
  /** variação em relação ao mesmo ponto do mês passado (0.12 = +12%); null sem base */
  receivedDelta: number | null;
  spentDelta: number | null;
}

/** Até o dia de hoje: compara o mês atual com os mesmos dias do mês passado. */
export function compareMonths(cards: FinanceCard[], now = Date.now()): MonthCompare {
  const cur = summarize(cards, now);
  const day = new Date(now).getDate();
  const prev = daily(cards, previousMonth(now), true);
  const upTo = Math.min(day, prev.received.length) - 1;
  const pr = upTo >= 0 ? prev.received[upTo] : 0;
  const ps = upTo >= 0 ? prev.spent[upTo] : 0;
  const delta = (a: number, b: number) => (b > 0 ? (a - b) / b : null);
  return { received: cur.received, spent: cur.spent, receivedDelta: delta(cur.received, pr), spentDelta: delta(cur.spent, ps) };
}

export interface DailySeries {
  /** dias do mês: 1, 2, 3… */
  days: number[];
  /** entradas acumuladas até cada dia */
  received: number[];
  /** gastos acumulados até cada dia */
  spent: number[];
}

/**
 * Curva acumulada do mês de `when`. No mês atual vai só até hoje (a não ser que `full`);
 * nos meses passados mostra o mês inteiro.
 */
export function daily(cards: FinanceCard[], when = Date.now(), full = false, now = Date.now()): DailySeries {
  const d = new Date(when);
  const key = monthKey(when);
  const length = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const last = !full && key === monthKey(now) ? new Date(now).getDate() : length;
  const inDay = new Array<number>(length).fill(0);
  const outDay = new Array<number>(length).fill(0);
  for (const c of cards)
    for (const t of c.transactions) {
      if (monthKey(t.date) !== key) continue;
      const i = new Date(t.date).getDate() - 1;
      if (isIncome(t)) inDay[i] += t.amount;
      else if (isSpend(t)) outDay[i] -= t.amount;
    }
  const days: number[] = [];
  const received: number[] = [];
  const spent: number[] = [];
  let a = 0;
  let b = 0;
  for (let i = 0; i < last; i++) {
    a += inDay[i];
    b += outDay[i];
    days.push(i + 1);
    received.push(round2(a));
    spent.push(round2(b));
  }
  return { days, received, spent };
}

export type TxKind = 'in' | 'out' | 'bill' | 'refund';

export interface ActivityRow extends FinanceTransaction {
  cardId: string;
  cardName: string;
  lastFour: string;
  kind: TxKind;
  categoryLabel: string;
}

export function txKind(t: FinanceTransaction): TxKind {
  if (t.category === 'fatura') return 'bill';
  if (t.amount < 0) return 'out';
  return isIncome(t) ? 'in' : 'refund';
}

/** Todas as transações dos cartões, da mais recente para a mais antiga. */
export function activity(cards: FinanceCard[]): ActivityRow[] {
  return cards
    .flatMap((c) =>
      c.transactions.map((t) => ({
        ...t,
        cardId: c.id,
        cardName: `${c.issuer} · ${c.product}`,
        lastFour: c.lastFour,
        kind: txKind(t),
        categoryLabel: CATEGORY_LABEL[t.category] ?? 'Outros',
      })),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export interface ActivityFilter {
  query?: string;
  category?: Category | 'all';
  kind?: 'all' | 'in' | 'out';
}

export function filterActivity(rows: ActivityRow[], f: ActivityFilter) {
  const q = fold(f.query?.trim() ?? '');
  return rows.filter((r) => {
    if (f.category && f.category !== 'all' && r.category !== f.category) return false;
    if (f.kind === 'in' && r.amount <= 0) return false;
    if (f.kind === 'out' && r.amount >= 0) return false;
    if (q && !fold(`${r.merchant} ${r.detail} ${r.categoryLabel} ${r.cardName}`).includes(q)) return false;
    return true;
  });
}

/** Categorias que aparecem nas transações, na ordem do rótulo. */
export function categoriesIn(rows: ActivityRow[]) {
  return [...new Set(rows.map((r) => r.category))].sort((a, b) => CATEGORY_LABEL[a].localeCompare(CATEGORY_LABEL[b], 'pt-BR'));
}

/** "1,2 mil", "850": rótulos curtos para o eixo do gráfico. */
export function compactBRL(n: number) {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return Math.round(n).toLocaleString('pt-BR');
}
