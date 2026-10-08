// Gera os ícones do PWA a partir do SVG da marca (requer Playwright/Chromium).
// Uso: NODE_PATH=$(npm root -g) node scripts/gen-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons');
mkdirSync(out, { recursive: true });

/** @param {{rounded:boolean, pad:number}} o pad = escala do "R" (1 = padrão) */
function mark({ rounded, scale = 1 }) {
  const rx = rounded ? 116 : 0;
  // R monolinha centralizado em 512x512 (desenhado em 64 → ×8)
  const s = 8 * scale;
  const off = 256 - 32 * s;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2b2b2e"/><stop offset="1" stop-color="#000"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.22" cy="-0.05" r="0.95">
      <stop offset="0" stop-color="#fff" stop-opacity="0.34"/><stop offset="0.55" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.10"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="r" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c4c4c8"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${rx}" fill="url(#bg)"/>
  <rect width="512" height="512" rx="${rx}" fill="url(#glow)"/>
  <path d="M0 ${rounded ? 116 : 0}a${rx} ${rx} 0 0 1 ${rx} -${rx}h${512 - 2 * rx}a${rx} ${rx} 0 0 1 ${rx} ${rx}v120c-120 40-392 40-512 0z" fill="url(#sheen)"/>
  ${rounded ? `<rect x="5" y="5" width="502" height="502" rx="${rx - 5}" fill="none" stroke="#fff" stroke-opacity="0.2" stroke-width="10"/>` : ''}
  <g transform="translate(${off} ${off}) scale(${s})">
    <path d="M22 47V17h11.5a8.6 8.6 0 0 1 0 17.2H22M33.5 34.2 43 47" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 1.2)"/>
    <path d="M22 47V17h11.5a8.6 8.6 0 0 1 0 17.2H22M33.5 34.2 43 47" fill="none" stroke="url(#r)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}

const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512">
  <path d="M22 47V17h11.5a8.6 8.6 0 0 1 0 17.2H22M33.5 34.2 43 47" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

writeFileSync(resolve(out, 'favicon.svg'), mark({ rounded: true, scale: 0.9 }));

const jobs = [
  { file: 'icon-192.png', svg: mark({ rounded: true, scale: 0.9 }), size: 192 },
  { file: 'icon-512.png', svg: mark({ rounded: true, scale: 0.9 }), size: 512 },
  { file: 'maskable-512.png', svg: mark({ rounded: false, scale: 0.78 }), size: 512 },
  { file: 'apple-touch-icon.png', svg: mark({ rounded: false, scale: 0.92 }), size: 180 },
  { file: 'favicon-32.png', svg: mark({ rounded: true }), size: 32 },
  { file: 'badge-96.png', svg: badge, size: 96 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const j of jobs) {
  await page.setViewportSize({ width: j.size, height: j.size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${j.svg.replace('width="512" height="512"', `width="${j.size}" height="${j.size}"`)}</body></html>`,
  );
  await page.screenshot({ path: resolve(out, j.file), omitBackground: true, clip: { x: 0, y: 0, width: j.size, height: j.size } });
  console.log('ok', j.file);
}
await browser.close();
