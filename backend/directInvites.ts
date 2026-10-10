// Direct brand invitations (session 26) — shared rules for backend/creators_routes.ts.
//
// A direct invite is a normal CAMPAIGN deal with a different start: the brand invites, the
// creator accepts, and a new `deals` row + `thread_camp_<dealId>` chat opens. See ARCHITECTURE.md
// rule 54.

/** Invite statuses (brief_requests.status). */
export const INVITE_PENDING = "pending_creator_acceptance";
/** Short-lived, in memory only: set while an accept is writing the deal, so a double tap can't open two. */
export const INVITE_ACCEPTING = "accepting";
export const INVITE_ACCEPTED = "accepted";
export const INVITE_DECLINED = "creator_declined";

/** Same floor as a counter offer in chat (ChatBox / useChatThreadMobile). */
export const MIN_INVITE_AMOUNT = 3000;

/** A rupee amount from what the brand typed ("₹45,000", "45000"). 0 when there is no number. */
export function parseInviteBudget(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
  const digits = String(raw ?? "").replace(/[^0-9.]/g, "");
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** The fee on an invite, from any of the fields older invites used. */
export function inviteAmount(invite: any): number {
  if (!invite) return 0;
  return parseInviteBudget(invite.amount) || parseInviteBudget(invite.proposed_budget) || parseInviteBudget(invite.budget_range);
}

/** "7" -> "7 days", "1" -> "1 day"; anything with words is kept as the brand wrote it. */
export function formatInviteTimeline(raw: unknown): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return `${n} ${n === 1 ? "day" : "days"}`;
  }
  return t;
}

/** WHO: only the invited creator (matched by id, or by email for an invite sent before they claimed the profile). */
export function isInvitedCreator(invite: any, user: any): boolean {
  if (!invite || !user) return false;
  if (String(user.role || "").toLowerCase() !== "creator") return false;
  if (invite.creator_id && (invite.creator_id === user.user_id || invite.creator_id === user.id)) return true;
  const inviteEmail = String(invite.creator_email || "").trim().toLowerCase();
  const userEmail = String(user.email || "").trim().toLowerCase();
  return Boolean(inviteEmail && userEmail && inviteEmail === userEmail);
}

/** Columns of public.brief_requests (Supabase report, session 26). Anything else stays local. */
export const INVITE_COLUMNS = [
  "id", "brand_id", "creator_id", "campaign_title", "budget_range", "deliverables", "timeline",
  "message", "status", "creator_name", "creator_handle", "creator_email", "creator_is_claimed",
  "thread_id", "created_at", "updated_at", "brand_name", "brand_logo", "creator_phone",
  "campaign_description", "proposed_budget", "deliverables_count", "pitch", "decline_reason",
  "admin_notes", "accepted_at", "declined_at", "amount", "deal_id", "accepted_by",
] as const;

/** The row to write: only real columns, never undefined. */
export function toInviteRow(invite: any): Record<string, any> {
  const row: Record<string, any> = {};
  for (const c of INVITE_COLUMNS) {
    if (invite && invite[c] !== undefined) row[c] = invite[c];
  }
  return row;
}

/** An accept that crashed half-way must not lock the invite forever. */
export const ACCEPTING_STALE_MS = 2 * 60 * 1000;
export function isStaleAccepting(invite: any, now = Date.now()): boolean {
  if (String(invite?.status || "") !== INVITE_ACCEPTING) return false;
  const t = new Date(invite?.updated_at || 0).getTime();
  return !t || now - t > ACCEPTING_STALE_MS;
}
