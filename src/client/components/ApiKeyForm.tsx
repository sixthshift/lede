// BYOK provider key — spec.md §8. Write-only: the server never returns the
// stored key (GET /api/settings sends only `keySet`), so this form has no
// key value to render, ever — only a status line and an input for a NEW key.
import { useState, type FormEvent } from "react";

import { ApiError } from "../api";
import { useSetApiKey, useDeleteApiKey } from "../hooks/queries";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function ApiKeyForm({ keySet }: { keySet: boolean }) {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const setKey = useSetApiKey();
  const deleteKey = useDeleteApiKey();
  const pending = setKey.isPending || deleteKey.isPending;

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await setKey.mutateAsync(apiKey);
      setApiKey("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save key.");
    }
  }

  async function handleDelete() {
    setError(null);
    try {
      await deleteKey.mutateAsync();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete key.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{keySet ? "A key is set." : "No key set."}</p>

      <form onSubmit={handleSave} className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="api-key-input">{keySet ? "Replace key" : "API key"}</Label>
          <Input
            id="api-key-input"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={keySet ? "Enter a new key to replace it" : "sk-..."}
            disabled={pending}
          />
        </div>
        <Button type="submit" disabled={pending || apiKey.length === 0}>
          Save
        </Button>
        {keySet ? (
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={pending}>
            Delete
          </Button>
        ) : null}
      </form>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
