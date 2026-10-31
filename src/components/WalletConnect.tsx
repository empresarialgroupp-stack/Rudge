import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Link2, Lock } from 'lucide-react';
import { Field, Modal } from './ui';
import { toast } from '../lib/ui';
import { linkPluggy } from '../lib/finance';

/** Conexão única com o Meu Pluggy; depois disso a Carteira sincroniza sozinha. */
export function WalletConnect({ onClose, onImport }: { onClose: () => void; onImport: () => void }) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [itemIds, setItemIds] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    if (!clientId.trim() || !clientSecret.trim() || !itemIds.trim()) return setError('Preencha os três campos.');
    setBusy(true);
    setError('');
    try {
      await linkPluggy({ clientId, clientSecret, itemIds });
      toast({ title: 'Bancos conectados', body: 'A Carteira agora se atualiza sozinha.', icon: 'check' });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

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
          <button className="btn btn-primary btn-pill" onClick={run} disabled={busy}>
            <Link2 /> {busy ? 'Conectando…' : 'Conectar'}
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
          <li>
            Em{' '}
            <a href="https://dashboard.pluggy.ai" target="_blank" rel="noreferrer">
              dashboard.pluggy.ai <ExternalLink />
            </a>
            , entre com a mesma conta e crie uma aplicação. Copie o <b>Client ID</b> e o <b>Client Secret</b>.
          </li>
          <li>
            Na aplicação, abra <b>Demo → Connect Account</b>, escolha <b>MeuPluggy</b> e entre. Em <b>Connected Items</b>, copie os Item IDs (um por banco).
          </li>
        </ol>
        <Field label="Client ID">
          <input className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" spellCheck={false} />
        </Field>
        <Field label="Client Secret">
          <input className="input" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Item IDs">
          <textarea className="textarea" rows={3} value={itemIds} onChange={(e) => setItemIds(e.target.value)} placeholder="Um por linha" spellCheck={false} />
        </Field>
        {error && <p className="wconnect-err">{error}</p>}
        <p className="wimport-lock">
          <Lock /> O Client Secret fica guardado no cofre do servidor do Rudge, não neste aparelho. O Meu Pluggy é grátis para uso pessoal (até 5 bancos) e atualiza os dados a cada
          24 horas.
        </p>
      </div>
    </Modal>,
    document.body,
  );
}
