import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export const PASSWORD_REQUIREMENT_MESSAGE = "Minimum 8 characters, alphanumeric, including 1 special character.";

const LETTER_PATTERN = /[A-Za-z]/;
const DIGIT_PATTERN = /[0-9]/;
const SPECIAL_CHARACTER_PATTERN = /[^A-Za-z0-9]/;

export function isPasswordComplexityValid(password: string) {
  return (
    password.length >= 8 &&
    LETTER_PATTERN.test(password) &&
    DIGIT_PATTERN.test(password) &&
    SPECIAL_CHARACTER_PATTERN.test(password)
  );
}

const TEMP_PASSWORD_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
const TEMP_PASSWORD_DIGITS = "23456789";
const TEMP_PASSWORD_SPECIALS = "!@#$%^&*";
const TEMP_PASSWORD_ALL = TEMP_PASSWORD_LETTERS + TEMP_PASSWORD_DIGITS + TEMP_PASSWORD_SPECIALS;

function randomChar(charset: string) {
  return charset[randomBytes(1)[0] % charset.length];
}

/** Generates a random password guaranteed to satisfy isPasswordComplexityValid. */
export function generateTemporaryPassword(length = 12) {
  const chars = [
    randomChar(TEMP_PASSWORD_LETTERS),
    randomChar(TEMP_PASSWORD_DIGITS),
    randomChar(TEMP_PASSWORD_SPECIALS)
  ];

  for (let i = chars.length; i < length; i += 1) {
    chars.push(randomChar(TEMP_PASSWORD_ALL));
  }

  // Fisher-Yates shuffle so the guaranteed characters aren't always in the same positions.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

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
