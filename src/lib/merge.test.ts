import { describe, expect, it } from 'vitest';
import type { AppState, Goal, Task } from './types';
import { freshState } from './store';
import { isPristine, mergeStates, stampChanges } from './merge';
import { stable } from './cloud';

const task = (id: string, title: string, extra: Partial<Task> = {}): Task => ({ id, title, done: false, createdAt: '2026-10-20T10:00:00Z', priority: 1, ...extra });
const goal = (id: string, title: string, extra: Partial<Goal> = {}): Goal => ({
  id,
  title,
  area: 'financas',
  kind: 'numeric',
  start: '2026-10-01',
  milestones: [],
  log: [],
  checkin: { freq: 'none', time: '20:00', weekday: 0 },
  status: 'active',
  createdAt: '2026-10-01T10:00:00Z',
  ...extra,
});
const st = (patch: Partial<AppState>): AppState => ({ ...freshState(), tasks: [], ...patch });

describe('juntar dados de aparelhos da mesma conta', () => {
  it('aparelho novo (só tarefas iniciais) recebe tudo da conta, sem as tarefas iniciais', () => {
    const fresh = freshState();
    expect(isPristine(fresh)).toBe(true);
    const account = st({ goals: [goal('g', 'Fazer 1000 reais')], tasks: [task('t', 'Geografia')], editedAt: 5 });
    const out = mergeStates(fresh, account);
    expect(out.goals.map((g) => g.title)).toEqual(['Fazer 1000 reais']);
    expect(out.tasks.map((t) => t.title)).toEqual(['Geografia']);
  });

  it('conta só com tarefas iniciais não apaga os dados do aparelho', () => {
    const phone = st({ goals: [goal('g', 'Meta')], editedAt: 9 });
    const out = mergeStates(phone, freshState());
    expect(out.goals).toHaveLength(1);
    expect(out.tasks).toHaveLength(0);
  });

  it('itens criados em aparelhos diferentes ficam todos', () => {
    const a = st({ tasks: [task('a', 'do celular')], editedAt: 1 });
    const b = st({ tasks: [task('b', 'do computador')], editedAt: 2 });
    expect(mergeStates(a, b).tasks.map((t) => t.id).sort()).toEqual(['a', 'b']);
  });

  it('mesmo item: vale a alteração mais recente', () => {
    const a = st({ tasks: [task('t', 'velho', { updatedAt: 100 })] });
    const b = st({ tasks: [task('t', 'novo', { updatedAt: 200 })] });
    expect(mergeStates(a, b).tasks[0].title).toBe('novo');
    expect(mergeStates(b, a).tasks[0].title).toBe('novo');
  });

  it('itens antigos sem updatedAt: vale o aparelho editado por último', () => {
    const old = st({ goals: [goal('g', 'Meta', { current: 100 })], editedAt: 100 });
    const recent = st({ goals: [goal('g', 'Meta', { current: 330 })], editedAt: 200 });
    expect(mergeStates(old, recent).goals[0].current).toBe(330);
    expect(mergeStates(recent, old).goals[0].current).toBe(330);
  });

  it('apagar vale em todos os aparelhos; editar depois de apagar traz de volta', () => {
    const before = st({ tasks: [task('t', 'x', { updatedAt: 100 }), task('k', 'fica', { updatedAt: 100 })] });
    const afterDelete = stampChanges(before, { ...before, tasks: [before.tasks[1]] }, 500);
    expect(afterDelete.deleted).toEqual({ t: 500 });
    expect(mergeStates(before, afterDelete, 1000).tasks.map((t) => t.id)).toEqual(['k']);
    const editedLater = st({ tasks: [task('t', 'editado', { updatedAt: 900 })] });
    expect(mergeStates(editedLater, afterDelete, 1000).tasks.map((t) => t.id).sort()).toEqual(['k', 't']);
  });

  it('marca só o que mudou', () => {
    const a = st({ tasks: [task('1', 'a'), task('2', 'b')] });
    const next = stampChanges(a, { ...a, tasks: [a.tasks[0], { ...a.tasks[1], done: true }] }, 777);
    expect(next.tasks[0].updatedAt).toBeUndefined();
    expect(next.tasks[1].updatedAt).toBe(777);
  });

  it('permissões de notificação continuam as do aparelho; o resto das configurações sincroniza', () => {
    const phone = st({ goals: [goal('g', 'x')], settings: { ...freshState().settings, push: true, notifications: true, theme: 'dark' }, settingsAt: 1 });
    const desk = st({ goals: [goal('g', 'x')], settings: { ...freshState().settings, push: false, notifications: false, theme: 'light' }, settingsAt: 2 });
    const out = mergeStates(phone, desk);
    expect(out.settings.theme).toBe('light');
    expect(out.settings.push).toBe(true);
    expect(out.settings.notifications).toBe(true);
  });

  it('central de avisos: junta pela chave e lido em um aparelho fica lido', () => {
    const item = { id: '1', key: 'rem:x:1', at: 10, title: 'Ler', body: '', kind: 'reminder' as const, url: '#/', read: false };
    const a = st({ goals: [goal('g', 'x')], inbox: [item] });
    const b = st({ goals: [goal('g', 'x')], inbox: [{ ...item, id: '2', read: true }] });
    const out = mergeStates(a, b);
    expect(out.inbox).toHaveLength(1);
    expect(out.inbox[0].read).toBe(true);
  });

  it('juntar de novo dá o mesmo resultado (não fica subindo sem parar)', () => {
    const a = st({ tasks: [task('a', 'x', { updatedAt: 3 })], goals: [goal('g', 'm')], editedAt: 1 });
    const b = st({ tasks: [task('b', 'y')], journal: { '2026-10-30': { good: 'a', blocked: '', score: 4, at: '2026-10-30T22:00:00Z' } }, editedAt: 2 });
    const m1 = mergeStates(a, b);
    const m2 = mergeStates(b, m1);
    const m3 = mergeStates(m1, m2);
    expect(stable(m3)).toBe(stable(m1));
    expect(stable(mergeStates(m1, m1))).toBe(stable(m1));
  });
});
