import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlarmClock,
  ArrowRight,
  Bell,
  CalendarDays,
  Camera,
  Timer,
  Clock,
  Download,
  Flag,
  Flame,
  Hash,
  ListTodo,
  LogOut,
  Moon,
  Mic,
  Plus,
  Repeat as RepeatIcon,
  Search,
  Settings,
  Sparkles,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { parseInput, type Parsed } from '../lib/nlp';
import { parsePlacePhrase } from '../lib/geo';
import { addReminder, addTask, updateSettings } from '../lib/actions';
import { getState, useStore } from '../lib/store';
import { closeModal, navigate, openModal, toast } from '../lib/ui';
import { parseKey, relativeDay } from '../lib/date';
import { AREA_LABEL } from '../lib/goals';
import { describeRule } from '../lib/recurrence';
import { logout } from '../lib/auth';
import { testNotification } from '../lib/scheduler';
import { cx, Modal, Segmented } from './ui';
import { NAV } from './Shell';

export type CaptureMode = 'task' | 'reminder';

export function ParseChips({ p, mode }: { p: Parsed; mode: CaptureMode }) {
  const chips: { icon: LucideIcon; text: string }[] = [];
  if (p.date) chips.push({ icon: CalendarDays, text: relativeDay(p.date) });
  if (p.time) chips.push({ icon: Clock, text: p.time });
  else if (mode === 'reminder' && p.date) chips.push({ icon: Clock, text: '09:00' });
  if (p.repeat !== 'none' && p.date)
    chips.push({ icon: RepeatIcon, text: describeRule({ at: parseKey(p.date, p.time).getTime(), repeat: p.repeat, days: p.days }) });
  if (p.priority) chips.push({ icon: Flag, text: ['', 'Baixa', 'Média', 'Alta'][p.priority] });
  if (p.area) chips.push({ icon: Hash, text: AREA_LABEL[p.area] });
  if (!chips.length) return null;
  return (
    <>
      {chips.map((c, i) => (
        <span key={i} className="chip solid">
          <c.icon /> {c.text}
        </span>
      ))}
    </>
  );
}

/** Cria tarefa ou lembrete a partir do texto em linguagem natural. Retorna false se faltar algo. */
export function createFromText(text: string, mode: CaptureMode): boolean {
  // "quando sair do trabalho" / "quando chegar em casa" → lembrete por lugar
  const pp = parsePlacePhrase(text, getState().places);
  if (pp && pp.title) {
    if (!pp.placeId) {
      toast({
        title: `Salve o lugar “${pp.placeName}” primeiro`,
        body: 'Em Configurações → Lugares, salve onde você está agora com esse nome.',
        icon: 'info',
        duration: 9000,
        actions: [{ label: 'Abrir Lugares', run: () => navigate('configuracoes?lugares=1') }],
      });
      return false;
    }
    addReminder({ title: pp.title, at: new Date().toISOString(), place: { placeId: pp.placeId, on: pp.on } });
    toast({ title: 'Lembrete por lugar criado', body: `${pp.title} — ${pp.on === 'arrive' ? 'ao chegar em' : 'ao sair de'} ${pp.placeName}`, icon: 'bell' });
    return true;
  }
  const p = parseInput(text);
  const title = p.title || text.trim();
  if (!title) return false;
  if (mode === 'task') {
    addTask({
      title,
      due: p.date,
      time: p.time,
      priority: p.priority ?? 0,
      area: p.area,
      repeat: p.repeat !== 'none' ? p.repeat : undefined,
      days: p.days,
      remind: p.time ? getState().settings.defaultTaskRemind : null,
    });
    toast({
      title: 'Tarefa adicionada',
      body: `${title}${p.date ? ` — ${relativeDay(p.date).toLowerCase()}${p.time ? ` às ${p.time}` : ''}` : ''}`,
      icon: 'check',
    });
    return true;
  }
  // lembrete: precisa de data/hora; sem isso abre o editor
  if (!p.date && !p.time) {
    openModal({ type: 'reminder', defaults: { title } });
    return true;
  }
  const at = parseKey(p.date!, p.time ?? '09:00').getTime();
  if (p.repeat === 'none' && at < Date.now() - 30_000) {
    openModal({ type: 'reminder', defaults: { title, at } });
    return true;
  }
  addReminder({ title, at: new Date(at).toISOString(), repeat: p.repeat, days: p.days });
  toast({
    title: 'Lembrete criado',
    body: `${title} — ${relativeDay(p.date!).toLowerCase()} às ${p.time ?? '09:00'}`,
    icon: 'bell',
  });
  return true;
}

