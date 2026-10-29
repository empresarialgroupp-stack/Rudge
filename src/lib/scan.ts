// Captura por foto: lê o texto da imagem no próprio aparelho (Tesseract, sem enviar a
// foto) e transforma em tarefa. Boletos: a linha digitável traz valor e vencimento.
import { addDaysKey, dateKey } from './date';

export interface Boleto {
  /** linha digitável (só dígitos) */
  line: string;
  kind: 'bancario' | 'arrecadacao';
  value?: number;
  due?: string;
  /** dígitos verificadores conferem */
  valid: boolean;
}

export interface ScanResult {
  boleto?: Boleto;
  amount?: number;
  due?: string;
  payee?: string;
  title: string;
  /** linhas que parecem itens (para papel/quadro) */
  lines: string[];
}

/* ---------------- dígitos verificadores ---------------- */

function mod10(num: string) {
  let sum = 0;
  let w = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    let v = Number(num[i]) * w;
    if (v > 9) v = Math.floor(v / 10) + (v % 10);
    sum += v;
    w = w === 2 ? 1 : 2;
  }
  return (10 - (sum % 10)) % 10;
}

function mod11Bank(num: string) {
  let sum = 0;
  let w = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    sum += Number(num[i]) * w;
    w = w === 9 ? 2 : w + 1;
  }
  const dv = 11 - (sum % 11);
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}

function mod11Arrec(num: string) {
  let sum = 0;
  let w = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    sum += Number(num[i]) * w;
    w = w === 9 ? 2 : w + 1;
  }
  const r = sum % 11;
  return r === 0 || r === 1 ? 0 : 11 - r;
}

/* ---------------- vencimento pelo fator ---------------- */

const DAY = 86_400_000;

/** Fator de vencimento (4 dígitos). O ciclo reiniciou em 22/02/2025 (fator 1000). */
export function dueFromFactor(factor: number, today = new Date()): string | undefined {
  if (!factor) return undefined;
  const c1 = new Date(Date.UTC(1997, 9, 7) + factor * DAY);
  const c2 = new Date(Date.UTC(2025, 1, 22) + (factor - 1000) * DAY);
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const best = Math.abs(c1.getTime() - t) <= Math.abs(c2.getTime() - t) ? c1 : c2;
  return best.toISOString().slice(0, 10);
}

/* ---------------- linha digitável / código de barras ---------------- */

export function parseBoletoDigits(digits: string, today = new Date()): Boleto | undefined {
  if (digits.length === 47) {
    const f1 = digits.slice(0, 9);
    const f2 = digits.slice(10, 20);
    const f3 = digits.slice(21, 31);
    const barcode = digits.slice(0, 4) + digits[32] + digits.slice(33, 47) + f1.slice(4) + f2 + f3;
    const fieldsOk = mod10(f1) === Number(digits[9]) && mod10(f2) === Number(digits[20]) && mod10(f3) === Number(digits[31]);
    const dvOk = mod11Bank(barcode.slice(0, 4) + barcode.slice(5)) === Number(barcode[4]);
    const factor = Number(digits.slice(33, 37));
    const cents = Number(digits.slice(37, 47));
    return { line: digits, kind: 'bancario', value: cents ? cents / 100 : undefined, due: dueFromFactor(factor, today), valid: fieldsOk && dvOk };
  }
  if (digits.length === 48 && digits[0] === '8') {
    const blocks = [0, 1, 2, 3].map((i) => digits.slice(i * 12, i * 12 + 12));
    const ref = digits[2];
    const dvf = ref === '6' || ref === '7' ? mod10 : mod11Arrec;
    const blocksOk = blocks.every((b) => dvf(b.slice(0, 11)) === Number(b[11]));
    const barcode = blocks.map((b) => b.slice(0, 11)).join('');
    return { ...parseArrecadacao(barcode, today), line: digits, valid: blocksOk };
  }
  if (digits.length === 44) {
    if (digits[0] === '8') return { ...parseArrecadacao(digits, today), line: digits, valid: true };
    const dvOk = mod11Bank(digits.slice(0, 4) + digits.slice(5)) === Number(digits[4]);
    const cents = Number(digits.slice(9, 19));
    return { line: digits, kind: 'bancario', value: cents ? cents / 100 : undefined, due: dueFromFactor(Number(digits.slice(5, 9)), today), valid: dvOk };
  }
  return undefined;
}

