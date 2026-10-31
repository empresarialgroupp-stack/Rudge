import { useEffect, useRef, useState } from 'react';
import { FileUp, Link2, RefreshCw, ShieldCheck, Trash2, Unlink } from 'lucide-react';
import { Switch } from './ui';
import { WalletConnect } from './WalletConnect';
import { WalletImport } from './WalletImport';
import { toast, useRoute } from '../lib/ui';
import { ago, removeAllAccounts, setPrivacy, syncedBanks, syncPluggy, unlinkPluggy, useAccounts, usePluggy, usePrivacy } from '../lib/finance';

/** Configurações → Dados sensíveis: privacidade dos valores e as conexões com os bancos. */
export function SensitiveDataCard() {
  const privacy = usePrivacy();
  const pluggy = usePluggy();
  const imported = useAccounts();
  const route = useRoute();
  const ref = useRef<HTMLElement>(null);
  const [connecting, setConnecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const banks = syncedBanks(pluggy.accounts);
  const linked = pluggy.linked && banks.length > 0;
  const soon = pluggy.accounts.some((a) => a.consentExpiresAt && Date.parse(a.consentExpiresAt) - Date.now() < 30 * 86_400_000);

  // vindo da barra da Carteira
  useEffect(() => {
    if (route.params.get('sensiveis')) setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  }, [route]);

  return (
    <section className="card glass" ref={ref}>
      <div className="card-head">
        <h2 className="card-title">
          <ShieldCheck /> Dados sensíveis
        </h2>
      </div>

      <div className="setting">
        <div className="s-text">
          <b>Abrir a Carteira com valores ocultos</b>
          <span>Saldos, gastos e nomes começam desfocados. Toque no olho para ver.</span>
        </div>
        <Switch on={privacy.hideOnOpen} onChange={(v) => setPrivacy({ hideOnOpen: v, hidden: v || privacy.hidden })} label="Abrir a Carteira com valores ocultos" />
      </div>
      <div className="setting">
        <div className="s-text">
          <b>Avisos sem valores</b>
          <span>O aviso de dinheiro novo diz só “Entrou dinheiro”, sem mostrar quanto, para quem olhar a sua tela.</span>
        </div>
        <Switch on={privacy.hideToasts} onChange={(v) => setPrivacy({ hideToasts: v })} label="Avisos sem valores" />
      </div>

      <div className="setting">
        <div className="s-text">
          <b>Bancos conectados</b>
          <span>
            {linked
              ? `${banks.join(', ')} · atualizado ${ago(pluggy.at)}${pluggy.errors?.length ? ' · um banco não respondeu' : ''}${soon ? ' · autorização vence em menos de 30 dias, renove no Meu Pluggy' : ''}`
              : 'Nenhum banco conectado. A Carteira usa extratos importados ou dados de exemplo.'}
          </span>
        </div>
      </div>
      <div className="row wrap sensitive-actions">
        {linked && (
          <button className="btn btn-glass btn-sm" onClick={() => void syncPluggy(true)} disabled={pluggy.syncing}>
            <RefreshCw className={pluggy.syncing ? 'spin' : undefined} /> {pluggy.syncing ? 'Atualizando…' : 'Atualizar agora'}
          </button>
        )}
        <button className="btn btn-glass btn-sm" onClick={() => setConnecting(true)}>
          <Link2 /> {linked ? 'Adicionar banco' : 'Conectar bancos'}
        </button>
        {linked && (
          <button
            className="btn btn-danger btn-sm"
            onClick={() =>
              confirm('Desconectar os bancos? A Carteira volta aos extratos ou aos dados de exemplo.') &&
              void unlinkPluggy()
                .then(() => toast({ title: 'Bancos desconectados', icon: 'info' }))
                .catch((e: Error) => toast({ title: 'Não deu para desconectar', body: e.message, icon: 'error' }))
            }
          >
            <Unlink /> Desconectar
          </button>
        )}
      </div>

      <div className="setting">
        <div className="s-text">
          <b>Extratos importados</b>
          <span>{imported.length ? `${imported.length} ${imported.length === 1 ? 'conta guardada' : 'contas guardadas'} só neste aparelho.` : 'Nenhum extrato neste aparelho.'}</span>
        </div>
      </div>
      <div className="row wrap sensitive-actions">
        <button className="btn btn-glass btn-sm" onClick={() => setImporting(true)}>
          <FileUp /> Importar extrato
        </button>
        {imported.length > 0 && (
          <button
            className="btn btn-danger btn-sm"
            onClick={() => confirm('Apagar todos os extratos importados deste aparelho?') && (removeAllAccounts(), toast({ title: 'Extratos apagados', icon: 'info' }))}
          >
            <Trash2 /> Apagar extratos
          </button>
        )}
      </div>

      {connecting && <WalletConnect onClose={() => setConnecting(false)} onImport={() => setImporting(true)} />}
      {importing && <WalletImport onClose={() => setImporting(false)} />}
    </section>
  );
}
