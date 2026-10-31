import { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, Landmark, Lightbulb, PiggyBank, Receipt, Scale } from 'lucide-react';
import { WalletStack } from '../components/WalletStack';
import { cx, ProgressBar } from '../components/ui';
import { toast } from '../lib/ui';
import { brl, summarize, takeNewInflows, tips, useFinance, useSaved, type FinanceCard } from '../lib/finance';

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

export function WalletPage() {
  const { provider, cards, error } = useFinance();
  const [selected, setSelected] = useState<FinanceCard | null>(null);

  // Toda entrada nova vira um aviso para guardar 10%.
  useEffect(() => {
    if (!cards) return;
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
  }, [cards]);

  if (error)
    return (
      <section className="card glass">
        <b>Não foi possível carregar os cartões.</b>
        <p className="muted">{error}</p>
      </section>
    );
  if (!cards) return <section className="card glass muted">Carregando cartões…</section>;

  const scopeCards = selected ? cards.filter((c) => c.id === selected.id) : cards;

  return (
    <div className="wallet-page">
      {!provider.live && (
        <div className="wallet-note glass">
          <Landmark />
          <span>
            <b>Dados de exemplo.</b> A conexão com seus bancos (Open Finance) entra assim que a integração for liberada.
          </span>
        </div>
      )}
      <WalletStack cards={cards} label="Meus cartões" currency="BRL" locale="pt-BR" onSelectedChange={(c) => setSelected(c ? (cards.find((x) => x.id === c.id) ?? null) : null)} />
      <Dashboard key={selected?.id ?? 'all'} cards={scopeCards} scope={selected ? `${selected.product} •••• ${selected.lastFour}` : 'Todos os cartões'} />
    </div>
  );
}
