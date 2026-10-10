import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import AccountPanel from "../../components/account/AccountPanel";

// Public page linked from the Play Console "Data deletion" field. Explains how to delete a Ybex
// account, what is removed and what is kept. Logged-in users can delete right here; others sign in
// first (deletion is also in the app at Settings → Account → Delete account).
export default function DeleteAccount() {
  const { user, logout } = useAuth();
  return (
    <div className="max-w-2xl mx-auto px-5 py-8">
      <h1 className="text-2xl font-extrabold text-slate-900">Delete your Ybex account</h1>
      <p className="mt-2 text-[14px] text-slate-600 leading-relaxed">
        You can permanently delete your Ybex account and personal data at any time — from this page, or
        in the app at <span className="font-semibold">Settings → Account → Delete account</span>.
      </p>

      <div className="mt-6 rounded-2xl border border-slate-200 p-5">
        <h2 className="text-[15px] font-bold text-slate-900">What is removed</h2>
        <p className="mt-1 text-[14px] text-slate-600 leading-relaxed">
          Your profile, photos, portfolio, chats, social links and saved bank / UPI details.
        </p>
        <h2 className="mt-4 text-[15px] font-bold text-slate-900">What is kept</h2>
        <p className="mt-1 text-[14px] text-slate-600 leading-relaxed">
          Payment and invoice records, which the law requires us to retain for tax and accounting. Your
          name is removed from them. After deletion you have 30 days to recover by contacting support;
          after that the account is removed for good.
        </p>
      </div>

      {user ? (
        <div className="mt-6 rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 pt-4 text-[13px] font-bold text-slate-500">Delete this account</div>
          <AccountPanel onOpen={() => {}} onDeleted={() => logout?.()} />
        </div>
      ) : (
        <div className="mt-6 rounded-2xl bg-slate-50 border border-slate-200 p-5">
          <p className="text-[14px] text-slate-700">To delete your account, first sign in, then open Delete account.</p>
          <Link to="/login" className="inline-flex mt-3 h-11 items-center px-5 rounded-xl text-white text-[14px] font-bold" style={{ background: "linear-gradient(135deg,#9B00FF,#5A00C8)" }}>
            Log in to delete
          </Link>
          <p className="mt-4 text-[13px] text-slate-500">
            Need help? Email <a href="mailto:support@ybexmedia.in" className="font-semibold text-[#7C3AED]">support@ybexmedia.in</a>.
          </p>
        </div>
      )}
    </div>
  );
}
