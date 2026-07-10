// Identity editor for the resume header — spec.md §16. Edits the Profile
// singleton (name/headline/email/phone/location/links/baseSummary) only;
// selection/ordering of resume content is out of scope here.
//
// Non-modal by construction (v3-T023, same approach as v3-T020's
// NewApplication / v3-T021's EntryEditor / v3-T022's LayoutEditor): built
// directly on @radix-ui/react-dialog's `modal={false}` mode rather than the
// shared ui/dialog.tsx wrapper (which stays modal for its other, legitimately
// -modal consumers). `modal={false}` skips the overlay entirely and disables
// the focus trap/outside-pointer lock.
//
// Like LayoutEditor, this panel has no owned trigger of its own — LibraryView
// opens it from its single "Edit profile" button and passes `triggerRef` (the
// button captured at click time) so focus can be restored to it on close.
//
// Like LayoutEditor's rows (and unlike EntryEditor's fields, populated
// synchronously from a prop), this form's state comes from useProfile() —
// the profile query can still be loading the first time this panel opens
// (LibraryView never warms that query before then). Focus is driven by an
// effect keyed on `open` AND the profile query having resolved, so it lands
// as soon as the form is populated with real data, whenever that is.
import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { Profile } from "@shared/types";
import type { ProfileInput } from "../api";
import { useDeleteVoiceSource, useProfile, useUpdateProfile } from "../hooks/queries";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";

const MAX_LINKS = 8;

type LinkRow = { type: "github" | "linkedin" | "site" | "other"; label: string; url: string };

type FormState = {
  name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  links: LinkRow[];
  baseSummary: string;
};

function toFormState(profile: Profile | undefined): FormState {
  return {
    name: profile?.name ?? "",
    headline: profile?.headline ?? "",
    email: profile?.email ?? "",
    phone: profile?.phone ?? "",
    location: profile?.location ?? "",
    links: profile?.links ? [...profile.links] : [],
    baseSummary: profile?.baseSummary ?? "",
  };
}

