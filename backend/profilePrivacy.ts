// Session 22. Fields a public profile must never show to other users.
const PRIVATE_KEY = /^(email|e_mail|phone|phone_number|mobile|whatsapp.*|contact_.*|personal_.*|bank.*|account.*|ifsc.*|upi.*|pan|pan_.*|aadhaar.*|aadhar.*|gst.*|gstin|address|full_address|pincode|password.*|.*_kyc.*|kyc.*|payout_.*|beneficiary.*|dob|date_of_birth)$/i;

export function stripPrivateProfileFields<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (PRIVATE_KEY.test(k) || /(_email|_phone|_mobile)$/i.test(k)) continue;
    out[k] = v;
  }
  return out;
}
