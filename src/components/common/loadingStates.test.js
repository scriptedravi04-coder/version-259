import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("loading states (rule 35)", () => {
  it("button actions in settings / collab / UGC approve no longer call startLoading()", () => {
    for (const [f, fns] of [
      ["src/pages/brand/BrandSettings.jsx", ["saveProfileChanges", "handleRequestOtp", "handleLogoutSession", "handleLogoutAllOtherSessions"]],
      ["src/pages/creator/CreatorSettings.jsx", ["saveProfileChanges", "handleRequestOtp", "handleLogoutSession", "handleLogoutAllOtherSessions"]],
      ["src/pages/collabs/AddCollab.jsx", ["handleSubmitProof"]],
      ["src/pages/brand/BrandInstantUGC.jsx", ["handleApproveOrder"]],
    ]) {
      const s = read(f);
      for (const fn of fns) {
        const start = s.indexOf(`const ${fn} = async`);
        expect(start, `${f} ${fn}`).toBeGreaterThan(-1);
        const body = s.slice(start, s.indexOf("\n  };", start));
        expect(body, `${f} ${fn}`).not.toContain("startLoading(");
      }
      expect(s).toContain("useBusy");
    }
  });
  it("settings buttons show a spinner while their action runs", () => {
    expect(read("src/pages/brand/BrandSettings.jsx")).toContain('{isBusy("logout-others") && <ButtonSpinner');
    expect(read("src/pages/creator/CreatorSettings.jsx")).toContain('{isBusy("save") && <ButtonSpinner');
  });
  it("detail / profile / explore pages render skeletons, not spinners or blank screens", () => {
    expect(read("src/pages/campaigns/CampaignDetail.jsx")).toContain("<DetailSkeleton");
    expect(read("src/pages/collabs/DealDetail.jsx")).toContain("<DetailSkeleton");
    expect(read("src/pages/collabs/UploadedCollab.jsx")).toContain("<DetailSkeleton");
    expect(read("src/pages/creator/CreatorProfile.jsx")).toContain("<ProfileSkeleton />");
    expect(read("src/pages/creator/CreatorPublicView.jsx")).toContain("<ProfileSkeleton />");
    expect(read("src/pages/dashboard/Explore.jsx")).toContain("<CardGridSkeleton");
  });
  it("skeletons respect reduced motion; rule is documented for AI tools", () => {
    expect(read("src/components/common/ContentSkeletons.jsx")).toContain("prefers-reduced-motion");
    expect(read("ARCHITECTURE.md")).toContain("## Loading states (rule 35");
    expect(read("AGENTS.md")).toContain("useBusy");
    expect(read("GEMINI.md")).toContain("useBusy");
  });
  it("no page brings back a full-screen blurred loader", () => {
    const hits = execSync("grep -rln 'fixed inset-0[^\"]*backdrop-blur' src --include=*.jsx || true").toString().trim().split("\n").filter(Boolean);
    // Modals may blur their own backdrop; the GLOBAL loader must not.
    expect(hits).not.toContain("src/components/layout/GlobalLoader.jsx");
  });
});
