export type InsuranceMonth = { standard: number; recovery: number; paid: boolean };
export type InsurancePlan = {
  id: string; revision: number; name: string; person: "Davide" | "Francesca" | "Comune";
  year: number; account: string; expenses: { label: string; cents: number }[];
  standard: number; recovery: number; months: InsuranceMonth[];
};
export function insuranceTotals(p: InsurancePlan) {
  const initial = p.expenses.reduce((s, e) => s + e.cents, 0);
  const paid = p.months.filter(m => m.paid);
  const standard = paid.reduce((s, m) => s + m.standard, 0);
  const recovery = paid.reduce((s, m) => s + m.recovery, 0);
  let cumulative = 0;
  const coveredMonth = p.months.findIndex(m => { if (m.paid) cumulative += m.recovery; return initial > 0 && cumulative >= initial; });
  return { initial, standard, recovery, total: standard + recovery, remaining: Math.max(0, initial - recovery), surplus: Math.max(0, recovery - initial), percent: initial ? recovery / initial * 100 : 0, coveredMonth };
}
export function validInsurancePlan(value: unknown): value is InsurancePlan {
  if (!value || typeof value !== "object") return false;
  const p = value as InsurancePlan;
  const money = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 100000000;
  return typeof p.id === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(p.id) && Number.isInteger(p.revision) && p.revision >= 0
    && typeof p.name === "string" && p.name.trim().length > 0 && p.name.length <= 120
    && ["Davide", "Francesca", "Comune"].includes(p.person)
    && Number.isInteger(p.year) && p.year >= 2000 && p.year <= 2200
    && typeof p.account === "string" && p.account.trim().length > 0 && p.account.length <= 100
    && money(p.standard) && money(p.recovery)
    && Array.isArray(p.expenses) && p.expenses.length > 0 && p.expenses.length <= 30
    && p.expenses.every(e => typeof e.label === "string" && e.label.trim().length > 0 && e.label.length <= 100 && money(e.cents))
    && p.expenses.some(e => e.cents > 0)
    && Array.isArray(p.months) && p.months.length === 12
    && p.months.every(m => money(m.standard) && money(m.recovery) && typeof m.paid === "boolean");
}
