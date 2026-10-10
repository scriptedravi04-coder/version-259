import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "../../lib/api";

// Session 36: who got each broadcast email and who did not (sent / failed / skipped / queued).
const AUDIENCE_LABEL = { creators: "Creators", brands: "Brands", agencies: "Agencies", unclaimed_creators: "Unclaimed creators", all: "Everyone" };
const STATUS_STYLE = { sent: "text-emerald-700 bg-emerald-50", failed: "text-red-700 bg-red-50", skipped: "text-gray-600 bg-gray-100", queued: "text-amber-700 bg-amber-50" };

export default function BroadcastReport({ refreshKey }) {
  const [list, setList] = useState([]);
  const [cap, setCap] = useState(null);
  const [open, setOpen] = useState(null);
  const [rows, setRows] = useState([]);
  const load = () => api.get("admin/broadcasts").then((r) => { setList(r.data?.broadcasts || []); setCap(r.data?.daily_cap); }).catch(() => {});
  useEffect(() => { load(); }, [refreshKey]);
  const toggle = async (id) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id); setRows([]);
    try { const r = await api.get(`admin/broadcasts/${id}`); setRows(r.data?.recipients || []); } catch { toast.error("Could not load the report."); }
  };
  const retry = async (id) => {
    try { await api.post(`admin/broadcasts/${id}/retry-failed`); toast.success("Failed emails queued again."); load(); if (open === id) toggle(id); }
    catch { toast.error("Retry failed."); }
  };
  if (list.length === 0) return null;
  return (
    <div className="mt-6 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-5" data-testid="broadcast-report">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-bold text-sm">Sent broadcasts</h4>
        <button onClick={load} className="text-xs flex items-center gap-1 text-[var(--text-secondary)]"><RefreshCw size={13} /> Refresh</button>
      </div>
      {cap && <p className="text-[11px] text-[var(--text-secondary)] mb-3">Up to {cap} emails go out per day (email provider limit). The rest are sent the next day automatically.</p>}
      <ul className="divide-y divide-[var(--border-default)]">
        {list.map((b) => (
          <li key={b.id} className="py-3">
            <div className="flex items-start justify-between gap-3">
              <button onClick={() => toggle(b.id)} className="text-left min-w-0 flex-1">
                <div className="font-semibold text-sm truncate">{b.subject}</div>
                <div className="text-[11px] text-[var(--text-secondary)]">
                  {AUDIENCE_LABEL[b.audience] || b.audience} · {new Date(b.created_at).toLocaleString("en-IN")}
                </div>
                <div className="text-xs mt-1 flex flex-wrap gap-2">
                  <span className="text-emerald-700">{b.sent || 0} sent</span>
                  <span className="text-amber-700">{b.queued || 0} waiting</span>
                  <span className="text-red-700">{b.failed || 0} failed</span>
                  <span className="text-gray-500">{b.skipped || 0} skipped</span>
                  <span className="text-[var(--text-secondary)]">of {b.total}</span>
                </div>
              </button>
              <div className="flex items-center gap-2 shrink-0">
                {(b.failed || 0) > 0 && <button onClick={() => retry(b.id)} className="px-2.5 py-1 rounded-lg border border-[var(--border-default)] text-[11px] font-semibold">Retry failed</button>}
                {open === b.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </div>
            {open === b.id && (
              <div className="mt-3 max-h-72 overflow-y-auto border border-[var(--border-default)] rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--bg-elevated)] text-left"><tr><th className="p-2">Email</th><th className="p-2">Status</th><th className="p-2">Note</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t border-[var(--border-default)]">
                        <td className="p-2 font-mono">{r.email}</td>
                        <td className="p-2"><span className={`px-2 py-0.5 rounded-md ${STATUS_STYLE[r.status] || ""}`}>{r.status}</span></td>
                        <td className="p-2 text-[var(--text-secondary)]">{r.error || (r.sent_at ? new Date(r.sent_at).toLocaleString("en-IN") : "")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
