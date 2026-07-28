// Typed client for the tailor + entries/profile/settings endpoints (spec.md §9, §15).
// Every non-2xx response throws ApiError{status,code,message}; `code` carries
// the server's `error` string verbatim (e.g. "key_invalid", "no_api_key") so
// later tickets can switch on it (401→LoginGate, 400 no_api_key→Settings).

import type {
  Entry,
  Profile,
  Layout,
  Section,
  Application,
  ApplicationSummary,
  Paper,
  VoiceSource,
} from "@shared/types";
import type { DocumentFormatV2 } from "@shared/format-v2";
import type { z } from "zod";
import type {
  entryInput,
  profileInput,
  settingsInput,
  applicationCreate,
  applicationUpdate,
  resumePartPatchZ,
  letterPartPatchZ,
} from "@shared/schema";

export type EntryInput = z.infer<typeof entryInput>;
export type ProfileInput = z.infer<typeof profileInput>;
export type SettingsInput = z.infer<typeof settingsInput>;
export type ApplicationCreateInput = z.infer<typeof applicationCreate>;
export type ApplicationUpdateInput = z.infer<typeof applicationUpdate>;
// T31/T32 — per-part text-edit request bodies, inferred straight off the
// server's own `.strict()` zod contracts so a schema change can never drift
// silently out of sync with what the client sends.
export type ResumePartPatchInput = z.infer<typeof resumePartPatchZ>;
export type LetterPartPatchInput = z.infer<typeof letterPartPatchZ>;
// The list endpoint omits the heavy current/locked TailoredResume snapshots
// (§9) — ApplicationSummary (src/shared/types.ts) is the canonical shape,
// kept in lockstep with the server's own LIST_COLUMNS projection.
export type ApplicationListItem = ApplicationSummary;
export type SettingsResponse = {
  keySet: boolean;
  provider: string;
  model: string;
  baseUrl: string | null;
  layout: Layout;
  paper: Paper;
  defaultFormat: DocumentFormatV2;
};

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    let code: string | undefined;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) {
        code = body.error;
        message = body.error;
      }
    } catch {
      // body wasn't JSON — fall back to the generic message above.
    }
    throw new ApiError(res.status, message, code);
  }

  return (await res.json()) as T;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

// ── entries (spec.md §9) ──
export async function fetchEntries(section?: Section): Promise<Entry[]> {
  const url = section ? `/api/entries?section=${encodeURIComponent(section)}` : "/api/entries";
  return request<Entry[]>(url);
}

export async function createEntry(input: EntryInput): Promise<Entry> {
  return request<Entry>("/api/entries", jsonInit("POST", input));
}

export async function updateEntry(id: string, input: EntryInput): Promise<Entry> {
  return request<Entry>(`/api/entries/${encodeURIComponent(id)}`, jsonInit("PUT", input));
}

