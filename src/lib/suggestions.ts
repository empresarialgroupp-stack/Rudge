// "Rudge sugere": propostas contextuais com base no estado atual.
import type { AppState, AreaKey } from './types';
import { diffDays, todayKey } from './date';
import { AREA_LABEL, goalPace, goalProgress, habitStreak } from './goals';
import { TEMPLATES, type GoalTemplate } from './templates';

export type SuggestionAction =
  | { type: 'wizard'; templateId?: string }
  | { type: 'overdue-today' }
  | { type: 'goal'; goalId: string }
  | { type: 'navigate'; to: string }
  | { type: 'notifications' }
  | { type: 'install' }
  | { type: 'add-task'; title: string; goalId?: string };

export interface Suggestion {
  id: string;
  tone: 'goal' | 'focus' | 'habit' | 'system' | 'review';
  title: string;
  body: string;
  cta: string;
  action: SuggestionAction;
  priority: number;
}

const AREA_ORDER: AreaKey[] = ['saude', 'financas', 'carreira', 'estudos', 'pessoal', 'relacionamentos', 'casa'];

function dayOfYear(d = new Date()) {
  return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000);
}

/** Metas propostas, priorizando áreas da vida ainda sem meta ativa. */
export function proposeGoals(s: AppState, n = 6): GoalTemplate[] {
  const activeAreas = new Set(s.goals.filter((g) => g.status === 'active').map((g) => g.area));
  const used = new Set(s.goals.map((g) => g.templateId).filter(Boolean));
  const seed = dayOfYear();
  const pool = TEMPLATES.filter((t) => !used.has(t.id));
  const score = (t: GoalTemplate) => {
    const gap = activeAreas.has(t.area) ? 0 : 100;
    const areaRank = 10 - AREA_ORDER.indexOf(t.area);
    const rotate = (TEMPLATES.indexOf(t) * 7 + seed) % 13;
    return gap + areaRank + rotate;
  };
  const sorted = [...pool].sort((a, b) => score(b) - score(a));
  // diversidade: no máximo 2 por área
  const out: GoalTemplate[] = [];
  const perArea: Record<string, number> = {};
  for (const t of sorted) {
    if ((perArea[t.area] ?? 0) >= 2) continue;
    perArea[t.area] = (perArea[t.area] ?? 0) + 1;
    out.push(t);
    if (out.length >= n) break;
  }
  return out;
}

