import { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, FileUp, Landmark, Link2, RefreshCw, Trash2, Unlink, Lightbulb, PiggyBank, Receipt, Scale } from 'lucide-react';
import { WalletStack } from '../components/WalletStack';
import { WalletImport } from '../components/WalletImport';
import { WalletConnect } from '../components/WalletConnect';
import { cx, ProgressBar } from '../components/ui';
import { toast } from '../lib/ui';
import { BANKS, brl, removeAccount, summarize, syncPluggy, takeNewInflows, tips, unlinkPluggy, useAccounts, useFinance, useSaved, type FinanceCard } from '../lib/finance';
import type { PluggyState } from '../lib/finance/pluggy';

function Dashboard({ cards, scope }: { cards: FinanceCard[]; scope: string }) {
  const { saved, total: savedTotal, toggle } = useSaved();
  const s = useMemo(() => summarize(cards), [cards]);
  const savedHere = s.inflows.reduce((n, i) => n + (saved[i.id] ?? 0), 0);
  const list = useMemo(() => tips(cards, Date.now(), savedHere), [cards, savedHere]);
  // cartão de crédito sozinho: não recebe dinheiro, então mostra fatura e limite no lugar
  const credit = cards.length === 1 && cards[0].kind === 'credit' ? cards[0] : null;

  return (
    <section className="wdash" aria-label={`Resumo do mês: ${scope}`}>
      <div className="wdash-scope">{scope} · este mês</div>

      <div className="wdash-kpis">
        {credit ? (
          <>
            <div className="wk">
              <span className="wk-l">
                <ArrowUpRight /> Gastei
              </span>
              <b className="wk-v">{brl(s.spent)}</b>
            </div>
            <div className="wk">
              <span className="wk-l">
                <Receipt /> Fatura
              </span>
              <b className="wk-v">{brl(credit.balance)}</b>
            </div>
            <div className="wk">
              <span className="wk-l">
                <Scale /> Limite livre
              </span>
              <b className="wk-v">{credit.limit ? brl(credit.limit - credit.balance) : '—'}</b>
            </div>
          </>
        ) : (
          <>
            <div className="wk">
              <span className="wk-l">
                <ArrowDownLeft /> Recebi
              </span>
              <b className="wk-v in">{brl(s.received)}</b>
            </div>
            <div className="wk">
              <span className="wk-l">
                <ArrowUpRight /> Gastei
              </span>
              <b className="wk-v">{brl(s.spent)}</b>
            </div>
            <div className="wk">
              <span className="wk-l">
                <Scale /> Sobrou
              </span>
              <b className={cx('wk-v', s.net < 0 && 'neg')}>{brl(s.net)}</b>
            </div>
          </>
        )}
      </div>

      {!credit && (
        <div className="wdash-block glass">
          <div className="wb-head">
            <PiggyBank />
            <b>Guarde 10% de cada entrada</b>
            <span className="wb-meta">
              {brl(savedHere)} de {brl(s.toSave)}
            </span>
          </div>
          <ProgressBar value={s.toSave ? savedHere / s.toSave : 0} />
          {s.inflows.length ? (
            <ul className="wsave">
              {s.inflows.map((i) => {
                const done = !!saved[i.id];
                return (
                  <li key={i.id} className={cx(done && 'done')}>
                    <span className="wsave-body">
                      <b>{i.merchant}</b>
                      <small>
                        Entrou {brl(i.amount)} · {new Date(i.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')}
                      </small>
                    </span>
                    <button className={cx('btn btn-sm btn-pill', done ? 'btn-primary' : 'btn-glass')} onClick={() => toggle(i.id, i.save)} aria-pressed={done}>
                      {done && <Check />} {done ? 'Guardado' : `Guardar ${brl(i.save)}`}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="wb-empty">Nenhuma entrada este mês ainda.</p>
          )}
          {savedTotal > savedHere && <p className="wb-foot">Em todos os cartões: {brl(savedTotal)} guardados no mês.</p>}
        </div>
      )}

      {list.length > 0 && (
        <div className="wdash-block glass">
          <div className="wb-head">
            <Lightbulb />
            <b>Dicas</b>
          </div>
          <ul className="wtips">
            {list.map((t) => (
              <li key={t.id} className={cx(t.tone)}>
                {t.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Accounts({ onImport }: { onImport: () => void }) {
  const accounts = useAccounts();
  return (
    <section className="wdash-block glass waccounts">
      <div className="wb-head">
        <Landmark />
        <b>Extratos importados</b>
        <button className="btn btn-sm btn-glass btn-pill wb-meta-btn" onClick={onImport}>
          <FileUp /> Importar
        </button>
      </div>
      <ul className="wsave">
        {accounts.map((a) => (
          <li key={a.id}>
            <span className="wsave-body">
              <b>
                {BANKS[a.bank].label} · {a.kind === 'credit' ? 'Cartão' : 'Conta'}
                {a.lastFour && ` •••• ${a.lastFour}`}
              </b>
              <small>
                {a.txs.length} transações · atualizado em {new Date(a.importedAt).toLocaleDateString('pt-BR')}
              </small>
            </span>
            <button
              className="btn btn-sm btn-glass btn-pill"
              onClick={() => confirm(`Remover ${BANKS[a.bank].label} deste aparelho?`) && removeAccount(a.id)}
              aria-label={`Remover ${BANKS[a.bank].label}`}
            >
              <Trash2 />
            </button>
          </li>
        ))}
      </ul>
      <p className="wb-foot">Atualize importando o extrato novo: o que já existe não duplica. Os dados ficam só neste aparelho.</p>
    </section>
  );
}

function ago(at: number) {
  const min = Math.round((Date.now() - at) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h} h` : new Date(at).toLocaleDateString('pt-BR');
}

/** Estado da sincronização automática, com aviso quando um banco precisa de nova autorização. */
function SyncStatus({ pluggy }: { pluggy: PluggyState }) {
  const banks = [...new Set(pluggy.accounts.map((a) => a.label || BANKS[a.bank].label))].join(', ');
  const soon = pluggy.accounts.map((a) => (a.consentExpiresAt ? Date.parse(a.consentExpiresAt) : Infinity)).some((t) => t - Date.now() < 30 * 86_400_000);
  const warn = !!pluggy.error || !!pluggy.errors?.length || soon;
  const note = pluggy.error
    ? `Sem conexão agora (${pluggy.error}). Mostrando o último retrato.`
    : pluggy.errors?.length
      ? 'Um banco não respondeu. Se continuar, autorize de novo no Meu Pluggy.'
      : soon
        ? 'A autorização de um banco vence em menos de 30 dias. Renove no Meu Pluggy.'
        : `Atualizado ${ago(pluggy.at)} · os bancos atualizam a cada 24 h`;
  return (
    <div className="wsync glass" role="status">
      <span className={cx('wsync-dot', warn && 'warn')} aria-hidden="true" />
      <span className="wsync-body">
        <b>Sincronizado: {banks}</b>
        <span>{note}</span>
      </span>
      <button className="icon-btn btn-glass" onClick={() => void syncPluggy(true)} disabled={pluggy.syncing} aria-label="Atualizar agora" title="Atualizar agora">
        <RefreshCw className={cx(pluggy.syncing && 'spin')} />
      </button>
      <button
        className="icon-btn btn-glass"
        onClick={() =>
          confirm('Desconectar os bancos? A Carteira volta aos extratos ou aos dados de exemplo.') &&
          void unlinkPluggy().catch((e: Error) => toast({ title: 'Não deu para desconectar', body: e.message, icon: 'error' }))
        }
        aria-label="Desconectar bancos"
        title="Desconectar bancos"
      >
        <Unlink />
      </button>
    </div>
  );
}

export function WalletPage() {
  const { provider, cards, error, pluggy } = useFinance();
  const imported = useAccounts();
  const [selected, setSelected] = useState<FinanceCard | null>(null);
  const [importing, setImporting] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Toda entrada nova vira um aviso para guardar 10%.
  useEffect(() => {
    if (!cards || !provider.live) return;
    const inflows = summarize(cards).inflows;
    const fresh = takeNewInflows(inflows.map((i) => i.id));
    const first = inflows.find((i) => fresh.includes(i.id));
    if (!first) return;
    const more = fresh.length - 1;
    toast({
      title: `Entrou ${brl(first.amount)} · guarde ${brl(first.save)}`,
      body: `${first.merchant}: separe 10% para a reserva antes de gastar.${more > 0 ? ` Mais ${more} ${more === 1 ? 'entrada nova' : 'entradas novas'} abaixo.` : ''}`,
      icon: 'spark',
      duration: 9000,
    });
  }, [cards, provider.live]);

  if (error)
    return (
      <section className="card glass">
        <b>Não foi possível carregar os cartões.</b>
        <p className="muted">{error}</p>
      </section>
    );
  if (!cards) return <section className="card glass muted">Carregando cartões…</section>;
  if (selected && !cards.some((c) => c.id === selected.id)) setSelected(null);

  const scopeCards = selected ? cards.filter((c) => c.id === selected.id) : cards;

  return (
    <div className="wallet-page">
      {provider.id === 'pluggy' ? (
        <SyncStatus pluggy={pluggy} />
      ) : (
        <div className="wallet-note glass">
          <Landmark />
          <span>{provider.live ? <b>Extratos importados.</b> : <b>Dados de exemplo.</b>} Conecte seus bancos para a Carteira se atualizar sozinha.</span>
          <button className="btn btn-sm btn-primary btn-pill" onClick={() => setConnecting(true)}>
            <Link2 /> Conectar
          </button>
        </div>
      )}
      <WalletStack cards={cards} label="Meus cartões" currency="BRL" locale="pt-BR" onSelectedChange={(c) => setSelected(c ? (cards.find((x) => x.id === c.id) ?? null) : null)} />
      <Dashboard key={selected?.id ?? 'all'} cards={scopeCards} scope={selected ? `${selected.issuer} · ${selected.product}` : 'Todos os cartões'} />
      {imported.length > 0 && provider.id !== 'pluggy' && <Accounts onImport={() => setImporting(true)} />}
      {importing && <WalletImport onClose={() => setImporting(false)} />}
      {connecting && <WalletConnect onClose={() => setConnecting(false)} onImport={() => setImporting(true)} />}
    </div>
  );
}
