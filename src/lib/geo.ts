// Lembretes por lugar. Um app web não pode acompanhar a localização com o app fechado
// (o iPhone não permite), então o Rudge confere a posição enquanto está aberto e
// sempre que você volta para ele, e avisa ao chegar/sair de um lugar salvo.
import type { Place, Reminder } from './types';
import { getState, subscribe } from './store';
import { completeReminder } from './actions';

const KEY = 'rudge:geo';

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

/** "me lembra de comprar pão quando sair do trabalho" → lugar + chegar/sair */
export function parsePlacePhrase(text: string, places: Place[]): { title: string; on: 'arrive' | 'leave'; placeId?: string; placeName: string } | null {
  const m = text.match(/\b(?:quando|assim que|ao)\s+(?:eu\s+)?(sair|chegar|sa[ií]r|deixar)\s+(?:d[oae]s?|n[oa]s?|em|ao|à|a|pra|para\s+[oa]?)?\s*([\p{L}\d ]{2,40}?)\s*[.!?]*$/iu);
  if (!m) return null;
  const on: 'arrive' | 'leave' = /cheg/i.test(m[1]) ? 'arrive' : 'leave';
  const placeName = m[2].trim();
  const target = norm(placeName);
  const place =
    places.find((p) => norm(p.name) === target) ??
    places.find((p) => norm(p.name).includes(target) || target.includes(norm(p.name)));
  const title = text
    .slice(0, m.index)
    .replace(/^\s*(me\s+)?(lembr[ae]r?|avis[ae]r?)(-me)?\s+(de\s+|que\s+|pra\s+|para\s+)?/i, '')
    .replace(/[,\s]+$/, '')
    .trim();
  return { title: title ? title[0].toUpperCase() + title.slice(1) : '', on, placeId: place?.id, placeName: place?.name ?? placeName };
}

export function describePlace(r: Reminder, places: Place[]) {
  if (!r.place) return '';
  const p = places.find((x) => x.id === r.place!.placeId);
  return `${r.place.on === 'arrive' ? 'Ao chegar em' : 'Ao sair de'} ${p?.name ?? 'lugar removido'}`;
}

export function geoSupported() {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

export function currentPosition(): Promise<{ lat: number; lng: number; acc: number }> {
  return new Promise((res, rej) =>
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      rej,
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    ),
  );
}

type Inside = Record<string, boolean>;
const readInside = (): Inside => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
};
const writeInside = (v: Inside) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* sem armazenamento */
  }
};

/** Compara a posição com os lugares e dispara os lembretes de entrada/saída. Exportado para testes. */
export function evaluatePosition(
  pos: { lat: number; lng: number; acc?: number },
  fire: (r: Reminder, place: Place) => void,
  prev: Inside = readInside(),
): Inside {
  const s = getState();
  const next: Inside = { ...prev };
  for (const p of s.places) {
    const d = distanceM(pos, p);
    // histerese: entra dentro do raio, só "sai" com folga, ignorando leituras imprecisas
    const slack = Math.max(50, Math.min(300, pos.acc ?? 50));
    const inside = prev[p.id] ? d <= p.radius + slack : d <= p.radius;
    const was = prev[p.id];
    next[p.id] = inside;
    if (was === undefined || was === inside) continue;
    for (const r of s.reminders) {
      if (r.done || r.place?.placeId !== p.id) continue;
      if ((r.place.on === 'arrive' && inside) || (r.place.on === 'leave' && !inside)) fire(r, p);
    }
  }
  return next;
}

let started = false;
let watchId: number | null = null;

export function startGeo(present: (r: Reminder, place: Place) => void) {
  if (started || !geoSupported()) return;
  started = true;
  const active = () => getState().reminders.some((r) => !r.done && r.place);
  const onPos = (p: GeolocationPosition) => {
    const next = evaluatePosition({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }, (r, place) => {
      present(r, place);
      completeReminder(r.id);
    });
    writeInside(next);
  };
  const run = async () => {
    const on = document.visibilityState === 'visible' && active();
    if (!on) {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
      return;
    }
    // só pede/usa a localização se a permissão já foi dada (pedida ao salvar um lugar)
    const perm = await navigator.permissions?.query({ name: 'geolocation' as PermissionName }).catch(() => null);
    if (perm && perm.state !== 'granted') return;
    if (watchId === null) watchId = navigator.geolocation.watchPosition(onPos, () => {}, { enableHighAccuracy: false, maximumAge: 60_000, timeout: 30_000 });
  };
  document.addEventListener('visibilitychange', () => void run());
  let last = '';
  subscribe(() => {
    const sig = String(active());
    if (sig !== last) {
      last = sig;
      void run();
    }
  });
  void run();
}
