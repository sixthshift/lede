// Identity editor for the resume header — spec.md §16. Edits the Profile
// singleton (name/headline/email/phone/location/links/baseSummary) only;
// selection/ordering of resume content is out of scope here.

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Profile } from "@shared/types";
import type { ProfileInput } from "../api";
import { useProfile, useUpdateProfile } from "../hooks/queries";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
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

export function ProfileEditor({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();

  const [state, setState] = useState<FormState>(() => toFormState(profile));
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setState(toFormState(profile));
      setError(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, profile]);

  function addLink() {
    if (state.links.length >= MAX_LINKS) return;
    setState((prev) => ({ ...prev, links: [...prev.links, { type: "other", label: "", url: "" }] }));
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
      links: state.links.map((link) => ({ type: link.type, label: link.label.trim(), url: link.url.trim() })),
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="profile-name">Name</Label>
            <Input id="profile-name" value={state.name} onChange={(e) => setState((prev) => ({ ...prev, name: e.target.value }))} />
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
            <Input id="profile-email" value={state.email} onChange={(e) => setState((prev) => ({ ...prev, email: e.target.value }))} />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="profile-phone">Phone</Label>
            <Input id="profile-phone" value={state.phone} onChange={(e) => setState((prev) => ({ ...prev, phone: e.target.value }))} />
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
              <Button type="button" variant="outline" size="sm" disabled={state.links.length >= MAX_LINKS} onClick={addLink}>
                Add link
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              {state.links.map((link, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select value={link.type} onValueChange={(value) => updateLink(i, { type: value as LinkRow["type"] })}>
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

          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button type="submit" disabled={updateProfile.isPending}>
              Save profile
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
