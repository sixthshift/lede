// Default DocumentFormat — spec.md §28.3. Instance-level fallback for
// `settings.defaultFormat`; per-application `format` overrides start here.
import type { DocumentFormat } from "@shared/types";

export const DEFAULT_FORMAT: DocumentFormat = {
  templateId: "strict",
  typography: {
    body: { family: "ibm-plex-sans", size: 10, lineHeight: 1.4 },
    heading: { family: "ibm-plex-sans", weight: 600 },
  },
  colors: { primary: "#1a1a2e", text: "#111111" },
  page: { marginX: 40, marginY: 36, sectionGap: 8 }, // matches the current strict template's paddings
  photo: { hidden: true, size: 64, shape: "circle" },
  sections: {},
};
