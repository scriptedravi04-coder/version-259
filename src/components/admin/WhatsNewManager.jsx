import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Trash2, Send, EyeOff, Pencil } from "lucide-react";
import { api } from "../../lib/api";

// Session 41 (Ravi) — write a "What's new" update and publish it. Each creator / brand sees each
// published update once (popup), then never again. Unpublish hides it from people who have not
// seen it yet.
const EMPTY = { id: null, title: "", points: "", audience: "all", cta_label: "", cta_url: "" };
const AUD = { all: "Everyone", creator: "Creators", brand: "Brands" };

export default function WhatsNewManager() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("admin/whats-new", { bypassCache: true });
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(e?.response?.data?.error || "Could not load updates.");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setBusy(true);
    try {
      await api.post("admin/whats-new", { ...form, points: form.points.split("\n") });
      toast.success(form.id ? "Saved." : "Draft saved. Publish it when ready.");
      setForm(EMPTY);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.error || "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const publish = async (it, published) => {
    try {
      await api.post(`admin/whats-new/${it.id}/publish`, { published });
      toast.success(published ? "Published — users will see it once." : "Unpublished.");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.error || "Could not update.");
    }
  };

  const remove = async (it) => {
    if (!window.confirm(`Delete "${it.title}"?`)) return;
    try {
      await api.delete(`admin/whats-new/${it.id}`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.error || "Could not delete.");
    }
  };

  const edit = (it) => setForm({
    id: it.id, title: it.title || "", points: (Array.isArray(it.points) ? it.points : []).join("\n"),
    audience: it.audience || "all", cta_label: it.cta_label || "", cta_url: it.cta_url || "",
  });

  const input = "w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2.5 text-sm";

  return (
    <div className="p-4 md:p-6 max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center"><Sparkles size={18} /></div>
        <div>
          <h1 className="text-xl font-bold">What's new</h1>
          <p className="text-xs text-[var(--text-secondary)]">A popup each creator / brand sees once. Keep it short — a title and 2–4 points.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border-default)] p-4 space-y-3 bg-[var(--bg-card)]">
        <div className="text-sm font-bold">{form.id ? "Edit update" : "New update"}</div>
        <input className={input} placeholder="Title — e.g. Express delivery is now free" value={form.title} onChange={set("title")} maxLength={120} />
        <textarea className={`${input} h-28`} placeholder={"One point per line (max 6)\nBrands can pick 24-hour delivery at no extra cost\nYou'll see a FREE badge on Express"} value={form.points} onChange={set("points")} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select className={input} value={form.audience} onChange={set("audience")}>
            <option value="all">Everyone</option>
            <option value="creator">Creators only</option>
            <option value="brand">Brands only</option>
          </select>
          <input className={input} placeholder="Button text (optional)" value={form.cta_label} onChange={set("cta_label")} maxLength={30} />
          <input className={input} placeholder="Button page, e.g. /campaigns" value={form.cta_url} onChange={set("cta_url")} />
        </div>
        <div className="flex gap-2 justify-end">
          {form.id && <button type="button" onClick={() => setForm(EMPTY)} className="px-4 py-2 rounded-xl border border-[var(--border-default)] text-sm font-semibold">Cancel</button>}
          <button type="button" disabled={busy} onClick={save} className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-bold disabled:opacity-60">{busy ? "Saving…" : form.id ? "Save changes" : "Save draft"}</button>
        </div>
      </div>

      <div className="space-y-3">
        {items.length === 0 && <div className="text-sm text-[var(--text-secondary)]">No updates yet.</div>}
        {items.map((it) => (
          <div key={it.id} className="rounded-2xl border border-[var(--border-default)] p-4 bg-[var(--bg-card)]">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm">{it.title}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{AUD[it.audience] || "Everyone"}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${it.published ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>{it.published ? "Live" : "Draft"}</span>
                </div>
                <ul className="mt-2 list-disc pl-5 text-xs text-[var(--text-secondary)] space-y-0.5">
                  {(Array.isArray(it.points) ? it.points : []).map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button type="button" onClick={() => edit(it)} title="Edit" className="p-2 rounded-lg hover:bg-slate-100"><Pencil size={15} /></button>
                {it.published
                  ? <button type="button" onClick={() => publish(it, false)} title="Unpublish" className="p-2 rounded-lg hover:bg-slate-100"><EyeOff size={15} /></button>
                  : <button type="button" onClick={() => publish(it, true)} title="Publish" className="p-2 rounded-lg hover:bg-violet-50 text-violet-700"><Send size={15} /></button>}
                <button type="button" onClick={() => remove(it)} title="Delete" className="p-2 rounded-lg hover:bg-red-50 text-red-600"><Trash2 size={15} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
