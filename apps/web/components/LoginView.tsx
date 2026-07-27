"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, apiBaseUrl } from "../lib/api";
import type { AuthUser, Branding } from "../lib/types";
import { Alert, Field, errorMessage } from "./shared";

export function LoginView({ onSuccess }: { onSuccess: (user: AuthUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branding, setBranding] = useState<Branding | null>(null);

  useEffect(() => {
    void api<Branding>("/settings/branding")
      .then(setBranding)
      .catch(() => setBranding(null));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ user: AuthUser }>("/auth/login", {
        method: "POST",
        body: { username, password },
      });
      onSuccess(res.user);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const title = branding?.name?.trim() || "The Gamer Shop";

  return (
    <div className="login-screen">
      <form className="login-panel" onSubmit={handleSubmit}>
        {branding?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="brand-mark-img" src={branding.logoUrl} alt={title} />
        ) : (
          <p className="brand-mark" aria-hidden="true">
            TGS
          </p>
        )}
        <h1>{title}</h1>
        <p className="lede">Suite interna de presupuestos y catálogo.</p>
        {error ? <Alert>{error}</Alert> : null}
        <Field label="Usuario" htmlFor="login-user">
          <input
            id="login-user"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            disabled={busy}
          />
        </Field>
        <Field label="Contraseña" htmlFor="login-pass">
          <input
            id="login-pass"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={busy}
          />
        </Field>
        <button type="submit" disabled={busy || !username || !password}>
          {busy ? "Ingresando…" : "Ingresar"}
        </button>
        <p className="login-meta">API: {apiBaseUrl()}</p>
      </form>
    </div>
  );
}
