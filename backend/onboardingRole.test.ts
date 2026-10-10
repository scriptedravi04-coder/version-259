import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { decideRoleChange, isOnboarded, SELECTABLE_ROLES } from "./roleGuards";

// Session 20. Onboarding did not save users.role, and a Google sign-up had none, so a brand
// that finished brand onboarding was still "not a brand" to the server.

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), "utf8");

describe("decideRoleChange", () => {
  it("takes the requested role when the account has none", () => {
    expect(decideRoleChange(null, "brand", false)).toEqual({ ok: true, setRole: "brand" });
    expect(decideRoleChange("", "creator", false)).toEqual({ ok: true, setRole: "creator" });
    expect(decideRoleChange(undefined, "BRAND", false)).toEqual({ ok: true, setRole: "brand" });
  });

  it("changes nothing when the role already matches", () => {
    expect(decideRoleChange("brand", "brand", true)).toEqual({ ok: true, setRole: null });
  });

  it("lets a not-yet-onboarded account fix a wrong sign-up tab", () => {
    expect(decideRoleChange("creator", "brand", false)).toEqual({ ok: true, setRole: "brand" });
  });

  it("refuses to turn an onboarded creator into a brand (or back)", () => {
    const d1 = decideRoleChange("creator", "brand", true);
    const d2 = decideRoleChange("brand", "creator", true);
    expect(d1.ok).toBe(false);
    expect(d2.ok).toBe(false);
    if (!d1.ok) expect([d1.status, d1.code]).toEqual([409, "ROLE_MISMATCH"]);
  });

  it("never changes staff roles", () => {
    expect(decideRoleChange("admin", "brand", true)).toEqual({ ok: true, setRole: null });
    expect(decideRoleChange("sub_admin", "creator", false)).toEqual({ ok: true, setRole: null });
  });

  it("rejects roles that cannot be picked", () => {
    for (const bad of ["admin", "sub_admin", "", null, "system"]) {
      const d = decideRoleChange(null, bad, false);
      expect(d.ok).toBe(false);
    }
    expect(decideRoleChange(null, "talent_manager", false).ok).toBe(false);
    expect(decideRoleChange(null, "talent_manager", false, SELECTABLE_ROLES)).toEqual({ ok: true, setRole: "talent_manager" });
  });

  it("reads every onboarded flag the codebase uses", () => {
    expect(isOnboarded({ onboarded: true })).toBe(true);
    expect(isOnboarded({ onboarding_completed: true })).toBe(true);
    expect(isOnboarded({ onboarding_complete: true })).toBe(true);
    expect(isOnboarded({})).toBe(false);
  });
});

describe("auth routes save the role in Supabase too", () => {
  const s = read("backend/auth_routes.ts");
  const onboard = s.slice(s.indexOf('router.post("/auth/onboard"'), s.indexOf('router.post("/auth/role"'));
  const roleRoute = s.slice(s.indexOf('router.post("/auth/role"'), s.indexOf('router.post("/auth/session"'));

  it("/auth/onboard decides and persists the role before building the profile", () => {
    expect(onboard).toContain("decideRoleChange(user.role, requestedRole, isOnboarded(user))");
    expect(onboard).toContain("await persistUserRole(user, decision.setRole)");
    expect(onboard.indexOf("persistUserRole")).toBeLessThan(onboard.indexOf("brand_profiles"));
  });

  it("/auth/role no longer writes only the local store", () => {
    expect(roleRoute).toContain("decideRoleChange(user.role, req.body?.role, isOnboarded(user), SELECTABLE_ROLES)");
    expect(roleRoute).toContain("persistUserRole");
  });

  it("persistUserRole writes users.role in Supabase and inserts the row when missing", () => {
    const helper = s.slice(s.indexOf("const persistUserRole"), s.indexOf("// Resilient Password Reset Tokens Helpers"));
    expect(helper).toMatch(/\.update\(\{ role \}\)/);
    expect(helper).toMatch(/\.insert\(\{/);
    expect(helper).toContain("dbUser.role = role");
  });

  it("/auth/me heals an onboarded account that has no role", () => {
    const me = s.slice(s.indexOf('router.get("/auth/me"'), s.indexOf('router.post("/auth/forgot-password"'));
    expect(me).toContain("if (!user.role)");
    expect(me).toContain("hasBrand !== hasCreator");
  });
});

describe("frontend saves the chosen role", () => {
  for (const f of ["src/pages/auth/Login.jsx", "src/pages/auth/Signup.jsx"]) {
    it(`${path.basename(f)} saves the tab after a Google sign-in with no role`, () => {
      expect(read(f)).toMatch(/if \(!loggedUser\.role && \(role === "creator" \|\| role === "brand"\)\)[\s\S]{0,80}api\.post\("auth\/role", \{ role \}\)/);
    });
  }

  it("Onboarding asks for the role instead of falling through to the creator form", () => {
    const s = read("src/pages/auth/Onboarding.jsx");
    expect(s).toContain("if (!user.role) {");
    expect(s).toContain('api.post("auth/role", { role })');
    expect(s.indexOf("if (!user.role) {")).toBeLessThan(s.indexOf("user?.role === 'brand' ?"));
  });
});
