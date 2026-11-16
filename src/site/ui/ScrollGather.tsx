import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react';

/**
 * Letras e ícones que começam espalhados e se juntam conforme a página rola.
 * Baseado no Skiper 31 "ScrollAnimation_002" da Skiper UI (skiper-ui.com).
 * Adaptado ao Rudge: sem Lenis, seção presa na tela (sticky) e espalhamento
 * proporcional à largura, para caber no celular.
 */

const END = 0.72; // fração da rolagem em que tudo já está junto

function Char({ char, dist, spread, progress }: { char: string; dist: number; spread: number; progress: MotionValue<number> }) {
  const x = useTransform(progress, [0, END], [dist * spread, 0], { clamp: true });
  const rotateX = useTransform(progress, [0, END], [dist * 50, 0], { clamp: true });
  const opacity = useTransform(progress, [0, END * 0.6], [0.25, 1], { clamp: true });
  return (
    <motion.span className={char === ' ' ? 'sg-char sg-space' : 'sg-char'} style={{ x, rotateX, opacity }}>
      {char}
    </motion.span>
  );
}

function Tile({ dist, spread, progress, children }: { dist: number; spread: number; progress: MotionValue<number>; children: ReactNode }) {
  const x = useTransform(progress, [0, END], [dist * spread * 1.8, 0], { clamp: true });
  const y = useTransform(progress, [0, END], [-Math.abs(dist) * 22, 0], { clamp: true });
  const rotate = useTransform(progress, [0, END], [dist * 40, 0], { clamp: true });
  const scale = useTransform(progress, [0, END], [0.75, 1], { clamp: true });
  return (
    <motion.span className="sg-tile" style={{ x, y, rotate, scale }}>
      {children}
    </motion.span>
  );
}

export function ScrollGather({ text, icons, caption }: { text: string; icons: ReactNode[]; caption: string }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.75', 'end end'] });
  const still = useTransform(scrollYProgress, () => 1);
  const progress = reduce ? still : scrollYProgress;
  const captionOpacity = useTransform(progress, [END * 0.8, END], [0, 1], { clamp: true });

  // espalhamento por letra, proporcional à largura da tela
  const [spread, setSpread] = useState(() => Math.min(50, Math.max(16, window.innerWidth * 0.045)));
  useEffect(() => {
    const on = () => setSpread(Math.min(50, Math.max(16, window.innerWidth * 0.045)));
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  const chars = text.split('');
  const center = Math.floor(chars.length / 2);
  const iconCenter = Math.floor(icons.length / 2);

  return (
    <section className="sg" ref={ref}>
      <div className="sg-pin">
        <div className="sg-icons" aria-hidden="true">
          {icons.map((icon, i) => (
            <Tile key={i} dist={i - iconCenter} spread={spread} progress={progress}>
              {icon}
            </Tile>
          ))}
        </div>
        <h2 className="sg-text" aria-label={text} data-index="Tudo junto">
          {chars.map((c, i) => (
            <Char key={i} char={c} dist={i - center} spread={spread} progress={progress} />
          ))}
        </h2>
        <motion.p className="sg-caption" style={{ opacity: captionOpacity }}>
          {caption}
        </motion.p>
      </div>
    </section>
  );
}
