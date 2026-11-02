"use client";
import { useEffect, useState } from "react";
import { InsurancePlan, insuranceTotals } from "../lib/insurance";
const months = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const euro = (v: number) => (v / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
function Money({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const [text, setText] = useState(String(value / 100).replace(".", ","));
  useEffect(() => setText(String(value / 100).replace(".", ",")), [value]);
  return <input aria-label={label} inputMode="decimal" required value={text} pattern="[0-9]+([,.][0-9]{1,2})?" onChange={e => { const s = e.target.value; setText(s); if (/^\d+([,.]\d{0,2})?$/.test(s)) onChange(Math.round(Number(s.replace(",", ".")) * 100)); }} />;
}
function newPlan(account: string, year: number): InsurancePlan {
  return { id: crypto.randomUUID(), revision: 0, name: "Assicurazione auto", person: "Davide", year, account, expenses: [{ label: "Assicurazione auto", cents: 0 }], standard: 25000, recovery: 15000, months: months.map(() => ({ standard: 25000, recovery: 15000, paid: false })) };
}
export function InsurancePlans({ commonAccounts, selectedPerson }: { commonAccounts: string[]; selectedPerson: string }) {
  const [plans, setPlans] = useState<InsurancePlan[]>([]);
  const [draft, setDraft] = useState<InsurancePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function load() {
    setLoading(true); setError("");
    try { const init = await fetch("/api/insurance-plans", { method: "POST" }); if (!init.ok) throw new Error("Impossibile preparare la scheda assicurazioni. Riprova."); const r = await fetch("/api/insurance-plans", { cache: "no-store" }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Caricamento non riuscito"); setPlans(d.plans); }
    catch (e) { setError(e instanceof Error ? e.message : "Caricamento non riuscito"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function save() {
    if (!draft || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const r = await fetch("/api/insurance-plans", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      setPlans(old => [...old.filter(p => p.id !== d.plan.id), d.plan]); setDraft(null); setMessage("Piano salvato.");
    } catch (e) { setError(e instanceof Error ? e.message : "Salvataggio non riuscito"); }
    finally { setBusy(false); }
  }
  async function remove(p: InsurancePlan) {
    if (!confirm(`Eliminare il piano ${p.name}?`)) return;
    setBusy(true); setError("");
    try { const r = await fetch("/api/insurance-plans", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, revision: p.revision }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setPlans(old => old.filter(x => x.id !== p.id)); }
    catch (e) { setError(e instanceof Error ? e.message : "Eliminazione non riuscita"); } finally { setBusy(false); }
  }
  const patch = (change: Partial<InsurancePlan>) => setDraft(p => p ? { ...p, ...change } : p);
  const visible = plans.filter(p => selectedPerson === "Tutti" || p.person === selectedPerson).sort((a, b) => b.year - a.year);
  return <section className="panel page-panel insurance-section">
    <div className="panel-heading"><div><p className="panel-kicker">Versamenti e copertura</p><h2>🚗 Rientro assicurazioni</h2><div className="panel-closed-summary">{visible.map(p => { const t = insuranceTotals(p); return <span className="summary-practice" key={p.id}><b>{p.name}</b><i>{p.person} · {p.year}</i><em>{p.account}</em><mark>Rientrato {euro(t.recovery)} / {euro(t.initial)}</mark><strong className={t.remaining ? "status-completed" : "status-active"}>{t.remaining ? `Da recuperare ${euro(t.remaining)}` : "✓ Esborso coperto"}</strong></span>; })}{loading && <span>Caricamento piani…</span>}{!loading && !visible.length && <span>{error || "Nessun piano per questa selezione"}</span>}</div></div><button type="button" className="primary-button" disabled={loading || busy || !!draft} onClick={() => { setError(""); setDraft(newPlan(commonAccounts.find(a => /bbva.*dafragu/i.test(a)) || commonAccounts[0] || "BBVA Dafragu", new Date().getFullYear())); }}>＋ Nuovo piano annuale</button></div>
    <p>Il rientro assicurativo ricostituisce la somma anticipata. Il versamento standard rimane separato. Questa scheda tiene il rendiconto e non modifica i saldi dei conti.</p>
    {loading && <p role="status">Caricamento piani…</p>}
    {message && <p role="status">{message}</p>}
    {error && !draft && <p role="alert">{error} <button type="button" onClick={load}>Ricarica</button></p>}
    {!loading && !visible.length && !draft && <p>Nessun piano per questa selezione.</p>}
    {visible.map(p => {
      const t = insuranceTotals(p);
      return <details className="insurance-card" key={p.id} open={undefined}>
        <summary><strong>{p.name}</strong><span>{p.person} · {p.year} · {p.account}</span><span>Esborso {euro(t.initial)} · Rientrato {euro(t.recovery)} · {t.remaining ? `Da recuperare ${euro(t.remaining)}` : "✓ Esborso coperto"}</span></summary>
        <div className="insurance-body"><div className="insurance-stats"><div className="insurance-outgoing">Esborso iniziale<strong>{euro(t.initial)}</strong></div><div className="insurance-incoming">Rientro versato<strong>{euro(t.recovery)}</strong></div><div className={t.remaining ? "insurance-pending" : "insurance-incoming"}>{t.surplus ? "Eccedenza rientro" : t.remaining ? "Da recuperare" : "✓ Copertura raggiunta"}<strong>{euro(t.surplus || t.remaining)}</strong></div></div>
        <progress max={100} value={Math.min(100, t.percent)} aria-label="Copertura esborso assicurativo" /><p className={t.remaining ? "insurance-coverage insurance-pending" : "insurance-coverage insurance-incoming"}>{t.percent.toLocaleString("it-IT", { maximumFractionDigits: 1 })}% coperto{t.coveredMonth >= 0 ? ` · Esborso coperto a ${months[t.coveredMonth].toLowerCase()} ${p.year}` : ""}</p>
        <p>{p.expenses.map(e => `${e.label}: ${euro(e.cents)}`).join(" · ")}</p>
        <div className="insurance-table"><table><thead><tr><th>Mese</th><th>Standard</th><th>Rientro assicurazione</th><th>Totale</th><th>Versato</th></tr></thead><tbody>{p.months.map((m, i) => <tr key={i} className={m.paid ? "insurance-paid" : "insurance-unpaid"}><th>{months[i]}</th><td>{euro(m.standard)}</td><td>{euro(m.recovery)}</td><td>{euro(m.standard + m.recovery)}</td><td>{m.paid ? "✓ Sì" : "—"}</td></tr>)}</tbody><tfoot><tr><th>Totali versati</th><td>{euro(t.standard)}</td><td>{euro(t.recovery)}</td><td>{euro(t.total)}</td><td /></tr></tfoot></table></div>
        <div className="insurance-actions"><button type="button" disabled={busy || !!draft} onClick={() => { setError(""); setDraft(structuredClone(p)); }}>✎ Modifica / registra versamenti</button><button type="button" disabled={busy || !!draft} onClick={() => setDraft({ ...structuredClone(p), id: crypto.randomUUID(), revision: 0, year: p.year + 1, name: p.name.replace(String(p.year), String(p.year + 1)), months: months.map(() => ({ standard: p.standard, recovery: p.recovery, paid: false })) })}>＋ Copia per il prossimo anno</button><button type="button" disabled={busy} onClick={() => remove(p)}>Elimina piano</button></div></div>
      </details>;
    })}
    {draft && <form className="insurance-editor" onSubmit={e => { e.preventDefault(); void save(); }}>
      <h3>{draft.revision ? "Modifica piano" : "Nuovo piano annuale"}</h3>
      <div className="insurance-fields"><label>Nome<input required maxLength={120} value={draft.name} onChange={e => patch({ name: e.target.value })} /></label><label>Intestatario<select value={draft.person} onChange={e => patch({ person: e.target.value as InsurancePlan["person"] })}>{["Davide", "Francesca", "Comune"].map(s => <option key={s}>{s}</option>)}</select></label><label>Anno<input required type="number" min={2000} max={2200} value={draft.year} onChange={e => patch({ year: Number(e.target.value) })} /></label><label>Pagata da / conto utilizzato<select value={draft.account} onChange={e => patch({ account: e.target.value })}>{Array.from(new Set([...commonAccounts, "Davide", "Francesca", draft.account])).map(a => <option key={a}>{a}</option>)}</select></label></div>
      <h4>Esborso iniziale</h4>{draft.expenses.map((expense, i) => <div className="insurance-expense" key={i}><label>Voce<input required maxLength={100} value={expense.label} onChange={e => patch({ expenses: draft.expenses.map((v, j) => j === i ? { ...v, label: e.target.value } : v) })} /></label><label>Importo (€)<Money label={`Importo ${expense.label}`} value={expense.cents} onChange={cents => patch({ expenses: draft.expenses.map((v, j) => j === i ? { ...v, cents } : v) })} /></label><button type="button" disabled={draft.expenses.length <= 1} onClick={() => patch({ expenses: draft.expenses.filter((_, j) => j !== i) })}>Rimuovi</button></div>)}
      <button type="button" onClick={() => patch({ expenses: [...draft.expenses, { label: "Altra assicurazione", cents: 0 }] })}>＋ Aggiungi voce</button>
      <div className="insurance-fields"><label>Versamento standard mensile (€)<Money label="Standard mensile" value={draft.standard} onChange={standard => patch({ standard })} /></label><label>Rientro assicurazione mensile (€)<Money label="Rientro mensile" value={draft.recovery} onChange={recovery => patch({ recovery })} /></label></div>
      <button type="button" onClick={() => patch({ months: draft.months.map(m => m.paid ? m : { ...m, standard: draft.standard, recovery: draft.recovery }) })}>Applica ai mesi non ancora versati</button>
      <p>Spunta «Versato» solo per i versamenti effettuati. Puoi modificare gli importi di ciascun mese.</p>
      <div className="insurance-table"><table><thead><tr><th>Mese</th><th>Standard (€)</th><th>Rientro (€)</th><th>Totale</th><th>Versato</th></tr></thead><tbody>{draft.months.map((m, i) => <tr key={i} className={m.paid ? "insurance-paid" : "insurance-unpaid"}><th>{months[i]}</th><td><Money label={`Standard ${months[i]}`} value={m.standard} onChange={standard => patch({ months: draft.months.map((v, j) => j === i ? { ...v, standard } : v) })} /></td><td><Money label={`Rientro ${months[i]}`} value={m.recovery} onChange={recovery => patch({ months: draft.months.map((v, j) => j === i ? { ...v, recovery } : v) })} /></td><td>{euro(m.standard + m.recovery)}</td><td><input type="checkbox" aria-label={`${months[i]} versato`} checked={m.paid} onChange={e => patch({ months: draft.months.map((v, j) => j === i ? { ...v, paid: e.target.checked } : v) })} /></td></tr>)}</tbody><tfoot><tr><th>Totali versati</th><td>{euro(insuranceTotals(draft).standard)}</td><td>{euro(insuranceTotals(draft).recovery)}</td><td>{euro(insuranceTotals(draft).total)}</td><td /></tr></tfoot></table></div>
      <div className="insurance-draft-totals"><span className="insurance-outgoing">Esborso: <strong>{euro(insuranceTotals(draft).initial)}</strong></span><span className="insurance-pending">Da recuperare: <strong>{euro(insuranceTotals(draft).remaining)}</strong></span>{insuranceTotals(draft).surplus > 0 && <span className="insurance-incoming">Eccedenza: <strong>{euro(insuranceTotals(draft).surplus)}</strong></span>}</div>
      {error && <p role="alert">{error}</p>}
      <div className="insurance-save"><button className="primary-button" disabled={busy} type="submit">{busy ? "Salvataggio…" : "Salva piano e versamenti"}</button><button type="button" disabled={busy} onClick={() => { if (confirm("Chiudere senza salvare le modifiche?")) { setDraft(null); setError(""); void load(); } }}>Annulla</button></div>
    </form>}
  </section>;
}
