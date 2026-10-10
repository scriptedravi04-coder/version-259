import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("creator mobile: campaigns + deals (session 23, design C01–C05, D01)", () => {
  it("pages switch to the mobile screens after all hooks, keeping desktop data + handlers", () => {
    const list = read("src/pages/campaigns/Campaigns.jsx");
    expect(list).toContain("<CampaignsListMobile");
    const det = read("src/pages/campaigns/CampaignDetail.jsx");
    expect(det).toContain("<CampaignDetailMobile");
    expect(det).toContain("handleApply={handleApply}");
    expect(det).toContain("onApplyClick={onApplyClick}");
    expect(det).toContain("if (isMobile) setApplicationSent(true);");
    const deals = read("src/pages/collabs/Collabs.jsx");
    expect(deals).toContain("<DealsMobile");
    expect(deals).toContain(".finally(() => setCollabsLoaded(true));");
  });
  it("mobile screens never call the API themselves (desktop logic stays the single source)", () => {
    for (const f of [
      "src/components/campaigns/mobile/CampaignsListMobile.jsx",
      "src/components/campaigns/mobile/CampaignDetailMobile.jsx",
      "src/components/deals/mobile/DealsMobile.jsx",
    ]) {
      const s = read(f);
      expect(s, f).not.toMatch(/\bapi\.(get|post|put|patch|delete)\(/);
      expect(s, f).not.toContain("supabase");
    }
  });
  it("apply keeps the desktop KYC gate and minimum pitch; closed campaigns can't be applied to", () => {
    const s = read("src/components/campaigns/mobile/CampaignDetailMobile.jsx");
    expect(s).toContain("disabled={applying || !amount || pitch.length < 20}");
    expect(s).toContain("Campaign closed");
    expect(read("src/pages/campaigns/CampaignDetail.jsx")).toContain('<KycPromptModal isOpen={showKycPrompt} onClose={() => setShowKycPrompt(false)} role="creator" actionType="apply_campaign" />');
  });
});
