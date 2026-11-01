import { useEffect, useRef, useState } from 'react';
import { Alert, type AlertTone } from './arc/Alert';
import { useCloudStatus, type CloudState } from '../lib/cloud';

const DISMISS_KEY = 'rudge:sync-alert-ok-dismissed';

const COPY: Record<Exclude<CloudState, 'syncing'>, { tone: AlertTone; title: string; body: string }> = {
  ok: {
    tone: 'success',
    title: 'Seus dados estão protegidos',
    body: 'Iguais no computador e no celular, com cópias de segurança automáticas na sua conta.',
  },
  off: {
    tone: 'info',
    title: 'Aguardando a primeira sincronização',
    body: 'Enquanto isso, tudo fica guardado neste aparelho. Toque em Sincronizar agora para enviar para a conta.',
  },
  offline: {
    tone: 'warning',
    title: 'Você está sem internet',
    body: 'Pode continuar usando normalmente. As alterações ficam neste aparelho e sobem sozinhas quando a conexão voltar.',
  },
  error: {
    tone: 'danger',
    title: 'A sincronização falhou',
    body: 'Nada foi perdido: seus dados continuam neste aparelho. Toque em Sincronizar agora ou tente de novo em instantes.',
  },
};

const SYNCING = {
  tone: 'info' as AlertTone,
  title: 'Sincronizando…',
  body: 'Juntando o que há neste aparelho com o que está na conta. Nada é apagado.',
};

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Alerta do card Dados na conta: um único Alert que muda de tom conforme o estado da sincronização. */
export function SyncAlert() {
  const cloud = useCloudStatus();
  // a checagem automática a cada 30 s passa por "syncing": se já estava tudo salvo, mantém o verde
  const settled = useRef<Exclude<CloudState, 'syncing'>>('off');
  if (cloud.state !== 'syncing') settled.current = cloud.state;
  const copy = cloud.state === 'syncing' ? (settled.current === 'ok' ? COPY.ok : SYNCING) : COPY[cloud.state];

  const [dismissed, setDismissed] = useState(readDismissed);
  // se algo der errado depois, o alerta volta a aparecer mesmo que o verde tenha sido dispensado
  useEffect(() => {
    if (copy.tone !== 'success' && dismissed) {
      setDismissed(false);
      try {
        localStorage.removeItem(DISMISS_KEY);
      } catch {
        /* ignora */
      }
    }
  }, [copy.tone, dismissed]);

  const isOk = copy.tone === 'success';
  return (
    <Alert
      className="account-alert"
      tone={copy.tone}
      title={copy.title}
      open={!(isOk && dismissed)}
      onDismiss={
        isOk
          ? () => {
              setDismissed(true);
              try {
                localStorage.setItem(DISMISS_KEY, '1');
              } catch {
                /* ignora */
              }
            }
          : undefined
      }
    >
      {copy.body}
    </Alert>
  );
}
