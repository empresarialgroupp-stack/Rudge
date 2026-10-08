import { useRef, useState } from 'react';
import { Bell, Database, Download, LogOut, Palette, Upload, User } from 'lucide-react';
import { exportState, replaceState, resetState, useStore } from '../lib/store';
import { updateSettings } from '../lib/actions';
import { logout, useSession } from '../lib/auth';
import { permission } from '../lib/notify';
import { testNotification } from '../lib/scheduler';
import { toast } from '../lib/ui';
import { WEEKDAYS } from '../lib/date';
import { cx, Field, Switch } from '../components/ui';
import { enableNotifications } from './Dashboard';

const PERM_LABEL: Record<string, string> = {
  granted: 'Permitidas',
  denied: 'Bloqueadas no navegador',
  default: 'Ainda não autorizadas',
  unsupported: 'Sem suporte neste navegador',
};

export function SettingsPage() {
  const s = useStore();
  const session = useSession();
  const st = s.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [perm, setPerm] = useState(permission());
  const [confirmReset, setConfirmReset] = useState(false);

  function download() {
    const blob = new Blob([exportState()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rudge-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast({ title: 'Backup exportado', icon: 'check' });
  }

  async function importFile(f: File) {
    try {
      const json = JSON.parse(await f.text());
      const data = json?.app === 'rudge' ? json.data : json;
      if (!data || !Array.isArray(data.tasks)) throw new Error('formato');
      replaceState(data);
      toast({ title: 'Backup restaurado', icon: 'check' });
    } catch {
      toast({ title: 'Arquivo inválido', body: 'Escolha um backup exportado pelo Rudge.', icon: 'error' });
    }
  }

  return (
    <div className="settings">
      <div className="dash-col">
        <section className="card glass">
          <div className="card-head">
            <h2 className="card-title">
              <User /> Perfil
            </h2>
          </div>
          <div className="stack">
            <Field label="Como quer ser chamado?">
              <input className="input" value={st.name} onChange={(e) => updateSettings({ name: e.target.value })} placeholder="Seu nome" />
            </Field>
            <Field label="E-mail de acesso">
              <input className="input" value={session?.email ?? ''} disabled />
            </Field>
          </div>
        </section>

        <section className="card glass">
          <div className="card-head">
            <h2 className="card-title">
              <Palette /> Aparência
            </h2>
          </div>
          <div className="theme-pick">
            <button className={cx('theme-opt', st.theme === 'dark' && 'on')} onClick={() => updateSettings({ theme: 'dark' })}>
              <div className="preview dark">
                <i />
                <i />
              </div>
              <b>Escuro</b>
            </button>
            <button className={cx('theme-opt', st.theme === 'light' && 'on')} onClick={() => updateSettings({ theme: 'light' })}>
              <div className="preview light">
                <i />
                <i />
              </div>
              <b>Modo white</b>
            </button>
          </div>
        </section>

        <section className="card glass">
          <div className="card-head">
            <h2 className="card-title">
              <Database /> Dados e backup
            </h2>
          </div>
          <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
            Seus dados ficam salvos neste dispositivo. Exporte um backup para levar ao celular ou guardar com segurança.
          </p>
          <div className="row wrap">
            <button className="btn btn-glass" onClick={download}>
              <Download /> Exportar backup
            </button>
            <button className="btn btn-glass" onClick={() => fileRef.current?.click()}>
              <Upload /> Importar backup
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = '';
              }}
            />
          </div>
          <div className="row wrap" style={{ marginTop: 14 }}>
            {!confirmReset ? (
              <button className="btn btn-danger btn-sm" onClick={() => setConfirmReset(true)}>
                Apagar todos os dados
              </button>
            ) : (
              <>
                <span style={{ fontSize: 13 }}>Tem certeza? Isso não pode ser desfeito.</span>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    resetState();
                    setConfirmReset(false);
                    toast({ title: 'Dados apagados', icon: 'info' });
                  }}
                >
                  Sim, apagar
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(false)}>
                  Cancelar
                </button>
              </>
            )}
          </div>
        </section>

        <section className="card glass">
          <div className="setting" style={{ padding: 0 }}>
            <div className="s-text">
              <b>Sair do Rudge</b>
              <span>Seus dados continuam salvos neste dispositivo.</span>
            </div>
            <button className="btn btn-glass" onClick={logout}>
              <LogOut /> Sair
            </button>
          </div>
        </section>
      </div>

      <div className="dash-col">
        <section className="card glass">
          <div className="card-head">
            <h2 className="card-title">
              <Bell /> Notificações
            </h2>
          </div>
          <div className="setting">
            <div className="s-text">
              <b>Permissão do navegador</b>
              <span>{PERM_LABEL[perm]}</span>
            </div>
            {perm !== 'granted' ? (
              <button
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  await enableNotifications();
                  setPerm(permission());
                }}
              >
                Ativar
              </button>
            ) : (
              <button className="btn btn-glass btn-sm" onClick={() => void testNotification()}>
                Testar
              </button>
            )}
          </div>
          <div className="setting">
            <div className="s-text">
              <b>Notificações do sistema</b>
              <span>Mostrar avisos fora do app (com Rudge minimizado ou em segundo plano).</span>
            </div>
            <Switch
              on={st.notifications}
              onChange={async (v) => {
                if (v && permission() !== 'granted') {
                  await enableNotifications();
                  setPerm(permission());
                } else updateSettings({ notifications: v });
              }}
            />
          </div>
          <div className="setting">
            <div className="s-text">
              <b>Som nos avisos internos</b>
              <span>Toque discreto quando o app está aberto.</span>
            </div>
            <Switch on={st.sound} onChange={(v) => updateSettings({ sound: v })} />
          </div>
          <div className="setting">
            <div className="s-text">
              <b>Resumo da manhã</b>
              <span>Seu plano do dia: tarefas, lembretes e hábitos.</span>
            </div>
            <input className="input" type="time" value={st.briefing.time} onChange={(e) => updateSettings({ briefing: { ...st.briefing, time: e.target.value } })} disabled={!st.briefing.enabled} />
            <Switch on={st.briefing.enabled} onChange={(v) => updateSettings({ briefing: { ...st.briefing, enabled: v } })} />
          </div>
          <div className="setting">
            <div className="s-text">
              <b>Fechamento do dia</b>
              <span>Revisar pendências e planejar amanhã.</span>
            </div>
            <input className="input" type="time" value={st.review.time} onChange={(e) => updateSettings({ review: { ...st.review, time: e.target.value } })} disabled={!st.review.enabled} />
            <Switch on={st.review.enabled} onChange={(v) => updateSettings({ review: { ...st.review, enabled: v } })} />
          </div>
          <div className="setting">
            <div className="s-text">
              <b>Revisão semanal</b>
              <span>Fechar a semana e escolher 3 prioridades.</span>
            </div>
            <Switch on={st.weekly.enabled} onChange={(v) => updateSettings({ weekly: { ...st.weekly, enabled: v } })} />
          </div>
          {st.weekly.enabled && (
            <div className="row" style={{ paddingBottom: 12 }}>
              <select className="select" value={st.weekly.weekday} onChange={(e) => updateSettings({ weekly: { ...st.weekly, weekday: Number(e.target.value) } })}>
                {WEEKDAYS.map((w, i) => (
                  <option key={i} value={i}>
                    {w}
                  </option>
                ))}
              </select>
              <input className="input" type="time" style={{ width: 130 }} value={st.weekly.time} onChange={(e) => updateSettings({ weekly: { ...st.weekly, time: e.target.value } })} />
            </div>
          )}
          <div className="setting">
            <div className="s-text">
              <b>Antecedência padrão das tarefas</b>
              <span>Para tarefas com horário.</span>
            </div>
            <select className="select" style={{ width: 150 }} value={st.defaultTaskRemind} onChange={(e) => updateSettings({ defaultTaskRemind: Number(e.target.value) })}>
              {[0, 5, 10, 15, 30, 60].map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? 'No horário' : `${m} min antes`}
                </option>
              ))}
            </select>
          </div>
        </section>
        <p className="muted" style={{ fontSize: 12, margin: '4px 4px 0' }}>Rudge v1.0 · organização pessoal</p>
      </div>
    </div>
  );
}
