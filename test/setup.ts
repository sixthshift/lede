// Global vitest setup: provides the operator secrets loadConfig() now
// fail-fasts on (LEDE_MASTER_KEY, LEDE_SESSION_SECRET) so the existing keyless
// suite keeps booting, and disables the auth guard for it (proven ENABLED
// separately in the auth-guard suite). Runs before every test file.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";

process.env.LEDE_MASTER_KEY = randomBytes(32).toString("base64");
process.env.LEDE_SESSION_SECRET = "test-session-secret-at-least-32-characters-long";
process.env.LEDE_AUTH_DISABLED = "true";

// Font-fetch backstop. Under jsdom (import.meta.env.SSR === false) react-pdf's
// browser render path fetches @fontsource face bytes at render time, and
// fitToPages fires those renders without the calling test awaiting every face
// request. A face fetch can therefore still be in flight after the test that
// triggered it settles — and since a worker runs files sequentially in one
// process, that late request can execute while a LATER file's fetch mock is
// installed, tripping its throw-on-unknown branch (the documented "@fontsource
// flake", worsened as fork concurrency reshuffles timing). Every component
// mock is installed through vi.stubGlobal("fetch", ...), so wrapping the
// stubbed value here serves font URLs from disk beneath whichever mock is
// active — non-font requests still reach the test's own mock unchanged, so its
// call assertions are untouched.
const isFontUrl = (url: string) => /\/node_modules\/@fontsource\/.+\.(?:woff2?|ttf)$/.test(url);
const realStubGlobal = vi.stubGlobal.bind(vi);
vi.stubGlobal = ((name: string, value: unknown) => {
  if (name === "fetch" && typeof value === "function") {
    const mock = value as typeof fetch;
    const wrapped = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (isFontUrl(url)) {
        const bytes = readFileSync(join(process.cwd(), new URL(url, "http://localhost").pathname));
        return Promise.resolve(new Response(bytes, { status: 200 }));
      }
      return mock(input, init);
    }) as typeof fetch;
    return realStubGlobal(name, wrapped);
  }
  return realStubGlobal(name, value);
}) as typeof vi.stubGlobal;
