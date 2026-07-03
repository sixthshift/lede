// TanStack Query hooks — spec.md §13/§14. Query state lives here only; no
// global store (Zustand) per §14. Keys: ['entries'], ['profile'], ['settings'].

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Section } from "@shared/types";
import {
  fetchEntries,
  deleteEntry,
  createEntry,
  updateEntry,
  fetchProfile,
  updateProfile,
  fetchSettings,
  updateSettings,
  authSetup,
  authLogin,
  authLogout,
  setApiKey,
  deleteApiKey,
} from "../api";
import type { EntryInput, ProfileInput, SettingsInput } from "../api";

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
    },
  });
}

export function useUpdateEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: EntryInput }) => updateEntry(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entries"] });
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
    },
  });
}

export function useSettings() {
  return useQuery({ queryKey: ["settings"] as const, queryFn: fetchSettings });
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
