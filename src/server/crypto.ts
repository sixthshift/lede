// AES-256-GCM (reversible, for the BYOK provider key) + scrypt (one-way, for
// the password) — spec.md §8/§17/§19. node:crypto only.
import { randomBytes, createCipheriv, createDecipheriv, scryptSync, timingSafeEqual } from "node:crypto";

export type EncryptedPayload = {
  iv: string; // base64
  tag: string; // base64
  ciphertext: string; // base64
};

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const SCRYPT_KEYLEN = 64;
const SALT_LENGTH = 16;

export function encrypt(plaintext: string, masterKey: Buffer): EncryptedPayload {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, masterKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decrypt(payload: EncryptedPayload, masterKey: Buffer): string {
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");
  const decipher = createDecipheriv(ALGO, masterKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export type PasswordHash = {
  hash: string; // base64
  salt: string; // base64
};

export function hashPassword(password: string): PasswordHash {
  const salt = randomBytes(SALT_LENGTH);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN);
  return { hash: hash.toString("base64"), salt: salt.toString("base64") };
}

export function verifyPassword(password: string, stored: PasswordHash): boolean {
  const salt = Buffer.from(stored.salt, "base64");
  const expected = Buffer.from(stored.hash, "base64");
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
