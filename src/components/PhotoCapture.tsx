import { useRef, useState } from 'react';
import { Camera, Check, Copy, ImageUp, Receipt, ScanText } from 'lucide-react';
import { addTask, addReminder } from '../lib/actions';
import { getState } from '../lib/store';
import { closeModal, toast } from '../lib/ui';
import { parseInput } from '../lib/nlp';
import { parseKey, relativeDay, todayKey, addDaysKey } from '../lib/date';
import { fmtBRL, scanImage, type ScanResult } from '../lib/scan';
import { cx, Modal, Segmented, Switch } from './ui';

type Phase = 'pick' | 'reading' | 'review' | 'error';

export function PhotoCapture() {
  const close = () => closeModal('photo');
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('pick');
  const [preview, setPreview] = useState<string>('');
  const [progress, setProgress] = useState({ p: 0, label: '' });
  const [res, setRes] = useState<ScanResult | null>(null);
  // boleto / conta
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [remind, setRemind] = useState(true);
  const [dayBefore, setDayBefore] = useState(true);
  // papel / quadro
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [mode, setMode] = useState<'task' | 'reminder'>('task');
  const [view, setView] = useState<'bill' | 'list'>('bill');

  async function onFile(f: File | undefined) {
    if (!f) return;
    setPreview(URL.createObjectURL(f));
    setPhase('reading');
    try {
      const { result } = await scanImage(f, (p, label) => setProgress({ p, label }));
      setRes(result);
      setTitle(result.title || result.lines[0] || '');
      setDue(result.due ?? '');
      setPicked(Object.fromEntries(result.lines.map((_, i) => [i, false])));
      setView(result.title ? 'bill' : 'list');
      setPhase('review');
    } catch (e) {
      console.error(e);
      setPhase('error');
    }
  }

  function createBill() {
    if (!title.trim()) return;
    const notes = [res?.boleto ? `Linha digitável: ${res.boleto.line}` : '', res?.amount ? `Valor: ${fmtBRL(res.amount)}` : ''].filter(Boolean).join('\n');
    addTask({ title: title.trim(), due: due || undefined, time: remind && due ? '09:00' : undefined, remind: remind && due ? 0 : null, priority: 2, area: 'financas', notes: notes || undefined });
    if (dayBefore && due && due > todayKey()) {
      addReminder({ title: `Amanhã vence: ${title.trim()}`, at: parseKey(addDaysKey(due, -1), '19:00').toISOString(), notes: notes || undefined });
    }
    toast({ title: 'Conta adicionada', body: `${title.trim()}${due ? ` — ${relativeDay(due).toLowerCase()}` : ''}`, icon: 'check' });
    close();
  }

  function createList() {
    if (!res) return;
    const items = res.lines.filter((_, i) => picked[i]);
    for (const line of items) {
      const p = parseInput(line);
      const t = p.title || line;
      if (mode === 'reminder' && (p.date || p.time)) addReminder({ title: t, at: parseKey(p.date ?? todayKey(), p.time ?? '09:00').toISOString(), repeat: p.repeat, days: p.days });
      else addTask({ title: t, due: p.date, time: p.time, priority: p.priority ?? 0, area: p.area, remind: p.time ? getState().settings.defaultTaskRemind : null });
    }
    toast({ title: `${items.length} ${items.length === 1 ? 'item criado' : 'itens criados'}`, icon: 'check' });
    close();
  }

  const nPicked = Object.values(picked).filter(Boolean).length;

  return (
    <Modal
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ScanText /> Capturar por foto
        </span>
      }
      onClose={close}
      footer={
        phase === 'review' ? (
          <>
            <button className="btn btn-ghost" onClick={() => setPhase('pick')}>
              Outra foto
            </button>
            <div className="spacer" />
            {view === 'bill' ? (
              <button className="btn btn-primary" onClick={createBill} disabled={!title.trim()}>
                <Check /> Criar tarefa
              </button>
            ) : (
              <button className="btn btn-primary" onClick={createList} disabled={!nPicked}>
                <Check /> Criar {nPicked || ''}
              </button>
            )}
          </>
        ) : undefined
      }
    >
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFile(e.target.files?.[0])} />

      {phase === 'pick' && (
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <div className="scan-hero">
            <Receipt />
          </div>
          <p className="muted" style={{ margin: 0 }}>
            Fotografe um <b>boleto</b>, uma conta, um papel ou um quadro. O Rudge lê o texto <b>no seu aparelho</b> — a foto não sai daqui.
          </p>
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            <button className="btn btn-primary btn-lg btn-pill" onClick={() => input.current?.click()}>
              <Camera /> Tirar ou escolher foto
            </button>
          </div>
          <label className="btn btn-ghost btn-sm">
            <ImageUp /> Escolher da galeria
            <input type="file" accept="image/*" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
        </div>
      )}

      {phase === 'reading' && (
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          {preview && <img className="scan-preview reading" src={preview} alt="" />}
          <div className="scan-bar">
            <i style={{ width: `${Math.round(progress.p * 100)}%` }} />
          </div>
          <span className="muted" style={{ fontSize: 13 }}>
            {progress.label || 'Lendo…'} · {Math.round(progress.p * 100)}%
          </span>
        </div>
      )}

      {phase === 'error' && (
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <p className="muted">Não consegui ler esta foto. Tente com mais luz, sem reflexo e com o papel inteiro na imagem.</p>
          <button className="btn btn-primary btn-pill" onClick={() => input.current?.click()}>
            <Camera /> Tentar de novo
          </button>
        </div>
      )}

      {phase === 'review' && res && (
        <div className="stack">
          {preview && <img className="scan-preview" src={preview} alt="Foto capturada" />}
          {(res.title || res.lines.length > 0) && (
            <Segmented
              full
              value={view}
              onChange={setView}
              options={[
                { value: 'bill', label: 'Conta / boleto' },
                { value: 'list', label: `Itens do texto (${res.lines.length})` },
              ]}
            />
          )}

          {view === 'bill' ? (
            <>
              {res.boleto && (
                <div className={cx('scan-boleto', !res.boleto.valid && 'warn')}>
                  <b>{res.boleto.valid ? 'Boleto reconhecido' : 'Boleto encontrado — confira os números'}</b>
                  <span>
                    {res.boleto.value ? fmtBRL(res.boleto.value) : 'valor não informado'}
                    {res.boleto.due ? ` · vence ${res.boleto.due.split('-').reverse().join('/')}` : ''}
                  </span>
                  <button
                    className="chip"
                    onClick={() => {
                      void navigator.clipboard?.writeText(res.boleto!.line);
                      toast({ title: 'Linha digitável copiada', icon: 'check' });
                    }}
                  >
                    <Copy /> Copiar código
                  </button>
                </div>
              )}
              <label className="field">
                <span className="label">Tarefa</span>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pagar conta" />
              </label>
              <label className="field">
                <span className="label">Vencimento</span>
                <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              </label>
              <div className="setting">
                <div className="s-text">
                  <b>Lembrar às 9h no dia</b>
                </div>
                <Switch on={remind} onChange={setRemind} label="Lembrar no dia" />
              </div>
              <div className="setting">
                <div className="s-text">
                  <b>Avisar na véspera (19h)</b>
                </div>
                <Switch on={dayBefore} onChange={setDayBefore} label="Avisar na véspera" />
              </div>
            </>
          ) : res.lines.length ? (
            <>
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'task', label: 'Criar como tarefas' },
                  { value: 'reminder', label: 'Como lembretes' },
                ]}
              />
              <div className="scan-lines">
                {res.lines.map((l, i) => (
                  <label key={i} className={cx('scan-line', picked[i] && 'on')}>
                    <input type="checkbox" checked={!!picked[i]} onChange={(e) => setPicked({ ...picked, [i]: e.target.checked })} />
                    <span>{l}</span>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">Não encontrei itens de texto nesta foto.</p>
          )}
        </div>
      )}
    </Modal>
  );
}
