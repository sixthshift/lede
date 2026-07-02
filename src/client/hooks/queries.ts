// TanStack Query hooks — spec.md §13/§14. Query state lives here only; no
// global store (Zustand) per §14. Keys: ['entries'], ['profile'], ['settings'].

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Section } from "@shared/types";
import { fetchEntries, deleteEntry, createEntry, updateEntry, fetchProfile, fetchSettings } from "../api";
import type { EntryInput } from "../api";

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

// Stubs — E1-F3 (settings) extends these with mutations.
export function useProfile() {
  return useQuery({ queryKey: ["profile"] as const, queryFn: fetchProfile });
}

export function useSettings() {
  return useQuery({ queryKey: ["settings"] as const, queryFn: fetchSettings });
}
