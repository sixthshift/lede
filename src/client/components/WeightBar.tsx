// Renders JDSignals — spec.md §11. Reasoning UI only; never printed.

import type { JDSignals } from "@shared/types";
import { Badge } from "./ui/badge";

export function WeightBar({ signals }: { signals: JDSignals }) {
  return (
    <div className="weight-bar">
      <div className="weight-bar__row">
        <span className="weight-bar__label">Role level</span>
        <Badge variant="outline">{signals.roleLevel}</Badge>
      </div>

      {signals.weights.length > 0 ? (
        <div className="weight-bar__row">
          <span className="weight-bar__label">Weighted on</span>
          <ol className="weight-bar__chips">
            {signals.weights.map((weight) => (
              <li key={weight}>
                <Badge variant="secondary">{weight}</Badge>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {signals.hardRequirements.length > 0 ? (
        <div className="weight-bar__row">
          <span className="weight-bar__label">Hard requirements</span>
          <div className="weight-bar__chips">
            {signals.hardRequirements.map((req) => (
              <Badge key={req} variant="destructive">
                {req}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
