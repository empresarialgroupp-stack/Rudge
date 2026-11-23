/* Ondas de distorção (Distortion waves, de Jakub Antalik, MIT).
   Código original em src/vendor/distortion-waves, portado do kit
   Libraries.dev (o mesmo efeito do DistortionWavesKit do SwiftUI, em WebGL 2).

   Onde aparece no Rudge:
   - Carteira → "Guarde 10%": onda vertical verde sobe do botão Guardar.
   - Meta → Concluir: anel colorido nasce do progresso e cobre a folha;
     Reabrir recolhe a onda de volta para o anel.
   - Modo foco → Começar: onda vertical leva a preparação para o relógio;
     ao encerrar, ela volta para o botão.

   Sem WebGL 2, ou com "reduzir movimento" ligado no aparelho, vira um
   esmaecer simples (a biblioteca cuida disso). */

import { useEffect, useRef } from 'react';
import { WaveController, type PlayOptions, type WaveOptions, type WaveStyleInput } from '../vendor/distortion-waves';
import { useStore } from '../lib/store';

export { DistortionWave } from '../vendor/distortion-waves';
export type { DistortionWaveHandle } from '../vendor/distortion-waves';

/** Canvas até 2× no iPhone (tela 3×): a onda é desfocada por natureza, a
    diferença não aparece e a GPU agradece. */
export const WAVE_RESOLUTION = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

/** No modo white a cor some no fundo claro: a onda fica mais forte. */
const LIGHT: WaveStyleInput = { strength: 0.95, rimStrength: 0.95 };
export function useWaveStyle(): WaveStyleInput | undefined {
  return useStore().settings.theme === 'light' ? LIGHT : undefined;
}

interface Carrier {
  prepare(): Promise<void>;
  play(o?: PlayOptions): void;
  reverse(): void;
}

/**
 * Leva a tela ao novo estado com a onda. Chame logo depois de mudar o estado:
 * espera o React desenhar, tira a foto do estado novo (até 260 ms; se
 * demorar, a lente entra suave quando a foto chegar) e solta a onda. Assim
 * o que passa sob a lente é sempre o que fica na tela.
 */
export function carry(wave: Carrier | null | undefined, how: 'play' | 'reverse', o?: PlayOptions) {
  if (!wave) return;
  requestAnimationFrame(() => {
    const go = () => (how === 'play' ? wave.play(o) : wave.reverse());
    let done = false;
    const once = () => {
      if (done) return;
      done = true;
      go();
    };
    wave.prepare().then(once, once);
    setTimeout(once, 260);
  });
}

/**
 * Liga uma onda a um elemento que já existe (uma folha, um cartão), sem
 * mudar a marcação dele: o próprio elemento é a vista que a onda atravessa.
 * `find` recebe o elemento de referência e devolve a superfície (ex.: a
 * folha que contém o anel de progresso).
 */
export function useSurfaceWave(anchor: React.RefObject<Element | null>, find: (el: Element) => HTMLElement | null, options: WaveOptions) {
  const wave = useRef<WaveController | null>(null);
  const opts = useRef(options);
  opts.current = options;

  useEffect(() => {
    const el = anchor.current;
    const surface = el ? find(el) : null;
    if (!surface) return;
    const c = new WaveController(surface, surface);
    c.update({ resolution: WAVE_RESOLUTION, ...opts.current });
    wave.current = c;
    return () => {
      c.destroy();
      wave.current = null;
    };
    // a superfície é montada uma vez por folha
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    wave.current?.update({ resolution: WAVE_RESOLUTION, ...options });
  });

  return {
    prepare: () => wave.current?.prepare() ?? Promise.resolve(),
    play: (o?: PlayOptions) => wave.current?.play(o),
    reverse: () => wave.current?.reverse(),
    reset: () => wave.current?.reset(),
  };
}