export function getSuggestions(
  s: AppState,
  ctx: { notificationsOk: boolean; installed: boolean },
): Suggestion[] {
  const today = todayKey();
  const out: Suggestion[] = [];
  const hour = new Date().getHours();
  const open = s.tasks.filter((t) => !t.done);
  const overdue = open.filter((t) => t.due && t.due < today);
  const todayTasks = open.filter((t) => t.due === today);
  const active = s.goals.filter((g) => g.status === 'active');

  if (!ctx.notificationsOk) {
    out.push({
      id: 'notif',
      tone: 'system',
      title: 'Ative as notificações',
      body: 'Sem elas o Rudge não consegue lembrar você de metas, hábitos e compromissos.',
      cta: 'Ativar agora',
      action: { type: 'notifications' },
      priority: 95,
    });
  }

  if (overdue.length) {
    out.push({
      id: `overdue-${overdue.length}`,
      tone: 'focus',
      title: `${overdue.length} tarefa${overdue.length > 1 ? 's' : ''} atrasada${overdue.length > 1 ? 's' : ''}`,
      body: 'Traga para hoje o que ainda faz sentido e exclua o que perdeu a importância.',
      cta: 'Mover para hoje',
      action: { type: 'overdue-today' },
      priority: 90,
    });
  }

  if (!active.length) {
    out.push({
      id: 'first-goal',
      tone: 'goal',
      title: s.goals.length ? 'Defina sua próxima meta' : 'Defina sua primeira meta',
      body: 'Escolha uma área da vida e o Rudge monta o plano com etapas, hábito e lembretes.',
      cta: 'Criar meta',
      action: { type: 'wizard' },
      priority: 88,
    });
  }

  for (const g of active) {
    const pace = goalPace(g, today);
    if (pace.status === 'behind') {
      out.push({
        id: `behind-${g.id}`,
        tone: 'goal',
        title: `“${g.title}” está ${pace.label.toLowerCase()}`,
        body: pace.advice,
        cta: 'Criar tarefa para hoje',
        action: { type: 'add-task', title: `Avançar na meta: ${g.title}`, goalId: g.id },
        priority: 85,
      });
    } else if (pace.status === 'overdue') {
      out.push({
        id: `overdue-goal-${g.id}`,
        tone: 'goal',
        title: `Prazo vencido: ${g.title}`,
        body: 'Ajuste o prazo para continuar ou conclua a meta.',
        cta: 'Abrir meta',
        action: { type: 'goal', goalId: g.id },
        priority: 75,
      });
    }
    const lastLog = g.log.length ? g.log[g.log.length - 1].date.slice(0, 10) : g.createdAt.slice(0, 10);
    const silent = diffDays(today, lastLog);
    if (silent >= 7 && pace.status !== 'behind') {
      out.push({
        id: `silent-${g.id}`,
        tone: 'goal',
        title: `Sem registro há ${silent} dias`,
        body: `Atualize o progresso de “${g.title}” para manter o ritmo calculado.`,
        cta: 'Registrar',
        action: { type: 'goal', goalId: g.id },
        priority: 70,
      });
    }
    const p = goalProgress(g);
    if (p >= 0.85 && p < 1) {
      out.push({
        id: `almost-${g.id}`,
        tone: 'goal',
        title: `Falta pouco: ${g.title}`,
        body: `${Math.round(p * 100)}% concluída. Um empurrão final e está feito.`,
        cta: 'Ver meta',
        action: { type: 'goal', goalId: g.id },
        priority: 55,
      });
    }
  }

  // revisão semanal
  const wd = new Date().getDay();
  const reviewDay = s.settings.weekly.weekday;
  const isReviewWindow = wd === reviewDay || wd === (reviewDay + 1) % 7;
  const lastReview = s.lastWeeklyReview ? diffDays(today, s.lastWeeklyReview) : 99;
  if (isReviewWindow && lastReview > 5) {
    out.push({
      id: `weekly-${today}`,
      tone: 'review',
      title: 'Revisão semanal',
      body: '5 minutos para fechar a semana, ajustar metas e escolher 3 prioridades.',
      cta: 'Começar',
      action: { type: 'navigate', to: 'revisao' },
      priority: 80,
    });
  }

  if (!todayTasks.length && !overdue.length && hour < 19) {
    out.push({
      id: 'plan-today',
      tone: 'focus',
      title: 'Planeje seu dia',
      body: 'Dias com até 3 prioridades claras rendem mais. O que precisa sair hoje?',
      cta: 'Adicionar tarefa',
      action: { type: 'navigate', to: 'tarefas' },
      priority: 60,
    });
  }
  if (todayTasks.length > 8) {
    out.push({
      id: 'overload',
      tone: 'focus',
      title: 'Dia sobrecarregado',
      body: `${todayTasks.length} tarefas para hoje. Escolha as 3 mais importantes e reagende o resto.`,
      cta: 'Revisar tarefas',
      action: { type: 'navigate', to: 'tarefas' },
      priority: 65,
    });
  }

  // hábitos: sequência quebrada
  for (const h of s.habits.filter((x) => !x.archived)) {
    const streakNow = habitStreak(h, today);
    if (streakNow === 0 && h.log.length >= 3) {
      out.push({
        id: `habit-restart-${h.id}`,
        tone: 'habit',
        title: `Recomece: ${h.title}`,
        body: 'A sequência quebrou — o que importa é voltar hoje.',
        cta: 'Ver hábitos',
        action: { type: 'navigate', to: 'habitos' },
        priority: 40,
      });
    }
  }

  // propostas de metas em áreas sem foco
  const activeAreas = new Set(active.map((g) => g.area));
  if (active.length) {
    const props = proposeGoals(s, 6).filter((t) => !activeAreas.has(t.area)).slice(0, 2);
    for (const t of props) {
      out.push({
        id: `prop-${t.id}`,
        tone: 'goal',
        title: `Proposta de ${AREA_LABEL[t.area]}: ${t.title}`,
        body: t.pitch,
        cta: 'Adotar meta',
        action: { type: 'wizard', templateId: t.id },
        priority: 45,
      });
    }
  }

  // próximo nível após concluir
  for (const g of s.goals.filter((x) => x.status === 'done' && x.completedAt)) {
    if (diffDays(today, g.completedAt!.slice(0, 10)) <= 14 && !activeAreas.has(g.area)) {
      out.push({
        id: `next-${g.id}`,
        tone: 'goal',
        title: 'Próximo nível',
        body: `Você concluiu “${g.title}”. Que tal um desafio maior em ${AREA_LABEL[g.area]}?`,
        cta: 'Criar meta',
        action: { type: 'wizard', templateId: g.templateId },
        priority: 50,
      });
    }
  }

  if (!ctx.installed) {
    out.push({
      id: 'install',
      tone: 'system',
      title: 'Instale o Rudge',
      body: 'Abre em janela própria, funciona offline e mantém os lembretes ativos.',
      cta: 'Ver passo a passo',
      action: { type: 'install' },
      priority: 30,
    });
  }

  return out
    .filter((x) => s.dismissedSuggestions[x.id] !== today)
    .sort((a, b) => b.priority - a.priority);
}
