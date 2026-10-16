// Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) usando apenas WebCrypto.
// Funciona no Deno (Supabase Edge Functions) e no Node 20+.

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface VapidKeys {
  publicKey: string; // base64url, ponto não comprimido (65 bytes)
  privateKey: string; // base64url, escalar d (32 bytes)
  subject: string; // mailto: ou https:
}

const enc = new TextEncoder();

export function b64uToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64u(b: Uint8Array): string {
  let bin = '';
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

/** Criptografa o payload para a assinatura (Content-Encoding: aes128gcm). */
export async function encryptPayload(payload: Uint8Array, p256dh: string, auth: string): Promise<Uint8Array> {
  const uaPublic = b64uToBytes(p256dh);
  const authSecret = b64uToBytes(auth);
  const asKeys = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as EcdhKeyDeriveParams, asKeys.privateKey, 256),
  );

  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const plaintext = concat(payload, new Uint8Array([2])); // delimitador do último registro
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext));

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ciphertext);
}

/** Cabeçalho Authorization VAPID (JWT ES256). */
export async function vapidAuthorization(endpoint: string, vapid: VapidKeys, ttlSeconds = 12 * 3600): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = bytesToB64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = bytesToB64u(
    enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + ttlSeconds, sub: vapid.subject })),
  );
  const pub = b64uToBytes(vapid.publicKey);
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: bytesToB64u(pub.slice(1, 33)), y: bytesToB64u(pub.slice(33, 65)), d: vapid.privateKey, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)),
  );
  return `vapid t=${header}.${claims}.${bytesToB64u(sig)}, k=${vapid.publicKey}`;
}

export interface SendResult {
  ok: boolean;
  status: number;
  /** assinatura expirada/inválida: deve ser removida */
  gone: boolean;
  error?: string;
}

export async function sendWebPush(
  sub: PushSubscriptionRecord,
  data: unknown,
  vapid: VapidKeys,
  opts: { ttl?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high' } = {},
): Promise<SendResult> {
  try {
    const body = await encryptPayload(enc.encode(JSON.stringify(data)), sub.p256dh, sub.auth);
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(Math.max(0, Math.round(opts.ttl ?? 3600))),
        Urgency: opts.urgency ?? 'high',
        Authorization: await vapidAuthorization(sub.endpoint, vapid),
      },
      body,
    });
    const text = res.ok ? '' : await res.text().catch(() => '');
    return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410, error: text.slice(0, 300) };
  } catch (e) {
    return { ok: false, status: 0, gone: false, error: String(e).slice(0, 300) };
  }
}
