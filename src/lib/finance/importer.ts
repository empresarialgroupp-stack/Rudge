// Importação de extratos (OFX e CSV) de Nubank, Inter, Mercado Pago e outros bancos.
// Tudo roda no aparelho: o arquivo não sai do navegador e nenhuma senha de banco é pedida.
import type { CardVariant, Category, FinanceCard, FinanceTransaction } from './types';

export type BankId = 'nubank' | 'inter' | 'mercadopago' | 'outro';

export const BANKS: Record<BankId, { label: string; variant: CardVariant; tint?: string; how: string }> = {
  nubank: {
    label: 'Nubank',
    variant: 'color',
    tint: 'oklch(42% .19 305)',
    how: 'No app: conta → "Pedir extrato" (OFX ou CSV, chega por e-mail). Cartão: fatura → "Exportar fatura" (CSV).',
  },
  inter: {
    label: 'Inter',
    variant: 'color',
    tint: 'oklch(66% .17 50)',
    how: 'No app ou no site: Extrato → Exportar → OFX ou CSV.',
  },
  mercadopago: {
    label: 'Mercado Pago',
    variant: 'color',
    tint: 'oklch(58% .14 235)',
    how: 'No site: Seu dinheiro → Relatórios → "Extrato da conta" → baixar CSV.',
  },
  outro: { label: 'Outro banco', variant: 'metal', how: 'Procure "Exportar extrato" e escolha OFX (melhor) ou CSV.' },
};

export interface ParsedTx {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // + entrada, − saída
}

export interface ParseResult {
  txs: ParsedTx[];
  /** saldo informado pelo extrato, quando houver */
  balance?: number;
  format: 'ofx' | 'csv';
}

/* ---------------- números e datas ---------------- */

/** "1.234,56", "-1234.56", "R$ 1.234,56", "(12,00)" → número */
export function parseMoney(raw: string): number | null {
  let s = raw.trim().replace(/\s|R\$|"/g, '');
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    neg = !neg;
    s = s.slice(1);
  } else if (s.startsWith('+')) s = s.slice(1);
  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');
  if (comma > dot) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return neg ? -n : n;
}

/** "31/10/2026", "31-10-2026", "2026-10-31", "20261031...", "31/10/26" → "2026-10-31" */
export function parseDate(raw: string): string | null {
  const s = raw.trim().replace(/"/g, '');
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Id estável: mesma transação importada duas vezes não duplica. */
function withIds(txs: Omit<ParsedTx, 'id'>[]): ParsedTx[] {
  const seen = new Map<string, number>();
  return txs.map((t) => {
    const base = hash(`${t.date}|${t.amount.toFixed(2)}|${t.description.toLowerCase()}`);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { ...t, id: n ? `${base}-${n}` : base };
  });
}

/* ---------------- OFX ---------------- */

function tag(block: string, name: string) {
  const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'));
  return m ? m[1].trim() : '';
}

export function parseOfx(text: string): ParseResult {
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const txs: ParsedTx[] = [];
  for (const b of blocks) {
    const date = parseDate(tag(b, 'DTPOSTED'));
    const amount = parseMoney(tag(b, 'TRNAMT'));
    if (!date || amount === null) continue;
    const description = tag(b, 'MEMO') || tag(b, 'NAME') || 'Transação';
    const fitid = tag(b, 'FITID');
    txs.push({ id: fitid ? `o${hash(fitid + date)}` : hash(`${date}|${amount}|${description}`), date, description, amount });
  }
  const bal = text.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([^<\r\n]+)/i);
  return { txs, balance: bal ? (parseMoney(bal[1]) ?? undefined) : undefined, format: 'ofx' };
}

/* ---------------- CSV ---------------- */

function splitRow(line: string, sep: string) {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (c === sep && !q) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z_ ]/g, '')
    .trim();

