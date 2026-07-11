import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

const BASE64URL_SEGMENT = /^[A-Za-z0-9_-]+$/;

function base64UrlToBuffer(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function constantTimeHashCompare(providedSecret: string, storedHash: string): boolean {
  const providedHash = hashSecret(providedSecret);
  const providedBuffer = Buffer.from(providedHash, "hex");
  const storedBuffer = Buffer.from(storedHash, "hex");

  if (providedBuffer.length !== storedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, storedBuffer);
}

export function signHmacSha256(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("hex");
}

export function constantTimeCompareHex(lhs: string, rhs: string): boolean {
  const left = lhs.trim().toLowerCase();
  const right = rhs.trim().toLowerCase();

  if (!/^[a-f0-9]+$/.test(left) || !/^[a-f0-9]+$/.test(right)) {
    return false;
  }

  const leftBuf = Buffer.from(left, "hex");
  const rightBuf = Buffer.from(right, "hex");

  if (leftBuf.length !== rightBuf.length) {
    return false;
  }

  return timingSafeEqual(leftBuf, rightBuf);
}

export function decodeJwt(token: string): {
  valid: boolean;
  header?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  signature?: string;
} {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false };
  }

  if (!BASE64URL_SEGMENT.test(parts[0]) || !BASE64URL_SEGMENT.test(parts[1])) {
    return { valid: false };
  }

  try {
    const header = JSON.parse(base64UrlToBuffer(parts[0]).toString("utf-8")) as Record<string, unknown>;
    const payload = JSON.parse(base64UrlToBuffer(parts[1]).toString("utf-8")) as Record<string, unknown>;
    return { valid: true, header, payload, signature: parts[2] };
  } catch {
    return { valid: false };
  }
}

export function verifyHs256Jwt(token: string, sharedSecret: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }

  const signingInput = `${parts[0]}.${parts[1]}`;
  const expected = createHmac("sha256", sharedSecret).update(signingInput).digest("base64url");
  const expectedBuf = Buffer.from(expected, "utf8");
  const signatureBuf = Buffer.from(parts[2], "utf8");

  if (expectedBuf.length !== signatureBuf.length) {
    return false;
  }

  return timingSafeEqual(expectedBuf, signatureBuf);
}

export function newCorrelationId(existing?: string | null): string {
  const candidate = (existing || "").trim();
  if (candidate.length >= 8 && candidate.length <= 128) {
    return candidate;
  }
  return randomUUID();
}

function getSecretEncryptionKey(): Buffer {
  const raw = process.env.HTTP_TRIGGER_SECRET_KEY || process.env.APP_SECRET || "scout-http-trigger-default-key";
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(secret: string): string {
  if (!secret) {
    return "";
  }

  if (secret.startsWith("enc:")) {
    return secret;
  }

  const key = getSecretEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `enc:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(value: string): string {
  if (!value) {
    return "";
  }

  if (!value.startsWith("enc:")) {
    return value;
  }

  const parts = value.split(":");
  if (parts.length !== 4) {
    return "";
  }

  try {
    const [, ivHex, tagHex, encryptedHex] = parts;
    const key = getSecretEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return "";
  }
}
