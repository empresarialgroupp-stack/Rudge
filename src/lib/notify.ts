// Notificações do sistema (via service worker quando disponível) + som discreto.

export type PermissionState = NotificationPermission | 'unsupported';

export function notifSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function permission(): PermissionState {
  return notifSupported() ? Notification.permission : 'unsupported';
}

export async function requestPermission(): Promise<PermissionState> {
  if (!notifSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export interface SystemNotif {
  title: string;
  body: string;
  tag: string;
  data?: unknown;
  actions?: { action: string; title: string }[];
  requireInteraction?: boolean;
  timestamp?: number;
}

const asset = (p: string) => new URL(p, document.baseURI).href;

async function getRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined;
  try {
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<undefined>((r) => setTimeout(() => r(undefined), 1500)),
    ]);
    return reg ?? (await navigator.serviceWorker.getRegistration());
  } catch {
    return undefined;
  }
}

export async function showSystem(n: SystemNotif): Promise<boolean> {
  if (permission() !== 'granted') return false;
  const options = {
    body: n.body,
    tag: n.tag,
    data: n.data,
    icon: asset('icons/icon-192.png'),
    badge: asset('icons/badge-96.png'),
    actions: n.actions ?? [],
    renotify: true,
    requireInteraction: n.requireInteraction ?? false,
    timestamp: n.timestamp ?? Date.now(),
    vibrate: [120, 60, 120],
  } as NotificationOptions;
  const reg = await getRegistration();
  try {
    if (reg) {
      await reg.showNotification(n.title, options);
      return true;
    }
    const plain = new Notification(n.title, { body: n.body, tag: n.tag, icon: asset('icons/icon-192.png') });
    plain.onclick = () => window.focus();
    return true;
  } catch {
    return false;
  }
}

let ctx: AudioContext | null = null;

/** Toque curto e elegante (duas notas senoidais). */
export function playChime() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = ctx ?? new AC();
    const t0 = ctx.currentTime + 0.01;
    [880, 1318.5].forEach((freq, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      const start = t0 + i * 0.14;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
      o.connect(g).connect(ctx!.destination);
      o.start(start);
      o.stop(start + 0.65);
    });
  } catch {
    /* sem áudio */
  }
}