const DATE_COLS = ['data', 'date', 'data lancamento', 'data da transacao', 'release_date', 'data movimento'];
const AMOUNT_COLS = ['valor', 'amount', 'transaction_net_amount', 'valor rs', 'valor (r$)', 'net_amount'];
const DESC_COLS = ['descricao', 'title', 'historico', 'description', 'transaction_type', 'estabelecimento', 'lancamento'];
const BALANCE_COLS = ['saldo', 'partial_balance', 'saldo rs', 'balance'];

function findCol(header: string[], names: string[]) {
  const h = header.map(norm);
  for (const n of names) {
    const i = h.indexOf(norm(n));
    if (i >= 0) return i;
  }
  for (const n of names) {
    const i = h.findIndex((x) => x.startsWith(norm(n)));
    if (i >= 0) return i;
  }
  return -1;
}

export function parseCsv(text: string): ParseResult {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const sep = (lines.slice(0, 15).join('\n').match(/;/g)?.length ?? 0) > (lines.slice(0, 15).join('\n').match(/,/g)?.length ?? 0) / 2 ? ';' : ',';
  // o cabeçalho pode vir depois de linhas de resumo (Inter, Mercado Pago)
  let hi = -1;
  let cols = { d: -1, a: -1, t: -1, b: -1 };
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const row = splitRow(lines[i], sep);
    const d = findCol(row, DATE_COLS);
    const a = findCol(row, AMOUNT_COLS);
    if (d >= 0 && a >= 0) {
      hi = i;
      cols = { d, a, t: findCol(row, DESC_COLS), b: findCol(row, BALANCE_COLS) };
      // Mercado Pago: "Valor" do resumo inicial não é o da transação
      const ex = findCol(row, ['transaction_net_amount']);
      if (ex >= 0) cols.a = ex;
      break;
    }
  }
  if (hi < 0) throw new Error('Não encontrei as colunas de data e valor neste CSV.');
  const header = splitRow(lines[hi], sep).map(norm);
  // fatura do Nubank (date,title,amount): compra vem positiva
  const invert = header.includes('title') && header.includes('amount') && !header.some((h) => h.startsWith('identificador'));
  const raw: Omit<ParsedTx, 'id'>[] = [];
  let balance: number | undefined;
  for (const line of lines.slice(hi + 1)) {
    const r = splitRow(line, sep);
    const date = parseDate(r[cols.d] ?? '');
    const amt = parseMoney(r[cols.a] ?? '');
    if (!date || amt === null) continue;
    const description = (cols.t >= 0 ? r[cols.t] : '') || 'Transação';
    raw.push({ date, description, amount: invert ? -amt : amt });
    if (cols.b >= 0) {
      const b = parseMoney(r[cols.b] ?? '');
      if (b !== null) balance = b;
    }
  }
  return { txs: withIds(raw), balance, format: 'csv' };
}

export function parseStatement(text: string): ParseResult {
  return /<OFX>|<STMTTRN>/i.test(text) ? parseOfx(text) : parseCsv(text);
}

/* ---------------- categorias ---------------- */

const RULES: [RegExp, Category][] = [
  [/salario|folha|pagamento de salario|proventos/, 'salario'],
  [/ifood|rappi|restaurante|lanchonete|padaria|bar |burger|pizza|cafe|starbucks|mcdonald/, 'restaurante'],
  [/uber|99 ?app|99pop|cabify|posto|combustivel|shell|ipiranga|estacionamento|metro|onibus|pedagio|sem parar/, 'transporte'],
  [/mercado(?! ?pago)|supermerc|atacad|assai|carrefour|pao de acucar|hortifruti|extra /, 'mercado'],
  [/netflix|spotify|youtube|prime video|amazon prime|disney|hbo|max |apple\.com|google|icloud|deezer|globoplay|academia|smartfit/, 'assinatura'],
  [/farmacia|drogaria|droga|raia|pacheco|hospital|clinica|laboratorio|unimed|odonto/, 'saude'],
  [/aluguel|condominio|energia|enel|light|cemig|copel|sabesp|agua|internet|vivo|claro|tim |oi /, 'casa'],
  [/amazon|mercado ?livre|shopee|magalu|americanas|aliexpress|shein|loja/, 'compras'],
  [/pix|transferencia|ted|doc /, 'pix'],
];

