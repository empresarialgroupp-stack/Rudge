// Converte contas e transações da Pluggy para o formato de conta da Carteira (o mesmo das
// contas importadas por extrato), sem dependências do Deno para poder ser testado no Vitest.

export interface PluggyAccount {
  id: string;
  itemId?: string;
  type: 'BANK' | 'CREDIT' | string;
  subtype?: string;
  name?: string;
  marketingName?: string | null;
  number?: string | null;
  balance?: number | null;
  owner?: string | null;
  creditData?: { creditLimit?: number | null; availableCreditLimit?: number | null; level?: string | null; brand?: string | null } | null;
}

export interface PluggyTransaction {
  id: string;
  date: string;
  description?: string | null;
  descriptionRaw?: string | null;
  amount: number;
  type?: 'DEBIT' | 'CREDIT' | string;
  status?: string;
  merchant?: { name?: string | null; businessName?: string | null } | null;
}

export interface PluggyItem {
  id: string;
  status?: string;
  lastUpdatedAt?: string | null;
  consentExpiresAt?: string | null;
  connector?: { name?: string | null } | null;
}

export type BankId = 'nubank' | 'inter' | 'mercadopago' | 'outro';

/** Mesmo formato de ImportedAccount (src/lib/finance/importer.ts). */
export interface SyncedAccount {
  id: string;
  bank: BankId;
  kind: 'debit' | 'credit';
  lastFour: string;
  holder: string;
  limit?: number;
  balance?: number;
  importedAt: number;
  txs: { id: string; date: string; description: string; amount: number }[];
  /** nome mostrado quando o banco não é um dos três conhecidos */
  label?: string;
  consentExpiresAt?: string;
}

export function detectBank(...names: (string | null | undefined)[]): BankId {
  const s = names.filter(Boolean).join(' ').toLowerCase();
  if (/nubank|nu pagamentos|\bnu\b/.test(s)) return 'nubank';
  if (/mercado ?pago/.test(s)) return 'mercadopago';
  if (/\binter\b|banco inter/.test(s)) return 'inter';
  return 'outro';
}

const lastFour = (n?: string | null) => (n ?? '').replace(/\D/g, '').slice(-4);
const firstName = (s?: string | null) => (s ?? '').trim().split(/\s+/)[0] ?? '';

/** DEBIT sai, CREDIT entra (vale para conta e cartão); sem type, usa o sinal da conta. */
export function signedAmount(t: PluggyTransaction, kind: 'debit' | 'credit') {
  const abs = Math.abs(t.amount);
  if (t.type === 'DEBIT') return -abs;
  if (t.type === 'CREDIT') return abs;
  return kind === 'credit' ? -t.amount : t.amount;
}

export function mapAccount(a: PluggyAccount, item: PluggyItem | undefined, txs: PluggyTransaction[], now = Date.now()): SyncedAccount {
  const kind = a.type === 'CREDIT' ? 'credit' : 'debit';
  // itens do Meu Pluggy podem vir com o conector "MeuPluggy": aí o banco sai do nome da conta
  const connector = /meu ?pluggy/i.test(item?.connector?.name ?? '') ? undefined : item?.connector?.name;
  const bank = detectBank(connector, a.marketingName, a.name);
  return {
    id: `pluggy-${a.id}`,
    bank,
    kind,
    lastFour: lastFour(a.number),
    holder: firstName(a.owner) || 'Você',
    limit: a.creditData?.creditLimit ?? undefined,
    balance: typeof a.balance === 'number' ? a.balance : undefined,
    importedAt: item?.lastUpdatedAt ? Date.parse(item.lastUpdatedAt) : now,
    label: bank === 'outro' ? connector || a.marketingName || a.name || undefined : undefined,
    consentExpiresAt: item?.consentExpiresAt ?? undefined,
    txs: txs
      .filter((t) => t.status !== 'PENDING' || kind === 'credit')
      .map((t) => ({
        id: t.id,
        date: t.date.slice(0, 10),
        description: (t.merchant?.name || t.description || t.descriptionRaw || 'Transação').trim(),
        amount: Math.round(signedAmount(t, kind) * 100) / 100,
      }))
      .sort((x, y) => y.date.localeCompare(x.date)),
  };
}

/**
 * No Meu Pluggy cada banco vira um item. O cartão costuma vir só com o nome do produto
 * ("Gold"), então herda o banco das outras contas do mesmo item.
 */
export function inheritBank(accounts: SyncedAccount[]): SyncedAccount[] {
  const known = accounts.find((a) => a.bank !== 'outro')?.bank;
  return known ? accounts.map((a) => (a.bank === 'outro' ? { ...a, bank: known, label: undefined } : a)) : accounts;
}
