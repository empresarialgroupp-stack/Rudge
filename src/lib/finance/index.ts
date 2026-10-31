// Ponto único de acesso aos dados financeiros. Hoje: exemplo. Para Open Finance, basta
// registrar outro FinanceProvider aqui (ver docs/open-finance.md).
import { useEffect, useState } from 'react';
import { sampleProvider } from './sample';
import { monthKey } from './insights';
import type { FinanceCard, FinanceProvider } from './types';

export * from './types';
export * from './insights';

export function getProvider(): FinanceProvider {
  return sampleProvider;
}

export function useFinance() {
  const provider = getProvider();
  const [cards, setCards] = useState<FinanceCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  return { provider, cards, error };
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
