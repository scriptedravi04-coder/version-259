import React, { useState } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { X, Upload, Download, CheckCircle2, AlertCircle, Copy } from "lucide-react";
import { api } from "../../lib/api";

import { PopupBackdrop, PopupPanel } from "../common/Popup";
// Session 36 (Ravi): Admin → Waitlist → Upload CSV. Each good row becomes a PENDING waitlist row for the
// normal review (nothing is approved, nothing is invented, no email is sent to imported people).
const TEMPLATE = [
  "name,email,mobile,instagram,city,gender,followers,avg_reach,price,niche,notes",
  "Asha Verma,asha@example.in,9876543210,asha.creates,Jaipur,Female,1.5L,12000,2500,Beauty,Met at event",
].join("\n");

const STATUS_STYLE = {
  ok: "text-emerald-700 bg-emerald-50",
  error: "text-red-700 bg-red-50",
  duplicate: "text-amber-700 bg-amber-50",
};

export default function WaitlistCsvImportModal({ open, onClose, onImported }) {
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const reset = () => { setRows(null); setFileName(""); setPreview(null); };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "ybex-creators-template.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (out) => {
        const parsed = (out.data || []).filter((r) => Object.values(r).some((v) => String(v || "").trim()));
        if (parsed.length === 0) { toast.error("The file has no rows."); return; }
        setRows(parsed);
        setBusy(true);
        try {
          const { data } = await api.post("admin/waitlist/import-csv", { rows: parsed, preview: true });
          setPreview(data);
        } catch (err) {
          toast.error(err?.response?.data?.detail || "Could not check the file.");
        } finally { setBusy(false); }
      },
      error: () => toast.error("Could not read this file. Save it as CSV and try again."),
    });
  };

  const doImport = async () => {
    if (!rows) return;
    setBusy(true);
    try {
      const { data } = await api.post("admin/waitlist/import-csv", { rows });
      toast.success(`${data.imported} creators added to the waitlist as Pending.`);
      onImported?.();
      reset();
      onClose?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Import failed. Nothing was saved.");
    } finally { setBusy(false); }
  };

  const s = preview?.summary;

  return (
    <PopupBackdrop className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <PopupPanel kind="modal" className="bg-[var(--bg-card)] w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-default)]">
          <div>
            <h3 className="font-bold text-lg text-[var(--text-primary)]">Upload creators (CSV)</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Rows are added as <b>Pending</b> for review. Empty cells stay empty. Imported people get no email.
            </p>
          </div>
          <button onClick={() => { reset(); onClose?.(); }} className="p-2 rounded-lg hover:bg-[var(--bg-elevated)]" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="flex flex-wrap gap-2">
            <button onClick={downloadTemplate} className="px-3 py-2 rounded-xl border border-[var(--border-default)] text-sm font-semibold flex items-center gap-2">
              <Download size={15} /> Sample CSV
            </button>
            <label className="px-3 py-2 rounded-xl bg-[var(--violet)] text-white text-sm font-semibold flex items-center gap-2 cursor-pointer">
              <Upload size={15} /> {fileName ? "Choose another file" : "Choose CSV file"}
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
            </label>
            {fileName && <span className="text-sm text-[var(--text-secondary)] self-center">{fileName}</span>}
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Columns: name and email are required; mobile, instagram, city, gender, followers (15000 or 1.5L), avg_reach, price, niche, notes are optional. Up to 500 rows.
          </p>

          {busy && <p className="text-sm text-[var(--text-secondary)]">Checking…</p>}

          {s && (
            <>
              <div className="flex flex-wrap gap-2 text-sm" data-testid="csv-summary">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 flex items-center gap-1"><CheckCircle2 size={14} /> {s.ok} ready</span>
                <span className="px-2.5 py-1 rounded-lg bg-red-50 text-red-700 flex items-center gap-1"><AlertCircle size={14} /> {s.errors} with errors</span>
                <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 flex items-center gap-1"><Copy size={14} /> {s.duplicates} already on Ybex</span>
              </div>
              <div className="overflow-x-auto border border-[var(--border-default)] rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--bg-elevated)] text-left">
                    <tr><th className="p-2">Row</th><th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Followers</th><th className="p-2">Result</th></tr>
                  </thead>
                  <tbody>
                    {preview.results.map((r) => {
                      const src = rows?.[r.row - 1] || {};
                      return (
                        <tr key={r.row} className="border-t border-[var(--border-default)]">
                          <td className="p-2">{r.row}</td>
                          <td className="p-2">{r.value?.name || src.name || "—"}</td>
                          <td className="p-2">{r.value?.email || src.email || "—"}</td>
                          <td className="p-2">{r.value?.followers != null ? Number(r.value.followers).toLocaleString("en-IN") : "—"}</td>
                          <td className="p-2"><span className={`px-2 py-0.5 rounded-md ${STATUS_STYLE[r.status]}`}>{r.status === "ok" ? "Ready" : r.reason}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-[var(--border-default)] flex justify-end gap-2">
          <button onClick={() => { reset(); onClose?.(); }} className="px-4 py-2 rounded-xl border border-[var(--border-default)] text-sm font-semibold">Cancel</button>
          <button
            disabled={busy || !s || s.ok === 0}
            onClick={doImport}
            className="px-4 py-2 rounded-xl bg-[var(--violet)] text-white text-sm font-semibold disabled:opacity-50"
          >
            Import {s?.ok || 0} as Pending
          </button>
        </div>
      </PopupPanel>
    </PopupBackdrop>
  );
}
