// Gera as capturas usadas no manifest (janela de instalação do Chrome) com dados de demonstração.
// Uso: npm run build && npx vite preview --port 4173 & ; NODE_PATH=$(npm root -g) node scripts/gen-screenshots.mjs
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons');
const URL = process.env.URL ?? 'http://localhost:4173/';

const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const iso = (n, h, m = 0) => { const d = day(n); d.setHours(h, m, 0, 0); return d.toISOString(); };
const now = new Date().toISOString();
const ALL = [0, 1, 2, 3, 4, 5, 6];
const past = (n, skip = []) => Array.from({ length: n }, (_, i) => key(day(-i - 1))).filter((_, i) => !skip.includes(i));

const demo = {
  version: 1,
  tasks: [
    { id: 't1', title: 'Enviar proposta para o cliente', done: false, createdAt: now, due: key(day(0)), time: '15:00', priority: 3, remind: 10 },
    { id: 't2', title: 'Revisar orçamento do mês', done: false, createdAt: now, due: key(day(0)), priority: 2, area: 'financas' },
    { id: 't3', title: 'Agendar consulta no dentista', done: false, createdAt: now, due: key(day(0)), priority: 1, area: 'saude' },
    { id: 't4', title: 'Planejar treinos da semana', done: true, doneAt: now, createdAt: now, due: key(day(0)), priority: 2 },
    { id: 't5', title: 'Ligar para o contador', done: false, createdAt: now, due: key(day(1)), time: '10:00', priority: 2, remind: 10 },
  ],
  goals: [
    { id: 'g1', title: 'Ler 12 livros em um ano', area: 'estudos', kind: 'numeric', startValue: 0, target: 12, current: 4, unit: 'livros', start: key(day(-120)), deadline: key(day(245)), milestones: [], log: [{ date: now, value: 4 }], checkin: { freq: 'weekly', time: '19:00', weekday: 0 }, status: 'active', createdAt: now },
    { id: 'g2', title: 'Montar reserva de emergência', area: 'financas', kind: 'numeric', startValue: 0, target: 10000, current: 3800, unit: 'R$', start: key(day(-100)), deadline: key(day(265)), milestones: [], log: [{ date: now, value: 3800 }], checkin: { freq: 'weekly', time: '19:00', weekday: 0 }, status: 'active', createdAt: now },
    { id: 'g3', title: 'Treinar 3x por semana por 12 semanas', area: 'saude', kind: 'numeric', startValue: 0, target: 36, current: 14, unit: 'treinos', start: key(day(-35)), deadline: key(day(49)), milestones: [], log: [{ date: now, value: 14 }], checkin: { freq: 'weekly', time: '19:00', weekday: 0 }, status: 'active', createdAt: now },
  ],
  habits: [
    { id: 'h1', title: 'Ler 20 páginas', days: ALL, remind: true, time: '21:00', log: past(12, [5]), createdAt: iso(-60, 9) },
    { id: 'h2', title: 'Beber 2L de água', days: ALL, remind: true, time: '15:00', log: [key(day(0)), ...past(9)], createdAt: iso(-60, 9) },
    { id: 'h3', title: 'Meditar 10 min', days: ALL, remind: true, time: '07:30', log: [key(day(0)), ...past(4)], createdAt: iso(-60, 9) },
  ],
  reminders: [
    { id: 'r1', title: 'Tomar vitamina', at: iso(-10, 8), repeat: 'daily', done: false, createdAt: now },
    { id: 'r2', title: 'Pagar fatura do cartão', at: iso(2, 9), repeat: 'none', done: false, createdAt: now },
  ],
  snoozes: [],
  inbox: [],
  dismissedSuggestions: { notif: key(day(0)), install: key(day(0)) },
  settings: { theme: 'dark', name: 'André', notifications: true, sound: true, briefing: { enabled: true, time: '08:00' }, review: { enabled: true, time: '21:00' }, weekly: { enabled: true, weekday: 0, time: '18:00' }, defaultTaskRemind: 10, onboarded: true },
};

const browser = await chromium.launch({ channel: 'chromium' });
for (const v of [
  { file: 'screenshot-wide.png', width: 1440, height: 900, mobile: false },
  { file: 'screenshot-mobile.png', width: 390, height: 844, mobile: true },
]) {
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 1, isMobile: v.mobile, hasTouch: v.mobile, locale: 'pt-BR' });
  await ctx.addInitScript((data) => {
    localStorage.setItem('rudge:data:v1', JSON.stringify(data));
    localStorage.setItem('rudge:session', JSON.stringify({ email: 'andre@rudge.app', at: Date.now() }));
  }, demo);
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(out, v.file) });
  console.log('ok', v.file);
  await ctx.close();
}
await browser.close();
