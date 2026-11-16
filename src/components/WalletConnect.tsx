import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Link2, Lock } from 'lucide-react';
import { Field, Modal } from './ui';
import { toast } from '../lib/ui';
import { linkPluggy, openPluggyConnect, pluggyConfig } from '../lib/finance';

/**
 * Conexão única com o Meu Pluggy; depois disso a Carteira sincroniza sozinha.
 * Com as credenciais nos secrets da função, basta abrir o widget Pluggy Connect. Sem elas,
 * o formulário pede Client ID, Client Secret e Item IDs (guardados no cofre do servidor).
 */
export function WalletConnect({ onClose, onImport }: { onClose: () => void; onImport: () => void }) {
  const [server, setServer] = useState<boolean | null>(null);
  const [manual, setManual] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [itemIds, setItemIds] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    pluggyConfig()
      .then((c) => setServer(c.serverCredentials))
      .catch(() => setServer(false));
  }, []);

  const done = (err?: string) => {
    setBusy(false);
    // conta trial da Pluggy não cria conexões pelo widget: conecta no painel e cola os Item IDs
    if (err && /TRIAL_CLIENT/i.test(err)) {
      setManual(true);
      return setError('No trial, a Pluggy só aceita conexões feitas pelo painel dela. Em dashboard.pluggy.ai, abra sua aplicação → Demo → Connect Account → MeuPluggy, copie os Item IDs e cole aqui.');
    }
    if (err) return setError(err);
    toast({ title: 'Banco conectado', body: 'A Carteira agora se atualiza sozinha.', icon: 'check' });
    onClose();
  };

  async function openWidget() {
    setBusy(true);
    setError('');
    try {
      await openPluggyConnect(done);
    } catch (e) {
      done(e instanceof Error ? e.message : String(e));
    }
  }

  async function submit() {
    const needCreds = !server;
    if (!itemIds.trim() || (needCreds && (!clientId.trim() || !clientSecret.trim()))) return setError(needCreds ? 'Preencha os três campos.' : 'Cole ao menos um Item ID.');
    setBusy(true);
    setError('');
    try {
      await linkPluggy(needCreds ? { clientId, clientSecret, itemIds } : { itemIds, append: true });
      done();
    } catch (e) {
      done(e instanceof Error ? e.message : String(e));
    }
  }

  const widget = server && !manual;

  return createPortal(
    <Modal
      title="Conectar bancos"
      onClose={onClose}
      size="narrow"
      footer={
        <>
          <button className="btn btn-glass btn-pill" onClick={() => (onClose(), onImport())}>
            Importar extrato
          </button>
          <button className="btn btn-primary btn-pill" onClick={widget ? openWidget : submit} disabled={busy || server === null}>
            <Link2 /> {busy ? 'Conectando…' : widget ? 'Abrir Pluggy' : 'Conectar'}
          </button>
        </>
      }
    >
      <div className="wimport">
        <ol className="wconnect-steps">
          <li>
            Em{' '}
            <a href="https://meu.pluggy.ai" target="_blank" rel="noreferrer">
              meu.pluggy.ai <ExternalLink />
            </a>
            , crie sua conta e conecte Nubank, Inter e Mercado Pago (cada banco pede para você autorizar no app dele).
          </li>
          {widget ? (
            <li>
              Toque em <b>Abrir Pluggy</b>, escolha <b>MeuPluggy</b> e entre com a mesma conta. Repita para cada banco que não aparecer.
            </li>
          ) : (
            <>
              {!server && (
                <li>
                  Em{' '}
                  <a href="https://dashboard.pluggy.ai" target="_blank" rel="noreferrer">
                    dashboard.pluggy.ai <ExternalLink />
                  </a>
                  , entre com a mesma conta e crie uma aplicação. Copie o <b>Client ID</b> e o <b>Client Secret</b>.
                </li>
              )}
              <li>
                Na aplicação, abra <b>Demo → Connect Account</b>, escolha <b>MeuPluggy</b> e entre. Em <b>Connected Items</b>, copie os Item IDs (um por banco).
              </li>
            </>
          )}
        </ol>
        {!widget && (
          <>
            {!server && (
              <>
                <Field label="Client ID">
                  <input className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" spellCheck={false} />
                </Field>
                <Field label="Client Secret">
                  <input className="input" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="off" />
                </Field>
              </>
            )}
            <Field label="Item IDs">
              <textarea className="textarea" rows={3} value={itemIds} onChange={(e) => setItemIds(e.target.value)} placeholder="Um por linha" spellCheck={false} />
            </Field>
          </>
        )}
        {server && (
          <button type="button" className="wconnect-alt" onClick={() => (setManual((v) => !v), setError(''))}>
            {manual ? 'Voltar para o widget' : 'Prefiro colar os Item IDs'}
          </button>
        )}
        {error && <p className="wconnect-err">{error}</p>}
        <p className="wimport-lock">
          <Lock />{' '}
          {server
            ? 'As credenciais da Pluggy ficam só no servidor do Rudge; o app recebe um token de 30 minutos para abrir a conexão.'
            : 'O Client Secret fica guardado no cofre do servidor do Rudge, não neste aparelho.'}{' '}
          O Meu Pluggy é grátis para uso pessoal (até 5 bancos) e atualiza os dados a cada 24 horas.
        </p>
      </div>
    </Modal>,
    document.body,
  );
}
