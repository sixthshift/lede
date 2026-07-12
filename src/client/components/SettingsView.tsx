// Settings route — spec.md §9/§4.2/§8. Provider and model changes save
// immediately via PUT /api/settings; the BYOK key has its own write-only
// sub-form (ApiKeyForm) since it never round-trips a value.
//
// v3-T041: rendered inside WorkspaceShell (rail | editor, no preview — a
// non-doc surface degrades, §locked constraints). The rail is nav-only over
// the SAME three section cards the editor pane renders below, in the SAME
// fixed order (no second ordering source) — the identical nav-without-reorder
// contract LibraryView's rail (v3-T040) and ApplicationDetail's rail
// (§WORKSPACE_SECTIONS there) already established.
import { useRef } from "react";
import { PROVIDERS } from "@shared/providers";
import { DEFAULT_FORMAT_V2, type DocumentFormatV2 } from "@shared/format-v2";
import type { ProviderId } from "@shared/types";

import { useSettings, useUpdateSettings } from "../hooks/queries";
import { ApiKeyForm } from "./ApiKeyForm";
import { DesignPanel } from "./DesignPanel";
import { ModelPicker } from "./ModelPicker";
import { ProviderPicker } from "./ProviderPicker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { WorkspaceShellSurface } from "./WorkspaceShellSlots";

const SETTINGS_SECTIONS = [
  { key: "provider", label: "Provider & model" },
  { key: "apiKey", label: "API key" },
  { key: "format", label: "Default document format" },
] as const;
type SettingsSectionKey = (typeof SETTINGS_SECTIONS)[number]["key"];

export function SettingsView() {
  const settingsQuery = useSettings();
  const updateSettings = useUpdateSettings();

  const sectionRefs = useRef<Partial<Record<SettingsSectionKey, HTMLDivElement | null>>>({});
  function navigateToSection(key: SettingsSectionKey) {
    sectionRefs.current[key]?.scrollIntoView({ block: "start" });
  }

  // F205/T021 one-title convention: the surface title lives ONLY in the
  // editor pane's h1 (below) — the rail no longer renders it. What stays in
  // the rail is the section zone, under the same mono-caps "SECTIONS"
  // micro-label the detail surface's rail uses (one visual language across
  // surfaces).
  const rail = (
    <div className="flex flex-col gap-2 p-4">
      <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">SECTIONS</p>
      <nav aria-label="Sections" data-testid="rail-nav" className="flex flex-col gap-1">
        {SETTINGS_SECTIONS.map((section) => (
          <button
            key={section.key}
            type="button"
            data-testid={`rail-nav-${section.key}`}
            onClick={() => navigateToSection(section.key)}
            className="truncate rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-[var(--ring-weak)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {section.label}
          </button>
        ))}
      </nav>
    </div>
  );

  let editorContent: React.ReactNode;
  if (settingsQuery.isPending) {
    editorContent = (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  } else if (settingsQuery.isError || !settingsQuery.data) {
    editorContent = <p className="text-sm text-destructive">Could not load settings.</p>;
  } else {
    const { provider, model, keySet, defaultFormat } = settingsQuery.data;

    function handleProviderChange(nextProvider: ProviderId) {
      updateSettings.mutate({ provider: nextProvider, model: PROVIDERS[nextProvider].default });
    }

    function handleModelChange(nextModel: string) {
      updateSettings.mutate({ model: nextModel });
    }

    function handleDefaultFormatChange(next: DocumentFormatV2) {
      updateSettings.mutate({ defaultFormat: next });
    }

    editorContent = (
      <div className="flex flex-col gap-6">
        <div ref={(el) => (sectionRefs.current.provider = el)}>
          <Card data-testid="settings-card">
            <CardHeader>
              <CardTitle as="h2" className="text-md">
                Provider &amp; model
              </CardTitle>
              <CardDescription>Every tailor call runs against this model.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <ProviderPicker value={provider as ProviderId} onChange={handleProviderChange} />
                <ModelPicker
                  provider={provider as ProviderId}
                  value={model}
                  onChange={handleModelChange}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div ref={(el) => (sectionRefs.current.apiKey = el)}>
          <Card data-testid="settings-card">
            <CardHeader>
              <CardTitle as="h2" className="text-md">
                API key
              </CardTitle>
              <CardDescription>
                Stored encrypted on the server and never shown again — you bring your own key for
                the provider above.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ApiKeyForm keySet={keySet} />
            </CardContent>
          </Card>
        </div>

        <div ref={(el) => (sectionRefs.current.format = el)}>
          <Card data-testid="settings-card">
            <CardHeader>
              <CardTitle as="h2" className="text-md">
                Default document format
              </CardTitle>
              <CardDescription>
                The starting look for a new application — any application can override it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DesignPanel
                format={defaultFormat ?? DEFAULT_FORMAT_V2}
                onChange={handleDefaultFormatChange}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // v4-T053 (F506): the settings column is centered in the editor pane
  // (`mx-auto`) rather than left-anchored — at a wide viewport a left-pinned
  // max-w-2xl column left ~640px of dead space to its right. Centering is
  // measured within the editor pane (the column's actual scroll container),
  // since the persistent rail offsets the pane from the viewport's left edge.
  const editor = (
    <div data-testid="settings-column" className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The provider, model, and key Lede uses to tailor.
        </p>
      </div>
      {editorContent}
    </div>
  );

  // v3-T050: see ApplicationDetail.tsx's identical comment — this either
  // portals `rail` into the hoisted App.tsx shell or falls back to an
  // embedded WorkspaceShell standalone. No preview (a non-doc surface
  // degrades).
  return <WorkspaceShellSurface rail={rail} editor={editor} />;
}
