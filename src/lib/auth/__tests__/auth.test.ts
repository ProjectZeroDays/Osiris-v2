import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  passwordStrength,
  PasswordError,
  MAX_PASSWORD_LENGTH,
} from "@/lib/auth/password.server";
import { hashToken } from "@/lib/auth/session.server";

describe("passwords", () => {
  it("hashes a password and checks it", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct-horse-battery", hash)).toBe(true);
  });

  it("does not accept the wrong password", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(await verifyPassword("not-the-password", hash)).toBe(false);
  });

  it("hashes the same password differently each time", async () => {
    // A salt per password: two accounts with the same password must not
    // have the same hash, or the hashes say they do.
    const a = await hashPassword("correct-horse-battery");
    const b = await hashPassword("correct-horse-battery");
    expect(a).not.toBe(b);
  });

  it("refuses a password that is too short", async () => {
    await expect(hashPassword("short")).rejects.toThrow(PasswordError);
  });

  it("refuses a password that is too long", async () => {
    await expect(hashPassword("x".repeat(MAX_PASSWORD_LENGTH + 1))).rejects.toThrow(
      PasswordError,
    );
  });

  it("refuses a password that is not a string", async () => {
    await expect(hashPassword(undefined as unknown as string)).rejects.toThrow(
      PasswordError,
    );
  });

  it("treats a missing hash as a failure, not a pass", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", undefined)).toBe(false);
    expect(await verifyPassword("anything", "")).toBe(false);
  });

  it("treats a malformed hash as a failure", async () => {
    for (const bad of ["not-a-hash", "scrypt$1$2$3", "bcrypt$x$y$z$a$b", "scrypt$a$b$c$d$e"]) {
      expect(await verifyPassword("anything", bad), bad).toBe(false);
    }
  });

  it("rates a password by its length, mostly", () => {
    expect(passwordStrength("short").score).toBe(0);
    expect(passwordStrength("12345678").score).toBe(1);
    expect(passwordStrength("1234567890").score).toBe(2);
    expect(passwordStrength("12345678901234").score).toBe(3);
    expect(passwordStrength("x".repeat(24)).score).toBe(4);
  });
});

describe("the session token", () => {
  it("hashes a token to a fixed length", () => {
    const hash = hashToken("a-token");
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  it("gives the same token the same hash, and a different one a different hash", () => {
    expect(hashToken("a-token")).toBe(hashToken("a-token"));
    expect(hashToken("a-token")).not.toBe(hashToken("another-token"));
  });

  it("does not contain the token itself", () => {
    expect(hashToken("a-token")).not.toContain("a-token");
  });
});
