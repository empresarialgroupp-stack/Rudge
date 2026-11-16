import { useEffect, useRef, useState } from 'react';
import { AlarmClock, Check, ListTodo, Mic, Square, Trash2 } from 'lucide-react';
import { addReminder, addTask } from '../lib/actions';
import { getState } from '../lib/store';
import { closeModal, toast } from '../lib/ui';
import { addDays, dateKey, parseKey, relativeDay } from '../lib/date';
import { describeRule } from '../lib/recurrence';
import { interpret, listen, speak, voiceSupported, type VoiceItem } from '../lib/voice';
import { cx, Modal } from './ui';

type Phase = 'listening' | 'thinking' | 'review' | 'error';

function whenOf(i: VoiceItem): number {
  let date = i.date;
  const time = i.time || '09:00';
  if (!date) {
    const today = dateKey(new Date());
    date = parseKey(today, time).getTime() > Date.now() ? today : dateKey(addDays(new Date(), 1));
  }
  return parseKey(date, time).getTime();
}

function label(i: VoiceItem) {
  const parts: string[] = [];
  if (i.kind === 'reminder' || i.date) {
    const at = whenOf(i);
    parts.push(`${relativeDay(dateKey(new Date(at)))}${i.time || i.kind === 'reminder' ? ` às ${i.time || '09:00'}` : ''}`);
  }
  if (i.repeat !== 'none') parts.push(describeRule({ at: whenOf(i), repeat: i.repeat, days: i.days }));
  return parts.join(' · ') || 'Sem data';
}

export function VoiceModal() {
  const [phase, setPhase] = useState<Phase>('listening');
  const [text, setText] = useState('');
  const [items, setItems] = useState<VoiceItem[]>([]);
  const [source, setSource] = useState<'ai' | 'local'>('local');
  const [error, setError] = useState('');
  const stopRef = useRef<() => void>(() => {});
  const close = () => {
    stopRef.current();
    closeModal('voice');
  };

  async function start() {
    setError('');
    setText('');
    setPhase('listening');
    try {
      const l = listen(setText);
      stopRef.current = l.stop;
      const heard = await l.done;
      if (!heard) throw new Error('Não ouvi nada. Toque no microfone e fale de novo.');
      await process(heard);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }

  async function process(t: string) {
    setPhase('thinking');
    const r = await interpret(t);
    setItems(r.items);
    setSource(r.source);
    setPhase('review');
    if (r.items.length) speak(r.reply ?? `Entendi ${r.items.length === 1 ? 'um pedido' : `${r.items.length} pedidos`}. Confirme para salvar.`);
    else speak('Não entendi o pedido. Pode repetir?');
  }

  useEffect(() => {
    if (voiceSupported()) void start();
    else {
      setPhase('error');
      setError('Este navegador não reconhece voz. Use o Chrome, o Edge ou o Safari do iPhone — ou digite abaixo.');
    }
    return () => stopRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function save() {
    for (const i of items) {
      if (i.kind === 'reminder') {
        addReminder({ title: i.title, at: new Date(whenOf(i)).toISOString(), repeat: i.repeat, days: i.repeat === 'weekly' ? i.days : undefined });
      } else {
        addTask({
          title: i.title,
          due: i.date || undefined,
          time: i.date && i.time ? i.time : undefined,
          priority: i.priority,
          repeat: i.repeat !== 'none' && i.date ? i.repeat : undefined,
          days: i.repeat === 'weekly' ? i.days : undefined,
          remind: i.date && i.time ? getState().settings.defaultTaskRemind : null,
        });
      }
    }
    const n = items.length;
    speak(n === 1 ? 'Pronto, está salvo.' : `Pronto, salvei ${n} itens.`);
    toast({ title: n === 1 ? 'Salvo pelo Rudge' : `${n} itens salvos`, body: items.map((i) => i.title).join(' · '), icon: 'check' });
    closeModal('voice');
  }

  return (
    <Modal
      title="Falar com o Rudge"
      onClose={close}
      footer={
        <>
          <button className="btn btn-ghost" onClick={close}>
            Cancelar
          </button>
          <div className="spacer" />
          {phase === 'review' && (
            <button className="btn btn-glass" onClick={() => void start()}>
              <Mic /> Falar de novo
            </button>
          )}
          {phase === 'review' && items.length > 0 && (
            <button className="btn btn-primary" onClick={save}>
              <Check /> Salvar {items.length > 1 ? `(${items.length})` : ''}
            </button>
          )}
        </>
      }
    >
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
        {(phase === 'listening' || phase === 'thinking' || phase === 'error') && (
          <button
            className={cx('mic-orb', phase === 'listening' && 'on')}
            onClick={() => (phase === 'listening' ? stopRef.current() : void start())}
            aria-label={phase === 'listening' ? 'Parar' : 'Falar'}
          >
            {phase === 'listening' ? <Square /> : <Mic />}
          </button>
        )}
        <p className="muted" style={{ margin: 0 }}>
          {phase === 'listening' && 'Ouvindo… ex.: “me lembra de pagar a luz amanhã às 10 e de ligar pro dentista sexta à tarde”'}
          {phase === 'thinking' && 'Entendendo o pedido…'}
          {phase === 'error' && error}
        </p>
        {text && <blockquote className="voice-text">“{text}”</blockquote>}
      </div>

      {phase === 'error' && (
        <input
          className="input"
          style={{ marginTop: 12 }}
          placeholder="Ou digite aqui e pressione Enter"
          onKeyDown={(e) => {
            const v = (e.target as HTMLInputElement).value.trim();
            if (e.key === 'Enter' && v) {
              setText(v);
              void process(v);
            }
          }}
        />
      )}

      {phase === 'review' && (
        <div className="stack sm" style={{ marginTop: 12 }}>
          {items.length === 0 && <p className="muted" style={{ margin: 0, textAlign: 'center' }}>Não encontrei um lembrete ou tarefa. Tente de novo.</p>}
          {items.map((i, idx) => (
            <div key={idx} className="tpl" style={{ alignItems: 'center' }}>
              <button
                className="icon-btn"
                title="Alternar entre lembrete e tarefa"
                onClick={() => setItems(items.map((x, j) => (j === idx ? { ...x, kind: x.kind === 'task' ? 'reminder' : 'task' } : x)))}
              >
                {i.kind === 'reminder' ? <AlarmClock /> : <ListTodo />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  className="input"
                  style={{ height: 36 }}
                  value={i.title}
                  onChange={(e) => setItems(items.map((x, j) => (j === idx ? { ...x, title: e.target.value } : x)))}
                />
                <span style={{ display: 'block', marginTop: 4 }}>
                  {i.kind === 'reminder' ? 'Lembrete' : 'Tarefa'} · {label(i)}
                </span>
              </div>
              <button className="icon-btn sm" onClick={() => setItems(items.filter((_, j) => j !== idx))} aria-label="Remover">
                <Trash2 />
              </button>
            </div>
          ))}
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            {source === 'ai' ? 'Interpretado pela IA do Rudge.' : 'Interpretado no aparelho (IA indisponível).'} Toque no ícone para alternar lembrete/tarefa.
          </p>
        </div>
      )}
    </Modal>
  );
}
