// Biblioteca de metas propostas (SMART) por área.
import type { AreaKey } from './types';

export interface GoalTemplate {
  id: string;
  area: AreaKey;
  title: string;
  pitch: string;
  kind: 'numeric' | 'milestones';
  startValue?: number;
  target?: number;
  unit?: string;
  /** duração sugerida em dias */
  days: number;
  milestones?: string[];
  habit?: { title: string; days: number[]; time: string };
  checkin: 'daily' | 'weekly';
  firstStep: string;
  /** cada check-in do hábito conta +1 na meta */
  habitCounts?: boolean;
}

const ALL = [0, 1, 2, 3, 4, 5, 6];
const WEEK = [1, 2, 3, 4, 5];

export const TEMPLATES: GoalTemplate[] = [
  // Saúde
  {
    id: 'treino-3x', habitCounts: true, area: 'saude', title: 'Treinar 3x por semana por 12 semanas',
    pitch: 'Constância vence intensidade: 36 treinos em 3 meses.',
    kind: 'numeric', startValue: 0, target: 36, unit: 'treinos', days: 84,
    habit: { title: 'Treinar', days: [1, 3, 5], time: '07:00' }, checkin: 'weekly',
    firstStep: 'Escolher horário fixo e local de treino',
  },
  {
    id: 'agua-2l', habitCounts: true, area: 'saude', title: 'Beber 2L de água por dia durante 30 dias',
    pitch: 'Um hábito simples com efeito em energia e foco.',
    kind: 'numeric', startValue: 0, target: 30, unit: 'dias', days: 30,
    habit: { title: 'Beber 2L de água', days: ALL, time: '15:00' }, checkin: 'daily',
    firstStep: 'Comprar/separar uma garrafa de 1L',
  },
  {
    id: 'peso', area: 'saude', title: 'Perder 5 kg com saúde',
    pitch: 'Meta realista: ~0,5 kg por semana em 10 semanas.',
    kind: 'numeric', startValue: 80, target: 75, unit: 'kg', days: 70,
    habit: { title: 'Registrar refeições', days: ALL, time: '21:00' }, checkin: 'weekly',
    firstStep: 'Registrar o peso inicial e montar o cardápio da semana',
  },
  {
    id: 'sono', habitCounts: true, area: 'saude', title: 'Dormir antes das 23h por 21 dias',
    pitch: 'Sono regular melhora humor, memória e produtividade.',
    kind: 'numeric', startValue: 0, target: 21, unit: 'noites', days: 21,
    habit: { title: 'Desligar telas e deitar até 23h', days: ALL, time: '22:30' }, checkin: 'daily',
    firstStep: 'Definir rotina de desligar telas às 22h30',
  },
  {
    id: 'passos', habitCounts: true, area: 'saude', title: 'Caminhar 8.000 passos por dia por 1 mês',
    pitch: 'Movimento diário sem precisar de academia.',
    kind: 'numeric', startValue: 0, target: 30, unit: 'dias', days: 30,
    habit: { title: 'Caminhar 8.000 passos', days: ALL, time: '18:30' }, checkin: 'daily',
    firstStep: 'Ativar contador de passos no celular',
  },
  // Finanças
  {
    id: 'reserva', area: 'financas', title: 'Montar reserva de emergência',
    pitch: 'Tranquilidade: 6 meses de custo de vida guardados.',
    kind: 'numeric', startValue: 0, target: 10000, unit: 'R$', days: 365,
    checkin: 'weekly', firstStep: 'Calcular meu custo de vida mensal',
    milestones: ['Calcular custo de vida mensal', 'Abrir conta/aplicação com liquidez diária', 'Configurar transferência automática no dia do pagamento'],
  },
  {
    id: 'gastos', habitCounts: true, area: 'financas', title: 'Registrar todos os gastos por 30 dias',
    pitch: 'Você não controla o que não mede.',
    kind: 'numeric', startValue: 0, target: 30, unit: 'dias', days: 30,
    habit: { title: 'Registrar gastos do dia', days: ALL, time: '21:30' }, checkin: 'weekly',
    firstStep: 'Escolher planilha ou app de controle de gastos',
  },
  {
    id: 'divida', area: 'financas', title: 'Quitar uma dívida',
    pitch: 'Plano de pagamento com prazo e valor definidos.',
    kind: 'milestones', days: 180, checkin: 'weekly',
    milestones: ['Listar todas as dívidas, juros e valores', 'Negociar condições/desconto', 'Definir valor mensal de pagamento', 'Pagar 50% do saldo', 'Quitar o saldo restante'],
    firstStep: 'Listar dívidas com juros e valores',
  },
  {
    id: 'investir', area: 'financas', title: 'Investir todo mês por 6 meses',
    pitch: 'Disciplina mensal cria patrimônio.',
    kind: 'numeric', startValue: 0, target: 6, unit: 'aportes', days: 180, checkin: 'weekly',
    firstStep: 'Definir valor fixo de aporte mensal',
  },
  // Carreira
  {
    id: 'certificacao', area: 'carreira', title: 'Conquistar uma certificação profissional',
    pitch: 'Um marco concreto para crescer na carreira.',
    kind: 'milestones', days: 120, checkin: 'weekly',
    milestones: ['Escolher a certificação e data da prova', 'Montar cronograma de estudos', 'Concluir 50% do conteúdo', 'Fazer 2 simulados', 'Fazer a prova'],
    habit: { title: 'Estudar para a certificação', days: WEEK, time: '19:30' },
    firstStep: 'Pesquisar e escolher a certificação',
  },
  {
    id: 'linkedin', area: 'carreira', title: 'Atualizar currículo e LinkedIn',
    pitch: 'Posicionamento profissional atualizado em 2 semanas.',
    kind: 'milestones', days: 14, checkin: 'weekly',
    milestones: ['Listar conquistas dos últimos 2 anos', 'Reescrever o resumo profissional', 'Atualizar experiências e foto', 'Pedir 2 recomendações'],
    firstStep: 'Listar minhas principais conquistas',
  },
  {
    id: 'vendas', area: 'carreira', title: 'Fechar 10 novos clientes',
    pitch: 'Meta comercial com acompanhamento semanal.',
    kind: 'numeric', startValue: 0, target: 10, unit: 'clientes', days: 90, checkin: 'weekly',
    habit: { title: 'Prospectar 5 contatos', days: WEEK, time: '10:00' },
    firstStep: 'Montar lista de 50 potenciais clientes',
  },
  // Estudos
  {
    id: 'livros', area: 'estudos', title: 'Ler 12 livros em um ano',
    pitch: 'Um livro por mês — cerca de 20 páginas por dia.',
    kind: 'numeric', startValue: 0, target: 12, unit: 'livros', days: 365,
    habit: { title: 'Ler 20 páginas', days: ALL, time: '21:00' }, checkin: 'weekly',
    firstStep: 'Escolher os 3 primeiros livros',
  },
  {
    id: 'ingles', habitCounts: true, area: 'estudos', title: 'Estudar inglês 30 min por dia',
    pitch: '45 horas de prática em 90 dias.',
    kind: 'numeric', startValue: 0, target: 90, unit: 'sessões', days: 90,
    habit: { title: 'Estudar inglês 30 min', days: ALL, time: '20:00' }, checkin: 'weekly',
    firstStep: 'Escolher método/curso de inglês',
  },
  {
    id: 'curso', area: 'estudos', title: 'Concluir um curso online',
    pitch: 'Terminar o que começou — com prazo.',
    kind: 'numeric', startValue: 0, target: 100, unit: '%', days: 60,
    habit: { title: 'Assistir 1 aula do curso', days: WEEK, time: '19:00' }, checkin: 'weekly',
    firstStep: 'Ver quantas aulas faltam e dividir por semana',
  },
  // Pessoal
  {
    id: 'meditar', habitCounts: true, area: 'pessoal', title: 'Meditar 10 minutos por dia por 30 dias',
    pitch: 'Menos ansiedade, mais clareza.',
    kind: 'numeric', startValue: 0, target: 30, unit: 'dias', days: 30,
    habit: { title: 'Meditar 10 min', days: ALL, time: '07:30' }, checkin: 'daily',
    firstStep: 'Escolher app/guia de meditação',
  },
  {
    id: 'telas', habitCounts: true, area: 'pessoal', title: 'Reduzir redes sociais para 1h por dia',
    pitch: 'Recupere horas da semana para o que importa.',
    kind: 'numeric', startValue: 0, target: 30, unit: 'dias', days: 30,
    habit: { title: 'Máx. 1h de redes sociais', days: ALL, time: '22:00' }, checkin: 'weekly',
    firstStep: 'Configurar limite de uso no celular',
  },
  {
    id: 'planejar', habitCounts: true, area: 'pessoal', title: 'Planejar a semana todo domingo por 8 semanas',
    pitch: 'Semanas planejadas rendem o dobro.',
    kind: 'numeric', startValue: 0, target: 8, unit: 'revisões', days: 56,
    habit: { title: 'Revisão e planejamento semanal', days: [0], time: '18:00' }, checkin: 'weekly',
    firstStep: 'Fazer a primeira revisão semanal no Rudge',
  },
  // Relacionamentos
  {
    id: 'familia', habitCounts: true, area: 'relacionamentos', title: 'Um momento de qualidade com a família por semana',
    pitch: 'Presença intencional, sem celular.',
    kind: 'numeric', startValue: 0, target: 12, unit: 'encontros', days: 84,
    habit: { title: 'Momento em família', days: [6], time: '11:00' }, checkin: 'weekly',
    firstStep: 'Combinar o primeiro programa em família',
  },
  {
    id: 'amigos', habitCounts: true, area: 'relacionamentos', title: 'Falar com um amigo diferente por semana',
    pitch: 'Cultive as amizades que importam.',
    kind: 'numeric', startValue: 0, target: 12, unit: 'conversas', days: 84,
    habit: { title: 'Mandar mensagem/ligar para um amigo', days: [3], time: '19:00' }, checkin: 'weekly',
    firstStep: 'Listar 12 amigos com quem quero manter contato',
  },
  // Casa
  {
    id: 'organizar-casa', area: 'casa', title: 'Organizar a casa — um cômodo por semana',
    pitch: 'Destralhe e organize sem se sobrecarregar.',
    kind: 'milestones', days: 42, checkin: 'weekly',
    milestones: ['Quarto', 'Cozinha', 'Sala', 'Banheiro', 'Área de serviço', 'Escritório/armários'],
    firstStep: 'Separar 3 sacolas: doar, descartar, guardar',
  },
  {
    id: 'rotina-casa', habitCounts: true, area: 'casa', title: 'Rotina de 15 minutos de arrumação diária',
    pitch: 'Casa em ordem sem faxinas exaustivas.',
    kind: 'numeric', startValue: 0, target: 30, unit: 'dias', days: 30,
    habit: { title: '15 min de arrumação', days: ALL, time: '19:00' }, checkin: 'weekly',
    firstStep: 'Definir as tarefas fixas de cada dia',
  },
];

export function templateById(id?: string) {
  return TEMPLATES.find((t) => t.id === id);
}