function parseArrecadacao(b: string, today: Date): Omit<Boleto, 'line' | 'valid'> {
  const real = b[2] === '6' || b[2] === '8';
  const cents = Number(b.slice(4, 15));
  // muitas contas trazem a data AAAAMMDD no começo do campo livre
  let due: string | undefined;
  const ymd = b.slice(19, 27);
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(4, 6));
  const d = Number(ymd.slice(6, 8));
  if (Math.abs(y - today.getFullYear()) <= 1 && m >= 1 && m <= 12 && d >= 1 && d <= 31) due = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
  return { kind: 'arrecadacao', value: real && cents ? cents / 100 : undefined, due };
}

/** Corrige confusões comuns do OCR em linhas que são quase só números. */
function fixDigits(line: string) {
  const digits = (line.match(/\d/g) ?? []).length;
  if (digits < 30 || digits < line.replace(/\s/g, '').length * 0.7) return line;
  return line.replace(/[Oo]/g, '0').replace(/[Il|!]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2').replace(/\//g, '7');
}

/**
 * Procura uma linha digitável no texto lido (tolera espaços e pontos, e uma linha
 * quebrada em duas). Nunca junta números de partes diferentes da foto: isso criaria
 * códigos "válidos" por acaso.
 */
export function findBoleto(text: string, today = new Date()): Boleto | undefined {
  const lines = text.split(/\n/).map(fixDigits);
  const candidates: string[] = [];
  lines.forEach((l, i) => {
    const d = l.replace(/[^\d]/g, '');
    if (d.length >= 44) candidates.push(d);
    // linha digitável quebrada em duas linhas seguidas
    const next = (lines[i + 1] ?? '').replace(/[^\d]/g, '');
    if (d.length >= 20 && next.length >= 20 && d.length + next.length >= 44 && d.length + next.length <= 50) candidates.push(d + next);
  });
  let fallback: Boleto | undefined;
  for (const c of candidates) {
    for (const len of [47, 48, 44]) {
      // aceita só um pouco de ruído nas pontas (ex.: um dígito solto antes/depois)
      if (c.length < len || c.length > len + 2) continue;
      for (let i = 0; i + len <= c.length; i++) {
        const b = parseBoletoDigits(c.slice(i, i + len), today);
        if (b?.valid) return b;
        if (b && !fallback && c.length === len) fallback = b;
      }
    }
  }
  return fallback;
}

/* ---------------- texto livre ---------------- */

const BRANDS = ['Claro', 'Vivo', 'TIM', 'Oi', 'NET', 'Enel', 'Sabesp', 'Copel', 'Cemig', 'Light', 'CPFL', 'Celesc', 'Coelba', 'Equatorial', 'Energisa', 'Comgás', 'Naturgy', 'Unimed', 'Amil', 'SulAmérica', 'Nubank', 'Itaú', 'Bradesco', 'Santander', 'Caixa', 'Banco do Brasil', 'Inter', 'C6', 'Porto Seguro', 'Sky', 'Netflix', 'Detran', 'IPVA', 'IPTU', 'Condomínio', 'Aluguel', 'Internet'];

const parseMoney = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));

function findAmount(text: string): number | undefined {
  const lines = text.split(/\n/);
  const money = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})(?!\d)/g;
  // perto de "valor", "total", "pagar"
  for (const l of lines) if (/valor|total|pagar|cobrado/i.test(l)) for (const m of l.matchAll(money)) return parseMoney(m[1]);
  const withRs = [...text.matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/g)].map((m) => parseMoney(m[1]));
  if (withRs.length) return Math.max(...withRs);
  return undefined;
}

function findDate(text: string, today: Date): string | undefined {
  const re = /(\d{2})[/.-](\d{2})[/.-](\d{4}|\d{2})/g;
  const lines = text.split(/\n/);
  const toKey = (m: RegExpMatchArray) => {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const mo = Number(m[2]);
    const d = Number(m[1]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || Math.abs(y - today.getFullYear()) > 2) return undefined;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };
  for (const l of lines) if (/venc/i.test(l)) for (const m of l.matchAll(re)) { const k = toKey(m); if (k) return k; }
  // senão: a primeira data a partir de hoje
  const keys = [...text.matchAll(re)].map(toKey).filter(Boolean) as string[];
  const t = dateKey(today);
  return keys.filter((k) => k >= addDaysKey(t, -3)).sort()[0] ?? keys[0];
}

