// Model selector — spec.md §6.1. Scoped to the chosen provider's model list
// (@shared/providers); openai-compatible has no fixed list, so the picker
// disables itself rather than offering choices the server can't resolve.
import { PROVIDERS } from "@shared/providers";
import type { ProviderId } from "@shared/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export function ModelPicker({
  provider,
  value,
  onChange,
}: {
  provider: ProviderId;
  value: string;
  onChange: (model: string) => void;
}) {
  const models = PROVIDERS[provider].models;

  return (
    <Select value={value} onValueChange={onChange} disabled={models.length === 0}>
      <SelectTrigger aria-label="Model" className="w-56">
        <SelectValue placeholder={models.length === 0 ? "No preset models" : undefined} />
      </SelectTrigger>
      <SelectContent>
        {models.map((model) => (
          <SelectItem key={model} value={model}>
            {model}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
