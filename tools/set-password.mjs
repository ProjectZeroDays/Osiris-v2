/**
 * Give a local account a password.
 *
 *   node tools/set-password.mjs <email> <password>
 *
 * The platform stores a password as a scrypt hash and never as text, so
 * there is no way to set one with a plain SQL update — the hash has to be
 * made the same way the platform makes it. This does that, and writes the
 * result to the `users` table.
 *
 * It is a local tool. It reads DATABASE_URL from the environment and does
 * nothing else; it refuses to run without a database, because a
 * deployment with no database has no accounts to set a password on.
 */
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import postgres from "postgres";

const scryptAsync = promisify(scrypt);

/** The same parameters the platform uses. */
const N = 16384;
const r = 8;
const p = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.log("usage: node tools/set-password.mjs <email> <password>");
  process.exit(1);
}

if (password.length < 8) {
  console.log("A password must be at least 8 characters.");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL is not set. There is no account to set a password on.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = await scryptAsync(password.normalize("NFKC"), salt, KEYLEN, {
  N,
  r,
  p,
  maxmem: MAXMEM,
});
const stored = ["scrypt", N, r, p, salt.toString("base64"), hash.toString("base64")].join("$");

const sql = postgres(url);
try {
  const rows = await sql`
    UPDATE users
       SET password_hash = ${stored}, disabled_at = NULL
     WHERE lower(email) = lower(${email})
    RETURNING id, email
  `;
  if (rows.length === 0) {
    console.log(`No account with the email ${email}.`);
    console.log("Create one first — the platform's first-run screen does this.");
    process.exitCode = 1;
  } else {
    console.log(`Password set for ${rows[0].email} (${rows[0].id}).`);
  }
} finally {
  await sql.end({ timeout: 5 });
}
