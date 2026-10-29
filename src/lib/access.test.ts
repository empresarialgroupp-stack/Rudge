import { describe, expect, it } from 'vitest';
import { appBlocked, parseAccess } from './access';

describe('acesso por plano', () => {
  it('lê a resposta de my_access', () => {
    expect(parseAccess({ plan: 'combo', music: true, app: true, storage_gb: 25 })).toEqual({ plan: 'combo', music: true, app: true, storageGb: 25 });
    expect(parseAccess(null)).toBeNull();
    expect(parseAccess({ foo: 1 })).toBeNull();
  });
  it('só bloqueia quando o servidor diz que o plano não inclui o app', () => {
    expect(appBlocked({ status: 'loading' })).toBe(false);
    expect(appBlocked({ status: 'unknown' })).toBe(false);
    expect(appBlocked({ status: 'ready', access: { plan: 'music', music: true, app: false } })).toBe(true);
    expect(appBlocked({ status: 'ready', access: { plan: 'combo', music: true, app: true } })).toBe(false);
  });
});
