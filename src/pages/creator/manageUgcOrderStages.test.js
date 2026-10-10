import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Every stage the creator's Manage Orders screen can put an order into must have a panel.
//
// Each panel in ManageUGCOrdersView is gated on one exact stage string. The mapper could
// produce LIVE_LINK_SUBMITTED and REVISION_DECLINED_LINKS, and no panel was gated on either —
// so the moment the creator submitted a live link, every condition went false and the whole
// detail pane rendered empty. Nothing failed: no error, no console warning, clean build, all
// tests green. It just looked like the screen had crashed at the exact moment the action
// succeeded.
//
// TypeScript cannot catch this (both sides are plain strings) and neither can a render test
// that only exercises the stages someone remembered to write. Comparing the two lists directly
// is the only thing that does.

const SOURCE = readFileSync(
  join(process.cwd(), "src/pages/creator/ManageUGCOrdersView.jsx"),
  "utf8"
);

/** Stages the mapper assigns, e.g. `stage = "LIVE_LINK_SUBMITTED";` */
function producedStages(src) {
  return [...src.matchAll(/\bstage\s*=\s*"([A-Z_]+)"/g)].map((m) => m[1]);
}

/** The declared registry the catch-all panel checks against. */
function declaredStages(src) {
  const block = src.match(/const HANDLED_ORDER_STAGES = \[([\s\S]*?)\];/);
  if (!block) return [];
  return [...block[1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
}

/** Stages a panel is actually gated on, e.g. `selectedOrder.stage === "COMPLETED"` */
function renderedStages(src) {
  return [...src.matchAll(/selectedOrder\.stage === "([A-Z_]+)"/g)].map((m) => m[1]);
}

describe("ManageUGCOrdersView — stage coverage", () => {
  it("finds the stage lists in the source (guards against this test silently matching nothing)", () => {
    // If a refactor renames the variable or the registry, the regexes above start returning
    // empty arrays and every assertion below passes vacuously. This is the check that stops a
    // green suite from meaning nothing.
    expect(producedStages(SOURCE).length).toBeGreaterThan(5);
    expect(declaredStages(SOURCE).length).toBeGreaterThan(5);
    expect(renderedStages(SOURCE).length).toBeGreaterThan(5);
  });

  it("declares every stage the mapper can produce", () => {
    const declared = declaredStages(SOURCE);
    const missing = [...new Set(producedStages(SOURCE))].filter((s) => !declared.includes(s));
    expect(missing).toEqual([]);
  });

  it("renders a panel for every declared stage", () => {
    const rendered = renderedStages(SOURCE);
    const missing = declaredStages(SOURCE).filter((s) => !rendered.includes(s));
    expect(missing).toEqual([]);
  });

  it("covers the two live-link stages that used to blank the pane", () => {
    const declared = declaredStages(SOURCE);
    const rendered = renderedStages(SOURCE);
    for (const stage of ["LIVE_LINK_SUBMITTED", "REVISION_DECLINED_LINKS"]) {
      expect(declared).toContain(stage);
      expect(rendered).toContain(stage);
    }
  });

  it("keeps a catch-all so an unlisted stage shows a message rather than nothing", () => {
    expect(SOURCE).toContain("!HANDLED_ORDER_STAGES.includes(selectedOrder.stage)");
  });
});

describe("BrandUGCOrders — revision requests say which kind they are", () => {
  const BRAND_SOURCE = readFileSync(
    join(process.cwd(), "src/pages/brand/BrandUGCOrders.jsx"),
    "utf8"
  );

  it("sends reject_live_links when the order is past draft approval", () => {
    // Without this the server had to infer it, and when the inference missed the creator was
    // handed a "re-upload your draft" form for a live-link correction — with no way to resubmit
    // the link at all.
    expect(BRAND_SOURCE).toContain('action: "reject_live_links"');
    expect(BRAND_SOURCE).toMatch(/isLiveLinkStage[\s\S]{0,400}LIVE_LINK_SUBMITTED/);
  });
});
