import { useState } from 'react';
import { CloudCheck, History, RefreshCw } from 'lucide-react';
import { listSnapshots, restoreSnapshot, syncAccount, useCloudStatus, type Snapshot } from '../lib/cloud';
import { formatWhen } from '../lib/date';
import { toast } from '../lib/ui';

const LABEL = { off: 'Ainda não sincronizado', syncing: 'Sincronizando…', ok: 'Tudo salvo na conta', offline: 'Sem internet: salva quando a conexão voltar', error: 'Não foi possível falar com o servidor' };

/** Configurações → Dados na conta: estado da sincronização e cópias de segurança. */
export function AccountDataCard() {
  const cloud = useCloudStatus();
  const [snaps, setSnaps] = useState<Snapshot[] | null>(null);
  const [busy, setBusy] = useState<number | 'list' | null>(null);

  async function openList() {
    setBusy('list');
    try {
      setSnaps(await listSnapshots());
    } catch {
      toast({ title: 'Não foi possível ver as cópias', body: 'Confira a conexão e tente de novo.', icon: 'error' });
    }
    setBusy(null);
  }

  async function restore(s: Snapshot) {
    setBusy(s.id);
    try {
      await restoreSnapshot(s.id);
      toast({ title: 'Cópia restaurada', body: 'O que estava nela voltou, junto com o que você tem hoje.', icon: 'check' });
    } catch {
      toast({ title: 'Não foi possível restaurar', icon: 'error' });
    }
    setBusy(null);
  }

  return (
    <section className="card glass">
      <div className="card-head">
        <h2 className="card-title">
          <CloudCheck /> Dados na conta
        </h2>
      </div>
      <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
        Metas, tarefas, hábitos, lembretes, diário, avisos e configurações ficam salvos na sua conta e iguais no computador e no
        celular. Atualizações do app não apagam nada.
      </p>
      <div className="setting">
        <div className="s-text">
          <b>{LABEL[cloud.state]}</b>
          <span>{cloud.state === 'error' ? cloud.error : cloud.at ? `Última vez ${formatWhen(cloud.at)}` : 'Sincroniza ao abrir e a cada alteração.'}</span>
        </div>
      </div>
      <div className="row wrap">
        <button className="btn btn-glass btn-sm" onClick={() => void syncAccount()} disabled={cloud.state === 'syncing'}>
          <RefreshCw /> Sincronizar agora
        </button>
        <button className="btn btn-glass btn-sm" onClick={() => void openList()} disabled={busy === 'list'}>
          <History /> Cópias de segurança
        </button>
      </div>
      {snaps && (
        <div className="snapshots" style={{ marginTop: 12 }}>
          {snaps.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Ainda não há cópias. A primeira é criada na próxima sincronização.</p>}
          {snaps.map((s) => (
            <div className="setting" key={s.id}>
              <div className="s-text">
                <b>
                  {formatWhen(Date.parse(s.at))}
                  {s.thisDevice ? ' · este aparelho' : s.deviceId === 'antes' ? ' · antes de uma exclusão' : ''}
                </b>
                <span>
                  {s.goals} metas · {s.tasks} tarefas · {s.habits} hábitos · {s.reminders} lembretes
                </span>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => void restore(s)} disabled={busy === s.id}>
                Restaurar
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
