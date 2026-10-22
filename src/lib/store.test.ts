import { describe, expect, it } from 'vitest';
import { getState, inferEditedAt, isEdit, setState } from './store';

describe('editedAt (qual aparelho programa os avisos)', () => {
  it('editar tarefas/lembretes marca editedAt', () => {
    const before = Date.now();
    setState((s) => ({ ...s, reminders: [...s.reminders, { id: 'r', title: 'x', at: new Date().toISOString(), repeat: 'none', done: false, createdAt: new Date().toISOString() }] }));
    expect(getState().editedAt).toBeGreaterThanOrEqual(before);
  });

  it('tema, permissões e caixa de avisos não contam como edição', () => {
    const s = getState();
    expect(isEdit(s, { ...s, settings: { ...s.settings, theme: 'light', push: true, notifications: true } })).toBe(false);
    expect(isEdit(s, { ...s, inbox: [...s.inbox] })).toBe(false);
    expect(isEdit(s, { ...s, settings: { ...s.settings, briefing: { enabled: false, time: '08:00' } } })).toBe(true);
  });

  it('dados antigos: usa o registro mais recente que existir', () => {
    const t = inferEditedAt({
      tasks: [{ id: 't', title: 'a', done: true, createdAt: '2026-10-10T10:00:00Z', doneAt: '2026-10-19T12:00:00Z', priority: 1 }],
      reminders: [{ id: 'r', title: 'b', at: '2026-12-01T10:00:00Z', repeat: 'daily', done: false, createdAt: '2026-10-12T10:00:00Z', ackUntil: '2026-10-21T00:00:00Z' }],
    });
    expect(new Date(t).toISOString()).toBe('2026-10-21T00:00:00.000Z');
    expect(inferEditedAt({})).toBe(0);
  });
});
