// Session 34: one 18+ rule for onboarding (desktop Step1_Identity has the same check).
/** Age in whole years from day / month / year strings, or null when the date is not real. */
export function ageFromDob(day, month, year, now = new Date()) {
  const d = Number(day), m = Number(month), y = Number(year);
  if (!d || !m || !y || String(year).length !== 4) return null;
  const dob = new Date(Date.UTC(y, m - 1, d));
  if (dob.getUTCFullYear() !== y || dob.getUTCMonth() !== m - 1 || dob.getUTCDate() !== d) return null;
  let age = now.getUTCFullYear() - y;
  const before = now.getUTCMonth() < m - 1 || (now.getUTCMonth() === m - 1 && now.getUTCDate() < d);
  if (before) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}
export const isUnder18 = (day, month, year, now) => {
  const a = ageFromDob(day, month, year, now);
  return a !== null && a < 18;
};
