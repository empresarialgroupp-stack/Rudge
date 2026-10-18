// Voz: reconhecimento de fala (Web Speech API), interpretação (IA no servidor ou
// interpretador local) e resposta falada.
import type { Priority, Repeat } from './types';
import { parseInput } from './nlp';
import { getSession } from './auth';
import { PUSH_API } from './push';
import { WEEKDAYS, dateKey, timeOf } from './date';

export interface VoiceItem {
  kind: 'reminder' | 'task';
  title: string;
  date: string; // YYYY-MM-DD ou ''
  time: string; // HH:MM ou ''
  repeat: Repeat;
  days: number[];
  priority: Priority;
}

type SR = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function ctor(): (new () => SR) | undefined {
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function voiceSupported() {
  return typeof window !== 'undefined' && !!ctor();
}

/** Ouve até a pessoa parar de falar. onText recebe o texto parcial. */
export function listen(onText: (t: string) => void): { done: Promise<string>; stop: () => void } {
  const C = ctor();
  if (!C) return { done: Promise.reject(new Error('Reconhecimento de voz indisponível neste navegador.')), stop: () => {} };
  const rec = new C();
  rec.lang = 'pt-BR';
  rec.interimResults = true;
  rec.continuous = false;
  let text = '';
  const done = new Promise<string>((resolve, reject) => {
    rec.onresult = (e) => {
      text = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(' ')
        .trim();
      onText(text);
    };
    rec.onerror = (e) =>
      reject(new Error(e.error === 'not-allowed' ? 'Permita o uso do microfone para falar com o Rudge.' : e.error === 'no-speech' ? 'Não ouvi nada. Tente de novo.' : `Erro no microfone (${e.error}).`));
    rec.onend = () => resolve(text);
  });
  rec.start();
  return { done, stop: () => rec.stop() };
}

export function speak(text: string) {
  try {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR';
    const v = speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith('pt'));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch {
    /* sem voz */
  }
}

/** Interpretação local: separa pedidos ("... e também ...", "; ") e usa o parser do Rudge. */
export function interpretLocal(text: string): VoiceItem[] {
  const parts = text
    .split(/\s*(?:;|\.\s|,?\s+e também\s+|,?\s+e depois\s+|,?\s+e me lembr[ae]\s+de\s+)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts
    .map((p) => {
      const r = parseInput(p);
      const isReminder = /lembr|avis/i.test(p) || !!r.time;
      return {
        kind: isReminder ? 'reminder' : 'task',
        title: r.title || p,
        date: r.date ?? '',
        time: r.time ?? (isReminder && r.date ? '09:00' : ''),
        repeat: r.repeat,
        days: r.days ?? [],
        priority: (r.priority ?? 0) as Priority,
      } as VoiceItem;
    })
    .filter((i) => i.title);
}

export async function interpret(text: string): Promise<{ items: VoiceItem[]; reply?: string; source: 'ai' | 'local' }> {
  const token = getSession()?.token;
  if (token && navigator.onLine) {
    try {
      const d = new Date();
      const now = `${WEEKDAYS[d.getDay()]}, ${dateKey(d)} ${timeOf(d)}`;
      const res = await fetch(`${PUSH_API}/ai`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-rudge-token': token },
        body: JSON.stringify({ text, now }),
      });
      if (res.ok) {
        const j = (await res.json()) as { items?: VoiceItem[]; reply?: string };
        if (Array.isArray(j.items) && j.items.length) return { items: j.items, reply: j.reply, source: 'ai' };
      }
    } catch {
      /* cai no local */
    }
  }
  return { items: interpretLocal(text), source: 'local' };
}
