// TanStack Query hooks — spec.md §13/§14. Query state lives here only; no
// global store (Zustand) per §14. Keys: ['entries'], ['profile'], ['settings'].

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Section } from "@shared/types";
import type { UserPreset } from "@shared/schema";
import {
  fetchEntries,
  deleteEntry,
  createEntry,
  updateEntry,
  fetchProfile,
  updateProfile,
  deleteVoiceSource,
  fetchSettings,
  updateSettings,
  authSetup,
  authLogin,
  authLogout,
  setApiKey,
  deleteApiKey,
} from "../api";
import type { EntryInput, ProfileInput, SettingsInput, SettingsResponse } from "../api";

// The server's GET/PUT /api/settings has round-tripped `presets` since
// E9-F5b (src/server/routes/settings.ts's currentSettings), but api.ts's
// SettingsResponse type — outside this ticket's declared files — was never
// widened to say so. Widened here instead, at the query boundary, rather
// than touching api.ts: every consumer of useSettings() sees the field its
// server response has actually always carried.
type SettingsWithPresets = SettingsResponse & { presets: UserPreset[] };

export function useEntries(section?: Section) {
  return useQuery({
    queryKey: section ? (["entries", section] as const) : (["entries"] as const),
    queryFn: () => fetchEntries(section),
  });
}

export function useDeleteEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
  });
}

export function useCreateEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EntryInput) => createEntry(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      // T040/F401: "entry save" is one named mutation across both doors
      // (create + update) — same message, each fired in the hook 1:1 with a
      // saved entry.
      toast.success("Entry saved");
    },
  });
}

export function useUpdateEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: EntryInput }) => updateEntry(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      toast.success("Entry saved");
    },
  });
}

export function useProfile() {
  return useQuery({ queryKey: ["profile"] as const, queryFn: fetchProfile });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileInput) => updateProfile(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile saved");
    },
  });
}

// ── T42/T44 voice sources — the delete route is the ONLY door OUT (the
// flag-voice route, src/client/queries/useApplications.ts's useFlagVoice, is
// the only door IN); success invalidates ['profile'] so ProfileEditor's list
// refreshes off the server's own updated row. ──
export function useDeleteVoiceSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vid: string) => deleteVoiceSource(vid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"] as const,
    queryFn: async () => (await fetchSettings()) as SettingsWithPresets,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SettingsInput) => updateSettings(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

// ── auth (spec.md §7/§8) — a login/logout flips access to every protected
// route, so success invalidates the whole cache rather than one key.
export function useAuthSetup() {
  return useMutation({ mutationFn: (password: string) => authSetup(password) });
}

export function useAuthLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => authLogin(password),
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
}

export function useAuthLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authLogout(),
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
}

// ── BYOK provider key (spec.md §8) ──
export function useSetApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (apiKey: string) => setApiKey(apiKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteApiKey(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}
