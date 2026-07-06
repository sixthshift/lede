// @vitest-environment jsdom
// E8-B1 — live mini-render thumbnails in the TemplatePicker (spec.md §28.2,
// decided 2026-07-05: previews are LIVE renders of this application's
// tailored resume, never static images). jsdom cannot paint pdf.js (no real
// canvas/worker) — that proof lives in the applications e2e. This file
// covers the PURE parts: the cache-key derivation, the render queue's
// one-at-a-time serialization, and the sample-content fallback wiring.
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { DocumentFormat, Profile, TailoredResume } from "@shared/types";
import { DEFAULT_FORMAT } from "../src/shared/format";
import { thumbnailCacheKey, enqueueThumbnailRender } from "../src/client/document/thumbnail";
import { TemplatePicker } from "../src/client/components/TemplatePicker";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function resumeFixture(summary = "SUMMARY_SENTINEL"): TailoredResume {
  return {
    signals: { roleLevel: "senior", weights: [], hardRequirements: [] },
    summary,
    sections: [
      {
        section: "experience",
        groups: [
          {
            heading: "Acme · Engineer · 2020-2023",
            items: [{ entryId: "e1", text: "EXPERIENCE_ITEM_ONE" }],
          },
        ],
      },
    ],
    cut: [],
  };
}

function profileFixture(): Profile {
  return { name: "Jordan Rivera", email: "jordan@example.com", links: [] };
}

describe("thumbnailCacheKey", () => {
  it("two templateIds for the same (format, paper, resume) produce two distinct keys", () => {
    const resume = resumeFixture();
    const a = thumbnailCacheKey({
      templateId: "strict",
      format: DEFAULT_FORMAT,
      paper: "letter",
      resume,
    });
    const b = thumbnailCacheKey({
      templateId: "classic",
      format: DEFAULT_FORMAT,
      paper: "letter",
      resume,
    });
    expect(a).not.toBe(b);
  });

  it("changing colors.primary changes the key", () => {
    const resume = resumeFixture();
    const a = thumbnailCacheKey({
      templateId: "strict",
      format: DEFAULT_FORMAT,
      paper: "letter",
      resume,
    });
    const recolored: DocumentFormat = {
      ...DEFAULT_FORMAT,
      colors: { ...DEFAULT_FORMAT.colors, primary: "#ff0000" },
    };
    const b = thumbnailCacheKey({
      templateId: "strict",
      format: recolored,
      paper: "letter",
      resume,
    });
    expect(a).not.toBe(b);
  });

  it("identical inputs produce identical keys", () => {
    const resume = resumeFixture();
    const a = thumbnailCacheKey({
      templateId: "strict",
      format: DEFAULT_FORMAT,
      paper: "letter",
      resume,
    });
    const b = thumbnailCacheKey({
      templateId: "strict",
      format: { ...DEFAULT_FORMAT },
      paper: "letter",
      resume: resumeFixture(),
    });
    expect(a).toBe(b);
  });

  it("a different resume (content) changes the key", () => {
    const a = thumbnailCacheKey({
      templateId: "strict",
      format: DEFAULT_FORMAT,
      paper: "letter",
      resume: resumeFixture("SUMMARY_A"),
    });
    const b = thumbnailCacheKey({
      templateId: "strict",
      format: DEFAULT_FORMAT,
      paper: "letter",
      resume: resumeFixture("SUMMARY_B"),
    });
    expect(a).not.toBe(b);
  });

  it("a different paper changes the key", () => {
    const resume = resumeFixture();
    const a = thumbnailCacheKey({
      templateId: "strict",
      format: DEFAULT_FORMAT,
      paper: "letter",
      resume,
    });
    const b = thumbnailCacheKey({
      templateId: "strict",
      format: DEFAULT_FORMAT,
      paper: "a4",
      resume,
    });
    expect(a).not.toBe(b);
  });

  it("templateId embedded in the format object is EXCLUDED from the format part — only the explicit prop drives the key", () => {
    const resume = resumeFixture();
    const formatWithStrict: DocumentFormat = { ...DEFAULT_FORMAT, templateId: "strict" };
    const formatWithClassic: DocumentFormat = { ...DEFAULT_FORMAT, templateId: "classic" };

    // Same explicit templateId prop ("banner"), different format.templateId
    // (irrelevant, since a card previews a template regardless of which one
    // is currently selected) — the keys must match.
    const a = thumbnailCacheKey({
      templateId: "banner",
      format: formatWithStrict,
      paper: "letter",
      resume,
    });
    const b = thumbnailCacheKey({
      templateId: "banner",
      format: formatWithClassic,
      paper: "letter",
      resume,
    });
    expect(a).toBe(b);
  });
});

describe("enqueueThumbnailRender — module-level serialization", () => {
  it("never runs more than one job concurrently, and preserves submission order", async () => {
    let active = 0;
    let maxActive = 0;
    const finishOrder: number[] = [];

    function job(id: number, delayMs: number) {
      return async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        finishOrder.push(id);
        active -= 1;
        return id;
      };
    }

    // Job 1 is slowest, jobs 2/3 are fast — if these ran concurrently, 2/3
    // would finish before 1. Serialized, submission order is finish order.
    const results = await Promise.all([
      enqueueThumbnailRender(job(1, 30)),
      enqueueThumbnailRender(job(2, 10)),
      enqueueThumbnailRender(job(3, 5)),
    ]);

    expect(maxActive).toBe(1);
    expect(finishOrder).toEqual([1, 2, 3]);
    expect(results).toEqual([1, 2, 3]);
  });

  it("a rejected job does not block the next job in the queue", async () => {
    const ran: string[] = [];

    const failing = enqueueThumbnailRender(async () => {
      throw new Error("boom");
    }).catch(() => {
      ran.push("failed-job-caught");
    });
    const following = enqueueThumbnailRender(async () => {
      ran.push("next-job-ran");
    });

    await Promise.all([failing, following]);
    expect(ran).toEqual(["failed-job-caught", "next-job-ran"]);
  });
});

describe("TemplatePicker — sample content fallback", () => {
  it("with resume=null, every card renders SAMPLE content and shows the 'Sample content' badge", () => {
    render(<TemplatePicker format={DEFAULT_FORMAT} onChange={vi.fn()} resume={null} />);

    const badges = screen.getAllByText("Sample content");
    // one per template card
    expect(badges.length).toBeGreaterThanOrEqual(6);
  });

  it("with a real resume, no 'Sample content' badge appears anywhere", () => {
    render(
      <TemplatePicker
        format={DEFAULT_FORMAT}
        onChange={vi.fn()}
        resume={resumeFixture()}
        profile={profileFixture()}
      />,
    );

    expect(screen.queryByText("Sample content")).not.toBeInTheDocument();
  });

  it("readOnly still disables every card's selection button", () => {
    render(<TemplatePicker format={DEFAULT_FORMAT} onChange={vi.fn()} readOnly resume={null} />);

    for (const button of screen.getAllByRole("button", { name: /ATS:/ })) {
      expect(button).toBeDisabled();
    }
  });
});
