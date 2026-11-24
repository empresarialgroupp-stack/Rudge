import { type FormEvent, useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { NeonLiquidButton } from './NeonLiquidButton';

// Lista de espera no fim da landing: um cartão preto e dourado (superfície em
// WebGL 2) guardado numa carteira. Ao entrar na fila, o cartão sai da carteira
// e mostra o número do membro. O e-mail vai para rudge.waitlist no Supabase,
// pela função pública rudge_join_waitlist (só insere; ninguém lê a lista daqui).

// Mesmo projeto e chave publicável do app (src/lib/supabase.ts). A landing não
// usa o cliente do app para não ler nem mexer na sessão da conta.
const SUPABASE_URL = 'https://btpbarqvsglqzpcpezvz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_dIg91iW6N6hpiZrE_ROmXA_trqjM6tV';
const STORE_KEY = 'rudge:site:waitlist';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Joined = { n: number; email: string };
type Status = 'idle' | 'sending' | 'done' | 'error' | 'invalid';

function readJoined(): Joined | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Joined;
    return typeof v?.n === 'number' && typeof v?.email === 'string' ? v : null;
  } catch {
    return null;
  }
}

function saveJoined(v: Joined) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(v));
  } catch {
    /* sem armazenamento: o estado vale só nesta visita */
  }
}

