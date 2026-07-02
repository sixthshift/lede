// Global vitest setup: provides the operator secrets loadConfig() now
// fail-fasts on (LEDE_MASTER_KEY, LEDE_SESSION_SECRET) so the existing keyless
// suite keeps booting, and disables the auth guard for it (proven ENABLED
// separately in the auth-guard suite). Runs before every test file.
import { randomBytes } from "node:crypto";

process.env.LEDE_MASTER_KEY = randomBytes(32).toString("base64");
process.env.LEDE_SESSION_SECRET = "test-session-secret-at-least-32-characters-long";
process.env.LEDE_AUTH_DISABLED = "true";
