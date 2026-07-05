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
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 pb-16">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary pb-0.5 font-serif text-lg font-medium leading-none text-primary-foreground"
        >
          L
        </span>
        <div>
          <p className="font-serif text-xl font-medium tracking-tight">Lede</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your resume, tailored to each job description.
          </p>
        </div>
      </div>
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border/70 bg-card p-6 shadow-sm"
      >
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
