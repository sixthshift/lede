// T004 — CoveragePanel mounted as ApplicationDetail's third view, driven
// against the SAME real recorded fixture signal-coverage.spec.ts/
// ats-view.spec.ts use: login -> create -> tailor -> read real coverage rows
// off the DOM. Bucket membership below is derived BY HAND from the spec's
// all-tokens-present rule (src/shared/content-coverage.ts), not copied from
// classifier output — the same discipline signal-coverage.spec.ts's header
// sets.
//
// ── candidate assembly (assembleCandidates) ──
// signal-derived = raw weights ∪ hardRequirements from
// test/fixtures/decisions/platform-sdk.json's signals (hardRequirements: []):
//   S1 "Designing and shipping a public-facing developer surface"
//   S2 "Creating stable contracts, versioning, and documentation"
//   S3 "Building a client library for external partners"
//   S4 "Collaborating with solutions engineering for early adopter onboarding"
//   S5 "Partnering with product on capability exposure"
// raw-jd-derived = stop-word-filtered unigrams/bigrams from CONTRAST_JDS[0].jd,
// capped at 15, ranked by frequency then first appearance — the JD's first
// sentence alone fills the cap (product, market, saas, opening, outside,
// developers, something, never, offered, before + adjacent bigrams).
//
// ── why in-facts is empty for the SEED library, and how we make a REAL one ──
// A tailored resume necessarily surfaces its grounding experience ON the page,
// so against the 3 seed entries every candidate lands on-page or unsupported
// (confirmed: coordinator escalation, all 3 scenarios). The feature's actual
// in-facts path is a library entry that exists but was NOT surfaced on the
// tailored page — e.g. an entry ADDED AFTER tailoring. The recorded
// platform-sdk decision is keyed on the seed library, so we tailor FIRST
// (library == seed), THEN POST one new experience entry whose `facts` contain
// EVERY match-token (>=2 chars, tokenize) of S1:
//   designing, and, shipping, public, facing, developer, surface
// via facts ["Designing and shipping a public-facing developer surface for
// partner teams"] — all seven tokens present. S1 is absent from the rendered
// document (it was unsupported against seed), so the same-both-sides matcher
// flips it: not on-page, all tokens in the new entry's facts -> IN-FACTS,
// entryIds = [the new entry]. Its human label (experience meta) renders as
// "Northwind · Staff Engineer" — never the raw id slug.
//
// STRONG DISCRIMINATOR: this new entry is NOT the rendered lead item (it isn't
// in the tailored decision at all), so an in-facts hit here can only resolve
// if the classifier scans ALL library entries' facts, not just rendered items.
//
// ── the multi-bucket assertions ──
//   in-facts (positive): S1 row -> bucket in-facts, grounding label present.
//   on-page (absence):   "developers" (raw-jd) is a substring of the summary's
//     "...to internal and external developers." -> on-page -> NEVER an
//     actionable row (bucket 1 isn't reported); asserted absent from the panel.
//   unsupported (present): S3 shares no token with any entry's facts or the
//     page -> unsupported; asserted present.
//
// Shares applications.spec.ts's "applications" project/server (real first-run
// set-password -> login, gate ON; LEDE_TAILOR_ENGINE=fixture) so PASSWORD
// matches that file's exactly — same rationale as ats-view.spec.ts's/
// signal-coverage.spec.ts's identical header comments.
import { test, expect } from "@playwright/test";
import { CONTRAST_JDS } from "../../src/server/tailor/evalcore";
import { login, createApplication, tailor } from "./helpers/workspace";

const PASSWORD = "correct horse battery staple e2e applications";
const JD = CONTRAST_JDS[0]!.jd; // "platform-sdk" scenario — same recorded fixture as applications.spec.ts

