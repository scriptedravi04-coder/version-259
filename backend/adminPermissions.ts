// Session 38 (Ravi: "Sub-admin ke paas full power hai ... theek kro").
//
// Before: most /admin routes only asked "is this admin OR sub-admin?". A sub-admin — or an
// account with role "admin" + team_role "sub_admin" — could release payouts, mark refunds,
// ban users and change fees, whatever boxes the super admin ticked in "Permissions".
// Only ~15 routes called checkAdminPerm.
//
// Now ONE gate runs before every /admin route (registered in server.ts before the route files):
//   - a full admin (role admin, team_role not sub_admin) passes, as before;
//   - anyone who is not admin staff passes the gate and is refused by the route's own check;
//   - a sub-admin needs the permission for that area (the same keys the super admin ticks in
//     User → Permissions: manage_escrow, manage_users, ...). Dashboard numbers are open to staff.
// An /admin path not in the map: a sub-admin may read it (GET) but not change anything.

import { isFullAdmin } from "./authSecurity";

/** First path segment after /admin → permission key. "*" = any staff member. */
export const ADMIN_AREA_PERMISSION: Record<string, string> = {
  // dashboard (read-only numbers)
  "stats": "*", "chart-data": "*", "pending-counts": "*",
  // money
  "escrow": "manage_escrow", "transactions": "manage_escrow", "refunds": "manage_escrow",
  "refund-account": "manage_escrow", "ugc-refunds": "manage_escrow", "referral-withdrawals": "manage_escrow",
  // platform settings / tools
  "settings": "manage_settings", "fee-config": "manage_settings", "fee-offer": "manage_settings",
  "maintenance": "manage_settings", "banners": "manage_settings", "landing-brands": "manage_settings",
  "landing-reviews": "manage_settings", "coupons": "manage_settings", "versions": "manage_settings",
  "referral-program": "manage_settings", "referral-list": "manage_settings", "referrals": "manage_settings",
  "broadcast-email": "manage_settings", "broadcasts": "manage_settings", "notifications": "manage_settings",
  "speed-report": "manage_settings",
  // people
  "users": "manage_users", "creators": "manage_users", "enforcement": "manage_users", "templates": "manage_users",
  "waitlist": "manage_waitlist",
  "kyc": "manage_kyc", "verifications": "manage_kyc",
  "campaigns": "manage_campaigns", "pitch-leads": "manage_campaigns",
  "chat": "manage_chat", "chat_violations": "manage_chat", "chat_guard_violations": "manage_chat",
  "reports": "manage_disputes", "system-collabs": "manage_disputes", "agreements": "manage_disputes",
  "ugc": "manage_ugc",
  "logs": "manage_logs",
  "blog": "manage_blog", "faq": "manage_blog",
  "support": "manage_helpdesk", "helpdesk": "manage_helpdesk",
};

export function isSubAdmin(user: any): boolean {
  if (!user) return false;
  const role = String(user.role || "").toLowerCase();
  const team = String(user.team_role || "").toLowerCase();
  return role === "sub_admin" || ((role === "admin" || role === "sub_admin") && team === "sub_admin");
}

/** Which permission a request needs, or null when no permission is needed. */
export function requiredAdminPermission(method: string, path: string): string | null {
  const m = /^\/admin\/([^/?#]+)/.exec(String(path || ""));
  if (!m) return null;
  const area = m[1];
  if (area === "bypass") return null; // demo login, has its own DEMO_LOGIN gate
  const perm = ADMIN_AREA_PERMISSION[area];
  if (perm === "*") return null;
  if (perm) return perm;
  return String(method || "GET").toUpperCase() === "GET" ? null : "__full_admin_only__";
}

type GateDeps = {
  parseAuthUser: (req: any) => Promise<any>;
  checkAdminPerm: (user: any, perm: string) => Promise<boolean>;
};

export function adminPermissionGate({ parseAuthUser, checkAdminPerm }: GateDeps) {
  return async (req: any, res: any, next: any) => {
    const path = String(req.path || "");
    if (!path.startsWith("/admin/")) return next();
    const perm = requiredAdminPermission(req.method, path);
    if (!perm) return next();
    let user: any = null;
    try { user = await parseAuthUser(req); } catch { user = null; }
    if (!user || isFullAdmin(user) || !isSubAdmin(user)) return next(); // route decides
    if (perm !== "__full_admin_only__" && (await checkAdminPerm(user, perm))) return next();
    return res.status(403).json({
      error: "You don't have permission for this. Ask the super admin to enable it for you.",
      detail: "You don't have permission for this. Ask the super admin to enable it for you.",
      code: "ADMIN_PERMISSION_MISSING",
      permission: perm === "__full_admin_only__" ? null : perm,
    });
  };
}
