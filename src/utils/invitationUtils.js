/**
 * Utilities for campaign invitations and briefs
 */

export const getDeliverablesCount = (deliverables) => {
  if (!deliverables && deliverables !== 0) return 1;
  if (typeof deliverables === "number") return Math.max(1, deliverables);
  const str = String(deliverables).trim();
  if (!str) return 1;

  // Extract explicit counts like "1 Dedicated Reel + 2 Stories" -> 3
  const matches = str.match(/\b\d+\b/g);
  if (matches && matches.length > 0) {
    const sum = matches.reduce((acc, curr) => acc + parseInt(curr, 10), 0);
    if (sum > 0 && sum < 100) return sum;
  }

  // Otherwise count delimited tokens (commas, pluses, newlines, semicolons)
  const parts = str.split(/[,+\n;]/).map(s => s.trim()).filter(Boolean);
  return parts.length || 1;
};

export const formatBudget = (val) => {
  if (!val && val !== 0) return "Negotiable";
  const str = String(val).trim();
  if (str.toLowerCase().includes("barter")) return str;
  const num = parseInt(str.replace(/[^0-9]/g, ""), 10);
  if (!isNaN(num) && num > 0) {
    return `₹${num.toLocaleString("en-IN")}`;
  }
  return str.startsWith("₹") ? str : `₹${str}`;
};
