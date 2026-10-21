const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

/**
 * The platform client, in the main process.
 *
 * The desktop app talks to the platform the way a browser does: it signs
 * in, it holds a session cookie, and it presents that cookie on every
 * request. The dispatcher checks the session on every call, so without
 * one the app can read the registry but cannot run anything.
 *
 * The token lives here, in the main process, and not in the renderer. The
 * renderer is a web page: anything that can run in it — the page's own
 * script, a dependency, an injected snippet — can read what the page
 * holds. Keeping the token out of it means the token is not in reach of
 * any of that. The renderer asks for an action, and the main process does
 * it.
 *
 * The token is stored with Electron's `safeStorage`, which encrypts it
 * with a key held by the operating system's credential store. Where the
 * operating system offers no such thing, the file is written plainly and
 * the fact is recorded, rather than pretending it is protected.
 */

const SESSION_COOKIE = 'osiris_session';
const DEFAULT_PLATFORM_URL = 'http://localhost:3000';

/** The stored state: the platform, the token, and who it belongs to. */
let state = {
  platformUrl: process.env.OSIRIS_PLATFORM_URL || DEFAULT_PLATFORM_URL,
  token: null,
  user: null,
};

let statePath = null;

/** Where the state is kept. `app.getPath` is only available once ready. */
function filePath() {
  if (!statePath) {
    statePath = path.join(app.getPath('userData'), 'platform-session.json');
  }
  return statePath;
}

/**
 * Read the stored state.
 *
 * The file holds the token encrypted when the operating system can do it.
 * A file that cannot be decrypted — because the key is gone, or the file
 * was written by another machine — is treated as no session at all,
 * rather than as an error that stops the app from starting.
 */
function load() {
  // An address in the environment is the deployment's setting, and it
  // wins over the one the app last used: a machine that is pointed at a
  // different platform should not have to remember to clear a file.
  const fromEnvironment = process.env.OSIRIS_PLATFORM_URL;
  if (fromEnvironment) {
    state.platformUrl = fromEnvironment.replace(/\/+$/, '');
  }

  try {
    const raw = fs.readFileSync(filePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!fromEnvironment) {
      state.platformUrl = parsed.platformUrl || state.platformUrl;
    }
    state.user = parsed.user || null;
    if (parsed.encrypted && safeStorage.isEncryptionAvailable()) {
      state.token = safeStorage.decryptString(Buffer.from(parsed.encrypted, 'base64'));
    } else if (parsed.token) {
      // Written where the operating system offered no encryption.
      state.token = parsed.token;
    }
  } catch {
    // No file, or a file that cannot be read. Either way there is no
    // session, and the app starts as a signed-out client.
    state.token = null;
    state.user = null;
  }
  return state;
}

/** Write the state, encrypting the token when that is possible. */
function save() {
  const payload = { platformUrl: state.platformUrl, user: state.user };
  if (state.token) {
    if (safeStorage.isEncryptionAvailable()) {
      payload.encrypted = safeStorage.encryptString(state.token).toString('base64');
    } else {
      payload.token = state.token;
    }
  }
  try {
    fs.mkdirSync(path.dirname(filePath()), { recursive: true });
    fs.writeFileSync(filePath(), JSON.stringify(payload, null, 2), 'utf8');
  } catch {
    // A session that cannot be written is a session that does not
    // survive a restart. The app still works until it is closed.
  }
}

/** Forget the session. The token goes; the platform is remembered. */
function clear() {
  state.token = null;
  state.user = null;
  try {
    fs.unlinkSync(filePath());
  } catch {
    // There was no file to remove.
  }
}

/** The headers a platform request carries. */
function headers(extra) {
  const h = { 'Content-Type': 'application/json', ...(extra || {}) };
  if (state.token) h.Cookie = `${SESSION_COOKIE}=${state.token}`;
  return h;
}

/** The platform's base URL, without a trailing slash. */
function base() {
  return String(state.platformUrl || DEFAULT_PLATFORM_URL).replace(/\/+$/, '');
}

/**
 * Read the session cookie out of a response.
 *
 * `getSetCookie` is the way to get at it; the joined header is the
 * fallback for a runtime that does not have it.
 */
