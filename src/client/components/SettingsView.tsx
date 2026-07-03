// Settings route — spec.md §9/§4.2/§8. Replaces the E1-F1 stub. Provider and
// model changes save immediately via PUT /api/settings; the BYOK key has its
// own write-only sub-form (ApiKeyForm) since it never round-trips a value.
import { PROVIDERS } from "@shared/providers";
import type { ProviderId } from "@shared/types";

import { useAuthLogout, useSettings, useUpdateSettings } from "../hooks/queries";
import { ApiKeyForm } from "./ApiKeyForm";
import { ModelPicker } from "./ModelPicker";
import { ProviderPicker } from "./ProviderPicker";
import { Button } from "./ui/button";

export function SettingsView() {
  const settingsQuery = useSettings();
  const updateSettings = useUpdateSettings();
  const logout = useAuthLogout();

  if (settingsQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Loading settings…</p>;
  }
  if (settingsQuery.isError || !settingsQuery.data) {
    return <p className="text-sm text-destructive">Could not load settings.</p>;
  }

  const { provider, model, keySet } = settingsQuery.data;

  function handleProviderChange(nextProvider: ProviderId) {
    updateSettings.mutate({ provider: nextProvider, model: PROVIDERS[nextProvider].default });
  }

  function handleModelChange(nextModel: string) {
    updateSettings.mutate({ model: nextModel });
  }

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Provider &amp; model</h2>
        <div className="flex flex-wrap gap-3">
          <ProviderPicker value={provider as ProviderId} onChange={handleProviderChange} />
          <ModelPicker provider={provider as ProviderId} value={model} onChange={handleModelChange} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">API key</h2>
        <ApiKeyForm keySet={keySet} />
      </section>

      <Button type="button" variant="outline" className="w-fit" onClick={() => logout.mutate()}>
        Log out
      </Button>
    </div>
  );
}
