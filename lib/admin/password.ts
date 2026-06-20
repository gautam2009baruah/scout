import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  }).toString("hex");

  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${key}`;
}

export function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, nValue, rValue, pValue, salt, storedKey] = passwordHash.split("$");

  if (algorithm !== "scrypt" || !salt || !storedKey) {
    return false;
  }

  const storedBuffer = Buffer.from(storedKey, "hex");
  const key = scryptSync(password, salt, storedBuffer.length, {
    N: Number(nValue) || SCRYPT_N,
    r: Number(rValue) || SCRYPT_R,
    p: Number(pValue) || SCRYPT_P
  });

  return storedBuffer.length === key.length && timingSafeEqual(storedBuffer, key);
}