export function categorize(description: string, amount: number): Category {
  const d = ` ${norm(description)} `;
  if (amount > 0) {
    if (/estorno|reembolso|devolucao|cashback/.test(d)) return 'compras';
    if (/salario|folha|proventos/.test(d)) return 'salario';
    return 'pix';
  }
  if (/pagamento (de )?fatura|pgto fatura|fatura (do )?cartao/.test(d)) return 'fatura';
  for (const [re, cat] of RULES) if (re.test(d)) return cat;
  return 'outros';
}

/* ---------------- contas importadas ---------------- */

export interface ImportedAccount {
  id: string;
  bank: BankId;
  kind: 'debit' | 'credit';
  lastFour: string;
  holder: string;
  limit?: number;
  balance?: number;
  importedAt: number;
  txs: ParsedTx[];
}

/** Junta um extrato novo a uma conta existente, sem duplicar e mantendo 12 meses. */
export function mergeAccount(prev: ImportedAccount | undefined, next: Omit<ImportedAccount, 'txs' | 'importedAt'>, parsed: ParseResult, now = Date.now()): ImportedAccount {
  const byId = new Map((prev?.txs ?? []).map((t) => [t.id, t]));
  for (const t of parsed.txs) byId.set(t.id, t);
  const cutoff = new Date(now - 365 * 86_400_000).toISOString().slice(0, 10);
  const txs = [...byId.values()].filter((t) => t.date >= cutoff).sort((a, b) => b.date.localeCompare(a.date));
  return { ...prev, ...next, balance: parsed.balance ?? next.balance ?? prev?.balance, importedAt: now, txs };
}

function detail(t: ParsedTx, category: Category, labels: Record<Category, string>, now: number) {
  const today = new Date(now).toISOString().slice(0, 10);
  const yest = new Date(now - 86_400_000).toISOString().slice(0, 10);
  const when = t.date === today ? 'Hoje' : t.date === yest ? 'Ontem' : `${t.date.slice(8)}/${t.date.slice(5, 7)}`;
  return `${labels[category]} · ${when}`;
}

export function accountToCard(a: ImportedAccount, labels: Record<Category, string>, now = Date.now()): FinanceCard {
  const bank = BANKS[a.bank];
  const transactions: FinanceTransaction[] = a.txs.map((t) => {
    // no cartão, valor positivo é pagamento da fatura ou estorno, nunca dinheiro novo
    const category = a.kind === 'credit' && t.amount > 0 ? 'fatura' : categorize(t.description, t.amount);
    return { id: `${a.id}:${t.id}`, merchant: t.description, amount: t.amount, date: `${t.date}T12:00:00`, category, detail: detail(t, category, labels, now) };
  });
  const month = new Date(now).toISOString().slice(0, 7);
  const monthSpent = a.txs.filter((t) => t.date.startsWith(month) && t.amount < 0).reduce((n, t) => n - t.amount, 0);
  const credit = a.kind === 'credit';
  return {
    id: a.id,
    kind: a.kind,
    issuer: bank.label,
    product: credit ? 'Cartão de crédito' : 'Conta',
    lastFour: a.lastFour || '••••',
    holder: a.holder,
    variant: bank.variant,
    tint: bank.tint,
    limit: a.limit,
    balance: Math.round((credit ? monthSpent : (a.balance ?? a.txs.reduce((n, t) => n + t.amount, 0))) * 100) / 100,
    balanceLabel: credit ? 'Gasto no mês' : a.balance !== undefined ? 'Saldo' : 'Saldo do período',
    transactions,
  };
}
