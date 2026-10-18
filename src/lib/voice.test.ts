import { describe, expect, it } from 'vitest';
import { interpretLocal } from './voice';

describe('interpretLocal', () => {
  it('separa vários pedidos falados', () => {
    const r = interpretLocal('me lembra de pagar a luz amanhã às 10h e também ligar pro dentista sexta às 15h');
    expect(r.map((i) => i.title)).toEqual(['Pagar a luz', 'Ligar pro dentista']);
    expect(r.every((i) => i.kind === 'reminder')).toBe(true);
    expect(r[0].time).toBe('10:00');
  });
  it('afazer sem hora vira tarefa', () => {
    const r = interpretLocal('comprar pão');
    expect(r[0]).toMatchObject({ kind: 'task', title: 'Comprar pão' });
  });
});