export function QuickAdd({ mode: initial = 'task' }: { mode?: CaptureMode }) {
  const [mode, setMode] = useState<CaptureMode>(initial);
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseInput(text), [text]);
  const close = () => closeModal('quick-add');

  function submit() {
    if (!text.trim()) return;
    if (createFromText(text, mode)) close();
  }

  return (
    <Modal
      title="Adicionar"
      onClose={close}
      footer={
        <>
          <button
            className="btn btn-ghost"
            onClick={() => {
              close();
              openModal(mode === 'task' ? { type: 'task', defaults: { title: parsed.title } } : { type: 'reminder', defaults: { title: parsed.title } });
            }}
          >
            Mais opções
          </button>
          <div className="spacer" />
          <button className="btn btn-primary" onClick={submit} disabled={!text.trim()}>
            Adicionar <ArrowRight />
          </button>
        </>
      }
    >
      <div className="stack">
        <Segmented
          full
          value={mode}
          onChange={setMode}
          options={[
            { value: 'task', label: <><ListTodo width={15} /> Tarefa</> },
            { value: 'reminder', label: <><AlarmClock width={15} /> Lembrete</> },
          ]}
        />
        <input
          className="input"
          style={{ height: 52, fontSize: 16 }}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={mode === 'task' ? 'Ex.: Enviar proposta amanhã 15h !!' : 'Ex.: me lembre de ligar pro João em 30 min'}
        />
        <div className="row wrap" style={{ minHeight: 22 }}>
          <ParseChips p={parsed} mode={mode} />
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          Escreva naturalmente: “hoje”, “amanhã às 9h”, “sexta 14:30”, “em 20 min”, “todo dia às 8h”, “toda segunda”, “dia 15”, “!!!” para alta prioridade, “#saude” para a área.
        </p>
        <div className="row wrap">
          <button
            className="chip"
            onClick={() => {
              close();
              openModal({ type: 'voice' });
            }}
          >
            <Mic /> Falar
          </button>
          <button
            className="chip"
            onClick={() => {
              close();
              openModal({ type: 'photo' });
            }}
          >
            <Camera /> Foto
          </button>
          <button
            className="chip"
            onClick={() => {
              close();
              openModal({ type: 'focus' });
            }}
          >
            <Timer /> Focar
          </button>
          <button
            className="chip"
            onClick={() => {
              close();
              openModal({ type: 'goal-wizard' });
            }}
          >
            <Target /> Nova meta
          </button>
          <button
            className="chip"
            onClick={() => {
              close();
              openModal({ type: 'habit' });
            }}
          >
            <Flame /> Novo hábito
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Paleta de comandos ---------------- */

interface Cmd {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
}

export function CommandPalette() {
  const s = useStore();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const close = () => closeModal('command');

  const items = useMemo<Cmd[]>(() => {
    const query = q.trim().toLowerCase();
    const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const nq = norm(query);
    const out: Cmd[] = [];
    if (query) {
      const p = parseInput(q);
      out.push({
        id: 'create-task',
        group: 'Criar',
        label: `Criar tarefa: ${p.title || q}`,
        hint: [p.date && relativeDay(p.date), p.time].filter(Boolean).join(' · '),
        icon: Plus,
        run: () => createFromText(q, 'task'),
      });
      out.push({
        id: 'create-rem',
        group: 'Criar',
        label: `Criar lembrete: ${p.title || q}`,
        hint: [p.date && relativeDay(p.date), p.time].filter(Boolean).join(' · '),
        icon: Bell,
        run: () => createFromText(q, 'reminder'),
      });
    }
    const commands: Cmd[] = [
      { id: 'c-task', group: 'Ações', label: 'Nova tarefa', icon: ListTodo, run: () => openModal({ type: 'task' }) },
      { id: 'c-rem', group: 'Ações', label: 'Novo lembrete', icon: AlarmClock, run: () => openModal({ type: 'reminder' }) },
      { id: 'c-goal', group: 'Ações', label: 'Nova meta (assistente)', icon: Target, run: () => openModal({ type: 'goal-wizard' }) },
      { id: 'c-habit', group: 'Ações', label: 'Novo hábito', icon: Flame, run: () => openModal({ type: 'habit' }) },
      { id: 'c-focus', group: 'Ações', label: 'Modo foco', icon: Timer, run: () => openModal({ type: 'focus' }) },
      { id: 'c-photo', group: 'Ações', label: 'Capturar por foto (boleto, papel)', icon: Camera, run: () => openModal({ type: 'photo' }) },
      { id: 'c-retro', group: 'Ações', label: 'Retrospectiva do mês', icon: Sparkles, run: () => openModal({ type: 'retro' }) },
      {
        id: 'c-theme',
        group: 'Ações',
        label: s.settings.theme === 'dark' ? 'Ativar modo white' : 'Ativar modo escuro',
        icon: Moon,
        run: () => updateSettings({ theme: s.settings.theme === 'dark' ? 'light' : 'dark' }),
      },
      { id: 'c-test', group: 'Ações', label: 'Testar notificação', icon: Bell, run: () => void testNotification() },
      ...NAV.map((n) => ({ id: `nav-${n.name}`, group: 'Ir para', label: n.label, icon: n.icon, run: () => navigate(n.name) })),
      { id: 'nav-inst', group: 'Ir para', label: 'Instalar app', icon: Download, run: () => navigate('instalar') },
      { id: 'nav-conf', group: 'Ir para', label: 'Configurações', icon: Settings, run: () => navigate('configuracoes') },
      { id: 'c-logout', group: 'Conta', label: 'Sair', icon: LogOut, run: logout },
    ];
    out.push(...commands.filter((c) => !nq || norm(c.label).includes(nq)));
    if (nq) {
      s.tasks
        .filter((t) => norm(t.title).includes(nq))
        .slice(0, 6)
        .forEach((t) =>
          out.push({
            id: `t-${t.id}`,
            group: 'Tarefas',
            label: t.title,
            hint: t.done ? 'concluída' : t.due ? relativeDay(t.due) : undefined,
            icon: ListTodo,
            run: () => openModal({ type: 'task', id: t.id }),
          }),
        );
      s.goals
        .filter((g) => norm(g.title).includes(nq))
        .slice(0, 5)
        .forEach((g) =>
          out.push({ id: `g-${g.id}`, group: 'Metas', label: g.title, icon: Target, run: () => openModal({ type: 'goal-detail', id: g.id }) }),
        );
      s.habits
        .filter((h) => norm(h.title).includes(nq))
        .slice(0, 5)
        .forEach((h) =>
          out.push({ id: `h-${h.id}`, group: 'Hábitos', label: h.title, icon: Flame, run: () => openModal({ type: 'habit', id: h.id }) }),
        );
      s.reminders
        .filter((r) => norm(r.title).includes(nq))
        .slice(0, 5)
        .forEach((r) =>
          out.push({ id: `r-${r.id}`, group: 'Lembretes', label: r.title, icon: AlarmClock, run: () => openModal({ type: 'reminder', id: r.id }) }),
        );
    }
    return out;
  }, [q, s]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('.palette-item.on')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const run = (c: Cmd) => {
    close();
    setTimeout(c.run, 0);
  };

  let lastGroup = '';
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal glass strong palette" role="dialog" aria-label="Comandos">
        <div className="sheet-grip" />
        <div className="palette-input">
          <Search />
          <input
            autoFocus
            value={q}
            placeholder="Busque, navegue ou digite para criar…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((v) => Math.min(items.length - 1, v + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((v) => Math.max(0, v - 1));
              } else if (e.key === 'Enter' && items[sel]) {
                e.preventDefault();
                run(items[sel]);
              } else if (e.key === 'Escape') close();
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" ref={listRef}>
          {items.map((c, i) => {
            const head = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <div key={c.id}>
                {head && <div className="palette-group">{head}</div>}
                <button className={cx('palette-item', i === sel && 'on')} onMouseEnter={() => setSel(i)} onClick={() => run(c)}>
                  <c.icon />
                  <span>{c.label}</span>
                  {c.hint && <small>{c.hint}</small>}
                </button>
              </div>
            );
          })}
          {!items.length && (
            <div className="empty">
              <Sparkles />
              <p>Nenhum resultado.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
