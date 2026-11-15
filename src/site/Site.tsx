import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { Check, Moon, Plus, Sun } from 'lucide-react';

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

/** Selo giratório com o aviso de lançamento. */
function LaunchSeal() {
  return (
    <div className="s-seal" role="img" aria-label="Lançamento previsto para 2027">
      <svg viewBox="0 0 120 120" className="s-seal-ring" aria-hidden="true">
        <defs>
          <path id="seal-path" d="M60 60m-44 0a44 44 0 1 1 88 0a44 44 0 1 1 -88 0" />
        </defs>
        <text>
          <textPath href="#seal-path" textLength="272">
            lançamento previsto para 2027 ✳ rudge ✳
          </textPath>
        </text>
      </svg>
      <Star className="s-seal-star" />
    </div>
  );
}

function ThemeButton() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark');
  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#f2f2f3' : '#000000');
    try {
      localStorage.setItem('rudge:site:theme', next);
    } catch {
      /* navegação privada */
    }
    setTheme(next);
  };
  return (
    <button className="s-icon-btn" onClick={toggle} aria-label={theme === 'light' ? 'Usar tema escuro' : 'Usar tema claro'}>
      {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Cena 3D do topo: três painéis de vidro em profundidade              */
/* ------------------------------------------------------------------ */

function Layer({
  depth,
  spread,
  className,
  children,
}: {
  depth: number;
  spread: MotionValue<number>;
  className: string;
  children: ReactNode;
}) {
  const z = useTransform(spread, (s) => depth * s);
  return (
    <motion.div className={`s-layer ${className}`} style={{ z }}>
      {children}
    </motion.div>
  );
}

const TODAY = [
  { t: 'Revisar a semana', done: true },
  { t: 'Treino de perna', done: true },
  { t: 'Enviar proposta', done: false },
  { t: 'Ler 20 páginas', done: false },
];

function HeroScene({ progress }: { progress: MotionValue<number> }) {
  const reduce = useReducedMotion();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 70, damping: 16 });
  const sy = useSpring(py, { stiffness: 70, damping: 16 });
  const sp = useSpring(progress, { stiffness: 90, damping: 22 });

  // gira com a rolagem (celular) e inclina com o ponteiro (desktop)
  const rotateY = useTransform([sp, sx], ([p, x]: number[]) => (reduce ? -20 : -20 + p * 40 + x * 10));
  const rotateX = useTransform([sp, sy], ([p, y]: number[]) => (reduce ? 12 : 16 - p * 10 - y * 8));
  const spread = useTransform(sp, (p) => (reduce ? 1 : 1 + p * 1.5));

  useEffect(() => {
    if (reduce) return;
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      px.set((e.clientX / window.innerWidth) * 2 - 1);
      py.set((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, [px, py, reduce]);

  return (
    <div className="s-scene" aria-hidden="true">
      <div className="s-float">
        <motion.div className="s-stack" style={{ rotateX, rotateY }}>
          <Layer depth={0} spread={spread} className="s-l-today">
            <div className="s-l-head">
              <span>Hoje</span>
              <span className="s-l-dim">2 de 4</span>
            </div>
            <ul>
              {TODAY.map((x) => (
                <li key={x.t} className={x.done ? 'done' : ''}>
                  <span className="s-box">{x.done && <Check size={11} strokeWidth={3} />}</span>
                  {x.t}
                </li>
              ))}
            </ul>
          </Layer>

          <Layer depth={70} spread={spread} className="s-l-goal">
            <svg viewBox="0 0 64 64" className="s-ring">
              <circle cx="32" cy="32" r="26" className="s-ring-track" />
              <circle cx="32" cy="32" r="26" className="s-ring-fill" pathLength={100} strokeDasharray="58 100" />
            </svg>
            <div>
              <strong>Ler 12 livros</strong>
              <span className="s-l-dim">7 lidos este ano</span>
            </div>
          </Layer>

          <Layer depth={130} spread={spread} className="s-l-habit">
            <strong>Treinar</strong>
            <div className="s-dots">
              {[1, 1, 1, 1, 1, 0, 0].map((on, i) => (
                <i key={i} className={on ? 'on' : ''} />
              ))}
            </div>
            <span className="s-l-dim">5 dias seguidos</span>
          </Layer>

          <Layer depth={190} spread={spread} className="s-l-remind">
            <span className="s-pulse" />
            Pagar a fatura às 18:00
          </Layer>
        </motion.div>
      </div>
    </div>
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

export function Site() {
  const hero = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: hero, offset: ['start start', 'end start'] });
  const glowY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const reduce = useReducedMotion();

  return (
    <div className="s-page">
      <header className="s-nav">
        <a className="s-brand" href="#topo" aria-label="Rudge, início da página">
          <Logo />
          <span>Rudge</span>
        </a>
        <nav aria-label="Seções">
          <a href="#recursos">Recursos</a>
          <a href="#foco">Modo foco</a>
          <a href="#lancamento">Lançamento</a>
        </nav>
        <div className="s-nav-end">
          <ThemeButton />
          <a className="s-btn ghost" href="../">
            Entrar
          </a>
        </div>
      </header>

      <main id="topo">
        <section className="s-hero" ref={hero}>
          <motion.div className="s-glow" style={reduce ? undefined : { y: glowY }} aria-hidden="true" />
          <div className="s-orbit" aria-hidden="true" />

          <div className="s-hero-copy">
            <p className="s-launch-pill">
              <span className="s-pulse" />
              Lançamento previsto para 2027
            </p>
            <h1>Organize a vida inteira num lugar só.</h1>
            <p className="s-lead">
              O Rudge junta metas, tarefas, hábitos, lembretes, diário, modo foco e carteira em um app, no celular e no
              computador.
            </p>
            <a className="s-btn" href="#recursos">
              Ver o que o Rudge faz
            </a>
          </div>

          <HeroScene progress={scrollYProgress} />
          <LaunchSeal />
        </section>

        <section className="s-section" id="recursos">
          <h2>Sete partes da sua rotina, um app.</h2>
          <Features />
        </section>

        <section className="s-section s-focus" id="foco">
          <div className="s-focus-copy">
            <h2>Na hora de focar, fica só o relógio.</h2>
            <p>
              Depois de alguns segundos parado, o modo foco esconde tudo. Este é o relógio Flip, um dos estilos que você
              pode escolher.
            </p>
          </div>
          <LiveClock />
        </section>

        <div className="s-band">
          <Marquee />
          <Marquee reverse />
        </div>

        <section className="s-section s-same">
          <h2>Seus dados acompanham você.</h2>
          <div className="s-same-grid">
            {SAME_ACCOUNT.map((x) => (
              <div key={x.h}>
                <h3>{x.h}</h3>
                <p>{x.p}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="s-launch" id="lancamento">
          <div className="s-glow low" aria-hidden="true" />
          <Star className="s-launch-star" />
          <h2>Lançamento previsto para</h2>
          <LaunchYear />
          <p>O Rudge ainda está em construção. A abertura para o público está prevista para 2027.</p>
        </section>
      </main>

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
