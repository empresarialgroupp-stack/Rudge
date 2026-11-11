// Capa das metas: foto escolhida na galeria, reduzida no próprio aparelho para caber na conta.
const CW = 640;
const CH = 360;
/** limite de tamanho de cada capa (texto data URL) */
export const COVER_MAX = 90_000;

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não deu para abrir essa imagem.'));
    };
    img.src = url;
  });
}

/** Recorta no centro (16:9), reduz para 640×360 e devolve JPEG leve em data URL. */
export async function fileToCover(file: Blob): Promise<string> {
  const img = await loadImage(file);
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  if (!sw || !sh) throw new Error('Imagem vazia.');
  const ratio = CW / CH;
  const cw = sw / sh > ratio ? sh * ratio : sw;
  const ch = sw / sh > ratio ? sh : sw / ratio;
  const c = document.createElement('canvas');
  c.width = CW;
  c.height = CH;
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, CW, CH);
  for (const q of [0.72, 0.6, 0.48, 0.36]) {
    const out = c.toDataURL('image/jpeg', q);
    if (out.length <= COVER_MAX) return out;
  }
  throw new Error('Imagem pesada demais. Tente outra foto.');
}

/** Só aceita capas que o próprio app gerou (JPEG/PNG/WebP em data URL, até o limite). */
export function isCover(v: unknown): v is string {
  return typeof v === 'string' && v.length <= COVER_MAX * 1.2 && /^data:image\/(jpeg|png|webp);base64,/.test(v);
}
