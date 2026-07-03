// Provider selector — spec.md §6.1. Options come from the same registry the
// server resolves models against (@shared/providers), so the list can never
// drift from what the server actually supports.
import { PROVIDERS } from "@shared/providers";
import type { ProviderId } from "@shared/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export function ProviderPicker({
  value,
  onChange,
}: {
  value: ProviderId;
  onChange: (provider: ProviderId) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as ProviderId)}>
      <SelectTrigger aria-label="Provider" className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PROVIDER_IDS.map((id) => (
          <SelectItem key={id} value={id}>
            {PROVIDERS[id].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
