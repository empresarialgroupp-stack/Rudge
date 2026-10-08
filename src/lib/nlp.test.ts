import { describe, expect, it } from 'vitest';
import { parseInput } from './nlp';

// quinta-feira, 8 de outubro de 2026, 10:00
const NOW = new Date(2026, 9, 8, 10, 0, 0);

describe('parseInput', () => {
  it('lembrete com amanhã e horário', () => {
    const r = parseInput('me lembre de pagar o boleto amanhã às 10h', NOW);
    expect(r.title).toBe('Pagar o boleto');
    expect(r.date).toBe('2026-10-09');
    expect(r.time).toBe('10:00');
    expect(r.repeat).toBe('none');
  });

  it('relativo em minutos', () => {
    const r = parseInput('ligar para o João em 15 min', NOW);
    expect(r.title).toBe('Ligar para o João');
    expect(r.date).toBe('2026-10-08');
    expect(r.time).toBe('10:15');
  });

  it('horário com minutos e período', () => {
    const r = parseInput('reunião com cliente sexta 8:30 da noite', NOW);
    expect(r.title).toBe('Reunião com cliente');
    expect(r.date).toBe('2026-10-09');
    expect(r.time).toBe('20:30');
  });

  it('dia da semana igual a hoje vai para a próxima semana', () => {
    const r = parseInput('enviar relatório quinta', NOW);
    expect(r.date).toBe('2026-10-15');
  });

  it('horário que já passou sem data vai para amanhã', () => {
    const r = parseInput('tomar remédio às 9h', NOW);
    expect(r.date).toBe('2026-10-09');
    expect(r.time).toBe('09:00');
  });

  it('recorrência diária', () => {
    const r = parseInput('beber água todo dia às 15h', NOW);
    expect(r.title).toBe('Beber água');
    expect(r.repeat).toBe('daily');
    expect(r.time).toBe('15:00');
  });

  it('recorrência semanal com dias', () => {
    const r = parseInput('academia toda segunda e quarta 7h', NOW);
    expect(r.title).toBe('Academia');
    expect(r.repeat).toBe('weekly');
    expect(r.days).toEqual([1, 3]);
    expect(r.time).toBe('07:00');
  });

  it('mensal em dia fixo', () => {
    const r = parseInput('pagar aluguel todo dia 5', NOW);
    expect(r.title).toBe('Pagar aluguel');
    expect(r.repeat).toBe('monthly');
    expect(r.date).toBe('2026-11-05');
  });

  it('data dd/mm e prioridade', () => {
    const r = parseInput('renovar CNH 15/11 !!!', NOW);
    expect(r.title).toBe('Renovar CNH');
    expect(r.date).toBe('2026-11-15');
    expect(r.priority).toBe(3);
  });

  it('data por extenso e área', () => {
    const r = parseInput('consulta dentista 20 de outubro às 14:30 #saude', NOW);
    expect(r.title).toBe('Consulta dentista');
    expect(r.date).toBe('2026-10-20');
    expect(r.time).toBe('14:30');
    expect(r.area).toBe('saude');
  });

  it('não confunde artigo "as" com horário', () => {
    const r = parseInput('comprar as frutas', NOW);
    expect(r.title).toBe('Comprar as frutas');
    expect(r.date).toBeUndefined();
    expect(r.time).toBeUndefined();
  });

  it('hoje à noite', () => {
    const r = parseInput('estudar inglês hoje à noite', NOW);
    expect(r.title).toBe('Estudar inglês');
    expect(r.date).toBe('2026-10-08');
    expect(r.time).toBe('20:00');
  });

  it('daqui a meia hora', () => {
    const r = parseInput('lembrete: tirar a roupa da máquina daqui a meia hora', NOW);
    expect(r.title).toBe('Tirar a roupa da máquina');
    expect(r.time).toBe('10:30');
  });
});
