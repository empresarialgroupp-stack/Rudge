// Cartão da semana: imagem com as conquistas dos últimos 7 dias, feita no próprio aparelho.
import { useEffect, useMemo, useState } from 'react';
import { Download, ImageIcon, Share2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { toast } from '../lib/ui';
import { parseKey, MONTHS, WEEKDAYS_MIN } from '../lib/date';
import { weekStats, type WeekStats } from '../lib/week';

const W = 1080;
const H = 1350;

function range(st: WeekStats) {
  const a = parseKey(st.from);
  const b = parseKey(st.to);
  const m = (d: Date) => MONTHS[d.getMonth()].slice(0, 3);
  return a.getMonth() === b.getMonth() ? `${a.getDate()} a ${b.getDate()} de ${m(b)}` : `${a.getDate()} de ${m(a)} a ${b.getDate()} de ${m(b)}`;
}

const cut = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);

/** Desenha o cartão num canvas 1080×1350 (formato de post). */
export function drawWeekCard(st: WeekStats, theme: 'dark' | 'light'): HTMLCanvasElement {
  const dark = theme === 'dark';
  const fg = dark ? '#fff' : '#0b0b0c';
  const soft = (a: number) => (dark ? `rgba(255,255,255,${a})` : `rgba(11,11,12,${a})`);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(W * 0.15, 0, 40, W * 0.15, 0, H * 1.1);
  grad.addColorStop(0, dark ? '#2c2c2f' : '#ffffff');
  grad.addColorStop(1, dark ? '#000' : '#e9e9ec');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const font = (w: number, px: number) => `${w} ${px}px "Geist Variable", Geist, system-ui, sans-serif`;
  const box = (x: number, y: number, w: number, h: number, r = 36) => {
    g.fillStyle = soft(dark ? 0.07 : 0.05);
    g.beginPath();
    g.roundRect(x, y, w, h, r);
    g.fill();
  };

  // cabeçalho
  g.fillStyle = fg;
  g.font = font(650, 40);
  g.fillText('Rudge', 80, 118);
  g.fillStyle = soft(0.55);
  g.font = font(500, 34);
  g.textAlign = 'right';
  g.fillText(range(st), W - 80, 118);
  g.textAlign = 'left';
  g.fillStyle = fg;
  g.font = font(650, 96);
  g.fillText('Minha semana', 74, 240);

  // 4 números
  const tiles: [string, string][] = [
    [`${st.tasksDone + st.remindersDone}`, 'coisas resolvidas'],
    [st.habitRate === null ? `${st.habitCheckins}` : `${Math.round(st.habitRate * 100)}%`, st.habitRate === null ? 'check-ins de hábitos' : `dos hábitos · ${st.habitCheckins} check-ins`],
    [st.focusMinutes >= 60 ? `${(st.focusMinutes / 60).toFixed(1).replace('.', ',')} h` : `${st.focusMinutes} min`, 'de foco'],
    [`${st.activeDays}/7`, 'dias com conquistas'],
  ];
  const tw = (W - 160 - 24) / 2;
  tiles.forEach(([big, small], i) => {
    const x = 80 + (i % 2) * (tw + 24);
    const y = 280 + Math.floor(i / 2) * 190;
    box(x, y, tw, 170);
    g.fillStyle = fg;
    g.font = font(650, 76);
    g.fillText(big, x + 40, y + 92);
    g.fillStyle = soft(0.6);
    g.font = font(500, 30);
    g.fillText(cut(small, 26), x + 40, y + 138);
  });

  // barras por dia
  const by = 668;
  box(80, by, W - 160, 236);
  const max = Math.max(1, ...st.perDay);
  const bw = 72;
  const gap = (W - 160 - 80 - bw * 7) / 6;
  st.perDay.forEach((n, i) => {
    const x = 120 + i * (bw + gap);
    const h = Math.max(10, (n / max) * 140);
    g.fillStyle = n === max && n > 0 ? fg : soft(0.22);
    g.beginPath();
    g.roundRect(x, by + 170 - h, bw, h, 14);
    g.fill();
    g.fillStyle = soft(0.5);
    g.font = font(550, 26);
    g.textAlign = 'center';
    const d = parseKey(st.from);
    d.setDate(d.getDate() + i);
    g.fillText(WEEKDAYS_MIN[d.getDay()], x + bw / 2, by + 212);
    g.textAlign = 'left';
  });

  // sequência e meta
  let y = 932;
  const line = (big: string, small: string, progress?: number) => {
    box(80, y, W - 160, 124, 32);
    g.fillStyle = fg;
    g.font = font(650, 44);
    g.fillText(big, 120, y + 56);
    g.fillStyle = soft(0.6);
    g.font = font(500, 28);
    g.fillText(cut(small, 52), 120, y + 98);
    if (progress !== undefined) {
      g.fillStyle = soft(0.15);
      g.beginPath();
      g.roundRect(W - 120 - 220, y + 34, 220, 16, 8);
      g.fill();
      g.fillStyle = fg;
      g.beginPath();
      g.roundRect(W - 120 - 220, y + 34, Math.max(16, 220 * progress), 16, 8);
      g.fill();
    }
    y += 140;
  };
  if (st.bestStreak && st.bestStreak.days > 1) line(`${st.bestStreak.days} dias seguidos`, st.bestStreak.title);
  const goal = st.goals[0];
  if (goal) line(`+${Math.max(1, Math.round((goal.to - goal.from) * 100))} pts`, `${goal.title} · ${Math.round(goal.to * 100)}%`, goal.to);
  if (y === 932) line('Semana registrada', 'Bora para a próxima.');

  g.fillStyle = soft(0.4);
  g.font = font(500, 28);
  g.fillText('rudge.vercel.app', 80, H - 60);
  return c;
}

