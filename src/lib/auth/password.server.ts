import "server-only";
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Passwords.
 *
 * A password is stored as a scrypt hash with a random salt, and the
 * comparison is constant-time. The parameters are written into the hash
 * itself, so they can be raised later without invalidating the passwords
 * that were hashed with the old ones.
 *
 * The format is:
 *     scrypt$N$r$p$<salt-b64>$<hash-b64>
 */

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** The work factor. Raising it makes every new password slower to check. */
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;

/** The most memory the hash may use, in bytes. scrypt needs about 32*N*r. */
const MAXMEM = 64 * 1024 * 1024;

/** The longest password that is accepted. A passphrase is not a novel. */
export const MAX_PASSWORD_LENGTH = 200;

export class PasswordError extends Error {}

/**
 * Hash a password.
 *
 * A password shorter than eight characters is refused rather than
 * hashed: a hash of it would look like a hash of anything, and the
 * platform would be pretending to be stronger than it is.
 */
export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== "string" || password.length < 8) {
    throw new PasswordError("A password must be at least 8 characters.");
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new PasswordError("That password is too long.");
  }

  const salt = randomBytes(SALT_BYTES);
  const hash = await scryptAsync(password.normalize("NFKC"), salt, KEYLEN, {
    N, r: R, p: P, maxmem: MAXMEM,
  });

  return [
    "scrypt", N, R, P,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}

/**
 * Check a password against a stored hash.
 *
 * A malformed hash is a failure, not a pass: a record that cannot be
 * checked is a record that cannot be trusted.
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored || typeof password !== "string") return false;

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "base64");
    expected = Buffer.from(parts[5], "base64");
  } catch {
    return false;
  }
  if (expected.length === 0) return false;

  try {
    const actual = await scryptAsync(password.normalize("NFKC"), salt, expected.length, {
      N: n, r, p, maxmem: MAXMEM,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * A password's strength, as a rough measure.
 *
 * This is a nudge, not a gate: the length is what matters, and a rule
 * that demands a symbol pushes people towards `Password1!`.
 */
export function passwordStrength(password: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
} {
  if (password.length >= 20) return { score: 4, label: "Very strong" };
  if (password.length >= 14) return { score: 3, label: "Strong" };
  if (password.length >= 10) return { score: 2, label: "Fair" };
  if (password.length >= 8) return { score: 1, label: "Weak" };
  return { score: 0, label: "Too short" };
}
