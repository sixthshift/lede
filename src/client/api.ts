// Typed client for the tailor + entries/profile/settings endpoints (spec.md §9, §15).
// Every non-2xx response throws ApiError{status,code,message}; `code` carries
// the server's `error` string verbatim (e.g. "key_invalid", "no_api_key") so
// later tickets can switch on it (401→LoginGate, 400 no_api_key→Settings).

import type { TailoredResume, Entry, Profile, Layout, Section, Application } from "@shared/types";
import type { z } from "zod";
import type {
  entryInput,
  profileInput,
  settingsInput,
  applicationCreate,
  applicationUpdate,
} from "@shared/schema";

export type EntryInput = z.infer<typeof entryInput>;
export type ProfileInput = z.infer<typeof profileInput>;
export type SettingsInput = z.infer<typeof settingsInput>;
export type ApplicationCreateInput = z.infer<typeof applicationCreate>;
export type ApplicationUpdateInput = z.infer<typeof applicationUpdate>;
// The list endpoint omits the heavy current/locked TailoredResume snapshots (§9).
export type ApplicationListItem = Omit<Application, "current" | "locked">;
export type SettingsResponse = {
  keySet: boolean;
  provider: string;
  model: string;
  baseUrl: string | null;
  layout: Layout;
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

export async function tailor(jobDescription: string): Promise<TailoredResume> {
  return request<TailoredResume>("/api/tailor", jsonInit("POST", { jobDescription }));
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

export async function tailorApplication(id: string): Promise<Application> {
  return request<Application>(
    `/api/applications/${encodeURIComponent(id)}/tailor`,
    jsonInit("POST", {}),
  );
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

// ── BYOK provider key (spec.md §8) — write-only: the server never returns
// the key value, only `keySet`. There is nothing here to fetch or display.
export async function setApiKey(apiKey: string): Promise<{ keySet: true }> {
  return request<{ keySet: true }>("/api/settings/key", jsonInit("PUT", { apiKey }));
}

export async function deleteApiKey(): Promise<{ keySet: false }> {
  return request<{ keySet: false }>("/api/settings/key", { method: "DELETE" });
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