// ── voice sources (§ voice-source epic, T44) — LOCKED: flagging an
// application's own resume/letter output is the ONLY door in (see
// ApplicationDetail.tsx's "Use as a voice source" buttons); there is
// deliberately no add-by-typing affordance here, unlike the Links list above
// this replicates the shape of (list existing + delete each) but never the
// add-a-blank-row half of that pattern. Reads straight off the live
// `profile` query rather than the form's local `state` — a delete is its own
// round-trip, not something the Save-profile submit batches. ──
function VoiceSourcesSection({ profile }: { profile: Profile | undefined }) {
  const deleteVoiceSource = useDeleteVoiceSource();
  const sources = profile?.voiceSources ?? [];

  return (
    <div className="flex flex-col gap-2">
      <Label>Voice sources</Label>
      <p className="text-xs text-muted-foreground">
        Captured by flagging a cover letter or resume from an application — there's no way to add
        one directly here.
      </p>

      {sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">No voice sources yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sources.map((source) => (
            <div
              key={source.id}
              data-testid={`voice-source-${source.id}`}
              className="flex items-center gap-2"
            >
              <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                {source.kind}
              </span>
              <span className="flex-1 truncate text-sm">{source.text.slice(0, 80)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Delete voice source (${source.kind})`}
                data-testid={`delete-voice-source-${source.id}`}
                disabled={deleteVoiceSource.isPending}
                onClick={() => deleteVoiceSource.mutate(source.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProfileEditor({
  open,
  onOpenChange,
  triggerRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The control that opened this instance, focused back manually on close
   * (see file header comment — same contract as LayoutEditor's triggerRef). */
  triggerRef?: React.RefObject<HTMLElement | null>;
}) {
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();

  const [state, setState] = useState<FormState>(() => toFormState(profile));
  const [error, setError] = useState<string | undefined>(undefined);
  const nameFieldRef = useRef<HTMLInputElement>(null);
  const profileLoaded = Boolean(profile);

  useEffect(() => {
    if (open) {
      setState(toFormState(profile));
      setError(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, profile]);

  // Land focus on the Name field once the profile query has actually
  // resolved — it may still be loading at the instant the panel opens.
  // Deferred one frame: useProfile() is usually already warm (this panel is
  // always mounted in LibraryView), so this effect typically fires in the
  // same commit as the panel's mount, where a synchronous focus races Radix's
  // own mount-focus settling and gets reset. The rAF lands it after.
  useEffect(() => {
    if (open && profileLoaded) {
      const raf = requestAnimationFrame(() => nameFieldRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
  }, [open, profileLoaded]);

  function addLink() {
    if (state.links.length >= MAX_LINKS) return;
    setState((prev) => ({
      ...prev,
      links: [...prev.links, { type: "other", label: "", url: "" }],
    }));
  }

  function updateLink(i: number, patch: Partial<LinkRow>) {
    setState((prev) => ({
      ...prev,
      links: prev.links.map((link, idx) => (idx === i ? { ...link, ...patch } : link)),
    }));
  }

  function removeLink(i: number) {
    setState((prev) => ({ ...prev, links: prev.links.filter((_, idx) => idx !== i) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!state.name.trim() || !state.email.trim()) {
      setError("Name and email are required.");
      return;
    }

    const payload: ProfileInput = {
      name: state.name.trim(),
      headline: state.headline.trim() || undefined,
      email: state.email.trim(),
      phone: state.phone.trim() || undefined,
      location: state.location.trim() || undefined,
      links: state.links.map((link) => ({
        type: link.type,
        label: link.label.trim(),
        url: link.url.trim(),
      })),
      baseSummary: state.baseSummary.trim() || undefined,
    };

    try {
      await updateProfile.mutateAsync(payload);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogPrimitive.Content
        className="fixed right-6 top-6 z-20 flex max-h-[85vh] w-[30rem] max-w-[90vw] flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-lg"
        onOpenAutoFocus={(e) => {
          // Focus is actually driven by the effect above (the profile query
          // may not have resolved yet at this instant) — just keep Radix
          // from focusing the panel container itself.
          e.preventDefault();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          triggerRef?.current?.focus();
        }}
      >
        <div className="flex items-start justify-between">
          <DialogPrimitive.Title className="text-lg font-semibold leading-none tracking-tight text-foreground">
            Edit profile
          </DialogPrimitive.Title>
          <DialogPrimitive.Close asChild>
            <button
              type="button"
              className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          </DialogPrimitive.Close>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              ref={nameFieldRef}
              value={state.name}
              onChange={(e) => setState((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="profile-headline">Headline</Label>
            <Input
              id="profile-headline"
              value={state.headline}
              onChange={(e) => setState((prev) => ({ ...prev, headline: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="profile-email">Email</Label>
            <Input
              id="profile-email"
              value={state.email}
              onChange={(e) => setState((prev) => ({ ...prev, email: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="profile-phone">Phone</Label>
            <Input
              id="profile-phone"
              value={state.phone}
              onChange={(e) => setState((prev) => ({ ...prev, phone: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="profile-location">Location</Label>
            <Input
              id="profile-location"
              value={state.location}
              onChange={(e) => setState((prev) => ({ ...prev, location: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Links</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={state.links.length >= MAX_LINKS}
                onClick={addLink}
              >
                Add link
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              {state.links.map((link, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: link rows are controlled by index (updateLink(i, …)); no stable id in the profile data model
                <div key={i} className="flex items-center gap-2">
                  <Select
                    value={link.type}
                    onValueChange={(value) => updateLink(i, { type: value as LinkRow["type"] })}
                  >
                    <SelectTrigger aria-label={`Link ${i + 1} type`} className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="github">GitHub</SelectItem>
                      <SelectItem value="linkedin">LinkedIn</SelectItem>
                      <SelectItem value="site">Site</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    aria-label={`Link ${i + 1} label`}
                    placeholder="Label"
                    value={link.label}
                    onChange={(e) => updateLink(i, { label: e.target.value })}
                  />
                  <Input
                    aria-label={`Link ${i + 1} url`}
                    placeholder="URL"
                    value={link.url}
                    onChange={(e) => updateLink(i, { url: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove link ${i + 1}`}
                    onClick={() => removeLink(i)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="profile-summary">Base summary</Label>
            <Textarea
              id="profile-summary"
              value={state.baseSummary}
              onChange={(e) => setState((prev) => ({ ...prev, baseSummary: e.target.value }))}
            />
          </div>

          <VoiceSourcesSection profile={profile} />

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-2">
            <Button type="submit" disabled={updateProfile.isPending}>
              Save profile
            </Button>
          </div>
        </form>
      </DialogPrimitive.Content>
    </DialogPrimitive.Root>
  );
}
