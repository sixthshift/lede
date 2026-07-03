// "What got buried" — spec.md §11. Reasoning UI only; never printed.

import type { TailoredResume } from "@shared/types";

export function CutList({ cut }: { cut: TailoredResume["cut"] }) {
  if (cut.length === 0) return null;

  return (
    <div className="cut-list">
      <h3 className="cut-list__heading">What got buried</h3>
      <ul className="cut-list__items">
        {cut.map((entry) => (
          <li key={entry.entryId} className="cut-list__item">
            {entry.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
