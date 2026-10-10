// Session 28 (Ravi: a campaign draft saved on one brand showed up on another brand in the same
// browser). Drafts used fixed localStorage keys ("campaign_draft", "ugc_draft", ...), shared by
// every account that ever logged in on that browser. Now every draft key carries the owner's
// user id, and the old shared keys are never read (they have no owner, so they are removed).
import { safeStorage } from "../utils/storage";

function ownerId() {
  try {
    const u = JSON.parse(safeStorage.getItem("ybex_user") || "null");
    return (u && (u.user_id || u.id)) ? String(u.user_id || u.id) : "";
  } catch {
    return "";
  }
}

/** `campaign_draft` → `campaign_draft::<user_id>`. No logged-in user → no key (nothing saved). */
export function draftKey(base, userId = ownerId()) {
  return userId ? `${base}::${userId}` : "";
}

function dropLegacy(base) {
  try { safeStorage.removeItem(base); } catch { /* ignore */ }
}

export function draftGet(base) {
  dropLegacy(base);
  const key = draftKey(base);
  if (!key) return null;
  try { return safeStorage.getItem(key); } catch { return null; }
}

export function draftSet(base, value) {
  const key = draftKey(base);
  if (!key) return;
  try { safeStorage.setItem(key, value); } catch { /* ignore */ }
}

export function draftRemove(base) {
  dropLegacy(base);
  const key = draftKey(base);
  if (!key) return;
  try { safeStorage.removeItem(key); } catch { /* ignore */ }
}
