import { createHash, randomBytes } from "node:crypto";

const TOKEN_PREFIX = "scidv1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSecret() {
  return (process.env.CHATBOT_EMBED_ID_SECRET || process.env.CHATBOT_API_KEY || "scout-chatbot-embed-local-secret").trim();
}

function base64UrlEncode(value: Buffer) {
  return value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64");
}

function buildKeystream(secret: string, nonce: string, length: number) {
  const chunks: Buffer[] = [];
  let counter = 0;

  while (Buffer.concat(chunks).length < length) {
    const block = createHash("sha256").update(`${secret}:${nonce}:${counter}`).digest();
    chunks.push(block);
    counter += 1;
  }

  return Buffer.concat(chunks).subarray(0, length);
}

function xorBytes(input: Buffer, key: Buffer) {
  const out = Buffer.allocUnsafe(input.length);
  for (let index = 0; index < input.length; index += 1) {
    out[index] = input[index] ^ key[index];
  }
  return out;
}

export function isUuid(value: string) {
  return UUID_PATTERN.test(value.trim());
}

export function obfuscateGuid(input: { id: string; type: "company" | "target_app" }) {
  const id = input.id.trim();
  if (!isUuid(id)) {
    throw new Error("Only UUID values can be obfuscated.");
  }

  const nonce = randomBytes(8).toString("hex");
  const secret = getSecret();
  const payload = Buffer.from(JSON.stringify({ type: input.type, id }), "utf8");
  const keystream = buildKeystream(secret, nonce, payload.length);
  const cipher = xorBytes(payload, keystream);
  return `${TOKEN_PREFIX}.${nonce}.${base64UrlEncode(cipher)}`;
}

export function resolveGuidIdentifier(input: string, expectedType?: "company" | "target_app") {
  const value = input.trim();
  if (!value) {
    return "";
  }

  if (isUuid(value)) {
    return value;
  }

  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) {
    throw new Error("Invalid scoped identifier format.");
  }

  const nonce = parts[1];
  const cipher = base64UrlDecode(parts[2]);
  const secret = getSecret();
  const keystream = buildKeystream(secret, nonce, cipher.length);
  const plain = xorBytes(cipher, keystream).toString("utf8");

  let parsed: { type?: string; id?: string };
  try {
    parsed = JSON.parse(plain);
  } catch {
    throw new Error("Invalid scoped identifier payload.");
  }

  if (!parsed?.id || !isUuid(parsed.id)) {
    throw new Error("Scoped identifier does not contain a valid UUID.");
  }

  if (expectedType && parsed.type !== expectedType) {
    throw new Error("Scoped identifier type mismatch.");
  }

  return parsed.id;
}
