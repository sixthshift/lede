# Voice on/off eval — gemini-2.5-flash @ temperature 0

Recorded 2026-07-10T12:24:06.233Z. Selection/order asserted position-for-position over the full
(entryId#rank) sequence; phrasing delta is input-attributable because temperature is pinned.

## Verdict

PASS — at pinned temperature 0, the voice block reworded the prose (summary and/or items on the resume; the letter body) while the resume's selection+order (entryId#rank sequence) and cut set stayed byte-identical and the letter's grounding set was unchanged. Phrasing moved; selection did not. VOICE-ON REGISTER (judged): the coordinator confirms below whether the reworded output adopts the exemplar's terse/blunt register — a green `pass` here is the mechanical half only.

- resume selection+order identical: **true** (`cloudcase-rules-engine#1 | cloudcase-platform-sdk#2 | cloudcase-frontend-rewrite#3`)
- resume cut set identical: **true**
- resume phrasing differs: **true** (summary changed=true, 3/3 items reworded)
- letter grounding set identical: **true**
- letter phrasing differs: **true**

## Resume summary — voice OFF

Senior Software Engineer with a strong background in platform architecture and lifecycle frameworks, experienced in leading the modernization of core systems and internal developer platforms. Proven ability to drive high-impact projects that reduce onboarding time and enhance reliability.

## Resume summary — voice ON

Senior Software Engineer with a strong background in platform architecture and lifecycle frameworks. Led modernization efforts for a core rules engine and internal developer platform, driving projects that cut onboarding time and improved reliability.

## Resume prose (full) — voice OFF

```
Senior Software Engineer with a strong background in platform architecture and lifecycle frameworks, experienced in leading the modernization of core systems and internal developer platforms. Proven ability to drive high-impact projects that reduce onboarding time and enhance reliability.
Built a lifecycle framework for a 30k-line rules engine, introducing schemas and consistent patterns, which reduced developer onboarding from days to 1 day and decreased bug incidence.
Developed the first platform SDK, programmatically exposing the platform, which was adopted by all internal project teams and became the standard integration path for new external clients.
Led the replacement of a legacy jQuery frontend with a new three-layer React/TypeScript architecture, incorporating a component library and the platform SDK, now used for all feature development.
```

## Resume prose (full) — voice ON

```
Senior Software Engineer with a strong background in platform architecture and lifecycle frameworks. Led modernization efforts for a core rules engine and internal developer platform, driving projects that cut onboarding time and improved reliability.
Built a lifecycle framework for a 30k-line rules engine, cutting onboarding from days to 1 day and reducing bug incidence.
Developed a platform SDK, exposing the platform programmatically for the first time and establishing it as the integration path for all internal teams and new external clients.
Modernized the frontend by replacing legacy jQuery with a three-layer React/TypeScript architecture, including a component library and platform SDK, now used for all feature work.
```

## Letter — voice OFF

```
Dear Hiring Manager,

I am writing to express my strong interest in the Senior Software Engineer, Platform role. My experience at Cloudcase, particularly in modernizing core systems and building foundational platform components, aligns closely with your needs for leading the modernization of your rules engine and internal developer platform.

At Cloudcase, I addressed a critical challenge with our rules engine, which comprised ~30k lines of unstructured rules and led developers to spend ~50% of their time navigating the codebase. I built a comprehensive lifecycle framework, introducing schemas, lifecycle management, and consistent patterns. This initiative significantly improved developer experience, cutting onboarding from days to 1 day and reducing bug incidence.

Beyond the rules engine, I also built a platform SDK that exposed our platform programmatically for the first time. This SDK was adopted across all internal project teams and is now the integration path offered to new external clients, demonstrating my ability to drive architectural decisions and deliver high-impact platform solutions.

I am eager to discuss how my background can contribute to your team's success.
```

## Letter — voice ON

```
Hello,

My experience modernizing a core rules engine aligns directly with your role. At Cloudcase, I tackled a rules engine with ~30k lines of unstructured rules. Developers spent ~50% of their time navigating this codebase. I built a lifecycle framework to address this.

This framework introduced schemas, lifecycle management, and consistent patterns. Onboarding time dropped from days to 1 day. Bug incidence also fell. This delivered high impact by improving reliability and cutting onboarding time.

Beyond the rules engine, I also built a platform SDK at Cloudcase. This exposed the platform programmatically for the first time. It was adopted across all internal project teams and is now the integration path for new external clients.

Thank you,
```

## Coordinator register verdict (judged)

AFFIRMED — the voice-ON output adopts the exemplar's distinctive terse/blunt
register, not merely different words:

- **Letter greeting/closing:** OFF opens "I am writing to express my strong
  interest in the Senior Software Engineer, Platform role" and closes "I am
  eager to discuss how my background can contribute to your team's success";
  ON opens flatly "Hello," and closes "Thank you," — the exemplar's
  no-throat-clearing stance.
- **Sentence length:** OFF runs long multi-clause sentences ("This SDK was
  adopted across all internal project teams and is now the integration path
  offered to new external clients, demonstrating my ability to drive
  architectural decisions and deliver high-impact platform solutions"); ON
  breaks the same content into short declaratives ("Onboarding time dropped
  from days to 1 day. Bug incidence also fell.") — the exemplar's "Short
  sentences. Plain words. Say the result, then stop."
- **Resume summary:** ON drops the padded "Proven ability to drive high-impact
  projects that reduce…" for the active, clipped "Led modernization efforts…
  driving projects that cut onboarding time and improved reliability."

Fact-lock INTACT under the register shift: `~30k` and `~50%` reproduced
verbatim in both; the grounding set and the resume's selection+order were
byte-identical — the voice moved phrasing only, never facts or selection.
