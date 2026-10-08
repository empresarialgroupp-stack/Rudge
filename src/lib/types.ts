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
  sound: boolean;
  briefing: { enabled: boolean; time: string };
  review: { enabled: boolean; time: string };
  weekly: { enabled: boolean; weekday: number; time: string };
  /** minutos padrão de antecedência para lembretes de tarefas */
  defaultTaskRemind: number;
  onboarded: boolean;
}

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
}
