import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The execution boundary.
 *
 * The platform does not run the tools it integrates. A tool is a file
 * import, a report, or an allowlisted upstream. The one documented
 * exception is the plate recogniser, which is a real program on the
 * operator's host, called through `execFile` with a fixed argument list
 * and no shell.
 *
 * This test is what keeps the exception from widening by accident. If a
 * second adapter reaches for `child_process`, or if the exception grows
 * a shell, this fails.
 */

const INTEGRATIONS_DIR = join(process.cwd(), "src", "lib", "integrations");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

const FILES = walk(INTEGRATIONS_DIR);

describe("execution boundary", () => {
  it("finds the integration layer", () => {
    expect(FILES.length).toBeGreaterThan(10);
  });

  it("lets exactly one adapter reach for child_process", () => {
    const offenders = FILES.filter((f) =>
      /from\s+["']node:child_process["']/.test(readFileSync(f, "utf8")),
    );
    expect(offenders.map((f) => f.split(/[\\/]/).pop())).toEqual([
      "plate-ocr.server.ts",
    ]);
  });

  it("never uses a shell", () => {
    for (const f of FILES) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/\bexecSync\s*\(/);
      expect(src, f).not.toMatch(/\bexec\s*\(\s*["'`]/);
      // execFile takes an argument vector; exec takes a string.
      expect(src, f).not.toMatch(/from\s+["']node:child_process["'][\s\S]{0,200}\bexec\(/);
    }
  });

  it("never evaluates code at runtime", () => {
    for (const f of FILES) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/\beval\s*\(/);
      expect(src, f).not.toMatch(/new\s+Function\s*\(/);
    }
  });

  it("never runs a shell interpreter from the integration layer", () => {
    for (const f of FILES) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/\/bin\/(sh|bash|zsh)\b/);
      expect(src, f).not.toMatch(/\bcmd\.exe\b/);
      expect(src, f).not.toMatch(/\bpowershell\b/i);
    }
  });

  it("never fetches a URL that came from the request", () => {
    // A fetch target may be built from an environment-configured
    // allowlisted host. It may never be built from the request body, or
    // from a parameter the caller supplied.
    for (const f of FILES) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/fetch\(\s*`?\$\{\s*(payload|body|args|input|request|params)\b/i);
      expect(src, f).not.toMatch(/fetch\(\s*(payload|body|args|input|request|params)\./i);
    }
  });

  it("builds its fetch targets from a host the code itself names", () => {
    // Where an adapter fetches at all, the base is either a literal the
    // code declares or an environment variable the operator configured.
    // It is never something the caller supplied.
    for (const f of FILES) {
      const src = readFileSync(f, "utf8");
      if (!/fetch\(/.test(src)) continue;
      const namesTheHost =
        /process\.env\.[A-Z_]*(URL|BASE|HOST|MCP)/.test(src) ||
        /const\s+[A-Z_]+\s*=\s*["']https?:\/\//.test(src) ||
        /["']https?:\/\/[a-z0-9.-]+/.test(src);
      expect(namesTheHost, f).toBe(true);
    }
  });
});

describe("the one exception", () => {
  const src = readFileSync(join(INTEGRATIONS_DIR, "adapters", "plate-ocr.server.ts"), "utf8");

  it("uses execFile, not exec", () => {
    expect(src).toMatch(/execFile/);
    expect(src).not.toMatch(/\bexec\s*\(/);
  });

  it("bounds the call with a timeout and a buffer limit", () => {
    expect(src).toMatch(/timeout:\s*15_000/);
    expect(src).toMatch(/maxBuffer:\s*2_000_000/);
  });

  it("validates the country against an allowlist", () => {
    expect(src).toMatch(/COUNTRIES/);
    expect(src).toMatch(/COUNTRIES\.includes/);
  });

  it("removes the temporary file either way", () => {
    expect(src).toMatch(/finally\s*\{[\s\S]{0,120}unlink/);
  });
});
