// Session 27. Which email a contract-signing code may go to.
//
// A brand signs with the verified POC business email from Settings (brand_profiles.poc_email /
// email) when there is one, else the login email. A creator signs with the login email, or the
// business email on the creator profile. Supabase is read first because the local store is empty
// after a Cloud Run restart. Signing NEVER changes the login email (it used to).

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

export type SigningEmails = { preferred: string; allowed: string[] };

export async function resolveSigningEmails(
  user: any,
  { client, getDb }: { client: any; getDb: () => any }
): Promise<SigningEmails> {
  const uid = String(user?.user_id || "");
  const login = norm(user?.email);
  const db = getDb() || {};
  let bp: any = (db.brand_profiles || []).find((b: any) => b.user_id === uid) || null;
  let cp: any = (db.creator_profiles || []).find((c: any) => c.user_id === uid) || null;
  if (client && uid) {
    const [b, c] = await Promise.all([
      client.from("brand_profiles").select("*").eq("user_id", uid).maybeSingle().then((r: any) => r?.data, () => null),
      client.from("creator_profiles").select("*").eq("user_id", uid).maybeSingle().then((r: any) => r?.data, () => null),
    ]);
    if (b) bp = { ...(bp || {}), ...b };
    if (c) cp = { ...(cp || {}), ...c };
  }
  const isBrand = String(user?.role || "").toLowerCase() === "brand";
  const brandPoc = norm(bp?.poc_email) || norm(bp?.email);
  const creatorBiz = norm(cp?.business_email);
  const preferred = (isBrand ? brandPoc : "") || login || creatorBiz || brandPoc;
  const allowed = Array.from(new Set([
    login, norm(bp?.poc_email), norm(bp?.email), norm(cp?.email), creatorBiz,
  ].filter((e) => e && e.includes("@"))));
  return { preferred, allowed };
}
