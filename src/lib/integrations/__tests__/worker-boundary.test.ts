import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";

/**
 * The worker's boundary.
 *
 * The tool collection runs in a separate process, and that process
 * imports tool modules and runs some of them as subprocesses. It is
 * therefore not a surface a client may reach: the platform's dispatcher
 * is the only thing that should talk to it, and it says so with a shared
 * secret.
 *
 * These tests drive the real worker, because the thing that matters is
 * what it does when the secret is absent, wrong, or right.
 */

const WORKER = "C:\\Projects\\osiris\\intel\\osiris_api.py";
const PYTHON = process.env.PYTHON_BIN ?? "python";

/** Start the worker on a port, with a key, and wait for it to answer. */
function startWorker(port: number, key: string | null): ChildProcess {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OSIRIS_WORKER_PORT: String(port),
  };
  if (key) env.OSIRIS_WORKER_KEY = key;
  else delete env.OSIRIS_WORKER_KEY;

  return spawn(PYTHON, [WORKER], { env, stdio: "ignore" });
}

/**
 * Wait for the worker to answer.
 *
 * The worker scans the tool collection before it binds the port, so it
 * takes a while to come up. That scan used to walk into the vendored
 * trees in the collection - one category carries a node_modules - and
 * the worker took almost a minute to start, which was long enough that
 * a caller waiting on it timed out and the platform's own test of the
 * boundary failed whenever the rest of the suite was running alongside
 * it. The scan now skips the vendored trees and the worker is up in
 * seconds.
 *
 * The wait is still shorter than the test's own timeout, so a worker
 * that genuinely never comes up reports that it did not come up rather
 * than timing out with nothing to say.
 */
async function waitForHealth(port: number, tries = 200): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
describe("the tool-collection worker", () => {
  const KEY = "test-worker-key-abcdef";
  let child: ChildProcess | null = null;
  let port = 0;

  /* The worker scans the whole tool collection before it answers, so it
     takes longer to start than an ordinary test allows — and longer still
     when the suite is running in parallel. */
  const STARTUP_TIMEOUT_MS = 120_000;

  beforeEach(() => {
    delete process.env.OSIRIS_WORKER_KEY;
    delete process.env.OSIRIS_WORKER_URL;
    // A fresh port per test: the previous worker is still closing, and a
    // new one cannot bind a port the old one still holds. The range is
    // high and the base is random, so a parallel run of this file and
    // another copy of it cannot collide either.
    port = 20000 + Math.floor(Math.random() * 20000);
  });

  afterEach(() => {
    if (child) {
      try { child.kill(); } catch { /* already gone */ }
      child = null;
    }
    delete process.env.OSIRIS_WORKER_KEY;
    delete process.env.OSIRIS_WORKER_URL;
  });

  it("answers its health check, and refuses everything else, without a key", async () => {
    child = startWorker(port, null);
    const up = await waitForHealth(port);
    expect(up).toBe(true);

    // The health check is open: it says whether the worker is alive and
    // what it can see, and nothing about that is a secret.
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(health.status).toBe(200);
    const body = await health.json();
    expect(body.status).toBe("ok");
    expect(body.tools_available).toBeGreaterThan(0);

    // Everything else is refused, because without a key the worker
    // cannot tell the platform from anyone else.
    const tools = await fetch(`http://127.0.0.1:${port}/api/tools`);
    expect(tools.status).toBe(503);
    expect((await tools.json()).error).toBe("WORKER_KEY_NOT_CONFIGURED");
  }, STARTUP_TIMEOUT_MS);

  it("answers the platform with the right key, and nobody else", async () => {
    child = startWorker(port, KEY);
    await waitForHealth(port);

    // A wrong key.
    const wrong = await fetch(`http://127.0.0.1:${port}/api/tools`, {
      headers: { "X-OSIRIS-Worker-Key": "not-the-key" },
    });
    expect(wrong.status).toBe(401);
    expect((await wrong.json()).error).toBe("WORKER_UNAUTHENTICATED");

    // No key at all.
    const none = await fetch(`http://127.0.0.1:${port}/api/tools`);
    expect(none.status).toBe(401);

    // The platform.
    const right = await fetch(`http://127.0.0.1:${port}/api/tools`, {
      headers: { "X-OSIRIS-Worker-Key": KEY },
    });
    expect(right.status).toBe(200);
    const body = await right.json();
    expect(body.total).toBeGreaterThan(0);
  }, STARTUP_TIMEOUT_MS);
});