function sessionCookie(response) {
  const raw =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie') || ''];
  for (const line of raw) {
    const match = /(^|;\s*)osiris_session=([^;]*)/.exec(line);
    if (match) return match[2];
  }
  return null;
}

/** A request to the platform, with the session attached. */
async function request(pathname, options = {}) {
  const response = await fetch(`${base()}${pathname}`, {
    ...options,
    headers: headers(options.headers),
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body, response };
}

/**
 * Sign in.
 *
 * The password goes to the platform and is not kept. The platform answers
 * with a session cookie, which is the only thing kept.
 */
async function signIn(email, password) {
  const response = await fetch(`${base()}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      error: body?.error || 'SIGN_IN_FAILED',
      detail: body?.detail || null,
    };
  }

  const token = sessionCookie(response);
  if (!token) {
    return { ok: false, error: 'NO_SESSION_COOKIE' };
  }

  state.token = token;
  state.user = body?.user || null;
  save();
  return { ok: true, user: state.user };
}

/**
 * Sign out.
 *
 * The platform is told first, so the session row is deleted there too and
 * the token stops working anywhere. A failure to reach the platform still
 * clears the local copy: the token is worthless to us either way, and
 * keeping it would only be keeping a credential.
 */
async function signOut() {
  let revoked = false;
  if (state.token) {
    try {
      const response = await fetch(`${base()}/api/auth/signout`, {
        method: 'POST',
        headers: headers(),
      });
      revoked = response.ok;
    } catch {
      revoked = false;
    }
  }
  clear();
  return { ok: true, revoked };
}

/**
 * Who the platform thinks we are.
 *
 * A platform with no database needs no sign-in, so "no session" there is
 * not a problem. The platform says which case this is, and the app says
 * so rather than showing a sign-in form that cannot work.
 */
async function session() {
  try {
    const { status, body } = await request('/api/auth/session');
    if (status !== 200 || !body) {
      return { authenticated: false, ephemeral: false, user: null, reachable: false };
    }
    return {
      authenticated: Boolean(body.authenticated),
      ephemeral: Boolean(body.ephemeral),
      user: body.user || null,
      reachable: true,
    };
  } catch {
    return { authenticated: false, ephemeral: false, user: null, reachable: false };
  }
}

/**
 * The tool registry. It is metadata, not data.
 *
 * It answers without a session by default. A deployment can close it
 * behind one (`OSIRIS_REGISTRY_REQUIRE_AUTH`), and because every call
 * here already carries the session, signing in is enough to reopen it.
 */
async function registry() {
  const { status, body } = await request('/api/integrations/tools');
  if (status !== 200 || !body) {
    return {
      ok: false,
      status,
      error: body?.error || `PLATFORM_RETURNED_${status}`,
      tools: [],
      total: 0,
    };
  }
  return { ok: true, status, tools: body.tools || [], total: body.total || 0 };
}

/**
 * Run one capability of one tool.
 *
 * The platform checks the capability against its own allowlist again, and
 * the session says who is asking. Offering a capability here is a request,
 * not a grant.
 */
async function execute(toolId, capability, body) {
  try {
    const { status, body: result } = await request(
      `/api/integrations/${encodeURIComponent(toolId)}/${encodeURIComponent(capability)}`,
      { method: 'POST', body: JSON.stringify(body || {}) },
    );
    return { ok: status >= 200 && status < 300, status, result };
  } catch (e) {
    return { ok: false, status: 0, result: { error: 'PLATFORM_UNREACHABLE', detail: e.message } };
  }
}

/** Point the app at a different platform. The session does not travel. */
function setPlatformUrl(url) {
  const next = String(url || '').trim().replace(/\/+$/, '');
  state.platformUrl = next || DEFAULT_PLATFORM_URL;
  state.token = null;
  state.user = null;
  save();
  return { ok: true, platformUrl: state.platformUrl };
}

module.exports = {
  load,
  save,
  clear,
  signIn,
  signOut,
  session,
  registry,
  execute,
  setPlatformUrl,
  get platformUrl() {
    return state.platformUrl;
  },
  get hasToken() {
    return Boolean(state.token);
  },
};