async function toFile(c: HTMLCanvasElement, name: string) {
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  return blob ? new File([blob], name, { type: 'image/png' }) : null;
}

function download(file: File) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  toast({ title: 'Imagem salva', icon: 'check' });
}

export function WeekCard() {
  const s = useStore();
  const theme = s.settings.theme;
  const st = useMemo(() => weekStats(s), [s]);
  const [url, setUrl] = useState('');
  const name = `rudge-semana-${st.to}.png`;

  useEffect(() => {
    let alive = true;
    // espera a fonte do app para o desenho sair igual ao app
    void (document.fonts?.ready ?? Promise.resolve()).then(() => {
      if (alive) setUrl(drawWeekCard(st, theme).toDataURL('image/png'));
    });
    return () => {
      alive = false;
    };
  }, [st, theme]);

  const share = async () => {
    const file = await toFile(drawWeekCard(st, theme), name);
    if (!file) return;
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Minha semana no Rudge' });
        return;
      } catch {
        return; // cancelado
      }
    }
    download(file);
  };
  const save = async () => {
    const file = await toFile(drawWeekCard(st, theme), name);
    if (file) download(file);
  };

  return (
    <section className="card glass week-card">
      <div className="card-head">
        <h2 className="card-title">
          <ImageIcon /> Cartão da semana
        </h2>
      </div>
      <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
        Suas conquistas dos últimos 7 dias numa imagem, pronta para guardar ou compartilhar.
      </p>
      <div className="week-card-preview">{url ? <img src={url} alt={`Cartão da semana: ${st.tasksDone + st.remindersDone} coisas resolvidas`} /> : <i />}</div>
      <div className="row wrap" style={{ marginTop: 12 }}>
        <button className="btn btn-primary btn-pill" onClick={() => void share()}>
          <Share2 /> Compartilhar
        </button>
        <button className="btn btn-glass btn-pill" onClick={() => void save()}>
          <Download /> Salvar imagem
        </button>
      </div>
    </section>
  );
}