async function joinWaitlist(email: string): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rudge_join_waitlist`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_email: email }),
  });
  if (!res.ok) throw new Error(`waitlist ${res.status}`);
  const n = (await res.json()) as unknown;
  if (typeof n !== 'number') throw new Error('waitlist resposta');
  return n;
}

const pad = (n: number) => String(n).padStart(4, '0');

/* ------------------------------------------------------------------ */
/* Superfície do cartão em WebGL 2                                     */
/* ------------------------------------------------------------------ */

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Preto escovado, linhas de nível douradas que escorrem devagar e um brilho
// que segue o dedo/mouse. uPulse faz uma onda dourada sair do centro.
const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uPtr;
uniform float uPulse;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}

void main() {
  float asp = uRes.x / uRes.y;
  vec2 p = vec2(vUv.x * asp, vUv.y);
  float t = uTime * 0.05;

  vec2 q = vec2(fbm(p * 1.2 + t), fbm(p * 1.2 - t + 4.1));
  float f = fbm(p * 1.05 + q * 1.7 + vec2(t * 0.6, -t * 0.35));

  // linhas de nível finas, com largura constante na tela
  float g = f * 7.0;
  float d = abs(fract(g - 0.5) - 0.5) / max(fwidth(g), 1e-4);
  float line = 1.0 - smoothstep(0.0, 1.15, d);

  // as linhas ficam no meio à direita e somem perto dos textos do cartão
  float mask = smoothstep(0.3, 0.85, vUv.x) * smoothstep(0.88, 0.62, vUv.y) * smoothstep(0.05, 0.38, vUv.y);

  // brilho em faixa diagonal: segue o ponteiro e respira sozinho
  vec2 dir = normalize(vec2(1.0, -0.62));
  vec2 c = vec2(uPtr.x * asp, uPtr.y) + vec2(sin(uTime * 0.21) * 0.18, cos(uTime * 0.17) * 0.08);
  float s = dot(p - c, dir);
  float sheen = exp(-s * s * 7.0);

  // onda do "entrei na fila"
  float r = length(p - vec2(asp * 0.5, 0.5));
  float ring = exp(-pow((r - uPulse * 1.6) * 7.0, 2.0)) * (1.0 - uPulse) * step(0.001, uPulse);

  vec3 base = vec3(0.028, 0.026, 0.024);
  base += (noise(vec2(p.x * 3.0, p.y * 520.0)) - 0.5) * 0.022; // escovado
  base += vec3(0.05, 0.04, 0.025) * smoothstep(1.2, 0.0, length(p - vec2(asp * 0.2, 1.0))); // luz no topo

  vec3 gold = vec3(0.78, 0.6, 0.31);
  vec3 goldHi = vec3(1.0, 0.86, 0.56);

  vec3 col = base;
  col += gold * line * mask * (0.16 + 0.9 * sheen + ring * 2.5);
  col += gold * line * (1.0 - mask) * 0.035 * (1.0 + sheen * 3.0); // eco bem fraco no resto
  col += goldHi * sheen * 0.07;
  col += goldHi * ring * 0.35;

  // vinheta suave
  vec2 v = vUv - 0.5;
  col *= 1.0 - dot(v, v) * 0.55;

  outColor = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function useCardSurface(canvasRef: React.RefObject<HTMLCanvasElement | null>, pulseKey: number) {
  const [failed, setFailed] = useState(false);
  const pulseStart = useRef(-1);
  const ptr = useRef({ x: 0.35, y: 0.6, tx: 0.35, ty: 0.6 });

  useEffect(() => {
    if (pulseKey > 0) pulseStart.current = performance.now();
  }, [pulseKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, premultipliedAlpha: false });
    if (!gl) {
      setFailed(true);
      return;
    }
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) {
      setFailed(true);
      return;
    }
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      setFailed(true);
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uPtr = gl.getUniformLocation(prog, 'uPtr');
    const uPulse = gl.getUniformLocation(prog, 'uPulse');

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let visible = false;
    const born = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(2, Math.round(rect.width * dpr));
      const h = Math.max(2, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    };

    const draw = (now: number) => {
      const P = ptr.current;
      P.x += (P.tx - P.x) * 0.06;
      P.y += (P.ty - P.y) * 0.06;
      const time = reduce ? 6 : (now - born) / 1000;
      let pulse = 0;
      if (pulseStart.current > 0) {
        pulse = Math.min(1, (now - pulseStart.current) / 1600);
        if (pulse >= 1) pulseStart.current = -1;
      }
      gl.uniform1f(uTime, time);
      gl.uniform2f(uPtr, P.x, P.y);
      gl.uniform1f(uPulse, pulse);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const loop = (now: number) => {
      draw(now);
      raf = visible ? requestAnimationFrame(loop) : 0;
    };

    const start = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };

    resize();
    draw(performance.now());

    const ro = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    ro.observe(canvas);

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !reduce) start();
    });
    io.observe(canvas);

    // com movimento reduzido só redesenha quando algo muda (ponteiro, onda)
    const kick = () => {
      if (reduce) {
        cancelAnimationFrame(raf);
        raf = 0;
        let frames = 40;
        const step = (now: number) => {
          draw(now);
          raf = --frames > 0 ? requestAnimationFrame(step) : 0;
        };
        raf = requestAnimationFrame(step);
      }
    };
    canvas.addEventListener('rudge-kick', kick);

    const onLost = (e: Event) => {
      e.preventDefault();
      setFailed(true);
    };
    canvas.addEventListener('webglcontextlost', onLost);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener('rudge-kick', kick);
      canvas.removeEventListener('webglcontextlost', onLost);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [canvasRef]);

  useEffect(() => {
    if (pulseKey > 0) canvasRef.current?.dispatchEvent(new Event('rudge-kick'));
  }, [pulseKey, canvasRef]);

  return { failed, ptr };
}

/* ------------------------------------------------------------------ */
/* Cartão + carteira                                                   */
/* ------------------------------------------------------------------ */

function Card({ joined, pulseKey }: { joined: Joined | null; pulseKey: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const { failed, ptr } = useCardSurface(canvasRef, pulseKey);

  const onMove = (e: React.PointerEvent) => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    ptr.current.tx = x;
    ptr.current.ty = 1 - y;
    if (e.pointerType === 'mouse') {
      el.style.setProperty('--rx', `${(0.5 - y) * 10}deg`);
      el.style.setProperty('--ry', `${(x - 0.5) * 14}deg`);
    }
    canvasRef.current?.dispatchEvent(new Event('rudge-kick'));
  };
  const onLeave = () => {
    const el = cardRef.current;
    ptr.current.tx = 0.35;
    ptr.current.ty = 0.6;
    el?.style.setProperty('--rx', '0deg');
    el?.style.setProperty('--ry', '0deg');
  };

  return (
    <div
      ref={cardRef}
      className="s-wl-card"
      data-failed={failed ? '' : undefined}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      role="img"
      aria-label={
        joined
          ? `Cartão de acesso antecipado do Rudge, membro número ${pad(joined.n)}`
          : 'Cartão de acesso antecipado do Rudge'
      }
    >
      <canvas ref={canvasRef} className="s-wl-canvas" aria-hidden="true" />
      <div className="s-wl-card-face" aria-hidden="true">
        <div className="s-wl-card-top">
          <span className="s-wl-wordmark">Rudge</span>
          <span className="s-wl-tier">Acesso antecipado</span>
        </div>
        <span className="s-wl-chip" />
        <div className="s-wl-card-bottom">
          <div>
            <span className="s-wl-label">Membro nº</span>
            <span className="s-wl-number">{joined ? pad(joined.n) : '····'}</span>
          </div>
          <div className="s-wl-valid">
            <span className="s-wl-label">Válido a partir de</span>
            <span className="s-wl-year">2027</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WaitlistWallet() {
  const stage = useRef<HTMLDivElement>(null);
  const inView = useInView(stage, { once: true, margin: '0px 0px -15% 0px' });
  const reduce = useReducedMotion();
  const [joined, setJoined] = useState<Joined | null>(() => readJoined());
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>(() => (readJoined() ? 'done' : 'idle'));
  const [pulseKey, setPulseKey] = useState(0);

  const out = joined ? 'out' : inView ? 'peek' : 'in';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value) || value.length > 254) {
      setStatus('invalid');
      return;
    }
    setStatus('sending');
    try {
      const n = await joinWaitlist(value);
      const v = { n, email: value };
      saveJoined(v);
      setJoined(v);
      setStatus('done');
      setPulseKey((k) => k + 1);
    } catch {
      setStatus('error');
    }
  };

  const again = () => {
    setStatus('idle');
    setEmail(joined?.email ?? '');
    setJoined(null);
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {
      /* ok */
    }
  };

  return (
    <div className="s-wl">
      <div className="s-wl-glow" aria-hidden="true" />

      <div className="s-wl-copy">
        <p className="s-wl-kicker">
          <span className="s-wl-dot" />
          Lista de espera
        </p>
        <h2 data-index="Lista de espera">Entre na fila. Receba o acesso quando lançar.</h2>
        <p className="s-wl-lead">
          Deixe o seu e-mail e o seu cartão de acesso antecipado fica guardado. Quando o Rudge abrir, em 2027, você
          recebe o convite antes de todo mundo.
        </p>
      </div>

      <div className="s-wl-stage" ref={stage} data-state={out}>
        <motion.div
          className="s-wl-card-slot"
          initial={false}
          animate={out}
          variants={{
            in: { y: '58%', rotate: 0 },
            peek: { y: '30%', rotate: -2 },
            out: { y: '-4%', rotate: -4 },
          }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 70, damping: 16, mass: 1.1 }}
        >
          <Card joined={joined} pulseKey={pulseKey} />
        </motion.div>
        <div className="s-wl-pocket" aria-hidden="true">
          <span className="s-wl-stitch" />
          <span className="s-wl-emboss">R</span>
        </div>
      </div>

      <div className="s-wl-form-wrap">
        {status === 'done' && joined ? (
          <div className="s-wl-done" role="status">
            <p className="s-wl-done-title">
              Você está na fila. Membro nº <strong>{pad(joined.n)}</strong>.
            </p>
            <p className="s-wl-done-sub">
              Avisamos em <strong>{joined.email}</strong> quando o Rudge abrir.
            </p>
            <button type="button" className="s-wl-link" onClick={again}>
              Usar outro e-mail
            </button>
          </div>
        ) : (
          <form className="s-wl-form" onSubmit={submit} noValidate>
            <label className="s-wl-field">
              <span className="s-wl-field-label">Seu e-mail</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="voce@email.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === 'invalid' || status === 'error') setStatus('idle');
                }}
                aria-invalid={status === 'invalid' || undefined}
                aria-describedby="s-wl-msg"
                maxLength={254}
                required
              />
            </label>
            <NeonLiquidButton type="submit" disabled={status === 'sending'} wrapperClassName="s-wl-btn">
              {status === 'sending' ? 'Guardando…' : 'Entrar na fila'}
            </NeonLiquidButton>
            <p id="s-wl-msg" className="s-wl-msg" aria-live="polite" data-tone={status}>
              {status === 'invalid' && 'Confira o e-mail: parece que falta alguma coisa.'}
              {status === 'error' && 'Não deu para entrar na fila agora. Tente de novo em instantes.'}
              {(status === 'idle' || status === 'sending') && 'Só usamos o e-mail para avisar do lançamento.'}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
