export type ID = string;

/** Áreas da vida usadas para agrupar metas, hábitos e tarefas. */
export type AreaKey =
  | 'saude'
  | 'financas'
  | 'carreira'
  | 'estudos'
  | 'pessoal'
  | 'relacionamentos'
  | 'casa';

/** 0 = nenhuma, 1 = baixa, 2 = média, 3 = alta */
export type Priority = 0 | 1 | 2 | 3;

export type Repeat = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

export interface Subtask {
  id: ID;
  title: string;
  done: boolean;
}

export interface Task {
  id: ID;
  title: string;
  notes?: string;
  done: boolean;
  doneAt?: string;
  createdAt: string;
  /** YYYY-MM-DD */
  due?: string;
  /** HH:MM */
  time?: string;
  priority: Priority;
  area?: AreaKey;
  goalId?: ID;
  /** minutos antes do horário para notificar; null = sem lembrete */
  remind?: number | null;
  subtasks?: Subtask[];
  /** tarefa recorrente: ao concluir, avança para a próxima data */
  repeat?: Repeat;
  days?: number[];
  lastDoneAt?: string;
}

export interface Milestone {
  id: ID;
  title: string;
  done: boolean;
  doneAt?: string;
  /** YYYY-MM-DD (opcional) */
  due?: string;
  /** metas numéricas: etapa concluída automaticamente ao atingir este valor */
  value?: number;
}

export interface GoalLog {
  date: string; // ISO
  value: number; // valor absoluto registrado (metas numéricas) ou 0
  note?: string;
}

export type CheckinFreq = 'none' | 'daily' | 'weekly';

export interface Goal {
  id: ID;
  title: string;
  why?: string;
  area: AreaKey;
  kind: 'numeric' | 'milestones';
  /** valor inicial (metas numéricas) */
  startValue?: number;
  target?: number;
  current?: number;
  unit?: string;
  /** YYYY-MM-DD */
  start: string;
  /** YYYY-MM-DD */
  deadline?: string;
  milestones: Milestone[];
  log: GoalLog[];
  checkin: { freq: CheckinFreq; time: string; weekday: number };
  status: 'active' | 'done' | 'paused';
  createdAt: string;
  completedAt?: string;
  templateId?: string;
  /** cada check-in do hábito vinculado soma +1 ao progresso */
  habitCounts?: boolean;
}

export interface Habit {
  id: ID;
  title: string;
  area?: AreaKey;
  /** dias da semana em que o hábito vale (0 = domingo) */
  days: number[];
  remind: boolean;
  /** HH:MM */
  time: string;
  /** datas concluídas YYYY-MM-DD */
  log: string[];
  goalId?: ID;
  createdAt: string;
  archived?: boolean;
}

export interface Reminder {
  id: ID;
  title: string;
  notes?: string;
  /** ISO — primeira ocorrência (âncora da recorrência) */
  at: string;
  repeat: Repeat;
  /** para repeat = weekly */
  days?: number[];
  done: boolean;
  doneAt?: string;
  createdAt: string;
  /** ocorrências repetidas já confirmadas até esta data (ISO) */
  ackUntil?: string;
  /** lembrete por lugar: avisa ao chegar ou sair (em vez de horário) */
  place?: { placeId: ID; on: 'arrive' | 'leave' };
}

/** Lugar salvo para lembretes por localização. */
export interface Place {
  id: ID;
  name: string;
  lat: number;
  lng: number;
  /** metros */
  radius: number;
}

/** Plano do dia montado pelo Rudge (horários em HH:MM). */
export interface DayPlan {
  date: string;
  status: 'proposed' | 'accepted' | 'dismissed';
  priorities: ID[];
  slots: { taskId: ID; start: string; end: string }[];
  createdAt: string;
}

/** Sessão de foco em andamento. */
export interface ActiveFocus {
  title: string;
  taskId?: ID;
  goalId?: ID;
  /** ms */
  start: number;
  /** fim previsto (ms); quando pausado, fica parado */
  until: number;
  minutes: number;
  /** ms restantes quando pausado */
  pausedLeft?: number;
}

export interface FocusSession {
  id: ID;
  title: string;
  taskId?: ID;
  goalId?: ID;
  start: string;
  end: string;
  minutes: number;
}

export interface JournalEntry {
  good: string;
  blocked: string;
  /** 1 a 5 */
  score: number;
  at: string;
}

/** Registro de quando a pessoa conclui ou adia, para aprender horários. */
export interface ActionLog {
  kind: 'reminder' | 'habit' | 'task';
  refId: ID;
  action: 'done' | 'snooze';
  /** horário programado (ms) */
  scheduledAt?: number;
  /** quando agiu (ms) */
  at: number;
}

/** Notificação adiada ("lembrar de novo em 10 min"). */
export interface Snooze {
  key: string;
  at: number;
  title: string;
  body: string;
  kind: NotifKind;
  refId?: ID;
  /** ocorrência original (ms) */
  occ?: number;
  url: string;
}

export type NotifKind =
  | 'reminder'
  | 'task'
  | 'habit'
  | 'goal'
  | 'briefing'
  | 'review'
  | 'weekly'
  | 'deadline'
  | 'snooze'
  | 'focus'
  | 'place'
  | 'retro'
  | 'test';

export interface InboxItem {
  id: ID;
  key: string;
  at: number;
  title: string;
  body: string;
  kind: NotifKind;
  url: string;
  read: boolean;
}

export interface Settings {
  theme: 'dark' | 'light';
  name: string;
  notifications: boolean;
  /** avisos pelo servidor (chegam com o app fechado) */
  push: boolean;
  sound: boolean;
  briefing: { enabled: boolean; time: string };
  review: { enabled: boolean; time: string };
  weekly: { enabled: boolean; weekday: number; time: string };
  /** minutos padrão de antecedência para lembretes de tarefas */
  defaultTaskRemind: number;
  /** plano do dia: janela de trabalho usada para encaixar tarefas */
  plan: { enabled: boolean; start: string; end: string };
  onboarded: boolean;
  /** relógio do Modo foco; vazio até o usuário escolher na primeira vez */
  focusClock?: FocusClockStyle;
}

export type FocusClockStyle = 'ring' | 'lens' | 'digital';

export interface AppState {
  version: number;
  tasks: Task[];
  goals: Goal[];
  habits: Habit[];
  reminders: Reminder[];
  snoozes: Snooze[];
  inbox: InboxItem[];
  dismissedSuggestions: Record<string, string>;
  settings: Settings;
  lastWeeklyReview?: string;
  /** Última edição feita pelo usuário (ms). Decide qual aparelho programa os avisos no servidor. */
  editedAt?: number;
  dayPlans: Record<string, DayPlan>;
  focus?: ActiveFocus | null;
  focusSessions: FocusSession[];
  journal: Record<string, JournalEntry>;
  places: Place[];
  history: ActionLog[];
  /** último mês (YYYY-MM) cuja retrospectiva foi vista */
  seenRetro?: string;
}
