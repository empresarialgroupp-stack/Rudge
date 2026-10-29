import { useEffect, useState, useSyncExternalStore } from 'react';
import { ExternalLink, Lock, LogOut, Music2, Plug, Sparkles } from 'lucide-react';
import { loadIntegrations, PLAN_LABEL, setIntegration, useAccess, type Integration } from '../lib/access';
import { logout, useSession } from '../lib/auth';
import { RUDGE_MUSIC_URL } from '../lib/supabase';
import { toast } from '../lib/ui';
import { BrandMark, cx, Switch } from './ui';

/* Conexão com o Rudge Music guardada no servidor (public.integrations) e espelhada aqui
   para o modo foco e para funcionar offline. */

const LINK_KEY = 'rudge:music-link';
interface MusicLink {
  connected: boolean;
  focusMusic: boolean;
}
function readLink(): MusicLink {
  try {
    return { connected: false, focusMusic: true, ...JSON.parse(localStorage.getItem(LINK_KEY) || '{}') };
  } catch {
    return { connected: false, focusMusic: true };
  }
}
let link = typeof window !== 'undefined' ? readLink() : { connected: false, focusMusic: true };
const listeners = new Set<() => void>();
function saveLink(next: MusicLink) {
  link = next;
  localStorage.setItem(LINK_KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}
export function useMusicLink() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => link,
  );
}

export function openRudgeMusic(path = '/inicio') {
  window.open(`${RUDGE_MUSIC_URL}${path}`, '_blank', 'noopener');
}

/** Configurações → Conta e integrações. */
export function IntegrationsCard() {
  const session = useSession();
  const access = useAccess();
  const music = useMusicLink();
  const [server, setServer] = useState<'loading' | 'off' | 'on'>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadIntegrations().then((list: Integration[] | null) => {
      setServer(list ? 'on' : 'off');
      const row = list?.find((i) => i.provider === 'rudge_music');
      if (row) saveLink({ connected: row.enabled, focusMusic: row.settings?.focusMusic !== false });
    });
  }, []);

  const hasMusic = access.status === 'ready' && access.access.music;
  const plan = access.status === 'ready' ? access.access.plan : null;

  async function update(next: MusicLink) {
    const prev = link;
    saveLink(next);
    if (server !== 'on') return;
    setBusy(true);
    try {
      await setIntegration('rudge_music', next.connected, { focusMusic: next.focusMusic });
    } catch {
      saveLink(prev);
      toast({ title: 'Não foi possível salvar', body: 'Confira a conexão e tente de novo.', icon: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card glass">
      <div className="card-head">
        <h2 className="card-title">
          <Plug /> Conta e integrações
        </h2>
      </div>
      <div className="setting">
        <div className="s-text">
          <b>Conta Rudge</b>
          <span>{session?.email} · a mesma conta do Rudge Music</span>
        </div>
      </div>
      <div className="setting">
        <div className="s-text">
          <b>Plano</b>
          <span>
            {access.status === 'loading'
              ? 'Consultando…'
              : plan
                ? (PLAN_LABEL[plan] ?? plan)
                : 'Ainda não definido'}
          </span>
        </div>
      </div>

      <div className="integration">
        <div className="integration-head">
          <span className="integration-icon">
            <Music2 />
          </span>
          <div className="s-text">
            <b>Rudge Music</b>
            <span>
              {hasMusic
                ? music.connected
                  ? 'Conectado à sua conta'
                  : 'Incluído no seu plano'
                : 'Seu player de música com a sua biblioteca'}
            </span>
          </div>
          {hasMusic && (
            <Switch on={music.connected} onChange={(v) => void update({ ...music, connected: v })} label="Conectar Rudge Music" />
          )}
        </div>
        {hasMusic && music.connected && (
          <div className="setting">
            <div className="s-text">
              <b>Música no modo foco</b>
              <span>Mostra o atalho para o Rudge Music ao iniciar um foco.</span>
            </div>
            <Switch on={music.focusMusic} onChange={(v) => void update({ ...music, focusMusic: v })} label="Música no modo foco" />
          </div>
        )}
        <div className="row wrap">
          {hasMusic ? (
            <button className="btn btn-glass btn-sm" onClick={() => openRudgeMusic()} disabled={busy}>
              <ExternalLink /> Abrir Rudge Music
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => openRudgeMusic('/configuracoes')}>
              <Sparkles /> Conhecer o pacote app + Music
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/** Atalho do Rudge Music dentro do modo foco. */
export function FocusMusicButton() {
  const access = useAccess();
  const music = useMusicLink();
  const hasMusic = access.status === 'ready' && access.access.music;
  if (!hasMusic || !music.connected || !music.focusMusic) return null;
  return (
    <button className="btn btn-glass btn-pill" onClick={() => openRudgeMusic('/inicio')}>
      <Music2 /> Rudge Music
    </button>
  );
}

/** Tela quando o plano da conta não inclui o Rudge app. */
export function PlanLocked() {
  const session = useSession();
  return (
    <div className="login">
      <div className="login-wrap">
        <BrandMark className="login-mark" />
        <h1 className="wordmark">Rudge</h1>
        <div className={cx('login-card glass liquid')}>
          <h2>
            <Lock width={18} /> Seu plano não inclui o Rudge app
          </h2>
          <p className="sub">
            A conta <b>{session?.email}</b> está ativa no Rudge Music. Para usar o organizador também, mude para o pacote
            Rudge (app + Music).
          </p>
          <button className="btn btn-primary btn-lg btn-block" onClick={() => openRudgeMusic('/configuracoes')}>
            <Sparkles /> Ver o pacote
          </button>
          <button className="btn btn-glass btn-block" onClick={() => openRudgeMusic()}>
            <Music2 /> Abrir Rudge Music
          </button>
          <button className="btn btn-ghost btn-block" onClick={() => void logout()}>
            <LogOut /> Entrar com outra conta
          </button>
        </div>
      </div>
    </div>
  );
}

