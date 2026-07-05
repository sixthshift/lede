// Settings route — spec.md §9/§4.2/§8. Provider and model changes save
// immediately via PUT /api/settings; the BYOK key has its own write-only
// sub-form (ApiKeyForm) since it never round-trips a value.
import { PROVIDERS } from "@shared/providers";
import { DEFAULT_FORMAT } from "@shared/format";
import type { DocumentFormat, ProviderId } from "@shared/types";

import { useSettings, useUpdateSettings } from "../hooks/queries";
import { ApiKeyForm } from "./ApiKeyForm";
import { DesignPanel } from "./DesignPanel";
import { ModelPicker } from "./ModelPicker";
import { ProviderPicker } from "./ProviderPicker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Skeleton } from "./ui/skeleton";

export function SettingsView() {
  const settingsQuery = useSettings();
  const updateSettings = useUpdateSettings();

  if (settingsQuery.isPending) {
    return (
      <div className="flex max-w-2xl flex-col gap-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }
  if (settingsQuery.isError || !settingsQuery.data) {
    return <p className="text-sm text-destructive">Could not load settings.</p>;
  }

  const { provider, model, keySet, defaultFormat } = settingsQuery.data;

  function handleProviderChange(nextProvider: ProviderId) {
    updateSettings.mutate({ provider: nextProvider, model: PROVIDERS[nextProvider].default });
  }

  function handleModelChange(nextModel: string) {
    updateSettings.mutate({ model: nextModel });
  }

  function handleDefaultFormatChange(next: DocumentFormat) {
    updateSettings.mutate({ defaultFormat: next });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The provider, model, and key Lede uses to tailor.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-md">Provider &amp; model</CardTitle>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-md">API key</CardTitle>
          <CardDescription>
            Stored encrypted on the server and never shown again — you bring your own key for the
            provider above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApiKeyForm keySet={keySet} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-md">Default document format</CardTitle>
          <CardDescription>
            The starting look for a new application — any application can override it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DesignPanel
            format={defaultFormat ?? DEFAULT_FORMAT}
            onChange={handleDefaultFormatChange}
          />
        </CardContent>
      </Card>
    </div>
  );
}
