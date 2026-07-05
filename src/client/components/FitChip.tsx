// Fit ladder chip (spec.md §28.4) — surfaces the exact FitResult that
// produced THIS render: the same density driving both the preview canvas
// and the downloaded PDF. Purely presentational — there is no density
// control here; density is auto-only and never persisted.

import type { FitResult } from "../document/fit";

export function FitChip({ fit }: { fit: FitResult }) {
  const pageWord = fit.pageCount === 1 ? "page" : "pages";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
      Fits {fit.pageCount} {pageWord} · {fit.density}
    </span>
  );
}
