import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { encrypt, decrypt, hashPassword, verifyPassword } from "../src/server/crypto";

const masterKey = randomBytes(32);
const otherKey = randomBytes(32);

describe("encrypt/decrypt (AES-256-GCM)", () => {
  it("round-trips: decrypt(encrypt(x)) === x", () => {
    const plaintext = "sk-ant-api03-super-secret-provider-key";
    const payload = encrypt(plaintext, masterKey);
    expect(decrypt(payload, masterKey)).toBe(plaintext);
  });

  it("uses a fresh iv and different ciphertext on every call for the SAME plaintext", () => {
    const plaintext = "same plaintext both times";
    const a = encrypt(plaintext, masterKey);
    const b = encrypt(plaintext, masterKey);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    // both still decrypt correctly despite differing
    expect(decrypt(a, masterKey)).toBe(plaintext);
    expect(decrypt(b, masterKey)).toBe(plaintext);
  });

  it("throws when decrypting with a different master key", () => {
    const payload = encrypt("secret", masterKey);
    expect(() => decrypt(payload, otherKey)).toThrow();
  });

  it("throws when the auth tag has been tampered with", () => {
    const payload = encrypt("secret", masterKey);
    const tampered = { ...payload, tag: encrypt("other", masterKey).tag };
    expect(() => decrypt(tampered, masterKey)).toThrow();
  });

  it("throws when the ciphertext has been tampered with", () => {
    const payload = encrypt("secret", masterKey);
    const bytes = Buffer.from(payload.ciphertext, "base64");
    bytes[0] = bytes[0] ^ 0xff;
    const tampered = { ...payload, ciphertext: bytes.toString("base64") };
    expect(() => decrypt(tampered, masterKey)).toThrow();
  });
});

describe("hashPassword/verifyPassword (scrypt)", () => {
  it("verifies the correct password", () => {
    const stored = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", stored)).toBe(true);
  });

  it("rejects the wrong password", () => {
    const stored = hashPassword("correct horse battery staple");
    expect(verifyPassword("wrong password", stored)).toBe(false);
  });

  it("uses a random salt so two hashes of the same password differ", () => {
    const a = hashPassword("same password");
    const b = hashPassword("same password");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });
});
