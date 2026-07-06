// Sample content for the template picker (spec.md §28.2, decided 2026-07-05:
// previews are LIVE renders of this application's tailored resume, never
// static images). Before an application has been tailored there is no real
// TailoredResume to show yet — TemplatePicker falls back to this fixture so
// every card can still render a live document, not a placeholder image.
//
// Deliberately generic ("Alex Sample") and deliberately inert:
// leadRationale/cut are omitted/empty, so there is nothing reasoning-shaped
// for a document render to ever expose (§11's "never reaches the document"
// invariant holds trivially here — there's nothing to leak).

import type { Profile, TailoredResume } from "@shared/types";

export const SAMPLE_PROFILE: Profile = {
  name: "Alex Sample",
  headline: "Senior Software Engineer",
  email: "alex@example.com",
  phone: "555-0100",
  location: "Remote",
  links: [{ type: "github", label: "github.com/alexsample", url: "https://github.com/alexsample" }],
};

export const SAMPLE_RESUME: TailoredResume = {
  signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
  summary: "A generalist engineer who ships reliable systems and works well across teams.",
  sections: [
    {
      section: "experience",
      groups: [
        {
          heading: "Sample Company · Senior Engineer · 2022–Present",
          items: [
            {
              entryId: "sample-experience-1",
              text: "Led a cross-team migration to a new platform.",
            },
            {
              entryId: "sample-experience-2",
              text: "Improved service reliability and reduced on-call load.",
            },
          ],
        },
        {
          heading: "Other Company · Engineer · 2019–2022",
          items: [
            { entryId: "sample-experience-3", text: "Built and maintained core product features." },
          ],
        },
      ],
    },
    {
      section: "skill",
      groups: [
        {
          items: [
            { entryId: "sample-skill-1", text: "TypeScript" },
            { entryId: "sample-skill-2", text: "System design" },
            { entryId: "sample-skill-3", text: "Team leadership" },
          ],
        },
      ],
    },
  ],
  cut: [],
};
