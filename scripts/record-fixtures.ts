// Record decision fixtures — spec.md §18, §22; .ailoop/oracle.md fixture-provenance gate.
// Calls the LIVE model once per §22 JD, proves the flip on the assembled resume
// (fabrication-clean, target leads, rationale names a signal), and ONLY THEN
// writes the fixture. Never hand-edit a fixture — a failing flip is reported,
// not forced.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ProviderEngine } from "../src/server/tailor/engine";
import { assemble } from "../src/server/tailor/assemble";
import { validateNoFabrication, FabricationError } from "../src/server/tailor/validate";
import { hashKey, CONTRAST_JDS, flipPredicate } from "../src/server/tailor/evalcore";
import { SEED_ENTRIES } from "../src/server/seed";
import { SECTION_VALUES } from "../src/shared/sections";
import type { Layout, TailorDecision } from "../src/shared/types";

const MODEL = "gemini-2.5-flash";
const FIXTURES_DIR = path.join(process.cwd(), "test/fixtures/decisions");

const defaultLayout: Layout = [
  { section: "summary", enabled: true },
  ...SECTION_VALUES.map((section) => ({ section, enabled: true })),
];

async function main() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    console.error("record-fixtures: GOOGLE_GENERATIVE_AI_API_KEY is not set — aborting (no silent skip).");
    process.exit(1);
  }

  const engine = new ProviderEngine({ provider: "google", model: MODEL, apiKey });

  mkdirSync(FIXTURES_DIR, { recursive: true });

  const manifestFixtures: { name: string; key: string; leadingEntryId: string }[] = [];
  const failures: string[] = [];

  for (const { name, jd, target } of CONTRAST_JDS) {
    console.log(`\n[${name}] requesting live decision for target "${target}"...`);

    let decision: TailorDecision;
    try {
      decision = await engine.decide(jd, SEED_ENTRIES);
    } catch (err) {
      failures.push(`${name}: live decide() failed — ${(err as Error).message}`);
      console.error(`[${name}] FAIL: decide() threw — ${(err as Error).message}`);
      continue;
    }

    try {
      const resume = assemble(decision, SEED_ENTRIES, defaultLayout);
      validateNoFabrication(resume, SEED_ENTRIES);

      const { leads, rationaleNamesSignal } = flipPredicate(resume, target);
      if (!leads || !rationaleNamesSignal) {
        const leadingIds = resume.sections.flatMap((s) => s.groups.map((g) => g.items[0]?.entryId));
        failures.push(
          `${name}: did NOT flip — leads=${leads} rationaleNamesSignal=${rationaleNamesSignal} ` +
            `(leading item(s): ${leadingIds.join(", ") || "(none)"})`,
        );
        console.error(`[${name}] FAIL: ${failures[failures.length - 1]}`);
        continue;
      }

      const key = hashKey(jd, SEED_ENTRIES);
      const fixturePath = path.join(FIXTURES_DIR, `${name}.json`);
      writeFileSync(fixturePath, JSON.stringify({ key, name, decision }, null, 2) + "\n");
      manifestFixtures.push({ name, key, leadingEntryId: target });
      console.log(`[${name}] PASS: "${target}" leads, rationale names a signal. Wrote ${fixturePath}`);
    } catch (err) {
      if (err instanceof FabricationError) {
        failures.push(`${name}: fabrication check failed — ${err.message}`);
      } else {
        failures.push(`${name}: unexpected error — ${(err as Error).message}`);
      }
      console.error(`[${name}] FAIL: ${failures[failures.length - 1]}`);
    }
  }

  const manifest = {
    model: MODEL,
    provider: "google",
    recordedAt: new Date().toISOString(),
    fixtures: manifestFixtures,
  };
  writeFileSync(path.join(FIXTURES_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  if (failures.length > 0) {
    console.error(`\nrecord-fixtures: ${failures.length} of ${CONTRAST_JDS.length} JD(s) failed to flip:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(`\nrecord-fixtures: all ${CONTRAST_JDS.length} fixtures recorded and verified.`);
}

main().catch((err) => {
  console.error("record-fixtures: fatal error:", err);
  process.exit(1);
});
