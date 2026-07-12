// TanStack Query hooks for /api/applications — spec.md §27. Keys:
// ['applications'] for the list, ['applications', id] for a detail record.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  listApplications,
  createApplication,
  getApplication,
  updateApplication,
  deleteApplication,
  duplicateApplication,
  tailorApplication,
  generateLetter,
  undoLetter,
  lockApplication,
  unlockApplication,
  patchResumePart,
  patchLetterPart,
  insertLetterParagraph,
  removeLetterParagraph,
  createBlankLetter,
  flagVoice,
} from "../api";
import type {
  ApplicationCreateInput,
  ApplicationUpdateInput,
  ResumePartPatchInput,
  LetterPartPatchInput,
} from "../api";

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
      // T040/F401: one success toast per named mutation, fired in the hook
      // whose onSuccess is 1:1 with the action (create fires exactly once per
      // created application). A failed create surfaces at its own call-site,
      // never here.
      toast.success("Application created");
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
      toast.success("Application deleted");
    },
  });
}

// T031 (dashboard quick actions, OQ4b/CO-2) — the response is just the new
// id; the list refetch (invalidated below) is what surfaces the duplicate's
// full card content, same pattern as useCreateApplication.
export function useDuplicateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => duplicateApplication(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      toast.success("Application duplicated");
    },
  });
}

// F105: invalidates on SETTLED, not just onSuccess — a 422 (fixture-engine
// rejection) still persists `genState: "failed"` server-side (see
// routes/applications.ts's /tailor catch block), and the inline error +
// failure badge both need that refetch on the SAME screen, not only the
// happy path. `variables` (the id passed to `.mutate`) stands in for the
// response body, which doesn't exist on the error branch.
export function useTailorApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tailorApplication(id),
    onSettled: (_updated, _error, id) => {
      queryClient.invalidateQueries({ queryKey: ["applications", id] });
    },
  });
}

export function useGenerateLetter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => generateLetter(id),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["applications", updated.id] });
    },
  });
}

export function useUndoLetter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => undoLetter(id),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["applications", updated.id] });
    },
  });
}

export function useLockApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => lockApplication(id),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["applications", updated.id] });
    },
  });
}

export function useUnlockApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unlockApplication(id),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["applications", updated.id] });
    },
  });
}

// ── T31/T32 in-place text editing — each mutation invalidates only the one
// application's detail query (mirrors useTailorApplication/useLockApplication
// above): the PATCH/POST/DELETE response is the full updated row, so
// invalidating triggers exactly the refetch the UI needs to reflect it. ──
export function usePatchResumePart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ResumePartPatchInput }) =>
      patchResumePart(id, input),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["applications", updated.id] });
    },
  });
}

export function usePatchLetterPart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: LetterPartPatchInput }) =>
      patchLetterPart(id, input),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["applications", updated.id] });
    },
  });
}

export function useInsertLetterParagraph() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, position, text }: { id: string; position: number; text: string }) =>
      insertLetterParagraph(id, position, text),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["applications", updated.id] });
    },
  });
}

export function useRemoveLetterParagraph() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, index }: { id: string; index: number }) => removeLetterParagraph(id, index),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["applications", updated.id] });
    },
  });
}

// ── T32 blank letter — the retroactive-import entry point (create app ->
// blank letter -> hand-author -> flag). No model call. ──
export function useCreateBlankLetter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => createBlankLetter(id),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["applications", updated.id] });
    },
  });
}

// ── T44 flag-voice — the ONLY door into profile.voiceSources. Permitted on a
// locked application (flagging copies, never edits), so this is never gated
// on isLocked by its callers. Invalidates ['profile'] (not the application,
// which flagging never mutates) so ProfileEditor's voice-sources list
// refreshes. ──
export function useFlagVoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: "cover-letter" | "resume" }) =>
      flagVoice(id, kind),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}
