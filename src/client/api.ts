// Typed client for the tailor + entries/profile/settings endpoints (spec.md §9, §15).
// Every non-2xx response throws ApiError{status,code,message}; `code` carries
// the server's `error` string verbatim (e.g. "key_invalid", "no_api_key") so
// later tickets can switch on it (401→LoginGate, 400 no_api_key→Settings).

import type { TailoredResume, Entry, Profile, Layout, Section } from "@shared/types";
import type { z } from "zod";
import type { entryInput, profileInput, settingsInput } from "@shared/schema";

export type EntryInput = z.infer<typeof entryInput>;
export type ProfileInput = z.infer<typeof profileInput>;
export type SettingsInput = z.infer<typeof settingsInput>;
export type SettingsResponse = { keySet: boolean; provider: string; model: string; baseUrl: string | null; layout: Layout };

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
