// Library actions — spec.md §13. Add/Import/Export wiring (editor dialog,
// file I/O) lands in E1-F2; these are plumbing stubs until then.

import { Button } from "./ui/button";

export function LibraryToolbar() {
  return (
    <div className="mb-4 flex gap-2">
      <Button size="sm" disabled title="Coming soon">
        Add
      </Button>
      <Button variant="outline" size="sm" disabled title="Coming soon">
        Import
      </Button>
      <Button variant="outline" size="sm" disabled title="Coming soon">
        Export
      </Button>
    </div>
  );
}
