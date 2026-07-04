// TanStack Query hooks for /api/applications — spec.md §27. Keys:
// ['applications'] for the list, ['applications', id] for a detail record.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  listApplications,
  createApplication,
  getApplication,
  updateApplication,
  deleteApplication,
  tailorApplication,
} from "../api";
import type { ApplicationCreateInput, ApplicationUpdateInput } from "../api";

export function useApplications() {
  return useQuery({ queryKey: ["applications"] as const, queryFn: listApplications });
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: ["applications", id] as const,
    queryFn: () => getApplication(id),
    enabled: Boolean(id),
  });
}

export function useCreateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ApplicationCreateInput) => createApplication(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}

export function useUpdateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ApplicationUpdateInput }) =>
      updateApplication(id, input),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["applications", updated.id] });
    },
  });
}

export function useDeleteApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteApplication(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}

export function useTailorApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tailorApplication(id),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["applications", updated.id] });
    },
  });
}
