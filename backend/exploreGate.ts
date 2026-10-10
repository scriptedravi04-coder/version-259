// Session 43 (Ravi): a creator who signs up and onboards shows on Explore only after an admin
// approves them from the waitlist (same gate as the creator form). Creators already on Explore
// before this change stay listed (Ravi: "wase hi rehne do") — the gate applies to profiles
// created from EXPLORE_GATE_FROM on. Rejected profiles never show.
export const EXPLORE_GATE_FROM = Date.parse("2026-10-10T00:00:00Z");

export function visibleOnExplore(row: any, gateFrom: number = EXPLORE_GATE_FROM): boolean {
  if (!row) return false;
  const status = String(row.profile_status || "").toLowerCase();
  if (status === "rejected") return false;
  if (status === "approved") return true;
  const created = Date.parse(row.created_at || row.inserted_at || "");
  if (!Number.isFinite(created) || created < gateFrom) return true; // existing creators stay listed
  return false; // new and not approved yet → waitlist first
}
