import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const m = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
  };
});
vi.mock('./auth', () => ({ getSession: () => ({ userId: 'u1', token: 't', email: 'a@b.c', at: 0 }) }));

import { applyRemote, freshState, getState, setState } from './store';
import { syncAccount } from './cloud';
import type { AppState } from './types';

/** servidor em memória com a mesma regra de rev do /state */
function server(initial?: AppState) {
  const db = { rev: initial ? 1 : 0, data: initial ?? null, puts: 0 };
  vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
    const b = JSON.parse(init.body);
    let out: unknown;
    if (b.op === 'get') out = !db.data ? { rev: 0 } : b.since === db.rev ? { rev: db.rev, same: true } : { rev: db.rev, data: db.data };
    else if (b.op === 'put') {
      if (b.baseRev !== db.rev) out = { conflict: true, rev: db.rev, data: db.data };
      else {
        db.rev++;
        db.data = b.data;
        db.puts++;
        out = { ok: true, rev: db.rev };
      }
    }
    return { ok: true, json: async () => out };
  });
  return db;
}

afterEach(() => vi.unstubAllGlobals());

describe('sincronização da conta', () => {
  it('aparelho com dados e conta vazia: sobe tudo', async () => {
    applyRemote({ ...freshState(), tasks: [{ id: 'a', title: 'Geografia', done: false, createdAt: '2026-10-20T10:00:00Z', priority: 1 }] });
    const db = server();
    await syncAccount();
    expect(db.puts).toBe(1);
    expect(db.data?.tasks.map((t) => t.title)).toEqual(['Geografia']);
  });

  it('outro aparelho gravou antes: junta e não perde nada de nenhum lado', async () => {
    const other: AppState = { ...getState(), tasks: [...getState().tasks, { id: 'b', title: 'Do computador', done: false, createdAt: '2026-10-21T10:00:00Z', priority: 1, updatedAt: 50 }] };
    const db = server(other);
    db.rev = 7;
    setState((s) => ({ ...s, tasks: [...s.tasks, { id: 'c', title: 'Do celular', done: false, createdAt: '2026-10-22T10:00:00Z', priority: 1 }] }));
    await syncAccount();
    const titles = (db.data?.tasks ?? []).map((t) => t.title).sort();
    expect(titles).toEqual(['Do celular', 'Do computador', 'Geografia']);
    expect(getState().tasks.map((t) => t.title).sort()).toEqual(titles);
    const puts = db.puts;
    await syncAccount();
    expect(db.puts).toBe(puts);
  });
});
