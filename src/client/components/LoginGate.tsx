// Single-user password gate — spec.md §7. Wraps the whole app: pings a
// protected route, and any 401 (ApiError.status === 401) swaps the app out
// for a password form instead of rendering it. There's no "am I set up yet"
// endpoint, so the form itself discovers that: it tries /api/auth/setup
// first (the first-run path), and only falls back to /api/auth/login when
// setup 409s because a password already exists. Either path ends in a
// session, at which point the ping is invalidated and the app renders.
import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchSettings, ApiError } from "../api";
import { useAuthSetup, useAuthLogin } from "../hooks/queries";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

function useAuthPing() {
  return useQuery({
    queryKey: ["auth-ping"] as const,
    queryFn: fetchSettings,
    retry: false,
  });
}

function LoginForm({ onSignedIn }: { onSignedIn: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const setup = useAuthSetup();
  const login = useAuthLogin();
  const pending = setup.isPending || login.isPending;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      await setup.mutateAsync(password);
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 409) {
        setError(err instanceof ApiError ? err.message : "Could not sign in.");
        return;
      }
      // password already set — this is a returning user, not first-run.
      try {
        await login.mutateAsync(password);
      } catch (loginErr) {
        setError(loginErr instanceof ApiError ? loginErr.message : "Could not sign in.");
        return;
      }
      onSignedIn();
      return;
    }

    // setup succeeded (first-run) — it only stores the password, so log in
    // now to establish the session.
    try {
      await login.mutateAsync(password);
      onSignedIn();
    } catch (loginErr) {
      setError(loginErr instanceof ApiError ? loginErr.message : "Could not sign in.");
    }
  }

  return (
    <div className="mx-auto mt-24 max-w-sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-border p-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="login-gate-password">Password</Label>
          <Input
            id="login-gate-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={pending}
          />
          <p className="text-xs text-muted-foreground">First time here? This sets your password.</p>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={pending || password.length === 0}>
          Continue
        </Button>
      </form>
    </div>
  );
}

export function LoginGate({ children }: { children: ReactNode }) {
  const ping = useAuthPing();
  const queryClient = useQueryClient();

  const unauthorized = ping.error instanceof ApiError && ping.error.status === 401;
  if (unauthorized) {
    return <LoginForm onSignedIn={() => queryClient.invalidateQueries()} />;
  }

  return <>{children}</>;
}
