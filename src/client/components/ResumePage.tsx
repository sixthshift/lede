// Deterministic, ATS-safe resume render — spec.md §10.
// CRITICAL: leadRationale and cut[] are reasoning UI (Phase 3) and must NEVER
// appear here — render only summary + sections/groups/items, in given order.

import type { TailoredResume, TailoredGroup, TailoredItem } from "@shared/types";
import { SECTIONS } from "@shared/sections";

function ItemRow({ item }: { item: TailoredItem }) {
  return <li className="resume-item">{item.text}</li>;
}

function GroupBlock({ group }: { group: TailoredGroup }) {
  return (
    <div className="resume-group">
      {group.heading ? <h3 className="resume-group__heading">{group.heading}</h3> : null}
      <ul className="resume-group__items">
        {group.items.map((item) => (
          <ItemRow key={item.entryId} item={item} />
        ))}
      </ul>
    </div>
  );
}

export function ResumePage({ resume }: { resume: TailoredResume }) {
  return (
    <div className="resume-page">
      <header className="resume-header">
        <h1 className="resume-header__name">Your Name</h1>
      </header>

      <section className="resume-summary">
        <p>{resume.summary}</p>
      </section>

      {resume.sections.map((section) => (
        <section key={section.section} className="resume-section">
          <h2 className="resume-section__label">{SECTIONS[section.section].label}</h2>
          {section.groups.map((group, i) => (
            <GroupBlock key={group.heading ?? i} group={group} />
          ))}
        </section>
      ))}
    </div>
  );
}
