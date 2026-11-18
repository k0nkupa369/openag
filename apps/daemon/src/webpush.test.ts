import { createDecipheriv, createECDH, createHmac, createPublicKey, verify } from "node:crypto";
import { describe, expect, test } from "vitest";
import { buildPushRequest, encryptPayload, generateVapidKeys, MAX_PLAINTEXT, pushTopic, vapidAuthorization } from "./webpush.js";

// RFC 8291 §5 and Appendix A, copied from https://www.rfc-editor.org/rfc/rfc8291.txt (whitespace removed).
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};
const b64 = (s: string) => Buffer.from(s, "base64url");
const hmac = (k: Buffer, d: Buffer) => createHmac("sha256", k).update(d).digest();

/** An independent receiver (RFC 8291 §3.4 "for a user agent"), so the test does not reuse the sender's code. */
function decrypt(message: Buffer, uaPrivate: Buffer, authSecret: Buffer): string {
  const salt = message.subarray(0, 16), idlen = message[20]!, asPublic = message.subarray(21, 21 + idlen), record = message.subarray(21 + idlen);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(uaPrivate);
  const uaPublic = ecdh.getPublicKey();
  const ikm = hmac(hmac(authSecret, ecdh.computeSecret(asPublic)), Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const decipher = createDecipheriv("aes-128-gcm", hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16), hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12));
  decipher.setAuthTag(record.subarray(record.length - 16));
  const padded = Buffer.concat([decipher.update(record.subarray(0, record.length - 16)), decipher.final()]);
  if (padded[padded.length - 1] !== 2) throw new Error("bad padding delimiter");
  return padded.subarray(0, -1).toString();
}

describe("RFC 8291 encryption", () => {
  test("matches the RFC's example byte for byte", () => {
    const out = encryptPayload(Buffer.from(RFC.plaintext), { p256dh: RFC.uaPublic, auth: RFC.authSecret }, { asPrivate: b64(RFC.asPrivate), salt: b64(RFC.salt) });
    expect(out.toString("base64url")).toBe(RFC.body);
  });

  test("a fresh message decrypts with the subscriber's private key", () => {
    const ua = createECDH("prime256v1");
    ua.generateKeys();
    const auth = Buffer.alloc(16, 7);
    const out = encryptPayload(Buffer.from("hello phone"), { p256dh: ua.getPublicKey().toString("base64url"), auth: auth.toString("base64url") });
    expect(decrypt(out, ua.getPrivateKey(), auth)).toBe("hello phone");
  });

  test("refuses oversized payloads and malformed subscription keys", () => {
    const keys = { p256dh: RFC.uaPublic, auth: RFC.authSecret };
    expect(() => encryptPayload(Buffer.alloc(MAX_PLAINTEXT + 1), keys)).toThrow(/too large/);
    expect(() => encryptPayload(Buffer.from("x"), { ...keys, p256dh: "AAAA" })).toThrow(/subscription key/);
    expect(() => encryptPayload(Buffer.from("x"), { ...keys, auth: "AAAA" })).toThrow(/auth secret/);
  });
});

describe("RFC 8292 VAPID", () => {
  test("signs an ES256 JWT for the push service's origin that verifies with the public key", () => {
    const vapid = generateVapidKeys(), now = Date.UTC(2026, 10, 12);
    const header = vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", vapid, "mailto:owner@example.com", now);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)!;
    expect(m[4]).toBe(vapid.publicKey);
    const claims = JSON.parse(Buffer.from(m[2]!, "base64url").toString());
    expect(claims).toEqual({ aud: "https://fcm.googleapis.com", exp: now / 1000 + 12 * 3600, sub: "mailto:owner@example.com" });
    const pub = b64(vapid.publicKey);
    const key = createPublicKey({ format: "jwk", key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") } });
    expect(verify("sha256", Buffer.from(`${m[1]}.${m[2]}`), { key, dsaEncoding: "ieee-p1363" }, b64(m[3]!))).toBe(true);
  });

  test("a push request carries the encrypted body, VAPID, TTL, urgency and a short topic", () => {
    const ua = createECDH("prime256v1");
    ua.generateKeys();
    const auth = Buffer.alloc(16, 3);
    const req = buildPushRequest("https://fcm.googleapis.com/fcm/send/abc", { p256dh: ua.getPublicKey().toString("base64url"), auth: auth.toString("base64url") }, { title: "OpenAg", body: "Approval needed", url: "/#/approvals/x" }, generateVapidKeys(), "mailto:o@example.com", { urgency: "high", dedupeKey: "approval:x" });
    const h = req.init.headers as Record<string, string>;
    expect(h).toMatchObject({ "Content-Encoding": "aes128gcm", TTL: "3600", Urgency: "high" });
    expect(h.Topic).toBe(pushTopic("approval:x"));
    expect(h.Topic!.length).toBeLessThanOrEqual(32);
    expect(req.init.redirect).toBe("error");
    expect(JSON.parse(decrypt(Buffer.from(req.init.body as Uint8Array), ua.getPrivateKey(), auth))).toEqual({ title: "OpenAg", body: "Approval needed", url: "/#/approvals/x" });
  });
});
