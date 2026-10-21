"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

/**
 * The gate.
 *
 * A deployment with a database and no accounts has no way in, and a
 * deployment with accounts needs a way in. This component is both: it asks
 * the platform whether it needs setting up, offers the first-run form when
 * it does, offers the sign-in form when it does not, and renders the
 * platform once either is done.
 *
 * The first-run form is only offered while the platform has no users at
 * all. The platform enforces that too — this is the courtesy, not the
 * control.
 */

type Mode = "checking" | "setup" | "signin" | "ready" | "error";

export function AuthGate({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantName, setTenantName] = useState("Primary");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      // The platform says whether it needs setting up. That is the only
      // question this asks it, and the answer is a yes or a no.
      //
      // Whether a session is needed is asked of the session route
      // instead, which is where the answer comes from — the platform
      // marks the single-tenant fallback `ephemeral` and nothing else,
      // so a caller that is being refused is never mistaken for a
      // deployment that needs no session. A failure to reach either
      // route means the platform cannot say, and the answer is then the
      // strict one.
      const setupRes = await fetch("/api/auth/setup", { cache: "no-store" });
      const setup = setupRes.ok ? await setupRes.json() : null;

      if (setup?.setupRequired) {
        setMode("setup");
        return;
      }

      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const state = res.ok ? await res.json() : null;

      if (state?.authenticated) {
        setMode("ready");
      } else if (state?.ephemeral) {
        // A deployment with no database runs single-tenant. There is
        // nothing to sign in to, and pretending otherwise would only
        // show a form that cannot work.
        //
        // The platform marks the single-tenant fallback `ephemeral` and
        // nothing else, so this branch cannot mistake a refusal for a
        // deployment that needs no session.
        setMode("ready");
      } else {
        setMode("signin");
      }
    } catch {
      setError("The platform could not be reached.");
      setMode("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submit = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          json?.error === "INVALID_CREDENTIALS"
            ? "That email and password do not match an account."
            : json?.detail ?? json?.error ?? "The request was refused.",
        );
        return false;
      }
      await refresh();
      return true;
    } catch {
      setError("The platform could not be reached.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (mode === "checking") {
    return (
      <div className="auth-gate auth-gate--checking">
        <p className="auth-gate__note">Checking the platform…</p>
      </div>
    );
  }

  if (mode === "error") {
    return (
      <div className="auth-gate">
        <h1 className="auth-gate__title">OSIRIS</h1>
        <p className="auth-gate__error">{error}</p>
        <button className="auth-gate__button" onClick={() => void refresh()}>
          Try again
        </button>
      </div>
    );
  }

  if (mode === "setup") {
    return (
      <div className="auth-gate">
        <h1 className="auth-gate__title">Set up OSIRIS</h1>
        <p className="auth-gate__note">
          This platform has no accounts yet. The first one becomes the
          administrator of the first tenant, and it is the only way in.
        </p>
        <label className="auth-gate__field">
          <span>Organisation</span>
          <input
            value={tenantName}
            onChange={(e) => setTenantName(e.target.value)}
            placeholder="Primary"
            autoComplete="organization"
          />
        </label>
        <label className="auth-gate__field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="username"
          />
        </label>
        <label className="auth-gate__field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
        </label>
        {error && <p className="auth-gate__error">{error}</p>}
        <button
          className="auth-gate__button"
          disabled={busy || !email || password.length < 8}
          onClick={() =>
            void submit("/api/auth/setup", { email, password, tenantName })
          }
        >
          {busy ? "Setting up…" : "Create the administrator"}
        </button>
      </div>
    );
  }

  if (mode === "signin") {
    return (
      <div className="auth-gate">
        <h1 className="auth-gate__title">OSIRIS</h1>
        <p className="auth-gate__note">Sign in to reach the intelligence grid.</p>
        <label className="auth-gate__field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="username"
          />
        </label>
        <label className="auth-gate__field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </label>
        {error && <p className="auth-gate__error">{error}</p>}
        <button
          className="auth-gate__button"
          disabled={busy || !email || !password}
          onClick={() => void submit("/api/auth/signin", { email, password })}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