export async function deleteEntry(id: string): Promise<void> {
  await request<{ ok: true }>(`/api/entries/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function importEntries(input: EntryInput[]): Promise<{ imported: number }> {
  return request<{ imported: number }>("/api/entries/import", jsonInit("POST", input));
}

// ── profile (spec.md §9/§4.2) ──
export async function fetchProfile(): Promise<Profile> {
  return request<Profile>("/api/profile");
}

export async function updateProfile(input: ProfileInput): Promise<Profile> {
  return request<Profile>("/api/profile", jsonInit("PUT", input));
}

// ── settings (spec.md §9/§4.2) ──
export async function fetchSettings(): Promise<SettingsResponse> {
  return request<SettingsResponse>("/api/settings");
}

export async function updateSettings(input: SettingsInput): Promise<SettingsResponse> {
  return request<SettingsResponse>("/api/settings", jsonInit("PUT", input));
}

// ── applications (spec.md §27) — tailoring records, not a hiring tracker ──
export async function listApplications(): Promise<ApplicationListItem[]> {
  return request<ApplicationListItem[]>("/api/applications");
}

export async function createApplication(input: ApplicationCreateInput): Promise<Application> {
  return request<Application>("/api/applications", jsonInit("POST", input));
}

export async function getApplication(id: string): Promise<Application> {
  return request<Application>(`/api/applications/${encodeURIComponent(id)}`);
}

export async function updateApplication(
  id: string,
  input: ApplicationUpdateInput,
): Promise<Application> {
  return request<Application>(
    `/api/applications/${encodeURIComponent(id)}`,
    jsonInit("PUT", input),
  );
}

export async function deleteApplication(id: string): Promise<void> {
  await request<{ ok: true }>(`/api/applications/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// T031 CO-2 — deep-copies the full application row server-side; the client
// only needs the new id (a fresh GET/list refetch surfaces the rest).
export async function duplicateApplication(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(
    `/api/applications/${encodeURIComponent(id)}/duplicate`,
    jsonInit("POST", {}),
  );
}

export async function tailorApplication(id: string): Promise<Application> {
  return request<Application>(
    `/api/applications/${encodeURIComponent(id)}/tailor`,
    jsonInit("POST", {}),
  );
}

export async function generateLetter(id: string): Promise<Application> {
  return request<Application>(
    `/api/applications/${encodeURIComponent(id)}/generate-letter`,
    jsonInit("POST", {}),
  );
}

export async function undoLetter(id: string): Promise<Application> {
  return request<Application>(
    `/api/applications/${encodeURIComponent(id)}/undo-letter`,
    jsonInit("POST", {}),
  );
}

export async function lockApplication(id: string): Promise<Application> {
  return request<Application>(
    `/api/applications/${encodeURIComponent(id)}/lock`,
    jsonInit("POST", {}),
  );
}

export async function unlockApplication(id: string): Promise<Application> {
  return request<Application>(`/api/applications/${encodeURIComponent(id)}/lock`, {
    method: "DELETE",
  });
}

// ── T31/T32 in-place text editing (spec.md §27) — every route 409s on a
// locked application; the server is the sole enforcer, these are thin
// wrappers matching the routes' exact paths/methods (src/server/routes/
// applications.ts). ──
export async function patchResumePart(
  id: string,
  input: ResumePartPatchInput,
): Promise<Application> {
  return request<Application>(
    `/api/applications/${encodeURIComponent(id)}/resume-part`,
    jsonInit("PATCH", input),
  );
}

export async function patchLetterPart(
  id: string,
  input: LetterPartPatchInput,
): Promise<Application> {
  return request<Application>(
    `/api/applications/${encodeURIComponent(id)}/letter-part`,
    jsonInit("PATCH", input),
  );
}

export async function insertLetterParagraph(
  id: string,
  position: number,
  text: string,
): Promise<Application> {
  return request<Application>(
    `/api/applications/${encodeURIComponent(id)}/letter-part/paragraph`,
    jsonInit("POST", { position, text }),
  );
}

export async function removeLetterParagraph(id: string, index: number): Promise<Application> {
  return request<Application>(
    `/api/applications/${encodeURIComponent(id)}/letter-part/paragraph/${encodeURIComponent(
      String(index),
    )}`,
    { method: "DELETE" },
  );
}

// ── T32 blank letter creation — the retroactive-import entry point (no model
// call; src/server/routes/applications.ts's /letter-blank). ──
export async function createBlankLetter(id: string): Promise<Application> {
  return request<Application>(
    `/api/applications/${encodeURIComponent(id)}/letter-blank`,
    jsonInit("POST", {}),
  );
}

// ── T42/T44 voice sources — flagging an application's own output is the
// ONLY door into profile.voiceSources (no paste-in add exists client-side);
// deleting is the only door back out. ──
export async function flagVoice(id: string, kind: "cover-letter" | "resume"): Promise<VoiceSource> {
  return request<VoiceSource>(
    `/api/applications/${encodeURIComponent(id)}/flag-voice`,
    jsonInit("POST", { kind }),
  );
}

export async function deleteVoiceSource(vid: string): Promise<Profile> {
  return request<Profile>(`/api/profile/voice-sources/${encodeURIComponent(vid)}`, {
    method: "DELETE",
  });
}

// ── auth (spec.md §7/§8) — single-user password gate, never accounts ──
export async function authSetup(password: string): Promise<void> {
  await request<{ ok: true }>("/api/auth/setup", jsonInit("POST", { password }));
}

export async function authLogin(password: string): Promise<void> {
  await request<{ ok: true }>("/api/auth/login", jsonInit("POST", { password }));
}

export async function authLogout(): Promise<void> {
  await request<{ ok: true }>("/api/auth/logout", { method: "POST" });
}

// Public, unauthenticated: does a password already exist? Lets the login
// form show first-run copy only when it's actually true, instead of
// inferring it by probing /api/auth/setup and reading the 409.
export async function getAuthState(): Promise<{ setup: boolean }> {
  return request<{ setup: boolean }>("/api/auth/state");
}

// Server `error` codes are wire identifiers, not copy — map every known one
// to a human sentence so the login form never shows raw/underscored text.
// Unknown codes fall back to the same generic sentence (never `err.message`).
const AUTH_ERROR_COPY: Record<string, string> = {
  invalid_body: "Enter a password to continue.",
  invalid_credentials: "That password didn't work. Try again.",
  already_configured: "This instance is already set up. Try signing in instead.",
};

export function authErrorMessage(code: string | undefined): string {
  const fallback = "Could not sign in.";
  return code ? (AUTH_ERROR_COPY[code] ?? fallback) : fallback;
}

// ── BYOK provider key (spec.md §8) — write-only: the server never returns
// the key value, only `keySet`. There is nothing here to fetch or display.
export async function setApiKey(apiKey: string): Promise<{ keySet: true }> {
  return request<{ keySet: true }>("/api/settings/key", jsonInit("PUT", { apiKey }));
}

export async function deleteApiKey(): Promise<{ keySet: false }> {
  return request<{ keySet: false }>("/api/settings/key", { method: "DELETE" });
}

// ── claude-cli readiness — the keyless counterpart to a stored key. Nothing
// is sent and nothing comes back but the verdict: the server spends one real
// round trip through its own `claude` (src/server/routes/settings.ts), which
// is the only observation that separates "installed" from "logged in".
export async function testConnection(): Promise<{ ok: true }> {
  return request<{ ok: true }>("/api/settings/test-connection", jsonInit("POST", {}));
}

// The four ways the CLI can fail, each kept as its own sentence because each
// has its own remedy (install it / read its login state / raise the budget /
// re-run an off-format answer) — the server refuses to collapse them into one
// code for that reason (CLAUDE_CLI_ERRORS, src/server/tailor/claude-cli.ts),
// so this client must not collapse them into one sentence either. An
// unrecognised code says only what it knows, never `err.message` raw.
const CLAUDE_CLI_ERROR_COPY: Record<string, string> = {
  claude_cli_binary_missing:
    "No claude binary on the server's PATH — install the Claude Code CLI where Lede runs.",
  claude_cli_exit:
    "The claude CLI exited with an error — check that it is signed in on the server.",
  claude_cli_timeout: "The claude CLI did not answer in time.",
  claude_cli_bad_output: "The claude CLI answered in a format Lede could not read.",
  provider_not_testable: "Only Claude Code (CLI) has a connection to test.",
};

export function claudeCliErrorMessage(code: string | undefined): string {
  const fallback = "Could not reach the claude CLI.";
  return code ? (CLAUDE_CLI_ERROR_COPY[code] ?? fallback) : fallback;
}

// ── backup (spec.md §27) — full-instance export/import: library + profile + applications ──
export type BackupPayload = {
  entries: Entry[];
  profile: Profile;
  applications: Application[];
};

export async function exportAll(): Promise<BackupPayload> {
  return request<BackupPayload>("/api/export");
}

export async function importAll(
  payload: Partial<BackupPayload>,
): Promise<{ imported: { entries: number; profile: number; applications: number } }> {
  return request("/api/import", jsonInit("POST", payload));
}