const IN_FACTS_SIGNAL = "Designing and shipping a public-facing developer surface"; // S1
const UNSUPPORTED_SIGNAL = "Building a client library for external partners"; // S3
const ON_PAGE_TERM = "developers"; // rendered (summary) -> never an actionable row
const GROUNDING_COMPANY = "Northwind";
const GROUNDING_ROLE = "Staff Engineer";
const GROUNDING_LABEL = `${GROUNDING_COMPANY} · ${GROUNDING_ROLE}`;

const runId = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test("CoveragePanel (third view): a post-tailor library entry surfaces a real in-facts row, alongside on-page-absence and unsupported", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await login(page, PASSWORD);
  await expect(page).toHaveURL(/\/applications$/);

  const company = `E2E Coverage Co ${runId}-${testInfo.retry}`;
  const applicationId = await createApplication(page, { company, jd: JD });

  await page.goto(`/applications/${applicationId}`);
  // Tailor while the library is EXACTLY the seed entries — the recorded
  // platform-sdk decision is keyed on them.
  await tailor(page, applicationId);

  // AFTER tailoring: add one library entry (real /api/entries POST, authed via
  // the page's own cookies) whose facts carry every token of S1 but which was
  // never part of the tailored decision — the genuine in-facts path.
  const newEntry = {
    id: `northwind-coverage-${runId}-${testInfo.retry}`,
    section: "experience",
    sortKey: 202601,
    meta: {
      section: "experience",
      company: GROUNDING_COMPANY,
      role: GROUNDING_ROLE,
      period: "2024–present",
    },
    facts: ["Designing and shipping a public-facing developer surface for partner teams"],
    tags: [],
  };
  const created = await page.request.post("/api/entries", { data: newEntry });
  expect(created.ok(), "POST /api/entries must succeed").toBeTruthy();

  // Recorded fixtures key on (jd, entries) (FixtureEngine.hashKey), so this
  // extra entry must NOT outlive the test — every other applications-project
  // spec tailors against the seed library and would hit NoFixtureError if it
  // leaked. Guaranteed removal in finally, pass or fail.
  try {
    // Reload so useEntries() refetches — CoveragePanel classifies over the
    // live library, which now includes the new entry.
    await page.goto(`/applications/${applicationId}`);
    await page.getByRole("button", { name: "Keyword coverage" }).click();

    const panel = page.getByTestId("coverage-panel");
    await expect(panel).toBeVisible({ timeout: 15000 });

    // IN-FACTS (positive), scoped to S1's own row locator (data-term, never a
    // page-wide getByText that could match nav/title chrome): bucket
    // in-facts, signal provenance, and the grounding entry by its HUMAN label.
    const inFactsRow = panel.locator(`li[data-term="${IN_FACTS_SIGNAL}"]`);
    await expect(inFactsRow).toHaveAttribute("data-bucket", "in-facts");
    await expect(inFactsRow).toHaveAttribute("data-provenance", "signal");
    await expect(inFactsRow).toContainText(GROUNDING_LABEL);
    // ...and it names the entry by label, not the raw id slug.
    await expect(inFactsRow).not.toContainText(newEntry.id);

    // ON-PAGE (absence half of multi-bucket): a term already on the rendered
    // page is bucket 1 (not reported) — absent from ALL actionable rows.
    await expect(panel.locator(`li[data-term="${ON_PAGE_TERM}"]`)).toHaveCount(0);

    // UNSUPPORTED (present): S3 shares no token with the page or any entry's
    // facts -> a real unsupported row with the honest fabrication-boundary copy.
    const unsupportedRow = panel.locator(`li[data-term="${UNSUPPORTED_SIGNAL}"]`);
    await expect(unsupportedRow).toHaveAttribute("data-bucket", "unsupported");
    await expect(unsupportedRow).toContainText(/no entry supports this/i);
  } finally {
    const deleted = await page.request.delete(`/api/entries/${newEntry.id}`);
    expect(deleted.ok(), "cleanup DELETE /api/entries must succeed").toBeTruthy();
  }
});
