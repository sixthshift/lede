// TanStack Query hooks — spec.md §13/§14. Query state lives here only; no
// global store (Zustand) per §14. Keys: ['entries'], ['profile'], ['settings'].

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Section } from "@shared/types";
import { fetchEntries, deleteEntry, fetchProfile, fetchSettings } from "../api";

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

// Stubs — E1-F2 (profile editor) / E1-F3 (settings) extend these with mutations.
export function useProfile() {
  return useQuery({ queryKey: ["profile"] as const, queryFn: fetchProfile });
}

export function useSettings() {
  return useQuery({ queryKey: ["settings"] as const, queryFn: fetchSettings });
}
