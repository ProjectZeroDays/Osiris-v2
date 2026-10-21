/**
 * The client, against a platform that has closed its registry.
 *
 * A deployment may set `OSIRIS_REGISTRY_REQUIRE_AUTH` and put the tool
 * registry behind the same session the dispatcher already demands. The
 * desktop app holds a session and presents it on the registry call, so
 * signing in is enough to reopen it.
 *
 * That is a claim about two pieces of code working together, and the
 * other tests only prove the halves: the route's own tests prove the
 * gate, and the client's own tests prove the session. This test drives
 * the client against a platform that has actually closed the registry,
 * so the claim is executed rather than expected.
 *
 *   OSIRIS_GATED_PLATFORM_URL=http://localhost:3001 \
 *     node --test electron-app/test/registry-gate.test.js
 *
 * The platform it points at must have the flag set and an account to
 * sign in with.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');

const PLATFORM_URL =
  process.env.OSIRIS_GATED_PLATFORM_URL ||
  process.env.OSIRIS_PLATFORM_URL ||
  'http://localhost:3000';
const EMAIL = process.env.OSIRIS_TEST_EMAIL || 'operator@osiris.local';
const PASSWORD = process.env.OSIRIS_TEST_PASSWORD || 'correct-horse-battery';

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'osiris-gate-test-'));

const electronStub = {
  app: {
    getPath: () => userData,
    whenReady: () => Promise.resolve(),
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (text) => Buffer.from(`enc:${text}`, 'utf8'),
    decryptString: (buffer) => buffer.toString('utf8').replace(/^enc:/, ''),
  },
};

const originalLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') return electronStub;
  return originalLoad.apply(this, arguments);
};

const platform = require('../platform');
platform.setPlatformUrl(PLATFORM_URL);

test.after(() => {
  Module._load = originalLoad;
  try {
    fs.rmSync(userData, { recursive: true, force: true });
  } catch { /* the temporary directory goes on its own */ }
});

test('the platform refuses the registry until the client signs in', async () => {
  const closed = await platform.registry();
  assert.equal(closed.ok, false, 'the registry should be closed');
  assert.equal(closed.status, 401, 'a caller with no session should be refused');
  assert.equal(closed.tools.length, 0);
});

test('signing in opens it', async () => {
  const result = await platform.signIn(EMAIL, PASSWORD);
  assert.equal(result.ok, true, `sign-in failed: ${result.error}`);

  const opened = await platform.registry();
  assert.equal(opened.ok, true, 'the session should open the registry');
  assert.equal(opened.status, 200);
  assert.ok(opened.total >= 25, 'the registry should hold every tool');
});

test('signing out closes it again', async () => {
  await platform.signOut();
  const closed = await platform.registry();
  assert.equal(closed.ok, false);
  assert.equal(closed.status, 401);
});
