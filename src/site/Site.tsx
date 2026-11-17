import { useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'motion/react';
import {
  Bell,
  BookOpen,
  CalendarDays,
  CheckSquare,
  LayoutDashboard,
  Plus,
  Repeat,
  Target,
  Timer,
  Wallet,
} from 'lucide-react';
import { LiquidButton } from './ui/LiquidButton';
import { GooeyTextReveal } from './ui/GooeyTextReveal';
import { ThemeToggle } from './ui/ThemeToggle';
import { ScrollGather } from './ui/ScrollGather';
import InkBackground from './ui/InkBackground';
import ActivityTerrain from './ui/ActivityTerrain';
import ScrollIndex from './ui/ScrollIndex';
import AgentLoop, { type LoopIteration } from './ui/AgentLoop';
import DataFlow, { type FlowNode } from './ui/DataFlow';

// Ilustração 1: o assistente previsto para 2027 organizando a semana (exemplo).
const AGENT_RUN: LoopIteration[] = [
  {
    gather: { label: 'Suas metas', detail: '3 metas ativas', tokens: 1800, mark: <Target /> },
    calls: [{ tool: 'Tarefas', mark: <CheckSquare />, action: 'Ler tarefas da semana', result: '12 tarefas, 4 atrasadas' }],
    verify: { passed: false, note: 'Faltam os horários livres' },
  },
  {
    gather: { label: 'Sua agenda', detail: 'Seg a sex, 9h às 18h', tokens: 2400, mark: <CalendarDays /> },
    calls: [
      { tool: 'Tarefas', mark: <CheckSquare />, action: 'Reorganizar a semana', result: '4 tarefas remarcadas' },
      { tool: 'Lembretes', mark: <Bell />, action: 'Criar lembretes', result: 'Horário em conflito', status: 'error' },
    ],
    verify: { passed: false, note: 'Um lembrete ficou de fora' },
  },
  {
    gather: { label: 'Seus hábitos', detail: 'Treino às 7h', tokens: 1200, mark: <Repeat /> },
    calls: [
      { tool: 'Lembretes', mark: <Bell />, action: 'Criar lembretes', result: '5 lembretes criados' },
      { tool: 'Modo foco', mark: <Timer />, action: 'Reservar foco', result: 'Ter e qui, às 14h' },
    ],
    verify: { passed: true, note: 'Semana pronta' },
  },
];

// Ilustração 2: como o Rudge funciona.
const FLOW_SOURCES: FlowNode[] = [
  { label: 'Rotina', meta: 'Tarefas e metas', detail: 'O que você precisa fazer e onde quer chegar', icon: <Target /> },
  { label: 'Hábitos', meta: 'Check-ins do dia', detail: 'Cada hábito concluído entra na sua constância', icon: <Repeat /> },
  { label: 'Carteira', meta: 'Seus bancos', detail: 'Gastos e saldos sincronizados', icon: <Wallet /> },
];
const FLOW_DESTINATIONS: FlowNode[] = [
  { label: 'Visão geral', meta: 'Tudo do seu dia', detail: 'Recebe tudo que entra', icon: <LayoutDashboard /> },
  { label: 'Lembretes', meta: 'Na hora certa', detail: 'Só o que tem horário', icon: <Bell />, share: 0.5 },
  { label: 'Modo foco', meta: 'Sessões de foco', detail: 'Só o que pede concentração', icon: <Timer />, share: 0.34 },
];

/* ------------------------------------------------------------------ */
/* Peças pequenas                                                      */
/* ------------------------------------------------------------------ */

function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg className="s-logo" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="15" className="s-logo-bg" />
      <path
        d="M22 47V17h11.5a8.6 8.6 0 0 1 0 17.2H22M33.5 34.2 43 47"
        fill="none"
        className="s-logo-r"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Estrela de oito pontas, usada como marca gráfica da página. */
function Star({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      {[0, 45, 90, 135].map((a) => (
        <line key={a} x1="24" y1="3" x2="24" y2="45" transform={`rotate(${a} 24 24)`} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Relógio de placas (flip) em 3D                                      */
/* ------------------------------------------------------------------ */

function FlipDigit({ value }: { value: string }) {
  const [cur, setCur] = useState(value);
  const [prev, setPrev] = useState(value);
  useEffect(() => {
    if (value === cur) return;
    setPrev(cur);
    setCur(value);
  }, [value, cur]);
  const flipping = prev !== cur;

  return (
    <span className="s-flip">
      <span className="s-flip-half top">
        <b>{cur}</b>
      </span>
      <span className="s-flip-half bottom">
        <b>{flipping ? prev : cur}</b>
      </span>
      {flipping && (
        <>
          <span key={`a${cur}`} className="s-flip-half top flap-a">
            <b>{prev}</b>
          </span>
          <span key={`b${cur}`} className="s-flip-half bottom flap-b" onAnimationEnd={() => setPrev(cur)}>
            <b>{cur}</b>
          </span>
        </>
      )}
    </span>
  );
}

function FlipGroup({ text }: { text: string }) {
  return (
    <span className="s-flip-group">
      {text.split('').map((c, i) => (
        <FlipDigit key={i} value={c} />
      ))}
    </span>
  );
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const p = (n: number) => String(n).padStart(2, '0');
  const label = `${p(now.getHours())}:${p(now.getMinutes())}`;
  return (
    <div className="s-clock" role="img" aria-label={`Relógio de placas marcando ${label}`}>
      <FlipGroup text={p(now.getHours())} />
      <FlipGroup text={p(now.getMinutes())} />
      <FlipGroup text={p(now.getSeconds())} />
    </div>
  );
}

/** As placas mostram o ano atual e viram para 2027 quando entram na tela. */
function LaunchYear() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.3 });
  const [year, setYear] = useState('2026');
  useEffect(() => {
    if (!seen) return;
    const id = window.setTimeout(() => setYear('2027'), 500);
    return () => window.clearTimeout(id);
  }, [seen]);
  return (
    <div className="s-year" ref={ref} role="img" aria-label="2027">
      <FlipGroup text={year} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Conteúdo                                                            */
/* ------------------------------------------------------------------ */

const FEATURES = [
  { name: 'Metas', text: 'Defina a meta, divida em etapas e registre o progresso. Cada meta pode ganhar uma capa.' },
  { name: 'Tarefas', text: 'Anote por texto, voz ou foto. O Rudge entende datas como "amanhã às 9h" e monta o seu dia.' },
  { name: 'Hábitos', text: 'Marque o dia como feito e acompanhe a sequência crescer semana após semana.' },
  { name: 'Lembretes', text: 'O aviso chega na hora marcada. Dá para concluir ou adiar 10 minutos direto da notificação.' },
  { name: 'Diário', text: 'Um espaço para fechar o dia, registrar o que importou e revisar a semana.' },
  { name: 'Modo foco', text: 'Tela cheia e só o relógio. Escolha o estilo do relógio e o fundo que ajudam você a concentrar.' },
  { name: 'Carteira', text: 'Conecte seus bancos e veja saldo, cartões e gastos do mês em um painel só.' },
];

function Features() {
  const [open, setOpen] = useState(0);
  return (
    <ul className="s-features">
      {FEATURES.map((f, i) => {
        const on = open === i;
        return (
          <li key={f.name} className={on ? 'open' : ''}>
            <button aria-expanded={on} aria-controls={`feat-${i}`} onClick={() => setOpen(on ? -1 : i)}>
              <span className="s-feat-name">{f.name}</span>
              <span className="s-feat-plus">
                <Plus size={22} strokeWidth={1.6} />
              </span>
            </button>
            <AnimatePresence initial={false}>
              {on && (
                <motion.div
                  id={`feat-${i}`}
                  className="s-feat-body"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                >
                  <p>{f.text}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
}

function Marquee({ reverse }: { reverse?: boolean }) {
  const items = Array.from({ length: 8 });
  return (
    <div className={`s-marquee${reverse ? ' rev' : ''}`} aria-hidden="true">
      <div className="s-marquee-track">
        {[0, 1].map((k) => (
          <div key={k} className="s-marquee-set">
            {items.map((_, i) => (
              <span key={i}>
                <Star className="s-marquee-star" />
                {i % 2 ? '2027' : 'Rudge'}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const SAME_ACCOUNT = [
  { h: 'Celular e computador', p: 'Entre com a mesma conta e encontre os mesmos dados nos dois.' },
  { h: 'Funciona sem internet', p: 'Use offline. O Rudge sincroniza assim que a conexão volta.' },
  { h: 'Instala como app', p: 'Adicione à tela de início, sem passar por loja de aplicativos.' },
];

const GATHER_ICONS = [Target, CheckSquare, Repeat, Bell, BookOpen, Timer, Wallet].map((Icon, i) => (
  <Icon key={i} size={22} strokeWidth={1.7} />
));

/** Dados de exemplo para o relevo: hábitos concluídos por dia, em 26 semanas. */
function habitData() {
  let seed = 11;
  const random = () => {
    seed = (seed * 16_807) % 2_147_483_647;
    return seed / 2_147_483_647;
  };
  const out: number[] = [];
  for (let i = 0; i < 26 * 7; i++) {
    const weekend = i % 7 >= 5;
    const growth = 0.45 + 0.55 * (i / (26 * 7)); // a constância cresce com o tempo
    const skipped = random() < (weekend ? 0.4 : 0.1) * (1.3 - growth);
    out.push(skipped ? 0 : Math.max(1, Math.round((weekend ? 3 : 6) * growth * (0.5 + random()))));
  }
  return out;
}
const HABIT_DATA = habitData();

export function Site() {
  const hero = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: hero, offset: ['start start', 'end start'] });
  const glowY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const reduce = useReducedMotion();
  // nome de fundo: abaixo do botão no celular, atrás do texto no desktop
  const [inkCenter] = useState(() => (window.innerWidth < 980 ? 0.8 : 0.6));

  return (
    <div className="s-page">
      <header className="s-nav">
        <a className="s-brand" href="#topo" aria-label="Rudge, início da página">
          <Logo />
          <span>Rudge</span>
        </a>
        <nav aria-label="Seções">
          <a href="#recursos">Recursos</a>
          <a href="#constancia">Constância</a>
          <a href="#foco">Modo foco</a>
          <a href="#lancamento">Lançamento</a>
        </nav>
        <div className="s-nav-end">
          <ThemeToggle />
          <LiquidButton href="../" size="sm">
            Entrar
          </LiquidButton>
        </div>
      </header>

      <ScrollIndex>
        <main id="topo">
          <section className="s-hero-wrap" ref={hero}>
            <InkBackground text="Rudge" center={inkCenter} />
            <motion.div className="s-glow" style={reduce ? undefined : { y: glowY }} aria-hidden="true" />
            <div className="s-orbit" aria-hidden="true" />

            <div className="s-hero">
              <div className="s-hero-copy">
                <p className="s-launch-pill">
                  <span className="s-pulse" />
                  Lançamento previsto para 2027
                </p>
                <GooeyTextReveal mode="immediate" delay={0.1} duration={1.1} stagger={0.09}>
                  <h1 data-index="Início">Organize a vida inteira num lugar só.</h1>
                  <p className="s-lead">
                    O Rudge junta metas, tarefas, hábitos, lembretes, diário, modo foco e carteira em um app, no celular
                    e no computador.
                  </p>
                </GooeyTextReveal>
                <LiquidButton href="#recursos" variant="solid">
                  Ver o que o Rudge faz
                </LiquidButton>
              </div>

            </div>
          </section>

          <ScrollGather
            text="Tudo no mesmo lugar"
            icons={GATHER_ICONS}
            caption="Metas, tarefas, hábitos, lembretes, diário, foco e carteira deixam de ficar espalhados."
          />

          <section className="s-section" id="recursos">
            <GooeyTextReveal mode="scroll">
              <h2 data-index="Recursos">Sete partes da sua rotina, um app.</h2>
            </GooeyTextReveal>
            <Features />
          </section>

          <section className="s-section s-split" id="constancia">
            <GooeyTextReveal mode="scroll" className="s-split-copy">
              <h2 data-index="Constância">Veja a sua constância ganhar relevo.</h2>
              <p>
                Cada coluna é um dia. Quanto mais hábitos você conclui, mais alta ela fica. Arraste o cartão para girar
                e toque em um dia para ver o total.
              </p>
            </GooeyTextReveal>
            <div className="s-terrain-wrap">
              <ActivityTerrain
                data={HABIT_DATA}
                title="Hábitos concluídos"
                unit={['hábito concluído', 'hábitos concluídos']}
              />
              <p className="s-note">Dados de exemplo.</p>
            </div>
          </section>

          <section className="s-section s-split" id="foco">
            <GooeyTextReveal mode="scroll" className="s-split-copy">
              <h2 data-index="Modo foco">Na hora de focar, fica só o relógio.</h2>
              <p>
                Depois de alguns segundos parado, o modo foco esconde tudo. Este é o relógio Flip, um dos estilos que
                você pode escolher.
              </p>
            </GooeyTextReveal>
            <LiveClock />
          </section>

          <div className="s-band">
            <Marquee />
            <Marquee reverse />
          </div>

          <section className="s-section s-same">
            <GooeyTextReveal mode="scroll">
              <h2 data-index="Seus dados">Seus dados acompanham você.</h2>
            </GooeyTextReveal>
            <div className="s-same-grid">
              {SAME_ACCOUNT.map((x) => (
                <div key={x.h}>
                  <h3>{x.h}</h3>
                  <p>{x.p}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="s-section s-illus" id="como-funciona">
            <GooeyTextReveal mode="scroll" className="s-illus-copy">
              <p className="s-kicker">Como funciona</p>
              <h2 data-index="Como funciona">Tudo entra, o Rudge organiza.</h2>
              <p>
                O que você registra vira um lugar só. O Rudge cruza tudo e devolve para você como visão do dia,
                lembretes na hora certa e sessões de foco.
              </p>
            </GooeyTextReveal>
            <DataFlow
              sources={FLOW_SOURCES}
              destinations={FLOW_DESTINATIONS}
              core={{ label: 'Rudge', detail: 'Organiza e cruza tudo', countLabel: 'itens organizados', countStart: 1248 }}
            />
          </section>

          <section className="s-section s-illus" id="novidade">
            <GooeyTextReveal mode="scroll" className="s-illus-copy">
              <p className="s-kicker">
                <span className="s-pulse" />
                Novidade em 2027
              </p>
              <h2 data-index="Novidade 2027">Um braço direito para tudo.</h2>
              <p>
                Em 2027 o Rudge ganha o Claude Opus como assistente. Você pede, ele lê suas metas, tarefas e hábitos,
                age por você e confere o resultado até a tarefa ficar pronta.
              </p>
            </GooeyTextReveal>
            <AgentLoop iterations={AGENT_RUN} task="Organize minha semana e me lembre do que importa." summary="Semana organizada: 4 tarefas remarcadas, 5 lembretes e 2 blocos de foco." title="Assistente" loop controls={false} defaultSpeed={1.3} />
          </section>

          <section className="s-launch" id="lancamento">
            <div className="s-glow low" aria-hidden="true" />
            <Star className="s-launch-star" />
            <h2 data-index="Lançamento">Lançamento previsto para</h2>
            <LaunchYear />
            <GooeyTextReveal mode="scroll">
              <p>O Rudge ainda está em construção. A abertura para o público está prevista para 2027.</p>
            </GooeyTextReveal>
          </section>
        </main>
      </ScrollIndex>

      <footer className="s-footer">
        <span className="s-brand">
          <Logo size={22} />
          <span>Rudge</span>
        </span>
        <span>Lançamento previsto para 2027</span>
        <a href="../">Já tenho acesso</a>
      </footer>
    </div>
  );
}
