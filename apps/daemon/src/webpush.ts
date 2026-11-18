import { createCipheriv, createECDH, createHash, createHmac, createPrivateKey, randomBytes, sign } from "node:crypto";

/**
 * Web Push message encryption (RFC 8291, "aes128gcm" from RFC 8188) and VAPID authentication (RFC 8292), with
 * node:crypto only. A push service only ever sees ciphertext; the subscriber's browser holds the private key.
 */

const RECORD_SIZE = 4096;
/** RFC 8291 §4: a single record of at most 4096 octets leaves 3993 octets of plaintext. */
export const MAX_PLAINTEXT = 3993;
const VAPID_LIFETIME_S = 12 * 3600;

export interface PushKeys {
  /** The subscriber's ECDH public key, uncompressed P-256, base64url (65 octets). */
  p256dh: string;
  /** The subscriber's authentication secret, base64url (16 octets). */
  auth: string;
}
export interface VapidKeys {
  /** Uncompressed P-256 public key, base64url (the browser's `applicationServerKey`). */
  publicKey: string;
  /** Raw 32-octet private scalar, base64url. Never leaves the daemon. */
  privateKey: string;
}

const b64 = (s: string) => Buffer.from(s, "base64url");
const hmac = (key: Buffer, data: Buffer) => createHmac("sha256", key).update(data).digest();

export function generateVapidKeys(): VapidKeys {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: ecdh.getPublicKey().toString("base64url"), privateKey: ecdh.getPrivateKey().toString("base64url") };
}

/** RFC 8291 §3.4 for an application server. `opts` fixes the ephemeral key and salt, for the RFC test vector only. */
export function encryptPayload(plaintext: Buffer, keys: PushKeys, opts: { asPrivate?: Buffer; salt?: Buffer } = {}): Buffer {
  if (plaintext.length > MAX_PLAINTEXT) throw new Error("push payload too large");
  const uaPublic = b64(keys.p256dh), authSecret = b64(keys.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) throw new Error("bad subscription key");
  if (authSecret.length !== 16) throw new Error("bad subscription auth secret");
  const ecdh = createECDH("prime256v1");
  if (opts.asPrivate) ecdh.setPrivateKey(opts.asPrivate); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(uaPublic);
  const prkKey = hmac(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])]));
  const salt = opts.salt ?? randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  // One record: the plaintext, then the padding delimiter 0x02 (RFC 8291 §4).
  const body = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(16 + 4 + 1);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}

/** RFC 8292: an ES256 JWT for the push service's origin, and the `Authorization: vapid` header that carries it. */
export function vapidAuthorization(endpoint: string, vapid: VapidKeys, subject: string, nowMs = Date.now()): string {
  const pub = b64(vapid.publicKey);
  const key = createPrivateKey({ format: "jwk", key: { kty: "EC", crv: "P-256", d: vapid.privateKey, x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33, 65).toString("base64url") } });
  const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(nowMs / 1000) + VAPID_LIFETIME_S, sub: subject })}`;
  const signature = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `vapid t=${unsigned}.${signature}, k=${vapid.publicKey}`;
}

export interface WebPushMessage { title: string; body: string; url: string }
export interface SendOptions { urgency: "low" | "normal" | "high"; dedupeKey?: string; ttlSeconds?: number }

/** A push service `Topic` (RFC 8030 §5.4): at most 32 base64url characters; a later message with it replaces the earlier. */
export const pushTopic = (dedupeKey: string) => createHash("sha256").update(dedupeKey).digest("base64url").slice(0, 32);

/** Builds the request for one subscription. The caller sends it through its guarded fetch. */
export function buildPushRequest(endpoint: string, keys: PushKeys, message: WebPushMessage, vapid: VapidKeys, subject: string, opts: SendOptions, nowMs = Date.now()): { url: string; init: RequestInit } {
  const body = encryptPayload(Buffer.from(JSON.stringify(message)), keys);
  const headers: Record<string, string> = {
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: String(opts.ttlSeconds ?? 3600),
    Urgency: opts.urgency,
    Authorization: vapidAuthorization(endpoint, vapid, subject, nowMs),
  };
  if (opts.dedupeKey) headers.Topic = pushTopic(opts.dedupeKey);
  return { url: endpoint, init: { method: "POST", headers, body: new Uint8Array(body), redirect: "error", signal: AbortSignal.timeout(10_000) } };
}
