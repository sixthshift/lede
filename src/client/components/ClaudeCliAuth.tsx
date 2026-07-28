// Provider claude-cli's auth surface — rendered in ApiKeyForm's place inside
// the same "API key" card, never as a fourth card (the Settings surface is
// bound to three).
//
// There is no input here BY DESIGN, and this is the whole point of the
// provider: it authenticates through the server's own `claude` login or the
// CLAUDE_CODE_OAUTH_TOKEN variable in the server's environment. A token typed
// into this browser would be a credential Lede stored and then never read —
// the tailor path doesn't look there. So: static text, no field, no reveal, no
// copy affordance.
//
// Readiness is therefore something only the server can answer, and only by
// spending a real round trip — "installed" and "signed in" are
// indistinguishable from here. Hence a button the operator presses rather than
// a status Lede asserts on load.
import { ApiError, claudeCliErrorMessage } from "../api";
import { useTestConnection } from "../hooks/queries";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export function ClaudeCliAuth() {
  const probe = useTestConnection();
  // The server's `detail` (the CLI's own bounded words) is deliberately not
  // shown: ApiError carries the code alone, and widening the shared error
  // channel for one surface's copy isn't this card's call to make.
  const failureCode = probe.error instanceof ApiError ? probe.error.code : undefined;

  return (
    <div className="flex flex-col gap-3">
      <p data-testid="claude-cli-auth-note" className="text-sm text-muted-foreground">
        Claude Code (CLI) signs in on the server, not here. Lede uses whatever the server's own{" "}
        <span className="font-mono text-xs">claude</span> login provides, or a{" "}
        <span className="font-mono text-xs">CLAUDE_CODE_OAUTH_TOKEN</span> in the server's
        environment. There is no key to enter.
      </p>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => probe.mutate()}
          disabled={probe.isPending}
        >
          {probe.isPending ? "Testing…" : "Test connection"}
        </Button>
        {probe.isSuccess ? (
          <Badge variant="success" data-testid="test-connection-success">
            The CLI answered.
          </Badge>
        ) : null}
      </div>

      {probe.isError ? (
        <p
          data-testid="test-connection-error"
          data-error-code={failureCode}
          className="text-sm text-destructive"
        >
          {claudeCliErrorMessage(failureCode)}
        </p>
      ) : null}
    </div>
  );
}