function findPayee(text: string): string | undefined {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    if (/benefici[aá]rio|cedente|favorecido|empresa/i.test(lines[i])) {
      const after = lines[i].split(/[:\-–]/).slice(1).join(' ').trim() || lines[i + 1] || '';
      const clean = after.replace(/CNPJ.*$/i, '').replace(/[\d./-]{8,}/g, '').replace(/\s+/g, ' ').trim();
      if (/[a-zà-ú]{3}/i.test(clean)) return titleCase(clean.slice(0, 40));
    }
  }
  const low = text.toLowerCase();
  return BRANDS.find((b) => new RegExp(`\\b${b.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(low));
}

function titleCase(s: string) {
  return s
    .toLowerCase()
    .split(' ')
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
    .replace(/\b(ltda|s\.?a\.?|me|eireli)\b\.?/gi, '')
    .trim();
}

export const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Interpreta o texto lido de uma foto. */
export function interpretScan(text: string, today = new Date()): ScanResult {
  const boleto = findBoleto(text, today);
  const textAmount = findAmount(text);
  const textDue = findDate(text, today);
  const amount = boleto?.valid ? (boleto.value ?? textAmount) : (textAmount ?? boleto?.value);
  const due = boleto?.valid ? (boleto.due ?? textDue) : (textDue ?? boleto?.due);
  const payee = findPayee(text);
  const looksBill = !!boleto || /\b(boleto|vencimento|pagador|benefici[aá]rio|fatura|cedente)\b|\bconta (de|da|do)\b|\btotal a pagar\b/i.test(text);
  const title = looksBill ? `Pagar ${payee ?? (boleto ? 'boleto' : 'conta')}${amount ? ` ${fmtBRL(amount)}` : ''}` : '';
  const lines = text
    .split(/\n/)
    .map((l) => l.replace(/^[\s•·*\-–—>»□☐☑✓✔\d.)]+/, '').replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 3 && l.length <= 90 && (l.match(/[a-zà-ú]/gi)?.length ?? 0) >= 3 && !/^\d[\d .]+$/.test(l));
  return { boleto, amount, due, payee, title, lines: [...new Set(lines)].slice(0, 20) };
}

/* ---------------- leitura da imagem ---------------- */

/** Reduz a foto para acelerar a leitura (máx. 2000 px). */
async function prepare(file: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    if (scale === 1) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.9));
  } catch {
    return file;
  }
}

/** Código de barras do boleto pela câmera (Android/Chrome); no iPhone usa só o texto. */
async function readBarcode(file: Blob): Promise<string | undefined> {
  const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: ImageBitmapSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
  if (!BD) return undefined;
  try {
    const det = new BD({ formats: ['itf'] });
    const found = await det.detect(await createImageBitmap(file));
    return found.map((f) => f.rawValue.replace(/\D/g, '')).find((v) => v.length === 44);
  } catch {
    return undefined;
  }
}

export async function scanImage(file: Blob, onProgress?: (p: number, label: string) => void): Promise<{ text: string; result: ScanResult }> {
  onProgress?.(0.02, 'Preparando a foto');
  const [img, barcode] = await Promise.all([prepare(file), readBarcode(file)]);
  onProgress?.(0.06, 'Carregando o leitor (só na primeira vez)');
  const { createWorker } = await import('tesseract.js');
  // no build, os arquivos do leitor ficam em /ocr (ver vite.config.ts)
  const base = new URL('ocr/', document.baseURI).href;
  const local = import.meta.env.PROD ? { workerPath: `${base}worker.min.js`, corePath: base, langPath: `${base}lang` } : {};
  const worker = await createWorker('por', 1, {
    ...local,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(0.3 + m.progress * 0.68, 'Lendo o texto');
      else if (/loading|initializ/i.test(m.status)) onProgress?.(0.06 + m.progress * 0.22, 'Carregando o leitor (só na primeira vez)');
    },
  });
  try {
    const { data } = await worker.recognize(img);
    const text = (barcode ? `${barcode}\n` : '') + data.text;
    onProgress?.(1, 'Pronto');
    return { text, result: interpretScan(text) };
  } finally {
    void worker.terminate();
  }
}
