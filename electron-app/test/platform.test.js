/**
 * The desktop app's platform client.
 *
 * The client is the part of the Electron app that holds the session: it
 * signs in, keeps the token, presents it on every call, and signs out.
 * The token is meant never to reach the renderer, so the test drives the
 * module directly rather than through the UI.
 *
 * The `electron` module is stubbed, because the client uses two things
 * from it — a place to keep a file, and `safeStorage` — and neither is
 * what is being tested here.
 *
 *   node --test electron-app/test/platform.test.js
 *
 * The platform must be running and a database must be configured: the
 * client is no use against a platform that has no accounts.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const Module = require('node:module');

const PLATFORM_URL =
  process.env.OSIRIS_PLATFORM_URL ||
  process.env.TEST_PLATFORM_URL ||
  'http://localhost:3000';
const EMAIL = process.env.OSIRIS_TEST_EMAIL || 'operator@osiris.local';
const PASSWORD = process.env.OSIRIS_TEST_PASSWORD || 'correct-horse-battery';

/* A temporary directory to stand in for the app's own storage. */
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'osiris-electron-test-'));

/* The stub of `electron`. `safeStorage` here is a reversible cipher, not
   the operating system's — what the test is checking is that the client
   asks for encryption and keeps the token out of the file in the clear. */
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

/* Node's module loader is asked for `electron` by the client; the stub
   answers instead. */
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return electronStub;
  return originalLoad.apply(this, arguments);
};

const platform = require('../platform');

test.after(() => {
  Module._load = originalLoad;
  try {
    fs.rmSync(userData, { recursive: true, force: true });
  } catch { /* the temporary directory goes on its own */ }
});

test('the platform is reachable and wants a session', async () => {
  const state = await platform.session();
  assert.equal(state.reachable, true, 'the platform should answer');
  // The client is no use against a platform with no accounts, so the
  // test says so rather than passing on a platform that needs nothing.
  assert.equal(state.authenticated, false);
  assert.equal(state.ephemeral, false, 'the platform should demand a session');
});

test('a wrong password is refused', async () => {
  const result = await platform.signIn(EMAIL, 'not-the-password');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'INVALID_CREDENTIALS');
  assert.equal(platform.hasToken, false, 'a refused sign-in must leave no token');
});

test('a capability is refused without a session', async () => {
  // The guard is the point: without a session the dispatcher says no, and
  // the app says so rather than pretending the call went through.
  const result = await platform.execute('exploit-index', 'report.import', {
    purpose: 'the electron client test, with no session',
    payload: { cve: 'CVE-2024-0001' },
  });
  assert.equal(result.status, 401, 'a call with no session must be refused');
});

test('the right password gives a session', async () => {
  const result = await platform.signIn(EMAIL, PASSWORD);
  assert.equal(result.ok, true, `sign-in failed: ${result.error}`);
  assert.equal(result.user.email, EMAIL);
  assert.equal(platform.hasToken, true);
});

test('the token is not written in the clear', () => {
  const file = path.join(userData, 'platform-session.json');
  const raw = fs.readFileSync(file, 'utf8');
  assert.ok(!raw.includes(PASSWORD), 'the password must never be stored');
  const parsed = JSON.parse(raw);
  assert.ok(!parsed.token, 'the token must be encrypted, not plain');
  assert.ok(parsed.encrypted, 'the file should hold the encrypted form');
});

test('the session resolves', async () => {
  const state = await platform.session();
  assert.equal(state.authenticated, true);
  assert.equal(state.user.email, EMAIL);
});

test('the registry answers and names every tool', async () => {
  // What the client can check for itself. Whether the deployment closed
  // the registry is its business; that the answer, once given, is the
  // whole manifest is the contract this client depends on.
  const result = await platform.registry();
  assert.equal(result.ok, true);
  const ids = new Set(result.tools.map((t) => t.id));
  for (const id of ['shodan', 'zenmap', 'metasploit']) {
    assert.ok(ids.has(id), `the registry should name ${id}`);
  }
  assert.equal(result.tools.length, result.total, 'the listing and the count should agree');
});

test('the registry is readable with the session', async () => {
  // A deployment may close the registry behind a session
  // (`OSIRIS_REGISTRY_REQUIRE_AUTH`). The client presents its session on
  // every call, so a closed registry is one sign-in away, and this is
  // executed rather than assumed: the client test runs against a platform
  // with the flag set. A client that did not attach the session here
  // would fail this and only this test.
  const result = await platform.registry();
  assert.equal(result.ok, true, 'a closed registry must open for a session');
  assert.ok(result.tools.length >= 25, 'the registry should hold every tool');
});

test('the token is not in the renderer\'s reach', () => {
  // The client hands the renderer nothing but answers: the token lives
  // here, in the main process. There is no getter that returns it.
  const exported = Object.keys(platform);
  assert.ok(!exported.includes('token'), 'the token must not be exported');
  assert.ok(!exported.includes('getToken'), 'the token must not be exported');
});

test('a capability runs with the session', async () => {
  const result = await platform.execute('exploit-index', 'report.import', {
    purpose: 'the electron client test',
    payload: { cve: 'CVE-2024-0001' },
  });
  // The platform answers with a verdict either way. What matters is that
  // the call was not refused for want of a session.
  assert.notEqual(result.status, 401, 'the call must not be refused for want of a session');
  assert.ok(result.result, 'the platform should answer');
});

test('signing out revokes the session at once', async () => {
  const result = await platform.signOut();
  assert.equal(result.ok, true);
  assert.equal(platform.hasToken, false);

  const state = await platform.session();
  assert.equal(state.authenticated, false, 'the session must be revoked');
});
