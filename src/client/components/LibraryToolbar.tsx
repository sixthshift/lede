// Library actions — spec.md §13. Import and Export are wired to the
// full-instance backup endpoints (§27); adding entries lives in LibraryView.

import { useRef, useState } from "react";
import { toast } from "sonner";
import { exportAll, importAll } from "../api";
import { Button } from "./ui/button";

export function LibraryToolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  // T040/F401: import is failure-prone (a malformed or schema-invalid backup
  // file) — its failure surfaces INLINE beside the Import control (the
  // flagVoice pattern), never as a toast. Success is the toast; the two are
  // mutually exclusive per attempt.
  const [importError, setImportError] = useState<string | undefined>(undefined);

  async function handleExport() {
    const backup = await exportAll();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "lede-backup.json";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Backup exported");
  }

  function readAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportError(undefined);
    try {
      const payload = JSON.parse(await readAsText(file));
      await importAll(payload);
      toast.success("Library imported");
    } catch {
      // Covers both a non-JSON file (client-side parse) and a server
      // rejection of a schema-invalid backup — either way the file is bad, so
      // one inline message beside the trigger, and no success toast.
      setImportError("Couldn't import that file — check it's a Lede backup.");
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => fileInputRef.current?.click()}
        >
          Import
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleFileSelected}
        />
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={handleExport}>
          Export
        </Button>
      </div>
      {importError ? (
        <p role="alert" data-testid="import-error" className="text-xs text-destructive">
          {importError}
        </p>
      ) : null}
    </div>
  );
}
