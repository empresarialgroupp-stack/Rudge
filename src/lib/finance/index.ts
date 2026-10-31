// Ponto único de acesso aos dados financeiros: extratos importados (OFX/CSV) quando houver,
// senão dados de exemplo. Para Open Finance, basta registrar outro FinanceProvider aqui
// (ver docs/open-finance.md).
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { CATEGORY_LABEL, sampleProvider } from './sample';
import { monthKey } from './insights';
import { accountToCard, mergeAccount, parseStatement, BANKS, type BankId, type ImportedAccount } from './importer';
import type { FinanceCard, FinanceProvider } from './types';
import { startPluggySync, usePluggy, type PluggyState } from './pluggy';

export * from './types';
export * from './insights';
export { BANKS, type BankId, type ImportedAccount };
export { linkPluggy, openPluggyConnect, pluggyConfig, syncPluggy, unlinkPluggy, usePluggy } from './pluggy';

/* ------- Contas importadas: ficam só neste aparelho ------- */

const ACCOUNTS_KEY = 'rudge.wallet.accounts.v1';
const listeners = new Set<() => void>();
let accounts: ImportedAccount[] = readAccounts();

function readAccounts(): ImportedAccount[] {
  try {
    const v = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? '[]') as ImportedAccount[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function saveAccounts(next: ImportedAccount[]) {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
  } catch {
    throw new Error('Sem espaço para guardar o extrato neste aparelho.');
  }
  accounts = next;
  listeners.forEach((l) => l());
}

export function useAccounts() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => accounts,
  );
}

export interface ImportInput {
  bank: BankId;
  kind: 'debit' | 'credit';
  lastFour: string;
  holder: string;
  limit?: number;
  text: string;
}

/** Lê o arquivo e junta à conta do mesmo banco/tipo/final. Devolve quantas transações vieram. */
export function importStatement(input: ImportInput) {
  const parsed = parseStatement(input.text);
  if (!parsed.txs.length) throw new Error('Nenhuma transação encontrada no arquivo.');
  const lastFour = input.lastFour.replace(/\D/g, '').slice(-4);
  const id = `${input.bank}-${input.kind}-${lastFour || 'x'}`;
  const prev = accounts.find((a) => a.id === id);
  const next = mergeAccount(prev, { id, bank: input.bank, kind: input.kind, lastFour, holder: input.holder, limit: input.limit }, parsed);
  saveAccounts([...accounts.filter((a) => a.id !== id), next]);
  return { count: parsed.txs.length, added: next.txs.length - (prev?.txs.length ?? 0), format: parsed.format };
}

export function removeAccount(id: string) {
  saveAccounts(accounts.filter((a) => a.id !== id));
}

const importedProvider: FinanceProvider = {
  id: 'import',
  label: 'Extratos importados',
  live: true,
  listCards: async () => accounts.map((a) => accountToCard(a, CATEGORY_LABEL)),
};

function pluggyProvider(p: PluggyState): FinanceProvider {
  return { id: 'pluggy', label: 'Sincronizado (Meu Pluggy)', live: true, listCards: async () => p.accounts.map((a) => accountToCard(a, CATEGORY_LABEL)) };
}

/** Ordem: bancos sincronizados → extratos importados → dados de exemplo. */
export function getProvider(list = accounts, p?: PluggyState): FinanceProvider {
  if (p?.linked && p.accounts.length) return pluggyProvider(p);
  return list.length ? importedProvider : sampleProvider;
}

export function useFinance() {
  const list = useAccounts();
  const pluggy = usePluggy();
  const provider = useMemo(() => getProvider(list, pluggy), [list, pluggy]);
  const [cards, setCards] = useState<FinanceCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => startPluggySync(), []);
  useEffect(() => {
    let alive = true;
    provider
      .listCards()
      .then((c) => alive && setCards(c))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [provider]);
  return { provider, cards, error, pluggy };
}

/* ------- Preferências deste aparelho: entradas já avisadas e quanto foi guardado ------- */

const KEY = 'rudge.wallet.v1';

interface WalletPrefs {
  seen: string[];
  /** id da entrada → valor guardado, por mês */
  saved: Record<string, Record<string, number>>;
}

function read(): WalletPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '') as WalletPrefs;
    return { seen: v.seen ?? [], saved: v.saved ?? {} };
  } catch {
    return { seen: [], saved: {} };
  }
}
function write(p: WalletPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* sem armazenamento: segue sem lembrar */
  }
}

/** Marca as entradas como vistas e devolve as que são novas. */
export function takeNewInflows(ids: string[]) {
  const p = read();
  const fresh = ids.filter((id) => !p.seen.includes(id));
  if (fresh.length) write({ ...p, seen: [...p.seen, ...fresh].slice(-500) });
  return fresh;
}

export function useSaved(now = Date.now()) {
  const month = monthKey(now);
  const [saved, setSaved] = useState<Record<string, number>>(() => read().saved[month] ?? {});
  const toggle = (id: string, amount: number) => {
    const p = read();
    const cur = { ...(p.saved[month] ?? {}) };
    if (cur[id]) delete cur[id];
    else cur[id] = amount;
    write({ ...p, saved: { ...p.saved, [month]: cur } });
    setSaved(cur);
  };
  return { saved, total: Object.values(saved).reduce((n, v) => n + v, 0), toggle };
}
