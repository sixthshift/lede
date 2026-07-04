// Library actions — spec.md §13. Add is a plumbing stub until E1-F2; Import
// and Export are wired to the full-instance backup endpoints (§27).

import { useRef } from "react";
import { exportAll, importAll } from "../api";
import { Button } from "./ui/button";

export function LibraryToolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    const backup = await exportAll();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "lede-backup.json";
    link.click();
    URL.revokeObjectURL(url);
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
    const payload = JSON.parse(await readAsText(file));
    await importAll(payload);
  }

  return (
    <div className="mb-4 flex gap-2">
      <Button size="sm" disabled title="Coming soon">
        Add
      </Button>
      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
        Import
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleFileSelected}
      />
      <Button variant="outline" size="sm" onClick={handleExport}>
        Export
      </Button>
    </div>
  );
}
