"use client";
import { InsurancePlans } from "./insurance-plans";

import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

type Movement = {
  id: number;
  kind: "Spesa" | "Entrata";
  description: string;
  category: string;
  amount: number;
  person: "Davide" | "Francesca" | "Comune";
  commonAccount?: string | null;
  date: string;
};
type Bill = {
  id: number;
  provider: string;
  service: string;
  amount: number;
  wallet: string;
  date: string;
  recurring?: boolean;
  billingFrequency?: "monthly" | "annual";
};
type Budget = { id: number; month: string; category: string; limit: number };
type CommonTransaction = {
  id: number;
  account: string;
  direction: "Spesa" | "Entrata";
  amount: number;
  date: string;
};
type Deadline = { id: number; title: string; date: string; completed: boolean };
type DuplicateAcknowledgement = {
  id: number;
  duplicateKey: string;
  author: "Davide" | "Francesca";
  createdAt: string;
};
type Decision = {
  id: number;
  title: string;
  content: string;
  author: "Davide" | "Francesca";
  status: "Da valutare" | "Decisa";
  date: string;
};
type Trip = {
  id: number;
  title: string;
  startDate: string;
  endDate: string;
  budget: number;
  notes: string;
  active: boolean;
  completedAt?: string | null;
};
type TripExpense = {
  id: number;
  tripId: number;
  label: string;
  section: string;
  note: string;
  amount: number;
  paid: boolean;
  affectsAccounts: boolean;
  paidDate?: string | null;
  payer: string;
  commonAccount?: string | null;
  movementId?: number | null;
};
type TripRepayment = {
  id: number;
  tripId: number;
  label: string;
  amount: number;
  dueDate: string;
  paid: boolean;
  note: string;
  kind?: "money" | "object";
};

const euro = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
});
const shortDate = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

function previousMonthKey(month: string) {
  const date = new Date(`${month}-01T12:00:00`);
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function latestRecurring(bills: Bill[]) {
  const map = new Map<string, Bill>();
  bills
    .filter((bill) => bill.recurring && isSubscription(bill))
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((bill) => {
      const key = `${bill.wallet}|${bill.provider}|${bill.service}`;
      if (!map.has(key)) map.set(key, bill);
    });
  return [...map.values()];
}

export function DashboardAdvice({
  movements,
  bills,
  budgets,
  transactions,
  deadlines,
  onNavigate,
}: {
  movements: Movement[];
  bills: Bill[];
  budgets: Budget[];
  transactions: CommonTransaction[];
  deadlines: Deadline[];
  onNavigate: (
    view: "movimenti" | "budget" | "scadenze" | "utenze" | "report",
  ) => void;
}) {
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateAcknowledgements, setDuplicateAcknowledgements] = useState<
    DuplicateAcknowledgement[]
  >([]);
  const [savingDuplicateKey, setSavingDuplicateKey] = useState<string | null>(
    null,
  );
  useEffect(() => {
    fetch("/api/duplicate-acknowledgements")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as {
          acknowledgements?: DuplicateAcknowledgement[];
        };
        setDuplicateAcknowledgements(payload.acknowledgements ?? []);
      })
      .catch(() => undefined);
  }, []);
  const month = today().slice(0, 7);
  const previous = previousMonthKey(month);
  const accountedMovements = movements.filter((item) => item.date <= today());
  const accountedTransactions = transactions.filter((item) => item.date <= today());
  const monthExpenses = accountedMovements
    .filter((item) => item.kind === "Spesa" && item.date.startsWith(month))
    .reduce((sum, item) => sum + item.amount, 0);
  const previousExpenses = accountedMovements
    .filter((item) => item.kind === "Spesa" && item.date.startsWith(previous))
    .reduce((sum, item) => sum + item.amount, 0);
  const forecast = latestRecurring(bills).reduce(
    (sum, bill) => sum + bill.amount,
    0,
  );
  const duplicates = new Map<string, number[]>();
  movements.forEach((item) => {
    const key = `${item.date}|${item.amount.toFixed(2)}|${item.description.trim().toLowerCase()}`;
    duplicates.set(key, [...(duplicates.get(key) ?? []), item.id]);
  });
  const duplicateGroups = [...duplicates.values()]
    .filter((ids) => ids.length > 1)
    .map((ids) =>
      ids
        .map((id) => movements.find((item) => item.id === id))
        .filter((item): item is Movement => Boolean(item)),
    );
  const duplicateKey = (group: Movement[]) => {
    const item = group[0];
    return `${group.map((entry) => entry.id).sort((a, b) => a - b).join(",")}|${item.date}|${item.amount.toFixed(2)}|${item.description.trim().toLowerCase()}`;
  };
  const acknowledgementByKey = new Map(
    duplicateAcknowledgements.map((item) => [item.duplicateKey, item]),
  );
  const newDuplicateGroups = duplicateGroups.filter(
    (group) => !acknowledgementByKey.has(duplicateKey(group)),
  );
  const reviewedDuplicateGroups = duplicateGroups.filter((group) =>
    acknowledgementByKey.has(duplicateKey(group)),
  );
  const duplicateCount = newDuplicateGroups.reduce(
    (sum, group) => sum + group.length,
    0,
  );
  const acknowledgeDuplicates = async (
    group: Movement[],
    author: "Davide" | "Francesca",
  ) => {
    const key = duplicateKey(group);
    setSavingDuplicateKey(key);
    try {
      const response = await fetch("/api/duplicate-acknowledgements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duplicateKey: key, author }),
      });
      if (!response.ok) return;
      const payload = (await response.json()) as {
        acknowledgement: DuplicateAcknowledgement;
      };
      setDuplicateAcknowledgements((current) => [
        payload.acknowledgement,
        ...current.filter((item) => item.duplicateKey !== key),
      ]);
    } finally {
      setSavingDuplicateKey(null);
    }
  };
  const budgetWarnings = budgets
    .filter((budget) => budget.month === month)
    .filter((budget) => {
      const spent = accountedMovements
        .filter(
          (item) =>
            item.kind === "Spesa" &&
            item.category === budget.category &&
            item.date.startsWith(month),
        )
        .reduce((sum, item) => sum + item.amount, 0);
      return spent >= budget.limit * 0.8;
    });
  const balances = new Map<string, number>();
  accountedTransactions.forEach((item) =>
    balances.set(
      item.account,
      (balances.get(item.account) ?? 0) +
        (item.direction === "Entrata" ? item.amount : -item.amount),
    ),
  );
  const lowAccounts = [...balances.entries()].filter(([, value]) => value < 50);
  const upcoming = deadlines
    .filter((item) => !item.completed && item.date >= today())
    .slice(0, 3);
  const change = previousExpenses
    ? Math.round(((monthExpenses - previousExpenses) / previousExpenses) * 100)
    : null;
  return (
    <section className="advice-section">
      <div className="section-title">
        <div>
          <p className="panel-kicker">Controlli automatici</p>
          <h2>Occhio del mese</h2>
        </div>
        <button className="text-btn" onClick={() => onNavigate("report")}>
          Apri la chiusura mensile →
        </button>
      </div>
      <div className="advice-grid">
        <button className="advice-card" onClick={() => onNavigate("report")}>
          <span>📊</span>
          <div>
            <strong>
              {change === null
                ? "Primo confronto in preparazione"
                : `Spese ${change > 0 ? "+" : ""}${change}%`}
            </strong>
            <small>
              {change === null
                ? "Servono dati del mese precedente"
                : "rispetto al mese precedente"}
            </small>
          </div>
        </button>
        <button className="advice-card" onClick={() => onNavigate("utenze")}>
          <span>🔭</span>
          <div>
            <strong>{euro.format(forecast)}</strong>
            <small>previsione mensile delle spese ricorrenti</small>
          </div>
        </button>
        <button
          className={`advice-card ${duplicateCount ? "warning" : "ok"}`}
          onClick={() =>
            duplicateGroups.length && setDuplicateOpen((open) => !open)
          }
          aria-expanded={duplicateGroups.length ? duplicateOpen : undefined}
          aria-controls={duplicateGroups.length ? "duplicate-details" : undefined}
        >
          <span>{duplicateCount ? "⚠️" : "✓"}</span>
          <div>
            <strong>
              {duplicateCount
                ? `${duplicateCount} possibili doppioni`
                : reviewedDuplicateGroups.length
                  ? "Doppioni già verificati"
                  : "Nessun doppione evidente"}
            </strong>
            <small>
              {duplicateGroups.length
                ? `${duplicateOpen ? "Nascondi" : "Mostra"} i movimenti da controllare`
                : "stessa data, cifra e descrizione"}
            </small>
          </div>
        </button>
        <button
          className={`advice-card ${budgetWarnings.length ? "warning" : "ok"}`}
          onClick={() => onNavigate("budget")}
        >
          <span>◔</span>
          <div>
            <strong>
              {budgetWarnings.length
                ? `${budgetWarnings.length} budget da controllare`
                : "Budget sotto controllo"}
            </strong>
            <small>
              {budgetWarnings.map((item) => item.category).join(", ") ||
                "nessuna soglia oltre l’80%"}
            </small>
          </div>
        </button>
        <button
          className={`advice-card ${lowAccounts.length ? "warning" : "ok"}`}
          onClick={() => onNavigate("report")}
        >
          <span>🏦</span>
          <div>
            <strong>
              {lowAccounts.length
                ? `${lowAccounts.length} conti sotto 50 €`
                : "Conti comuni sopra la soglia"}
            </strong>
            <small>
              {lowAccounts.map(([name]) => name).join(", ") ||
                "saldo complessivo controllato"}
            </small>
          </div>
        </button>
        <button className="advice-card" onClick={() => onNavigate("scadenze")}>
          <span>⏰</span>
          <div>
            <strong>
              {upcoming.length
                ? `${upcoming.length} prossime scadenze`
                : "Nessuna scadenza futura"}
            </strong>
            <small>
              {upcoming.map((item) => item.title).join(", ") ||
                "potete aggiungerne una"}
            </small>
          </div>
        </button>
      </div>
      {duplicateOpen && duplicateGroups.length > 0 && (
        <div className="duplicate-details" id="duplicate-details">
          <div className="duplicate-details-heading">
            <div>
              <p className="panel-kicker">Verifica richiesta</p>
              <h3>Movimenti che potrebbero essere doppi</h3>
            </div>
            <button
              className="text-btn"
              type="button"
              onClick={() => setDuplicateOpen(false)}
              aria-label="Chiudi il dettaglio dei possibili doppioni"
            >
              Chiudi ×
            </button>
          </div>
          <p className="duplicate-explanation">
            Sono segnalati perché hanno la stessa data, lo stesso importo e la
            stessa descrizione. Potrebbero comunque essere movimenti corretti.
          </p>
          {newDuplicateGroups.length > 0 && (
            <div className="duplicate-groups">
            {newDuplicateGroups.map((group, groupIndex) => (
              <article key={`${group[0]?.id ?? groupIndex}-${groupIndex}`}>
                <strong>Da verificare · gruppo {groupIndex + 1}</strong>
                {group.map((item) => (
                  <div className="duplicate-row" key={item.id}>
                    <span className={item.kind === "Entrata" ? "income-text" : "expense-text"}>
                      {item.kind === "Entrata" ? "+" : "−"} {euro.format(item.amount)}
                    </span>
                    <div>
                      <b>{item.description}</b>
                      <small>
                        {shortDate.format(new Date(`${item.date}T12:00:00`))} · {item.person} · {item.category}
                      </small>
                    </div>
                  </div>
                ))}
                <div className="duplicate-ack-actions">
                  <small>Chi ha controllato questi movimenti?</small>
                  <div>
                    <button
                      type="button"
                      disabled={savingDuplicateKey === duplicateKey(group)}
                      onClick={() => acknowledgeDuplicates(group, "Davide")}
                    >
                      ✓ Presa visione Davide
                    </button>
                    <button
                      type="button"
                      disabled={savingDuplicateKey === duplicateKey(group)}
                      onClick={() => acknowledgeDuplicates(group, "Francesca")}
                    >
                      ✓ Presa visione Francesca
                    </button>
                  </div>
                </div>
              </article>
            ))}
            </div>
          )}
          {reviewedDuplicateGroups.length > 0 && (
            <details className="reviewed-duplicates">
              <summary>
                Già verificati ({reviewedDuplicateGroups.length})
              </summary>
              {reviewedDuplicateGroups.map((group) => {
                const acknowledgement = acknowledgementByKey.get(
                  duplicateKey(group),
                );
                return (
                  <div key={duplicateKey(group)}>
                    <b>{group[0].description} · {euro.format(group[0].amount)}</b>
                    <small>
                      Presa visione: {acknowledgement?.author} · {acknowledgement
                        ? new Intl.DateTimeFormat("it-IT", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(acknowledgement.createdAt))
                        : ""}
                    </small>
                  </div>
                );
              })}
            </details>
          )}
          <button
            className="primary-btn duplicate-action"
            type="button"
            onClick={() => onNavigate("movimenti")}
          >
            Apri Movimenti per modificare o eliminare
          </button>
        </div>
      )}
    </section>
  );
}

export function UtilitiesAnalysis({ bills }: { bills: Bill[] }) {
  const subscriptions = latestRecurring(bills);
  const providers = Array.from(
    new Set(bills.map((bill) => bill.provider)),
  ).sort();
  const [provider, setProvider] = useState("");
  const effectiveProvider = providers.includes(provider)
    ? provider
    : (providers[0] ?? "");
  const history = bills
    .filter((bill) => bill.provider === effectiveProvider)
    .sort((a, b) => a.date.localeCompare(b.date));
  const max = Math.max(...history.map((bill) => bill.amount), 1);
  const last = history.at(-1);
  const prior = history.at(-2);
  const variation =
    last && prior ? ((last.amount - prior.amount) / prior.amount) * 100 : null;
  return (
    <div className="utility-analysis">
      <article className="insight-box">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">Costi fissi</p>
            <h3>Abbonamenti attivi</h3>
          </div>
        </div>
        {subscriptions.length ? (
          <>
            <div className="subscription-total">
              <div>
                <span>Mensile</span>
                <strong>
                  {euro.format(
                    subscriptions.reduce(
                      (sum, item) =>
                        sum +
                        (item.billingFrequency === "annual"
                          ? item.amount / 12
                          : item.amount),
                      0,
                    ),
                  )}
                </strong>
              </div>
              <div>
                <span>Annuale stimato</span>
                <strong>
                  {euro.format(
                    subscriptions.reduce(
                      (sum, item) =>
                        sum +
                        (item.billingFrequency === "annual"
                          ? item.amount
                          : item.amount * 12),
                      0,
                    ),
                  )}
                </strong>
              </div>
            </div>
            <div className="chip-list">
              {subscriptions.map((item) => (
                <span key={`${item.wallet}-${item.provider}-${item.service}`}>
                  {item.provider} · {euro.format(item.amount)}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="report-copy">
            Gli abbonamenti ricorrenti compariranno qui.
          </p>
        )}
      </article>
      <article className="insight-box">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">Storico fatture</p>
            <h3>Variazione per fornitore</h3>
          </div>
          {providers.length > 0 && (
            <select
              className="compact-select"
              value={effectiveProvider}
              onChange={(event) => setProvider(event.target.value)}
            >
              {providers.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          )}
        </div>
        {history.length ? (
          <>
            <div className="history-bars">
              {history.slice(-8).map((bill) => (
                <div
                  key={bill.id}
                  title={`${bill.date}: ${euro.format(bill.amount)}`}
                >
                  <i
                    style={{
                      height: `${Math.max(8, (bill.amount / max) * 100)}%`,
                    }}
                  />
                  <span>{bill.date.slice(5)}</span>
                </div>
              ))}
            </div>
            <p
              className={`variation ${variation !== null && variation > 0 ? "negative" : "positive"}`}
            >
              {variation === null
                ? "Servono almeno due fatture per il confronto."
                : `${variation > 0 ? "+" : ""}${variation.toFixed(1)}% rispetto alla fattura precedente.`}
            </p>
          </>
        ) : (
          <p className="report-copy">Nessuna fattura disponibile.</p>
        )}
      </article>
    </div>
  );
}

function isSubscription(bill: Bill) {
  return bill.recurring || bill.service === "Streaming" || bill.service === "Abbonamento" || [
    "Netflix", "Prime Video", "Sky", "Disney+", "NOW", "DAZN", "Apple TV+", "Paramount+", "Spotify", "Audible",
  ].includes(bill.provider);
}

export function SubscriptionsView({
  bills,
  onAdd,
  onEdit,
  onToggleStatus,
}: {
  bills: Bill[];
  onAdd: () => void;
  onEdit: (bill: Bill) => void;
  onToggleStatus: (bill: Bill) => void;
}) {
  const [status, setStatus] = useState<"active" | "all" | "closed">("active");
  const [person, setPerson] = useState<"Tutti" | "Davide" | "Francesca" | "Comune">("Tutti");
  const latest = new Map<string, Bill>();
  bills
    .filter(isSubscription)
    .filter((bill) => person === "Tutti" || bill.wallet === person || (person === "Comune" && !["Davide", "Francesca"].includes(bill.wallet)))
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
    .forEach((bill) => {
      const key = `${bill.wallet}|${bill.provider}|${bill.service}`;
      if (!latest.has(key)) latest.set(key, bill);
    });
  const subscriptions = [...latest.values()];
  const shown = subscriptions.filter((bill) => status === "all" || (status === "active" ? bill.recurring : !bill.recurring));
  const active = subscriptions.filter((bill) => bill.recurring);
  const monthly = active.reduce((sum, bill) => sum + (bill.billingFrequency === "annual" ? bill.amount / 12 : bill.amount), 0);
  const annual = active.reduce((sum, bill) => sum + (bill.billingFrequency === "annual" ? bill.amount : bill.amount * 12), 0);
  return (
    <section className="panel page-panel subscriptions-page">
      <div className="panel-heading subscriptions-heading">
        <div>
          <p className="panel-kicker">Costi fissi sotto controllo</p>
          <h2>Abbonamenti</h2>
          <p className="report-copy">Una riga per servizio: così capite subito cosa tenere e cosa tagliare.</p>
          <div className="panel-closed-summary"><span className="summary-practice"><i>Attivi</i><strong>{active.length}</strong><em>Media {euro.format(monthly)}</em><mark>Anno {euro.format(annual)}</mark></span></div>
        </div>
        <button className="primary-btn" onClick={onAdd}>＋ Nuovo abbonamento</button>
      </div>
      <div className="subscription-kpis">
        <article><span>Attivi</span><strong>{active.length}</strong><small>servizi ricorrenti</small></article>
        <article><span>Media mensile</span><strong>{euro.format(monthly)}</strong><small>costi annuali ripartiti su 12 mesi</small></article>
        <article><span>Totale annuale</span><strong>{euro.format(annual)}</strong><small>in base alla frequenza indicata</small></article>
      </div>
      <div className="subscription-toolbar">
        <div className="subscription-filters">
          <div className="status-switch" aria-label="Intestatario abbonamenti">
            {(["Tutti", "Davide", "Francesca", "Comune"] as const).map((item) => (
              <button key={item} className={person === item ? "selected" : ""} onClick={() => setPerson(item)}>{item}</button>
            ))}
          </div>
          <div className="status-switch" aria-label="Stato abbonamenti">
            <button className={status === "active" ? "selected" : ""} onClick={() => setStatus("active")}>Attivi</button>
            <button className={status === "all" ? "selected" : ""} onClick={() => setStatus("all")}>Tutti</button>
            <button className={status === "closed" ? "selected" : ""} onClick={() => setStatus("closed")}>Conclusi</button>
          </div>
        </div>
        <small>{shown.length} {shown.length === 1 ? "servizio" : "servizi"} visualizzati</small>
      </div>
      {shown.length ? (
        <div className="subscription-grid">
          {shown.map((bill) => (
            <article className={`subscription-card ${bill.recurring ? "active" : "closed"}`} key={bill.id}>
              <div className="subscription-card-top">
                <span className="subscription-logo">{bill.service === "Streaming" ? "▶" : "◉"}</span>
                <span className={`subscription-status ${bill.recurring ? "active" : "closed"}`}>{bill.recurring ? "● Attivo" : "✓ Concluso"}</span>
              </div>
              <h3>{bill.provider}</h3>
              <p>{bill.service} · <b>{bill.wallet}</b></p>
              <strong>{euro.format(bill.amount)} <small>/ {bill.billingFrequency === "annual" ? "anno" : "mese"}</small></strong>
              <div className="subscription-meta"><span>Totale annuale</span><b>{euro.format(bill.billingFrequency === "annual" ? bill.amount : bill.amount * 12)}</b></div>
              <div className="subscription-meta"><span>Ultima registrazione</span><b>{shortDate.format(new Date(`${bill.date}T12:00:00`))}</b></div>
              <div className="subscription-actions">
                <button className="secondary-btn" onClick={() => onEdit(bill)}>Modifica</button>
                <button className={bill.recurring ? "subscription-close" : "subscription-reopen"} onClick={() => onToggleStatus(bill)}>{bill.recurring ? "Segna concluso" : "Riattiva"}</button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state compact">
          <span>◉</span>
          <h2>Nessun abbonamento {status === "closed" ? "concluso" : "attivo"}</h2>
          <p>Registra le piattaforme ricorrenti dalle Utenze o usa il tasto qui sopra.</p>
        </div>
      )}
    </section>
  );
}

function FeatureModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="close-btn" onClick={onClose}>
          ×
        </button>
        <p className="panel-kicker">Casa Insieme</p>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}

export function DecisionsView() {
  const [items, setItems] = useState<Decision[]>([]);
  const [editing, setEditing] = useState<Decision | "new" | null>(null);
  const load = () =>
    fetch("/api/decisions")
      .then((response) => response.json())
      .then((data: { decisions?: Decision[] }) =>
        setItems(data.decisions ?? []),
      );
  useEffect(() => {
    load();
  }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      id: editing === "new" ? undefined : editing?.id,
      title: String(form.get("title")),
      content: String(form.get("content")),
      author: String(form.get("author")),
      status: String(form.get("status")),
      date: String(form.get("date")),
    };
    await fetch("/api/decisions", {
      method: editing === "new" ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setEditing(null);
    load();
  }
  async function remove(item: Decision) {
    if (!confirm(`Eliminare “${item.title}”?`)) return;
    await fetch(`/api/decisions?id=${item.id}`, { method: "DELETE" });
    load();
  }
  return (
    <section className="panel page-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">Accordi e cose da valutare</p>
          <h2>Decisioni di casa</h2>
        </div>
        <button className="primary-btn" onClick={() => setEditing("new")}>
          ＋ Nuova decisione
        </button>
      </div>
      {items.length ? (
        <div className="decision-grid">
          {items.map((item) => (
            <article
              className={`decision-card ${item.status === "Decisa" ? "done" : "open"}`}
              key={item.id}
            >
              <div className="decision-top">
                <span>{item.status}</span>
                <small>
                  {item.author} ·{" "}
                  {shortDate.format(new Date(`${item.date}T12:00:00`))}
                </small>
              </div>
              <h3>{item.title}</h3>
              <p>{item.content || "Nessun dettaglio aggiunto."}</p>
              <div className="row-actions">
                <button className="delete-btn" onClick={() => setEditing(item)}>
                  ✎
                </button>
                <button className="delete-btn" onClick={() => remove(item)}>
                  🗑️
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span>🤝</span>
          <h2>Nessuna decisione salvata</h2>
          <p>
            Usate questa sezione per conservare scelte, accordi e questioni
            ancora da valutare.
          </p>
          <button className="primary-btn" onClick={() => setEditing("new")}>
            Inserisci la prima
          </button>
        </div>
      )}
      {editing && (
        <FeatureModal
          title={editing === "new" ? "Nuova decisione" : "Modifica decisione"}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={save}>
            <label>
              Titolo
              <input
                name="title"
                defaultValue={editing === "new" ? "" : editing.title}
                required
              />
            </label>
            <label>
              Dettagli
              <textarea
                name="content"
                rows={5}
                defaultValue={editing === "new" ? "" : editing.content}
              />
            </label>
            <div className="form-row">
              <label>
                Autore
                <select
                  name="author"
                  defaultValue={editing === "new" ? "Davide" : editing.author}
                >
                  <option>Davide</option>
                  <option>Francesca</option>
                </select>
              </label>
              <label>
                Stato
                <select
                  name="status"
                  defaultValue={
                    editing === "new" ? "Da valutare" : editing.status
                  }
                >
                  <option>Da valutare</option>
                  <option>Decisa</option>
                </select>
              </label>
            </div>
            <label>
              Data
              <input
                name="date"
                type="date"
                defaultValue={editing === "new" ? today() : editing.date}
                required
              />
            </label>
            <button className="primary-btn full">Salva</button>
          </form>
        </FeatureModal>
      )}
    </section>
  );
}

type TravelModal =
  | { kind: "trip"; item?: Trip }
  | { kind: "expense"; item?: TripExpense }
  | { kind: "repayment"; item?: TripRepayment };
function TravelSchedule({tripId,cost,items,close,refresh}:{tripId:number;cost:number;items:TripRepayment[];close:()=>void;refresh:()=>Promise<void>}) {
  const people=["Davide","Francesca"], money=(c:number)=>euro.format(c/100);
  const cent=(n:number)=>Math.round(n*100), show=(c:number)=>(c/100).toFixed(2).replace(".",",");
  const parse=(s:string)=>/^\d+(?:[.,]\d{1,2})?$/.test(s)?cent(Number(s.replace(",","."))):NaN;
  const records=items.filter(r=>r.kind!=="object"), who=(s:string)=>people.findIndex(p=>s.trim().toLowerCase()===("Versamento "+p).toLowerCase()||s.trim().toLowerCase()===p.toLowerCase());
  const booked=people.map((_,i)=>records.reduce((s,r)=>s+(who(r.label)===i?cent(r.amount):0),0));
  const paid=records.reduce((s,r)=>s+(r.paid?cent(r.amount):0),0), bookedAll=records.reduce((s,r)=>s+cent(r.amount),0), total=cent(cost);
  const free=Math.max(0,total-bookedAll), share=booked[0]&&!booked[1]?0:booked[1]&&!booked[0]?free:Math.floor(free/2);
  const [forms,setForms]=useState(()=>people.map((_,i)=>({target:show(booked[i]+(i?free-share:share)),quota:"",date:today()})));
  const set=(i:number,key:"target"|"quota"|"date",v:string)=>setForms(old=>old.map((f,j)=>j===i?{...f,[key]:v}:f));
  const [busy,B]=useState(false),[message,E]=useState("");const lock=useRef(false);
  type Row={date:string;i:number;c:number};
  const rows:Row[]=[];let problem="",allocated=bookedAll;
  forms.forEach((f,i)=>{
    const target=parse(f.target),extra=target-booked[i],monthly=parse(f.quota);allocated+=extra;
    if(!Number.isSafeInteger(target)||extra<0){problem="Il totale personale deve coprire almeno le rate già presenti.";return}
    if(!extra)return;
    if(!(monthly>0)||!f.date){problem="Inserisci quota mensile e prima data per ogni importo ancora da programmare.";return}
    const count=Math.ceil(extra/monthly);if(count>120){problem="La quota deve coprire il totale entro 120 mesi.";return}
    const [y,m,d]=f.date.split("-").map(Number);
    for(let j=0;j<count;j++){const dt=new Date(Date.UTC(y,m-1+j,1));dt.setUTCDate(Math.min(d,new Date(Date.UTC(y,m+j,0)).getUTCDate()));rows.push({date:dt.toISOString().slice(0,10),i,c:Math.min(monthly,extra-j*monthly)})}
  });
  if(allocated>total)problem="Le quote superano il costo del viaggio.";
  const calendar=new Map<string,number[]>();const add=(date:string,i:number,c:number)=>{const v=calendar.get(date)||[0,0,0];v[i<0?2:i]+=c;calendar.set(date,v)};
  records.filter(r=>!r.paid).forEach(r=>add(r.dueDate,who(r.label),cent(r.amount)));rows.forEach(r=>add(r.date,r.i,r.c));
  let balance=total-paid;
  async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();if(lock.current||problem||!rows.length)return;lock.current=true;B(true);E("");
    try{const res=await fetch("/api/travel");if(!res.ok)throw Error();const live=(await res.json()).repayments.filter((r:TripRepayment)=>r.tripId===tripId) as TripRepayment[];
      const original=new Set(items.map(r=>r.id));const key=(r:Row)=>"Piano mensile · "+people[r.i]+" · "+r.date+" · "+r.c;
      if(live.some(r=>!original.has(r.id)&&!rows.some(x=>key(x)===r.note))||items.some(r=>!live.some(v=>v.id===r.id&&v.amount===r.amount&&v.paid===r.paid&&v.dueDate===r.dueDate&&v.label===r.label))){E("Il piano è cambiato. Chiudi e riapri per aggiornare l’anteprima.");await refresh();return}
      for(const r of rows){if(live.some(v=>!original.has(v.id)&&v.note===key(r)))continue;
        const saved=await fetch("/api/travel",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"repayment",tripId,label:"Versamento "+people[r.i],amount:r.c/100,dueDate:r.date,paid:false,note:key(r)})});if(!saved.ok)throw Error()}
      await refresh();close();
    }catch{E("Salvataggio interrotto. Riprova con gli stessi valori.")}finally{lock.current=false;B(false)}}
  return <FeatureModal title="Dividete la spesa del viaggio" onClose={()=>{if(!busy)close()}}><form onSubmit={save}>
    <p><strong>Costo del viaggio: {money(total)}</strong><br/>Già versato: {money(paid)} · Ancora da versare: {money(total-paid)}</p>
    {forms.map((f,i)=>{const own=records.filter(r=>who(r.label)===i),extra=parse(f.target)-booked[i],nr=rows.filter(r=>r.i===i);return <fieldset key={i} style={{minWidth:0,border:"1px solid currentColor",borderRadius:12,padding:12}}>
      <legend><strong>{people[i]}</strong></legend><small>{own.length} versamenti già inseriti · {money(booked[i])}</small>
      <label>Totale a carico (€)<input inputMode="decimal" value={f.target} onChange={e=>set(i,"target",e.target.value)}/></label>
      {extra>0&&<><label>Quota mensile (€)<input inputMode="decimal" placeholder="Es. 450" value={f.quota} onChange={e=>set(i,"quota",e.target.value)}/></label>
      <label>Primo nuovo versamento<input type="date" value={f.date} onChange={e=>set(i,"date",e.target.value)}/></label></>}
      {nr.length>0&&<small>{nr.length} nuove rate · ultima da {money(nr[nr.length-1].c)}</small>}{extra===0&&<p>Quota già coperta dal piano.</p>}
    </fieldset>})}
    <strong>Calendario previsto</strong>
    <div style={{overflow:"auto",maxHeight:"32vh"}}><table style={{width:"100%",fontSize:"0.85rem",textAlign:"right"}}><thead><tr>{["Data","Davide","Francesca",...(Array.from(calendar.values()).some(v=>v[2])?["Altro"]:[]),"Totale","Residuo"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
    {[...calendar].sort(([a],[b])=>a.localeCompare(b)).map(([date,v])=>{const day=v.reduce((a,b)=>a+b,0);balance-=day;return <tr key={date}><td>{date.split("-").reverse().join("/")}</td>{[...v.slice(0,2),...(Array.from(calendar.values()).some(v=>v[2])?[v[2]]:[]),day,balance].map((c,i)=><td key={i}>{c||i>=v.length-1?money(c):"—"}</td>)}</tr>})}
    </tbody></table></div>
    <small>Il residuo è una previsione. Solo le rate spuntate risultano versate.</small>
    {problem&&<small>{problem}</small>}{message&&<p role="alert">{message}</p>}
    <button className="primary-btn full" disabled={busy||!!problem||!rows.length}>{busy?"Salvataggio…":"Conferma "+rows.length+" nuovi versamenti"}</button>
  </form></FeatureModal>
}
export function TravelView({
  commonAccounts,
  onMovementChange,
}: {
  commonAccounts: string[];
  onMovementChange: () => void;
}) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [expenses, setExpenses] = useState<TripExpense[]>([]);
  const [showSchedule,setShowSchedule]=useState(false);
  const [repayments, setRepayments] = useState<TripRepayment[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modal, setModal] = useState<TravelModal | null>(null);
  const [giftType, setGiftType] = useState<"money" | "object">("money");
  const [saveError, setSaveError] = useState("");
  const [travelSections, setTravelSections] = useState(() => {
    if (typeof window === "undefined") return { expenses: true, repayments: true };
    try {
      return { expenses: true, repayments: true, ...JSON.parse(localStorage.getItem("casa-insieme:travel-sections:v1") || "{}") };
    } catch {
      return { expenses: true, repayments: true };
    }
  });
  useEffect(() => {
    localStorage.setItem("casa-insieme:travel-sections:v1", JSON.stringify(travelSections));
  }, [travelSections]);
  async function load() {
    const response = await fetch("/api/travel");
    const data = (await response.json()) as {
      trips?: Trip[];
      expenses?: TripExpense[];
      repayments?: TripRepayment[];
    };
    const nextTrips = data.trips ?? [];
    setTrips(nextTrips);
    setExpenses(data.expenses ?? []);
    setRepayments(data.repayments ?? []);
    setSelectedId((current) =>
      current && nextTrips.some((trip) => trip.id === current)
        ? current
        : (nextTrips[0]?.id ?? null),
    );
    return nextTrips;
  }
  useEffect(() => {
    void load().then(async (currentTrips) => {
      const response = await fetch("/api/travel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "wedding2026" }),
      });
      if (response.ok && !currentTrips.some((trip) => trip.title === "Matrimonio 2026")) await load();
      if (response.ok && currentTrips.some((trip) => trip.title === "Matrimonio 2026")) await load();
    });
  }, []);
  const selected = trips.find((trip) => trip.id === selectedId) ?? null;
  const selectedExpenses = expenses.filter(
    (item) => item.tripId === selectedId,
  );
  const selectedRepayments = repayments.filter(
    (item) => item.tripId === selectedId,
  );
  const isWedding = selected?.title === "Matrimonio 2026";
  const monetaryRepayments = selectedRepayments.filter((item) => item.kind !== "object");
  const objectGifts = selectedRepayments.filter((item) => item.kind === "object");
  const giftsReceived = monetaryRepayments.filter((item) => item.paid).reduce((sum, item) => sum + item.amount, 0);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal) return;
    setSaveError("");
    const form = new FormData(event.currentTarget);
    const money = (name: string) => Number(String(form.get(name) ?? "").trim().replace(",", "."));
    const isEdit = Boolean(modal.item);
    let payload: Record<string, unknown> = {
      action: modal.kind,
      id: modal.item?.id,
      tripId: selectedId,
    };
    if (modal.kind === "trip")
      payload = {
        ...payload,
        title: String(form.get("title")),
        startDate: String(form.get("startDate")),
        endDate: String(form.get("endDate")),
        budget: Number(form.get("budget") ?? 0),
        notes: String(form.get("notes") ?? ""),
      };
    if (modal.kind === "expense") {
      const section = String(form.get("section"));
      const custom = String(form.get("customSection") ?? "").trim();
      payload = {
        ...payload,
        label: String(form.get("label")),
        section: section === "Altro" && custom ? custom : section,
        note: String(form.get("note") ?? ""),
        amount: money("amount"),
        paid: form.get("paid") === "on",
        paidDate: String(form.get("paidDate") || today()),
        payer: String(form.get("payer")),
        affectsAccounts: selected?.title === "Matrimonio 2026" ? form.get("affectsAccounts") === "on" : true,
      };
    }
    if (modal.kind === "repayment")
      payload = {
        ...payload,
        label: String(form.get("label")),
        amount: money("amount"),
        kind: isWedding ? giftType : "money",
        dueDate: String(form.get("dueDate")),
        paid: form.get("paid") === "on",
        note: String(form.get("note") ?? ""),
      };
    try {
      const response = await fetch("/api/travel", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setSaveError(data.error || "Non riesco a salvare la voce. Riprovate.");
        return;
      }
    } catch {
      setSaveError("Connessione assente: la voce non è stata salvata.");
      return;
    }
    setModal(null);
    await load();
    if (modal.kind === "expense" || modal.kind === "repayment") onMovementChange();
  }
  async function remove(kind: "trip" | "expense" | "repayment", id: number) {
    if (!confirm("Eliminare questo elemento?")) return;
    await fetch(`/api/travel?action=${kind}&id=${id}`, { method: "DELETE" });
    await load();
    if (kind !== "repayment") onMovementChange();
  }
  async function toggleExpense(item: TripExpense) {
    await fetch("/api/travel", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "expense",
        ...item,
        paid: !item.paid,
        paidDate: !item.paid ? today() : null,
      }),
    });
    await load();
    onMovementChange();
  }
  async function toggleRepayment(item: TripRepayment) {
    await fetch("/api/travel", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "repayment", ...item, paid: !item.paid }),
    });
    await load();
    onMovementChange();
  }
  async function toggleTripStatus(item: Trip) {
    await fetch("/api/travel", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "tripStatus", id: item.id, active: !item.active }),
    });
    await load();
  }
  const planned = selectedExpenses.reduce((sum, item) => sum + item.amount, 0);
  const paid = selectedExpenses
    .filter((item) => item.paid)
    .reduce((sum, item) => sum + item.amount, 0);
  const repaid = selectedRepayments
    .filter((item) => item.paid)
    .reduce((sum, item) => sum + item.amount, 0);
  return (
    <section className="travel-layout">
      <aside className="panel trip-sidebar">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">I vostri progetti</p>
            <h2>Viaggi</h2>
          </div>
          <button
            className="icon-add"
            onClick={() => setModal({ kind: "trip" })}
          >
            ＋
          </button>
        </div>
        {trips.map((trip) => {
          const total = expenses
            .filter((item) => item.tripId === trip.id)
            .reduce((sum, item) => sum + item.amount, 0);
          return (
            <button
              className={`trip-selector ${trip.id === selectedId ? "selected" : ""} ${!trip.active ? "practice-completed" : ""}`}
              key={trip.id}
              onClick={() => setSelectedId(trip.id)}
            >
              <span>{trip.title === "Matrimonio 2026" ? "👰🤵" : "✈️"}</span>
              <div>
                <strong>{trip.title}</strong>
                {!trip.active && <small className="completed-label">✓ Concluso</small>}
                <small>
                  {trip.startDate && trip.endDate
                    ? `${shortDate.format(new Date(`${trip.startDate}T12:00:00`))} – ${shortDate.format(new Date(`${trip.endDate}T12:00:00`))}`
                    : "Date da definire"}
                </small>
              </div>
              <b>{euro.format(total)}</b>
            </button>
          );
        })}
        {!trips.length && (
          <div className="empty-mini">
            <span>🌍</span>
            <p>Create il primo viaggio e aggiungete le spese previste.</p>
            <button
              className="primary-btn"
              onClick={() => setModal({ kind: "trip" })}
            >
              Nuovo viaggio
            </button>
          </div>
        )}
      </aside>
      <article className="panel page-panel trip-main">
        {selected ? (
          <>
            <div className="trip-hero">
              <div>
                <p className="panel-kicker">{selected.title === "Matrimonio 2026" ? "Piano spese del matrimonio" : "Piano economico del viaggio"}</p>
                <h2>{selected.title}</h2>
                <div className="closed-card-meta">
                  <span>Viaggio</span>
                  <span className={selected.active ? "status-active" : "status-completed"}>
                    {selected.active ? "● Attivo" : "✓ Concluso"}
                  </span>
                  <span>
                    {selected.startDate && selected.endDate
                      ? `${shortDate.format(new Date(`${selected.startDate}T12:00:00`))} – ${shortDate.format(new Date(`${selected.endDate}T12:00:00`))}`
                      : "Date da definire"}
                  </span>
                </div>
                <p>
                  {selected.notes ||
                    "Aggiungete note, spese previste e piano di rientro."}
                </p>
              </div>
              <div className="row-actions">
                <button className="secondary-btn" onClick={() => toggleTripStatus(selected)}>
                  {selected.active ? "✓ Concludi viaggio" : "↻ Riattiva viaggio"}
                </button>
                <button
                  className="delete-btn"
                  onClick={() => setModal({ kind: "trip", item: selected })}
                >
                  ✎
                </button>
                <button
                  className="delete-btn"
                  onClick={() => remove("trip", selected.id)}
                >
                  🗑️
                </button>
              </div>
            </div>
            <div className="trip-kpis">
              <div>
                <span>Totale previsto</span>
                <strong>{euro.format(planned)}</strong>
              </div>
              <div className="positive">
                <span>Già pagato</span>
                <strong>{euro.format(paid)}</strong>
              </div>
              <div className="negative">
                <span>Da pagare</span>
                <strong>{euro.format(planned - paid)}</strong>
              </div>
              <div
                className={selected.title === "Matrimonio 2026" || selected.budget >= planned ? "positive" : "negative"}
              >
                <span>{selected.title === "Matrimonio 2026" ? "Incassato con regali" : "Budget disponibile"}</span>
                <strong>
                  {selected.title === "Matrimonio 2026"
                    ? euro.format(giftsReceived)
                    : selected.budget
                    ? euro.format(selected.budget - planned)
                    : "Non impostato"}
                </strong>
              </div>
            </div>
            <div className="progress-caption">
              <span>Completamento spese del viaggio</span>
              <b>{planned ? Math.min(100, Math.round((paid / planned) * 100)) : 0}%</b>
            </div>
            <div className="trip-progress">
              <span
                style={{ width: `${planned ? (paid / planned) * 100 : 0}%` }}
              />
            </div>
            <div className="subsection-heading">
              <div>
                <p className="panel-kicker">Rendiconto del viaggio</p>
                <h3>Spese previste</h3>
                {!travelSections.expenses && <small className="collapsed-inline-summary">Totale {euro.format(planned)} · Da pagare {euro.format(planned - paid)}</small>}
              </div>
              <div className="row-actions">
                <button
                  className="secondary-btn"
                  onClick={() => setModal({ kind: "expense" })}
                >
                  ＋ Aggiungi voce
                </button>
                <button
                  className="collapse-card-btn"
                  onClick={() =>
                    setTravelSections((current) => ({
                      ...current,
                      expenses: !current.expenses,
                    }))
                  }
                >
                  {travelSections.expenses ? "▴ Richiudi" : "▾ Apri"}
                </button>
              </div>
            </div>
            <div hidden={!travelSections.expenses}>
            {selectedExpenses.length ? (
              <div className="travel-expenses">
                {selectedExpenses.map((item) => (
                  <article
                    className={`travel-expense ${item.paid ? "paid" : "unpaid"} ${item.paid && !item.affectsAccounts ? "outside-accounts" : ""}`}
                    key={item.id}
                  >
                    <button
                      className="status-check"
                      onClick={() => toggleExpense(item)}
                    >
                      {item.paid ? "✓" : "○"}
                    </button>
                    <div>
                      <strong>{item.label}</strong>
                      <small>
                        {item.section}
                        {item.note ? ` · ${item.note}` : ""}
                        {item.paidDate
                          ? ` · pagata il ${shortDate.format(new Date(`${item.paidDate}T12:00:00`))}`
                          : ""}
                        {item.paid && !item.affectsAccounts
                          ? " · già pagata, fuori dai conti"
                          : ""}
                      </small>
                    </div>
                    <span>{item.payer}</span>
                    <b>{euro.format(item.amount)}</b>
                    <div className="row-actions">
                      <button
                        className="delete-btn"
                        onClick={() => setModal({ kind: "expense", item })}
                      >
                        ✎
                      </button>
                      <button
                        className="delete-btn"
                        onClick={() => remove("expense", item.id)}
                      >
                        🗑️
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="report-copy">
                Nessuna voce inserita. Potete partire da volo, hotel,
                assicurazione, trasporti e attività.
              </p>
            )}
            </div>
            <div className="subsection-heading">
              <div>
                <p className="panel-kicker">{selected.title === "Matrimonio 2026" ? "Regali e rientri" : "Versamenti programmati"}</p>
                <h3>{selected.title === "Matrimonio 2026" ? "Rientro dai regali" : "Piano di rientro"}</h3>
                {!travelSections.repayments && <small className="collapsed-inline-summary">{isWedding ? `Incassato ${euro.format(giftsReceived)}` : `Versato ${euro.format(repaid)}`}</small>}
              </div>
              <div className="row-actions">
                {!isWedding&&<button className="secondary-btn" onClick={()=>setShowSchedule(true)}>Crea piano mensile</button>}
                {showSchedule&&<TravelSchedule tripId={selected.id} cost={planned} items={selectedRepayments} close={()=>setShowSchedule(false)} refresh={load}/>}

                <button
                  className="secondary-btn"
                  onClick={() => { setGiftType("money"); setModal({ kind: "repayment" }); }}
                >
                  {selected.title === "Matrimonio 2026" ? "＋ Aggiungi regalo" : "＋ Nuova rata"}
                </button>
                <button
                  className="collapse-card-btn"
                  onClick={() =>
                    setTravelSections((current) => ({
                      ...current,
                      repayments: !current.repayments,
                    }))
                  }
                >
                  {travelSections.repayments ? "▴ Richiudi" : "▾ Apri"}
                </button>
              </div>
            </div>
            <div hidden={!travelSections.repayments}>
            {isWedding ? (
              <section className="wedding-gift-overview" aria-label="Riepilogo regali di nozze">
                <div className="wedding-gift-total">
                  <span>Rientro ricevuto</span>
                  <strong className="positive-text">{euro.format(giftsReceived)}</strong>
                  <small>{monetaryRepayments.filter((item) => item.paid).length} regali monetari ricevuti</small>
                </div>
                <div className="wedding-gift-coverage">
                  <div><span>Regali in denaro su spesa totale del matrimonio</span><b>{planned ? Math.min(100, Math.round((giftsReceived / planned) * 100)) : 0}%</b></div>
                  <div className="wedding-gift-track"><span style={{ width: `${planned ? Math.min(100, (giftsReceived / planned) * 100) : 0}%` }} /></div>
                  <small>{euro.format(giftsReceived)} di regali in denaro su {euro.format(planned)} di spesa totale. I regali ricevuti vengono accreditati su BBVA Dafragu.</small>
                </div>
                <div className="wedding-extra-gifts">
                  <div className="wedding-extra-heading"><span>Regali extra</span><small>Non monetari</small></div>
                  {objectGifts.map((item) => <div className="wedding-extra-row" key={item.id}><strong>{item.label}</strong><span>{item.note || "Oggetto ricevuto"}</span></div>)}
                </div>
              </section>
            ) : <div className="repayment-summary">
              <span>
                Programmato:{" "}
                <strong>
                  {euro.format(
                    selectedRepayments.reduce(
                      (sum, item) => sum + item.amount,
                      0,
                    ),
                  )}
                </strong>
              </span>
              <span>
                Versato: <strong>{euro.format(repaid)}</strong>
              </span>
            </div>}
            {monetaryRepayments.length ? (
              <div className="repayment-list">
                {monetaryRepayments.map((item) => (
                  <article className={item.paid ? "paid" : ""} key={item.id}>
                    <button
                      className="status-check"
                      onClick={() => toggleRepayment(item)}
                    >
                      {item.paid ? "✓" : "○"}
                    </button>
                    <div>
                      <strong>{item.label}</strong>
                      <small>
                        {shortDate.format(new Date(`${item.dueDate}T12:00:00`))}
                        {item.note ? ` · ${item.note}` : ""}
                      </small>
                    </div>
                    <b>{euro.format(item.amount)}</b>
                    <div className="row-actions">
                      <button
                        className="delete-btn"
                        onClick={() => setModal({ kind: "repayment", item })}
                      >
                        ✎
                      </button>
                      <button
                        className="delete-btn"
                        onClick={() => remove("repayment", item.id)}
                      >
                        🗑️
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="report-copy">Nessun versamento programmato.</p>
            )}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <span>✈️</span>
            <h2>Scegliete o create un viaggio</h2>
            <p>Ogni viaggio avrà il proprio rendiconto e piano di rientro.</p>
          </div>
        )}
      </article>
      {modal?.kind === "trip" && (
        <FeatureModal
          title={modal.item ? "Modifica viaggio" : "Nuovo viaggio"}
          onClose={() => setModal(null)}
        >
          <form onSubmit={save}>
            <label>
              Titolo
              <input
                name="title"
                defaultValue={modal.item?.title ?? ""}
                placeholder="Es. Singapore · Capodanno"
                required
              />
            </label>
            <div className="form-row">
              <label>
                Partenza
                <input
                  name="startDate"
                  type="date"
                  defaultValue={modal.item?.startDate ?? ""}
                />
              </label>
              <label>
                Rientro
                <input
                  name="endDate"
                  type="date"
                  defaultValue={modal.item?.endDate ?? ""}
                />
              </label>
            </div>
            <label>
              Budget totale facoltativo
              <input
                name="budget"
                type="number"
                min="0"
                step="0.01"
                defaultValue={modal.item?.budget ?? 0}
              />
            </label>
            <label>
              Note
              <textarea
                name="notes"
                rows={4}
                defaultValue={modal.item?.notes ?? ""}
              />
            </label>
            <button className="primary-btn full">Salva viaggio</button>
          </form>
        </FeatureModal>
      )}
      {modal?.kind === "expense" && (
        <FeatureModal
          title={modal.item ? "Modifica voce di spesa" : "Nuova voce di spesa"}
          onClose={() => setModal(null)}
        >
          <form onSubmit={save}>
            <label>
              Voce
              <input
                name="label"
                defaultValue={modal.item?.label ?? ""}
                placeholder="Es. Volo A/R"
                required
              />
            </label>
            <div className="form-row">
              <label>
                Sezione
                <select
                  name="section"
                  defaultValue={
                    [
                      "Voli",
                      "Hotel",
                      "Trasporti",
                      "Assicurazione",
                      "Documenti",
                      "Attività",
                      "Ristoranti",
                    ].includes(modal.item?.section ?? "")
                      ? modal.item?.section
                      : "Altro"
                  }
                >
                  <option>Voli</option>
                  <option>Hotel</option>
                  <option>Trasporti</option>
                  <option>Assicurazione</option>
                  <option>Documenti</option>
                  <option>Attività</option>
                  <option>Ristoranti</option>
                  <option>Altro</option>
                </select>
              </label>
              <label>
                Sezione libera
                <input
                  name="customSection"
                  defaultValue={
                    [
                      "Voli",
                      "Hotel",
                      "Trasporti",
                      "Assicurazione",
                      "Documenti",
                      "Attività",
                      "Ristoranti",
                    ].includes(modal.item?.section ?? "")
                      ? ""
                      : (modal.item?.section ?? "")
                  }
                />
              </label>
            </div>
            <label>
              Nota
              <input
                name="note"
                defaultValue={modal.item?.note ?? ""}
                placeholder="Es. dal 29 dicembre al 3 gennaio"
              />
            </label>
            {selected?.title === "Matrimonio 2026" && (
              <label className="checkbox-label">
                <input
                  name="affectsAccounts"
                  type="checkbox"
                  defaultChecked={modal.item?.affectsAccounts ?? true}
                />{" "}
                Registra il pagamento anche nei conti
              </label>
            )}
            <div className="form-row">
              <label>
                Cifra
                <input
                  name="amount"
                type="text"
                inputMode="decimal"
                pattern="[0-9]+([,.][0-9]{1,2})?"
                  defaultValue={modal.item?.amount ?? ""}
                  required
                />
              </label>
              <label>
                Pagata da
                <select
                  name="payer"
                  defaultValue={
                    modal.item?.payer ?? commonAccounts[0] ?? "Davide"
                  }
                >
                  <option>Davide</option>
                  <option>Francesca</option>
                  {commonAccounts.map((account) => (
                    <option key={account}>{account}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="checkbox-label">
              <input
                name="paid"
                type="checkbox"
                defaultChecked={modal.item?.paid ?? false}
              />{" "}
              Spesa effettuata e pagata
            </label>
            <label>
              Data del pagamento
              <input
                name="paidDate"
                type="date"
                defaultValue={modal.item?.paidDate ?? today()}
              />
            </label>
            <p className="form-note">
              {selected?.title === "Matrimonio 2026"
                ? "Se l’opzione conti è disattivata, la voce resta segnata come pagata ma non crea né modifica movimenti o saldi."
                : "Quando la spuntate, diventa verde e viene registrata anche nei movimenti con categoria “Viaggi”."}
            </p>
            {saveError && <p className="form-error" role="alert">{saveError}</p>}
            <button className="primary-btn full" type="submit">Salva voce</button>
          </form>
        </FeatureModal>
      )}
      {modal?.kind === "repayment" && (
        <FeatureModal
          title={modal.item ? "Modifica rientro" : selected?.title === "Matrimonio 2026" ? "Nuovo regalo / rientro" : "Nuova rata di rientro"}
          onClose={() => setModal(null)}
        >
          <form onSubmit={save}>
            {isWedding && (
              <label>
                Tipo di regalo
                <select value={giftType} onChange={(event) => setGiftType(event.target.value as "money" | "object")}>
                  <option value="money">💶 Somma ricevuta</option>
                  <option value="object">🎁 Oggetto ricevuto</option>
                </select>
              </label>
            )}
            <label>
              Descrizione
              <input
                name="label"
                defaultValue={modal.item?.label ?? ""}
                placeholder={selected?.title === "Matrimonio 2026" ? "Es. Regalo famiglia Rossi" : "Es. Versamento Francesca"}
                required
              />
            </label>
            <div className="form-row">
              {(!isWedding || giftType === "money") && <label>
                Importo
                <input
                  name="amount"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]+([,.][0-9]{1,2})?"
                  defaultValue={modal.item?.amount ?? ""}
                  required
                />
              </label>}
              <label>
              {selected?.title === "Matrimonio 2026" ? "Data ricezione" : "Data prevista"}
                <input
                  name="dueDate"
                  type="date"
                  defaultValue={modal.item?.dueDate ?? today()}
                  required
                />
              </label>
            </div>
            {isWedding && giftType === "object" && <p className="form-note">L’oggetto sarà inserito nei “Regali extra” e non avrà alcun valore economico.</p>}
            <label>
              Nota
              <input name="note" defaultValue={modal.item?.note ?? ""} />
            </label>
            <label className="checkbox-label">
              <input
                name="paid"
                type="checkbox"
                defaultChecked={modal.item?.paid ?? false}
              />{" "}
              {selected?.title === "Matrimonio 2026" ? "Regalo ricevuto" : "Versamento eseguito"}
            </label>
            {saveError && <p className="form-error" role="alert">{saveError}</p>}
            <button className="primary-btn full" type="submit">Salva rata</button>
          </form>
        </FeatureModal>
      )}
    </section>
  );
}

export function BackupView() {
  const [lastBackup, setLastBackup] = useState("");
  const [referenceTime] = useState(() => Date.now());
  const [message, setMessage] = useState("");
  const importInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setLastBackup(localStorage.getItem("casa-last-backup") ?? ""),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);
  async function download() {
    try {
      const response = await fetch("/api/backup");
      if (!response.ok) throw new Error("Backup non disponibile");
      const payload = (await response.json()) as { exportedAt: string };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `casa-insieme-backup-${today()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      localStorage.setItem("casa-last-backup", payload.exportedAt);
      setLastBackup(payload.exportedAt);
      setMessage("Backup scaricato correttamente.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Backup non disponibile.",
      );
    }
  }
  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as Record<string, unknown>;
      if (
        !window.confirm(
          "Ripristinare questo backup? I dati attuali della dashboard saranno sostituiti. La password di accesso rimarrà invariata.",
        )
      )
        return;
      const response = await fetch("/api/backup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error ?? "Ripristino non riuscito");
      setMessage("Backup ripristinato. Aggiorno la dashboard…");
      window.setTimeout(() => window.location.reload(), 850);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "File di backup non valido.",
      );
    }
  }
  const overdue =
    !lastBackup ||
    referenceTime - new Date(lastBackup).getTime() > 31 * 86400000;
  return (
    <section className="page-grid">
      <article className="panel page-panel wide">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">Copia completa dei dati</p>
            <h2>Backup Casa Insieme</h2>
          </div>
        </div>
        <div className={`backup-status ${overdue ? "warning" : "ok"}`}>
          <span>{overdue ? "⚠️" : "✓"}</span>
          <div>
            <strong>
              {lastBackup
                ? `Ultimo backup: ${new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeStyle: "short" }).format(new Date(lastBackup))}`
                : "Nessun backup registrato su questo dispositivo"}
            </strong>
            <p>
              {overdue
                ? "È un buon momento per creare una nuova copia."
                : "La copia mensile risulta aggiornata."}
            </p>
          </div>
        </div>
        <p className="report-copy">
          Il file comprende tutti i dati economici, PAC, finanziamenti,
          movimenti automatici, conti, utenze, budget, obiettivi, scadenze,
          note, chat, decisioni e viaggi. La password rimane esclusa dal file.
        </p>
        <div className="row-actions">
          <button className="primary-btn" onClick={download}>
            ↓ Scarica backup completo
          </button>
          <button
            className="secondary-btn"
            onClick={() => importInput.current?.click()}
          >
            ↑ Importa e ripristina
          </button>
          <input
            ref={importInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={importBackup}
          />
        </div>
        {message && <p className="form-note">{message}</p>}
      </article>
      <article className="panel tip-card">
        <span>🛟</span>
        <h3>Una copia al mese</h3>
        <p>
          L’importazione sostituisce i dati attuali, dopo una conferma, ma non
          modifica mai la password di accesso.
        </p>
      </article>
    </section>
  );
}

type Plan = {
  id: number;
  person: "Davide" | "Francesca" | "Comune";
  name: string;
  kind: string;
  institution: string;
  targetCents: number;
  monthlyAmountCents: number;
  initialSavedCents: number;
  frequencyMonths: number;
  paymentTiming: "anticipata" | "posticipata" | "libera";
  durationMonths: number;
  taxRateBps: number;
  taxAmountCents: number;
  dayOfMonth: number;
  startDate: string;
  endDate?: string | null;
  automatic: boolean;
  active: boolean;
  reminderDays: number;
  notes: string;
  author: "Davide" | "Francesca";
};
type PlanPayment = {
  id: number;
  planId: number;
  amountCents: number;
  date: string;
  note: string;
  automatic: boolean;
  author: "Davide" | "Francesca";
};
type PlanAdjustment = {
  id: number;
  planId: number;
  previousBalanceCents: number;
  newBalanceCents: number;
  deltaCents: number;
  note: string;
  author: "Davide" | "Francesca";
  adjustedAt: string;
};
type Debt = {
  id: number;
  person: "Davide" | "Francesca" | "Comune";
  name: string;
  kind: string;
  creditor: string;
  originalAmountCents: number;
  installmentCents: number;
  initialPaidCents: number;
  dayOfMonth: number;
  startDate: string;
  endDate?: string | null;
  automatic: boolean;
  variable: boolean;
  active: boolean;
  commonAccount?: string | null;
  reminderDays: number;
  notes: string;
  author: "Davide" | "Francesca";
};
type DebtPayment = {
  id: number;
  debtId: number;
  amountCents: number;
  date: string;
  note: string;
  automatic: boolean;
  author: "Davide" | "Francesca";
};
type DebtAdjustment = {
  id: number;
  debtId: number;
  previousResidualCents: number;
  newResidualCents: number;
  deltaCents: number;
  note: string;
  author: "Davide" | "Francesca";
  adjustedAt: string;
};
type Schedule = {
  id: number;
  name: string;
  kind: "Spesa" | "Entrata";
  category: string;
  amountCents: number;
  person: "Davide" | "Francesca" | "Comune";
  commonAccount?: string | null;
  goalId?: number | null;
  dayOfMonth: number;
  startDate: string;
  endDate?: string | null;
  active: boolean;
  author: "Davide" | "Francesca";
};
type FinanceData = {
  plans: Plan[];
  planPayments: PlanPayment[];
  planAdjustments: PlanAdjustment[];
  debts: Debt[];
  debtPayments: DebtPayment[];
  debtAdjustments: DebtAdjustment[];
  schedules: Schedule[];
};
type FinanceEdit =
  | { entity: "plan"; item?: Plan; mode?: "plan" | "investment" }
  | { entity: "planPayment"; planId: number; item?: PlanPayment }
  | { entity: "debt"; item?: Debt }
  | { entity: "debtPayment"; debtId: number; item?: DebtPayment }
  | { entity: "schedule"; item?: Schedule };

function DebtRateChart({
  debt,
  payments,
}: {
  debt: Debt;
  payments: DebtPayment[];
}) {
  const ordered = [...payments]
    .filter((payment) => payment.debtId === debt.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const total = Math.max(
    debt.originalAmountCents,
    debt.initialPaidCents + ordered.reduce((sum, payment) => sum + payment.amountCents, 0),
    1,
  );
  let cumulative = debt.initialPaidCents;
  const maxRate = Math.max(...ordered.map((payment) => payment.amountCents), debt.installmentCents, 1);
  const points = ordered.map((payment, index) => {
    cumulative += payment.amountCents;
    const x = ordered.length === 1 ? 50 : 8 + (index / (ordered.length - 1)) * 84;
    const y = 84 - Math.min(68, (payment.amountCents / maxRate) * 58);
    return { x, y, payment, cumulative };
  });
  const curve = points.length < 2
    ? (points[0] ? `M ${points[0].x} ${points[0].y}` : "")
    : points.reduce((path, point, index) => {
        if (index === 0) return `M ${point.x} ${point.y}`;
        const previous = points[index - 1];
        const midpoint = (previous.x + point.x) / 2;
        return `${path} C ${midpoint} ${previous.y}, ${midpoint} ${point.y}, ${point.x} ${point.y}`;
      }, "");
  const area = points.length
    ? `${curve} L ${points.at(-1)?.x ?? 92} 92 L ${points[0].x} 92 Z`
    : "";
  const last = points.at(-1);
  const paidPercent = Math.min(100, Math.round((cumulative / total) * 100));
  return (
    <div className="debt-rate-chart">
      <div className="debt-rate-chart-head">
        <div>
          <span className="panel-kicker">Andamento rate</span>
          <h3>{debt.name}</h3>
          <p>{debt.creditor || "Mutuo"} · {ordered.length} rate registrate</p>
        </div>
        <strong>{paidPercent}% versato</strong>
      </div>
      <div className="debt-rate-plot" role="img" aria-label={`Andamento delle rate di ${debt.name}`}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line x1="8" y1="8" x2="8" y2="92" />
          <line x1="8" y1="92" x2="92" y2="92" />
          {area && <path className="debt-rate-area" d={area} />}
          {curve && <path className="debt-rate-curve" d={curve} />}
          {points.map((point) => (
            <circle key={point.payment.id} cx={point.x} cy={point.y} r="1.7" />
          ))}
        </svg>
        {!ordered.length && <span className="debt-rate-empty">Registra la prima rata per vedere l’andamento.</span>}
        {last && <span className="debt-rate-current">Ultima rata · {shortDate.format(new Date(`${last.payment.date}T12:00:00`))}</span>}
      </div>
      <div className="debt-rate-summary">
        <span>Già versato <b>{euro.format(cumulative / 100)}</b></span>
        <span>Capitale residuo <b>{euro.format(Math.max(0, debt.originalAmountCents - cumulative) / 100)}</b></span>
        {debt.installmentCents > 0 && <span>Rata prevista <b>{euro.format(debt.installmentCents / 100)}</b></span>}
      </div>
      {ordered.length > 0 && (
        <div className="debt-rate-list">
          {ordered.map((payment) => (
            <div key={payment.id}><span>{shortDate.format(new Date(`${payment.date}T12:00:00`))}</span><b>{euro.format(payment.amountCents / 100)}</b></div>
          ))}
        </div>
      )}
    </div>
  );
}

function addPlanMonths(dateText: string, months: number) {
  const source = new Date(`${dateText}T12:00:00`);
  const day = source.getDate();
  const target = new Date(
    source.getFullYear(),
    source.getMonth() + months,
    1,
    12,
  );
  target.setDate(
    Math.min(
      day,
      new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate(),
    ),
  );
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
}
function planEndDate(plan: Plan) {
  return plan.durationMonths > 0
    ? addPlanMonths(plan.startDate, plan.durationMonths)
    : (plan.endDate ?? null);
}
function planNextDue(plan: Plan, payments: PlanPayment[]) {
  if (
    !plan.active ||
    plan.frequencyMonths <= 0 ||
    plan.paymentTiming === "libera"
  )
    return null;
  const latest = payments
    .filter((p) => p.planId === plan.id)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  let candidate = latest
    ? addPlanMonths(latest.date, plan.frequencyMonths)
    : plan.paymentTiming === "posticipata"
      ? addPlanMonths(plan.startDate, plan.frequencyMonths)
      : plan.startDate;
  const end = planEndDate(plan);
  while (candidate < today())
    candidate = addPlanMonths(candidate, plan.frequencyMonths);
  return end && candidate > end ? null : candidate;
}
function frequencyLabel(months: number) {
  return months === 1
    ? "mensile"
    : months === 2
      ? "bimestrale"
      : months === 3
        ? "trimestrale"
        : months === 6
          ? "semestrale"
          : months === 12
            ? "annuale"
            : months > 0
              ? `ogni ${months} mesi`
              : "libera";
}

export function PersonalFinanceView({
  commonAccounts,
  goals,
  onMovementChange,
  selectedPerson,
}: {
  commonAccounts: string[];
  goals: { id: number; name: string }[];
  onMovementChange: () => void;
  selectedPerson: "Tutti" | "Davide" | "Francesca" | "Comune";
}) {
  const [data, setData] = useState<FinanceData>({
    plans: [],
    planPayments: [],
    planAdjustments: [],
    debts: [],
    debtPayments: [],
    debtAdjustments: [],
    schedules: [],
  });
  const person: "Davide" | "Francesca" | "Comune" =
    selectedPerson === "Tutti" ? "Davide" : selectedPerson;
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set<string>(JSON.parse(localStorage.getItem("casa-insieme:finance-closed:v1") || "[]"));
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    localStorage.setItem("casa-insieme:finance-closed:v1", JSON.stringify([...collapsedCards]));
  }, [collapsedCards]);
  const toggleCard = (key: string) =>
    setCollapsedCards((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const [editing, setEditing] = useState<FinanceEdit | null>(null);
  const [aligning, setAligning] = useState<Plan | null>(null);
  const [aligningDebt, setAligningDebt] = useState<Debt | null>(null);
  const [debtChart, setDebtChart] = useState<Debt | null>(null);
  const [alignError, setAlignError] = useState("");
  const [referenceTime] = useState(() => Date.now());
  const load = () =>
    fetch("/api/finance-plans")
      .then((r) => r.json())
      .then((value: FinanceData) =>
        setData({
          plans: value.plans ?? [],
          planPayments: value.planPayments ?? [],
          planAdjustments: value.planAdjustments ?? [],
          debts: value.debts ?? [],
          debtPayments: value.debtPayments ?? [],
          debtAdjustments: value.debtAdjustments ?? [],
          schedules: value.schedules ?? [],
        }),
      );
  useEffect(() => {
    void load();
  }, []);
  // The handler intentionally uses the latest loaded payment list; remove is recreated with the view state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    function removePlanPayment(event: MouseEvent) {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        ".payment-history > button",
      );
      if (!button) return;
      const card = button.closest<HTMLElement>(".plan-card");
      const name = card?.querySelector("h3")?.textContent;
      const date = button.textContent?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
      const plan = data.plans.find(
        (item) => item.name === name && item.kind !== "Investimento",
      );
      const payment =
        plan &&
        data.planPayments.find(
          (item) => item.planId === plan.id && item.date === date,
        );
      if (!payment) return;
      event.preventDefault();
      void remove("planPayment", payment.id);
    }
    document.addEventListener("contextmenu", removePlanPayment);
    return () => document.removeEventListener("contextmenu", removePlanPayment);
  }, [data]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    const item = "item" in editing ? editing.item : undefined;
    const durationValue = Number(form.get("durationValue") || 0);
    const durationMonths =
      durationValue * (form.get("durationUnit") === "years" ? 12 : 1);
    const payload: Record<string, unknown> = {
      entity: editing.entity,
      id: item?.id,
      person: form.get("person") || person,
      name: form.get("name"),
      kind: form.get("kind"),
      institution: form.get("institution"),
      creditor: form.get("creditor"),
      target: Number(form.get("target") || 0),
      monthlyAmount: Number(form.get("monthlyAmount") || 0),
      initialSaved: Number(form.get("initialSaved") || 0),
      frequencyMonths: Number(form.get("frequencyMonths") || 0),
      paymentTiming: form.get("paymentTiming") || "libera",
      durationMonths,
      taxRate: Number(form.get("taxRate") || 0),
      taxAmount: Number(form.get("taxAmount") || 0),
      originalAmount: Number(form.get("originalAmount") || 0),
      installment: Number(form.get("installment") || 0),
      initialPaid: Number(form.get("initialPaid") || 0),
      dayOfMonth: Number(form.get("dayOfMonth") || 1),
      startDate: form.get("startDate"),
      endDate: form.get("endDate"),
      automatic: form.get("automatic") === "on",
      variable: form.get("variable") === "on",
      active: form.get("active") === "on",
      reminderDays: Number(form.get("reminderDays") || 7),
      notes: form.get("notes"),
      commonAccount: form.get("commonAccount"),
      author: form.get("author") || person,
      amount: Number(form.get("amount") || 0),
      date: form.get("date"),
      note: form.get("note"),
      planId: "planId" in editing ? editing.planId : undefined,
      debtId: "debtId" in editing ? editing.debtId : undefined,
      category: form.get("category"),
      goalId: form.get("goalId") || null,
      ticketAmount: Number(form.get("ticketAmount") || 0),
    };
    const response = await fetch("/api/finance-plans", {
      method: item ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return;
    setEditing(null);
    await load();
    if (editing.entity === "debtPayment" || editing.entity === "schedule")
      onMovementChange();
  }
  async function remove(entity: string, id: number) {
    if (!confirm("Eliminare questa voce?")) return;
    await fetch(`/api/finance-plans?entity=${entity}&id=${id}`, {
      method: "DELETE",
    });
    await load();
    onMovementChange();
  }
  async function saveAlignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!aligning) return;
    const form = new FormData(event.currentTarget);
    setAlignError("");
    const response = await fetch("/api/finance-plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entity: "planAdjustment",
        planId: aligning.id,
        actualBalance: Number(form.get("actualBalance")),
        note: String(form.get("note") ?? ""),
        author: String(form.get("author") ?? person),
        recoveryCode: String(form.get("recoveryCode") ?? ""),
      }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setAlignError(result.error ?? "Allineamento non salvato");
      return;
    }
    setAligning(null);
    await load();
  }
  async function removeAdjustment(adjustment: PlanAdjustment) {
    const recoveryCode = window.prompt(
      "Inserisci il codice di recupero per annullare questo allineamento:",
    );
    if (
      !recoveryCode ||
      !window.confirm("Confermi l’annullamento dell’allineamento selezionato?")
    )
      return;
    const response = await fetch(
      `/api/finance-plans?entity=planAdjustment&id=${adjustment.id}`,
      { method: "DELETE", headers: { "x-recovery-code": recoveryCode } },
    );
    if (!response.ok) {
      window.alert("Codice errato o allineamento non annullato.");
      return;
    }
    await load();
  }
  async function togglePractice(entity: "planStatus" | "debtStatus", id: number, active: boolean) {
    await fetch("/api/finance-plans", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entity, id, active }),
    });
    await load();
  }
  async function saveDebtAlignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!aligningDebt) return;
    const form = new FormData(event.currentTarget);
    setAlignError("");
    const response = await fetch("/api/finance-plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entity: "debtAdjustment",
        debtId: aligningDebt.id,
        actualResidual: Number(form.get("actualResidual")),
        note: String(form.get("note") ?? ""),
        author: String(form.get("author") ?? person),
        recoveryCode: String(form.get("recoveryCode") ?? ""),
      }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setAlignError(result.error ?? "Allineamento non salvato");
      return;
    }
    setAligningDebt(null);
    await load();
  }
  async function removeDebtAdjustment(adjustment: DebtAdjustment) {
    const recoveryCode = window.prompt("Inserisci il codice di recupero per annullare questo allineamento:");
    if (!recoveryCode || !window.confirm("Confermi l’annullamento dell’allineamento selezionato?")) return;
    const response = await fetch(`/api/finance-plans?entity=debtAdjustment&id=${adjustment.id}`, {
      method: "DELETE",
      headers: { "x-recovery-code": recoveryCode },
    });
    if (!response.ok) return window.alert("Codice errato o allineamento non annullato.");
    await load();
  }
  function exportCsv() {
    const rows = [
      ["Tipo", "Profilo", "Nome", "Data", "Importo", "Autore"],
      ...data.planPayments.map((p) => {
        const plan = data.plans.find((x) => x.id === p.planId);
        return [
          "PAC",
          plan?.person ?? "",
          plan?.name ?? "",
          p.date,
          (p.amountCents / 100).toFixed(2),
          p.author,
        ];
      }),
      ...data.debtPayments.map((p) => {
        const debt = data.debts.find((x) => x.id === p.debtId);
        return [
          debt?.kind ?? "Rata",
          debt?.person ?? "",
          debt?.name ?? "",
          p.date,
          (p.amountCents / 100).toFixed(2),
          p.author,
        ];
      }),
    ];
    const csv =
      "\ufeff" +
      rows
        .map((r) =>
          r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(";"),
        )
        .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    a.download = `piani-rate-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const plans = data.plans.filter(
    (x) =>
      (selectedPerson === "Tutti" || x.person === selectedPerson) &&
      x.kind !== "Investimento",
  );
  const investments = data.plans.filter(
    (x) =>
      (selectedPerson === "Tutti" || x.person === selectedPerson) &&
      x.kind === "Investimento",
  );
  const debts = data.debts.filter(
    (x) => selectedPerson === "Tutti" || x.person === selectedPerson,
  );
  const schedules = data.schedules.filter(
    (x) => selectedPerson === "Tutti" || x.person === selectedPerson,
  );
  const planReminders = plans.flatMap((plan) => {
    const dates = [
      planNextDue(plan, data.planPayments),
      planEndDate(plan),
    ].filter((value): value is string => Boolean(value));
    return dates
      .filter(
        (date) =>
          date >= today() &&
          (new Date(`${date}T12:00:00`).getTime() - referenceTime) / 86400000 <=
            plan.reminderDays,
      )
      .map(
        (date) =>
          `${plan.name} · ${shortDate.format(new Date(`${date}T12:00:00`))}`,
      );
  });
  const dueSoon = [
    ...planReminders,
    ...debts
      .filter(
        (x) =>
          x.endDate &&
          x.endDate >= today() &&
          (new Date(`${x.endDate}T12:00:00`).getTime() - referenceTime) /
            86400000 <=
            x.reminderDays,
      )
      .map((x) => x.name),
  ];
  const residualForDebt = (debt: Debt) => {
    const recorded = data.debtPayments
      .filter((payment) => payment.debtId === debt.id)
      .reduce((sum, payment) => sum + payment.amountCents, 0);
    const correction = data.debtAdjustments
      .filter((adjustment) => adjustment.debtId === debt.id)
      .reduce((sum, adjustment) => sum + adjustment.deltaCents, 0);
    return Math.max(
      0,
      debt.originalAmountCents - debt.initialPaidCents - recorded + correction,
    );
  };
  return (
    <section className="finance-plans">
      <InsurancePlans commonAccounts={commonAccounts} selectedPerson={selectedPerson} />
      <div className="panel page-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">Fuori dal patrimonio</p>
            <h2>
              {selectedPerson === "Comune"
                ? "PAC e accantonamenti comuni"
                : selectedPerson === "Tutti"
                  ? "PAC e accantonamenti"
                  : "PAC e accantonamenti personali"}
            </h2>
            <div className="panel-closed-summary">
              {plans.length ? plans.map((plan) => (
                <span className="summary-practice" key={plan.id}>
                  <b>{plan.name}</b>
                  <i>{plan.person}</i>
                  <em>{plan.kind}</em>
                  <strong className={plan.active ? "status-active" : "status-completed"}>{plan.active ? "● Attivo" : "✓ Concluso"}</strong>
                </span>
              )) : <span>Nessun piano inserito</span>}
            </div>
          </div>
          <div className="row-actions">
            <button className="secondary-btn" onClick={exportCsv}>
              ↓ Excel
            </button>
            <button
              className="primary-btn"
              onClick={() => setEditing({ entity: "plan", mode: "plan" })}
            >
              ＋ Nuovo piano
            </button>
          </div>
        </div>
        <p className="form-note">
          Queste cifre restano separate e non entrano nei patrimoni singoli o
          totali.
        </p>
        {dueSoon.length > 0 && (
          <div className="plan-alert">
            ⏰ {dueSoon.length} scadenza{dueSoon.length > 1 ? "e" : ""} vicina:{" "}
            {dueSoon.join(", ")}
          </div>
        )}
        <div className="plan-grid">
          {plans.map((plan) => {
            const added = data.planPayments
              .filter((p) => p.planId === plan.id)
              .reduce((s, p) => s + p.amountCents, 0);
            const adjustments = data.planAdjustments.filter(
              (item) => item.planId === plan.id,
            );
            const returnDelta = adjustments.reduce(
              (sum, item) => sum + item.deltaCents,
              0,
            );
            const paid = plan.initialSavedCents + added + returnDelta;
            const percent = plan.targetCents
              ? Math.min(100, (paid / plan.targetCents) * 100)
              : 0;
            const nextDue = planNextDue(plan, data.planPayments);
            const ending = planEndDate(plan);
            return (
              <article
                className={`plan-card ${!plan.active ? "practice-completed" : ""} ${collapsedCards.has(`plan-${plan.id}`) ? "collapsed" : ""}`}
                key={plan.id}
              >
                <div className="decision-top">
                  <span>{plan.kind}</span>
                  <small>
                    {plan.author === "Davide" ? "D" : "F"} ·{" "}
                    {frequencyLabel(plan.frequencyMonths)}{" "}
                    {plan.paymentTiming !== "libera" ? plan.paymentTiming : ""}
                  </small>
                  <button
                    className="collapse-card-btn"
                    onClick={() => toggleCard(`plan-${plan.id}`)}
                  >
                    {collapsedCards.has(`plan-${plan.id}`)
                      ? "▾ Apri"
                      : "▴ Richiudi"}
                  </button>
                </div>
                <h3>{plan.name}</h3>
                <div className="closed-card-meta">
                  <span>{plan.kind}</span>
                  <span className={plan.active ? "status-active" : "status-completed"}>
                    {plan.active ? "● Attivo" : "✓ Concluso"}
                  </span>
                </div>
                {!plan.active && <span className="completed-badge">✓ Concluso</span>}
                <p>{plan.institution || "Istituto non indicato"}</p>
                <strong>{euro.format(paid / 100)}</strong>
                {plan.targetCents > 0 && (
                  <>
                    <small> di {euro.format(plan.targetCents / 100)}</small>
                    <div className="mini-progress">
                      <span style={{ width: `${percent}%` }} />
                    </div>
                    <div className="progress-caption">
                      <span>Completamento</span>
                      <b>{Math.round(percent)}%</b>
                    </div>
                  </>
                )}
                <div className="plan-dates">
                  <span>
                    Prossima rata{" "}
                    <b>
                      {nextDue
                        ? shortDate.format(new Date(`${nextDue}T12:00:00`))
                        : "Libera / non prevista"}
                    </b>
                  </span>
                  <span>
                    Fine piano{" "}
                    <b>
                      {ending
                        ? shortDate.format(new Date(`${ending}T12:00:00`))
                        : "Non indicata"}
                    </b>
                  </span>
                </div>
                <div className="amount-breakdown">
                  <span>
                    Accantonamento iniziale{" "}
                    <b>{euro.format(plan.initialSavedCents / 100)}</b>
                  </span>
                  <span>
                    Versamenti registrati <b>{euro.format(added / 100)}</b>
                  </span>
                  <span>
                    Rendimento / riallineamenti{" "}
                    <b
                      className={
                        returnDelta >= 0 ? "positive-text" : "negative-text"
                      }
                    >
                      {returnDelta >= 0 ? "+" : ""}
                      {euro.format(returnDelta / 100)}
                    </b>
                  </span>
                </div>
                <div className="row-actions">
                  <button className="secondary-btn" onClick={() => togglePractice("planStatus", plan.id, !plan.active)}>
                    {plan.active ? "✓ Concludi" : "↻ Riattiva"}
                  </button>
                  <button
                    className="secondary-btn"
                    onClick={() =>
                      setEditing({ entity: "planPayment", planId: plan.id })
                    }
                  >
                    ＋ Versamento
                  </button>
                  <button
                    className="secondary-btn"
                    onClick={() => {
                      setAlignError("");
                      setAligning(plan);
                    }}
                  >
                    ↔ Allinea saldo
                  </button>
                  <button
                    className="delete-btn"
                    onClick={() =>
                      setEditing({ entity: "plan", item: plan, mode: "plan" })
                    }
                  >
                    ✎
                  </button>
                  <button
                    className="delete-btn"
                    onClick={() => remove("plan", plan.id)}
                  >
                    🗑️
                  </button>
                </div>
                <div className="payment-history">
                  {data.planPayments
                    .filter((p) => p.planId === plan.id)
                    .slice(0, 5)
                    .map((p) => (
                      <button
                        key={p.id}
                        onClick={() =>
                          setEditing({
                            entity: "planPayment",
                            planId: plan.id,
                            item: p,
                          })
                        }
                      >
                        <span>
                          {p.date}
                          {p.automatic ? " · auto" : ""}
                        </span>
                        <b>{euro.format(p.amountCents / 100)}</b>
                      </button>
                    ))}
                </div>
                {adjustments.length > 0 && (
                  <div className="adjustment-history">
                    <small>Storico allineamenti</small>
                    {adjustments.slice(0, 5).map((item) => (
                      <article key={item.id}>
                        <div>
                          <b
                            className={
                              item.deltaCents >= 0
                                ? "positive-text"
                                : "negative-text"
                            }
                          >
                            {item.deltaCents >= 0 ? "+" : ""}
                            {euro.format(item.deltaCents / 100)}
                          </b>
                          <span>
                            {item.author} ·{" "}
                            {new Intl.DateTimeFormat("it-IT", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            }).format(
                              new Date(
                                item.adjustedAt.replace(" ", "T") +
                                  (item.adjustedAt.endsWith("Z") ? "" : "Z"),
                              ),
                            )}
                          </span>
                          <span>
                            {euro.format(item.previousBalanceCents / 100)} →{" "}
                            {euro.format(item.newBalanceCents / 100)}
                            {item.note ? ` · ${item.note}` : ""}
                          </span>
                        </div>
                        <button
                          className="delete-btn"
                          onClick={() => void removeAdjustment(item)}
                          aria-label="Annulla allineamento"
                        >
                          🗑️
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
      <div className="panel page-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">Fuori dal patrimonio</p>
            <h2>
              {selectedPerson === "Comune"
                ? "Investimenti comuni"
                : selectedPerson === "Tutti"
                  ? "Investimenti"
                  : "Investimenti personali"}
            </h2>
            <div className="panel-closed-summary">
              {investments.length ? investments.map((investment) => (
                <span className="summary-practice" key={investment.id}>
                  <b>{investment.name}</b>
                  <i>{investment.person}</i>
                  <em>Investimento</em>
                  <strong className={investment.active ? "status-active" : "status-completed"}>{investment.active ? "● Attivo" : "✓ Concluso"}</strong>
                </span>
              )) : <span>Nessun investimento inserito</span>}
            </div>
          </div>
          <button
            className="primary-btn"
            onClick={() => setEditing({ entity: "plan", mode: "investment" })}
          >
            ＋ Nuovo investimento
          </button>
        </div>
        <p className="form-note">
          Gli investimenti sono separati dai patrimoni e restano completamente
          modificabili.
        </p>
        <div className="plan-grid">
          {investments.map((investment) => {
            const ending = planEndDate(investment);
            const adjustments = data.planAdjustments.filter(
              (item) => item.planId === investment.id,
            );
            const returnDelta = adjustments.reduce(
              (sum, item) => sum + item.deltaCents,
              0,
            );
            const currentValue = investment.initialSavedCents + returnDelta;
            return (
              <article
                className={`plan-card investment-card ${!investment.active ? "practice-completed" : ""} ${collapsedCards.has(`investment-${investment.id}`) ? "collapsed" : ""}`}
                key={investment.id}
              >
                <div className="decision-top">
                  <span>Investimento</span>
                  <small>
                    {investment.author === "Davide" ? "D" : "F"} ·{" "}
                    {investment.author}
                  </small>
                  <button
                    className="collapse-card-btn"
                    onClick={() => toggleCard(`investment-${investment.id}`)}
                  >
                    {collapsedCards.has(`investment-${investment.id}`)
                      ? "▾ Apri"
                      : "▴ Richiudi"}
                  </button>
                </div>
                <h3>{investment.name}</h3>
                <div className="closed-card-meta">
                  <span>Investimento</span>
                  <span className={investment.active ? "status-active" : "status-completed"}>
                    {investment.active ? "● Attivo" : "✓ Concluso"}
                  </span>
                </div>
                {!investment.active && <span className="completed-badge">✓ Concluso</span>}
                <p>{investment.institution || "Banca non indicata"}</p>
                <strong>{euro.format(currentValue / 100)}</strong>
                <div className="plan-dates">
                  <span>
                    Inizio{" "}
                    <b>
                      {shortDate.format(
                        new Date(`${investment.startDate}T12:00:00`),
                      )}
                    </b>
                  </span>
                  <span>
                    Scadenza{" "}
                    <b>
                      {ending
                        ? shortDate.format(new Date(`${ending}T12:00:00`))
                        : "Non indicata"}
                    </b>
                  </span>
                </div>
                <div className="amount-breakdown">
                  <span>
                    Capitale inserito{" "}
                    <b>{euro.format(investment.initialSavedCents / 100)}</b>
                  </span>
                  <span>
                    Guadagno / perdita{" "}
                    <b
                      className={
                        returnDelta >= 0 ? "positive-text" : "negative-text"
                      }
                    >
                      {returnDelta >= 0 ? "+" : ""}
                      {euro.format(returnDelta / 100)}
                    </b>
                  </span>
                  <span>
                    Tasse indicate{" "}
                    <b>
                      {investment.taxAmountCents
                        ? euro.format(investment.taxAmountCents / 100)
                        : "—"}
                    </b>
                  </span>
                  <span>
                    Aliquota{" "}
                    <b>
                      {investment.taxRateBps
                        ? `${(investment.taxRateBps / 100).toFixed(2)}%`
                        : "—"}
                    </b>
                  </span>
                </div>
                {investment.notes && (
                  <p className="investment-note">{investment.notes}</p>
                )}
                <div className="row-actions">
                  <button className="secondary-btn" onClick={() => togglePractice("planStatus", investment.id, !investment.active)}>
                    {investment.active ? "✓ Concludi" : "↻ Riattiva"}
                  </button>
                  <button
                    className="secondary-btn"
                    onClick={() => {
                      setAlignError("");
                      setAligning(investment);
                    }}
                  >
                    ↔ Allinea valore
                  </button>
                  <button
                    className="delete-btn"
                    onClick={() =>
                      setEditing({
                        entity: "plan",
                        item: investment,
                        mode: "investment",
                      })
                    }
                  >
                    ✎
                  </button>
                  <button
                    className="delete-btn"
                    onClick={() => remove("plan", investment.id)}
                  >
                    🗑️
                  </button>
                </div>
                {adjustments.length > 0 && (
                  <div className="adjustment-history">
                    <small>Storico allineamenti</small>
                    {adjustments.slice(0, 5).map((item) => (
                      <article key={item.id}>
                        <div>
                          <b
                            className={
                              item.deltaCents >= 0
                                ? "positive-text"
                                : "negative-text"
                            }
                          >
                            {item.deltaCents >= 0 ? "+" : ""}
                            {euro.format(item.deltaCents / 100)}
                          </b>
                          <span>
                            {item.author} ·{" "}
                            {new Intl.DateTimeFormat("it-IT", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            }).format(
                              new Date(
                                item.adjustedAt.replace(" ", "T") +
                                  (item.adjustedAt.endsWith("Z") ? "" : "Z"),
                              ),
                            )}
                          </span>
                          <span>
                            {euro.format(item.previousBalanceCents / 100)} →{" "}
                            {euro.format(item.newBalanceCents / 100)}
                            {item.note ? ` · ${item.note}` : ""}
                          </span>
                        </div>
                        <button
                          className="delete-btn"
                          onClick={() => void removeAdjustment(item)}
                          aria-label="Annulla allineamento"
                        >
                          🗑️
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
      <div className="panel page-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">Sotto-sezione obiettivi</p>
            <h2>Finanziamenti, prestiti e mutui</h2>
            <div className="panel-closed-summary">
              {debts.length ? debts.map((debt) => (
                <span className="summary-practice" key={debt.id}>
                  <b>{debt.name}</b>
                  <i>{debt.person}</i>
                  <em>{debt.kind}</em>
                  <strong className={debt.active ? "status-active" : "status-completed"}>{debt.active ? "● Attivo" : "✓ Concluso"}</strong>
                  <mark>Residuo {euro.format(residualForDebt(debt) / 100)}</mark>
                </span>
              )) : <span>Nessuna pratica inserita</span>}
            </div>
          </div>
          <button
            className="primary-btn"
            onClick={() => setEditing({ entity: "debt" })}
          >
            ＋ Nuova voce
          </button>
        </div>
        <div className="plan-grid">
          {debts.map((debt) => {
            const recorded = data.debtPayments
              .filter((p) => p.debtId === debt.id)
              .reduce((s, p) => s + p.amountCents, 0);
            const adjustments = data.debtAdjustments.filter((item) => item.debtId === debt.id);
            const adjustmentDelta = adjustments.reduce((sum, item) => sum + item.deltaCents, 0);
            const residual = Math.max(0, debt.originalAmountCents - debt.initialPaidCents - recorded + adjustmentDelta);
            const paid = Math.max(0, debt.originalAmountCents - residual);
            return (
              <article
                className={`plan-card debt-card ${!debt.active ? "practice-completed" : ""} ${collapsedCards.has(`debt-${debt.id}`) ? "collapsed" : ""}`}
                key={debt.id}
              >
                <div className="decision-top">
                  <span>{debt.kind}</span>
                  <small>
                    {debt.author === "Davide" ? "D" : "F"} ·{" "}
                    {debt.variable
                      ? "rata variabile"
                      : debt.automatic
                        ? "rata automatica"
                        : "manuale"}
                  </small>
                  <button
                    className="collapse-card-btn"
                    onClick={() => toggleCard(`debt-${debt.id}`)}
                  >
                    {collapsedCards.has(`debt-${debt.id}`)
                      ? "▾ Apri"
                      : "▴ Richiudi"}
                  </button>
                </div>
                <h3>{debt.name}</h3>
                <div className="closed-card-meta">
                  <span>{debt.kind}</span>
                  <span className={debt.active ? "status-active" : "status-completed"}>
                    {debt.active ? "● Attivo" : "✓ Concluso"}
                  </span>
                  <span>Residuo {euro.format(residual / 100)}</span>
                </div>
                {!debt.active && <span className="completed-badge">✓ Concluso</span>}
                <p>{debt.creditor}</p>
                <div className="debt-parallel">
                  <div>
                    <span>Già versato</span>
                    <strong>{euro.format(paid / 100)}</strong>
                  </div>
                  <div>
                    <span>Capitale residuo</span>
                    <strong>
                      {euro.format(residual / 100)}
                    </strong>
                  </div>
                </div>
                <small>
                  Importo iniziale {euro.format(debt.originalAmountCents / 100)}
                </small>
                <div className="mini-progress">
                  <span
                    style={{
                      width: `${debt.originalAmountCents ? Math.min(100, (paid / debt.originalAmountCents) * 100) : 0}%`,
                    }}
                  />
                </div>
                <div className="progress-caption">
                  <span>Finanziamento completato</span>
                  <b>
                    {debt.originalAmountCents
                      ? Math.min(
                          100,
                          Math.round((paid / debt.originalAmountCents) * 100),
                        )
                      : 0}
                    %
                  </b>
                </div>
                <div className="amount-breakdown">
                  <span>
                    Già versato all’inserimento{" "}
                    <b>{euro.format(debt.initialPaidCents / 100)}</b>
                  </span>
                  <span>
                    Rate registrate <b>{euro.format(recorded / 100)}</b>
                  </span>
                  <span>
                    Correzioni del residuo{" "}
                    <b className={adjustmentDelta <= 0 ? "positive-text" : "negative-text"}>
                      {adjustmentDelta >= 0 ? "+" : ""}{euro.format(adjustmentDelta / 100)}
                    </b>
                  </span>
                </div>
                <div className="row-actions">
                  <button className="secondary-btn" onClick={() => togglePractice("debtStatus", debt.id, !debt.active)}>
                    {debt.active ? "✓ Concludi" : "↻ Riattiva"}
                  </button>
                  <button className="secondary-btn" onClick={() => setDebtChart(debt)}>
                    ↗ Andamento rate
                  </button>
                  <button
                    className="secondary-btn"
                    onClick={() =>
                      setEditing({ entity: "debtPayment", debtId: debt.id })
                    }
                  >
                    ＋ Registra rata
                  </button>
                  <button className="secondary-btn" onClick={() => { setAlignError(""); setAligningDebt(debt); }}>
                    ↔ Allinea residuo
                  </button>
                  <button
                    className="delete-btn"
                    onClick={() => setEditing({ entity: "debt", item: debt })}
                  >
                    ✎
                  </button>
                  <button
                    className="delete-btn"
                    onClick={() => remove("debt", debt.id)}
                  >
                    🗑️
                  </button>
                </div>
                <div className="payment-history">
                  {data.debtPayments
                    .filter((p) => p.debtId === debt.id)
                    .slice(0, 5)
                    .map((p) => (
                      <div className="payment-edit-row" key={p.id}>
                        <button
                          onClick={() =>
                            setEditing({
                              entity: "debtPayment",
                              debtId: debt.id,
                              item: p,
                            })
                          }
                        >
                          <span>
                            {p.date}
                            {p.automatic ? " · generata dal piano" : " · inserita manualmente"}
                          </span>
                          <b>{euro.format(p.amountCents / 100)}</b>
                        </button>
                        {!p.automatic && (
                          <button
                            className="delete-btn"
                            onClick={() => remove("debtPayment", p.id)}
                            aria-label="Elimina rata manuale"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    ))}
                </div>
                {adjustments.length > 0 && (
                  <div className="adjustment-history">
                    <small>Storico allineamenti residuo</small>
                    {adjustments.slice(0, 5).map((item) => (
                      <article key={item.id}>
                        <div>
                          <b className={item.deltaCents <= 0 ? "positive-text" : "negative-text"}>
                            {item.deltaCents >= 0 ? "+" : ""}{euro.format(item.deltaCents / 100)}
                          </b>
                          <span>{item.author} · {new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(item.adjustedAt.replace(" ", "T") + (item.adjustedAt.endsWith("Z") ? "" : "Z")))}</span>
                          <span>{euro.format(item.previousResidualCents / 100)} → {euro.format(item.newResidualCents / 100)}{item.note ? ` · ${item.note}` : ""}</span>
                        </div>
                        <button className="delete-btn" onClick={() => void removeDebtAdjustment(item)} aria-label="Annulla allineamento">🗑️</button>
                      </article>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
      <div className="panel page-panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">Movimenti generati ogni mese</p>
            <h2>Automatismi attivi</h2>
            <div className="panel-closed-summary">
              {schedules.length ? schedules.map((schedule) => (
                <span className="summary-practice" key={schedule.id}>
                  <b>{schedule.name}</b>
                  <i>{schedule.person}</i>
                  <em>{schedule.kind}</em>
                  <strong className={schedule.active ? "status-active" : "status-completed"}>{schedule.active ? "● Attivo" : "✓ Concluso"}</strong>
                  <mark>{euro.format(schedule.amountCents / 100)}</mark>
                </span>
              )) : <span>Nessun automatismo inserito</span>}
            </div>
          </div>
          <button
            className="primary-btn"
            onClick={() => setEditing({ entity: "schedule" })}
          >
            ＋ Nuovo automatismo
          </button>
        </div>
        {schedules.length ? (
          <div className="deadline-list">
            {schedules.map((s) => (
              <article
                className={`deadline-row ${!s.active ? "done" : ""}`}
                key={s.id}
              >
                <span className="movement-icon">↻</span>
                <div>
                  <strong>{s.name}</strong>
                  <small>
                    {s.kind} · {euro.format(s.amountCents / 100)} · giorno{" "}
                    {s.dayOfMonth} · {s.author}
                  </small>
                </div>
                <span className="row-actions">
                  <button
                    className="delete-btn"
                    onClick={() => setEditing({ entity: "schedule", item: s })}
                  >
                    ✎
                  </button>
                  <button
                    className="delete-btn"
                    onClick={() => remove("schedule", s.id)}
                  >
                    🗑️
                  </button>
                </span>
              </article>
            ))}
          </div>
        ) : (
          <p className="report-copy">Nessun movimento automatico impostato.</p>
        )}
      </div>
      {editing && (
        <FeatureModal
          title={
            editing.entity === "plan"
              ? editing.mode === "investment" ||
                editing.item?.kind === "Investimento"
                ? "Investimento"
                : "PAC o accantonamento"
              : editing.entity === "debt"
                ? "Finanziamento, prestito o mutuo"
                : editing.entity === "schedule"
                  ? "Movimento mensile automatico"
                  : editing.entity === "planPayment"
                    ? "Versamento al piano"
                    : "Registra rata"
          }
          onClose={() => setEditing(null)}
        >
          <FinanceForm
            editing={editing}
            person={person}
            commonAccounts={commonAccounts}
            goals={goals}
            onSubmit={save}
          />
        </FeatureModal>
      )}
      {aligning && (
        <FeatureModal
          title={`Allinea · ${aligning.name}`}
          onClose={() => setAligning(null)}
        >
          <form onSubmit={saveAlignment}>
            <p className="form-note">
              Inserisci il valore reale mostrato dalla banca. La differenza sarà
              registrata come rendimento o perdita, senza creare un versamento.
            </p>
            <label>
              Valore reale aggiornato
              <input
                name="actualBalance"
                type="number"
                min="0"
                step="0.01"
                required
              />
            </label>
            <label>
              Motivo / nota
              <input
                name="note"
                placeholder="Es. valore aggiornato da app banca"
              />
            </label>
            <label>
              Allineato da
              <select
                name="author"
                defaultValue={person === "Francesca" ? "Francesca" : "Davide"}
              >
                <option>Davide</option>
                <option>Francesca</option>
              </select>
            </label>
            <label>
              Codice di recupero
              <input
                name="recoveryCode"
                type="password"
                minLength={6}
                autoComplete="off"
                required
              />
            </label>
            {alignError && <p className="form-error">{alignError}</p>}
            <button className="primary-btn full">Conferma allineamento</button>
          </form>
        </FeatureModal>
      )}
      {aligningDebt && (
        <FeatureModal title={`Allinea capitale residuo · ${aligningDebt.name}`} onClose={() => setAligningDebt(null)}>
          <form onSubmit={saveDebtAlignment}>
            <p className="form-note">
              Inserisci il capitale residuo reale indicato dalla banca. Le rate e l’importo iniziale non verranno modificati.
            </p>
            <label>
              Capitale residuo reale
              <input name="actualResidual" type="number" min="0" step="0.01" required />
            </label>
            <label>
              Motivo / nota
              <input name="note" placeholder="Es. conteggio aggiornato della banca" />
            </label>
            <label>
              Allineato da
              <select name="author" defaultValue={person === "Francesca" ? "Francesca" : "Davide"}>
                <option>Davide</option>
                <option>Francesca</option>
              </select>
            </label>
            <label>
              Codice di recupero
              <input name="recoveryCode" type="password" minLength={6} autoComplete="off" required />
            </label>
            {alignError && <p className="form-error">{alignError}</p>}
            <button className="primary-btn full">Conferma allineamento</button>
          </form>
        </FeatureModal>
      )}
      {debtChart && (
        <FeatureModal title={`Andamento rate · ${debtChart.name}`} onClose={() => setDebtChart(null)}>
          <DebtRateChart debt={debtChart} payments={data.debtPayments} />
        </FeatureModal>
      )}
    </section>
  );
}

function FinanceForm({
  editing,
  person,
  commonAccounts,
  goals,
  onSubmit,
}: {
  editing: FinanceEdit;
  person: "Davide" | "Francesca" | "Comune";
  commonAccounts: string[];
  goals: { id: number; name: string }[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const item = "item" in editing ? editing.item : undefined;
  const defaultAuthor = person === "Francesca" ? "Francesca" : "Davide";
  if (editing.entity === "planPayment" || editing.entity === "debtPayment") {
    const payment = editing.item;
    return (
      <form onSubmit={onSubmit}>
        <div className="form-row">
          <label>
            Importo
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              defaultValue={payment ? payment.amountCents / 100 : ""}
              required
            />
          </label>
          <label>
            Data
            <input
              name="date"
              type="date"
              defaultValue={payment?.date ?? today()}
              required
            />
          </label>
        </div>
        <label>
          Nota
          <input name="note" defaultValue={payment?.note ?? ""} />
        </label>
        <label>
          Inserito da
          <select name="author" defaultValue={payment?.author ?? defaultAuthor}>
            <option>Davide</option>
            <option>Francesca</option>
          </select>
        </label>
        <button className="primary-btn full">Salva</button>
      </form>
    );
  }
  if (editing.entity === "plan") {
    const p = item as Plan | undefined;
    const investment =
      editing.mode === "investment" || p?.kind === "Investimento";
    const durationInYears = Boolean(
      p?.durationMonths && p.durationMonths % 12 === 0,
    );
    if (investment)
      return (
        <form onSubmit={onSubmit}>
          <input type="hidden" name="kind" value="Investimento" />
          <input type="hidden" name="frequencyMonths" value="0" />
          <input type="hidden" name="paymentTiming" value="libera" />
          <input type="hidden" name="active" value={p?.active === false ? "" : "on"} />
          <div className="form-row">
            <label>
              Profilo
              <select name="person" defaultValue={p?.person ?? person}>
                <option>Davide</option>
                <option>Francesca</option>
                <option>Comune</option>
              </select>
            </label>
            <label>
              Creato da
              <select name="author" defaultValue={p?.author ?? defaultAuthor}>
                <option>Davide</option>
                <option>Francesca</option>
              </select>
            </label>
          </div>
          <label>
            Nome investimento
            <input name="name" defaultValue={p?.name ?? ""} required />
          </label>
          <label>
            Banca / istituto
            <input
              name="institution"
              defaultValue={p?.institution ?? ""}
              required
            />
          </label>
          <label>
            Cifra investita
            <input
              name="initialSaved"
              type="number"
              min="0"
              step="0.01"
              defaultValue={(p?.initialSavedCents ?? 0) / 100}
              required
            />
            <small className="field-help">
              Resta separata dal patrimonio familiare ed è sempre modificabile.
            </small>
          </label>
          <div className="form-row">
            <label>
              Data di inizio
              <input
                name="startDate"
                type="date"
                defaultValue={p?.startDate ?? today()}
                required
              />
            </label>
            <label>
              Durata
              <input
                name="durationValue"
                type="number"
                min="0"
                step="1"
                defaultValue={
                  p?.durationMonths
                    ? durationInYears
                      ? p.durationMonths / 12
                      : p.durationMonths
                    : ""
                }
              />
              <select
                name="durationUnit"
                defaultValue={durationInYears ? "years" : "months"}
              >
                <option value="months">Mesi</option>
                <option value="years">Anni</option>
              </select>
              <small className="field-help">
                La scadenza finale viene calcolata automaticamente.
              </small>
            </label>
          </div>
          <input type="hidden" name="endDate" value={p?.endDate ?? ""} />
          <div className="form-row">
            <label>
              Tasse previste (%)
              <input
                name="taxRate"
                type="number"
                min="0"
                step="0.01"
                defaultValue={(p?.taxRateBps ?? 0) / 100}
              />
            </label>
            <label>
              Tasse previste (€)
              <input
                name="taxAmount"
                type="number"
                min="0"
                step="0.01"
                defaultValue={(p?.taxAmountCents ?? 0) / 100}
              />
            </label>
          </div>
          <label>
            Avviso prima
            <select name="reminderDays" defaultValue={p?.reminderDays ?? 7}>
              <option value="1">1 giorno</option>
              <option value="2">2 giorni</option>
              <option value="7">1 settimana</option>
              <option value="30">1 mese</option>
            </select>
          </label>
          <label>
            Note
            <textarea name="notes" rows={4} defaultValue={p?.notes ?? ""} />
          </label>
          <button className="primary-btn full">Salva investimento</button>
        </form>
      );
    return (
      <form onSubmit={onSubmit}>
        <div className="form-row">
          <label>
            Profilo
            <select name="person" defaultValue={p?.person ?? person}>
              <option>Davide</option>
              <option>Francesca</option>
              <option>Comune</option>
            </select>
          </label>
          <label>
            Tipo
            <select name="kind" defaultValue={p?.kind ?? "PAC"}>
              <option>PAC</option>
              <option>Accantonamento</option>
              <option>Altro</option>
            </select>
          </label>
        </div>
        <label>
          Nome
          <input name="name" defaultValue={p?.name ?? ""} required />
        </label>
        <label>
          Banca / istituto
          <input name="institution" defaultValue={p?.institution ?? ""} />
        </label>
        <div className="form-row">
          <label>
            Accantonamento iniziale
            <input
              name="initialSaved"
              type="number"
              min="0"
              step="0.01"
              defaultValue={(p?.initialSavedCents ?? 0) / 100}
            />
            <small className="field-help">
              Serve ad allineare il PAC al saldo già presente in banca.
            </small>
          </label>
          <label>
            Obiettivo facoltativo
            <input
              name="target"
              type="number"
              min="0"
              step="0.01"
              defaultValue={(p?.targetCents ?? 0) / 100}
            />
          </label>
        </div>
        <label>
          Importo della rata
          <input
            name="monthlyAmount"
            type="number"
            min="0"
            step="0.01"
            defaultValue={(p?.monthlyAmountCents ?? 0) / 100}
          />
        </label>
        <div className="form-row">
          <label>
            Periodicità
            <select
              name="frequencyMonths"
              defaultValue={p?.frequencyMonths ?? 1}
            >
              <option value="0">Libera / nessuna cadenza</option>
              <option value="1">Mensile</option>
              <option value="2">Bimestrale</option>
              <option value="3">Trimestrale</option>
              <option value="6">Semestrale</option>
              <option value="12">Annuale</option>
            </select>
          </label>
          <label>
            Tipo rata
            <select
              name="paymentTiming"
              defaultValue={p?.paymentTiming ?? "anticipata"}
            >
              <option value="anticipata">Anticipata</option>
              <option value="posticipata">Posticipata</option>
              <option value="libera">Libera</option>
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            Data di inizio
            <input
              name="startDate"
              type="date"
              defaultValue={p?.startDate ?? today()}
              required
            />
          </label>
          <label>
            Durata
            <input
              name="durationValue"
              type="number"
              min="0"
              step="1"
              defaultValue={
                p?.durationMonths
                  ? durationInYears
                    ? p.durationMonths / 12
                    : p.durationMonths
                  : ""
              }
            />
            <select
              name="durationUnit"
              defaultValue={durationInYears ? "years" : "months"}
            >
              <option value="months">Mesi</option>
              <option value="years">Anni</option>
            </select>
            <small className="field-help">
              Calcola la scadenza finale e il relativo promemoria.
            </small>
          </label>
        </div>
        <input type="hidden" name="endDate" value={p?.endDate ?? ""} />
        <div className="form-row">
          <label>
            Giorno rata
            <input
              name="dayOfMonth"
              type="number"
              min="1"
              max="31"
              defaultValue={p?.dayOfMonth ?? 1}
            />
          </label>
          <label>
            Avviso prima
            <select name="reminderDays" defaultValue={p?.reminderDays ?? 7}>
              <option value="1">1 giorno</option>
              <option value="2">2 giorni</option>
              <option value="7">1 settimana</option>
              <option value="30">1 mese</option>
            </select>
          </label>
        </div>
        <label>
          Note
          <textarea name="notes" rows={3} defaultValue={p?.notes ?? ""} />
        </label>
        <label>
          Creato da
          <select name="author" defaultValue={p?.author ?? defaultAuthor}>
            <option>Davide</option>
            <option>Francesca</option>
          </select>
        </label>
        <label className="checkbox-label">
          <input
            name="automatic"
            type="checkbox"
            defaultChecked={p?.automatic ?? false}
          />{" "}
          Registra automaticamente le rate previste
        </label>
        <label className="checkbox-label">
          <input
            name="active"
            type="checkbox"
            defaultChecked={p?.active ?? true}
          />{" "}
          Piano attivo
        </label>
        <button className="primary-btn full">Salva</button>
      </form>
    );
  }
  if (editing.entity === "debt") {
    const d = item as Debt | undefined;
    return (
      <form onSubmit={onSubmit}>
        <div className="form-row">
          <label>
            Tipo
            <select name="kind" defaultValue={d?.kind ?? "Finanziamento"}>
              <option>Finanziamento</option>
              <option>Prestito</option>
              <option>Mutuo</option>
            </select>
          </label>
          <label>
            Profilo
            <select name="person" defaultValue={d?.person ?? person}>
              <option>Davide</option>
              <option>Francesca</option>
              <option>Comune</option>
            </select>
          </label>
        </div>
        <label>
          Nome
          <input
            name="name"
            defaultValue={d?.name ?? ""}
            placeholder="Es. BYD"
            required
          />
        </label>
        <label>
          Banca / creditore
          <input name="creditor" defaultValue={d?.creditor ?? ""} />
        </label>
        <div className="form-row">
          <label>
            Importo iniziale
            <input
              name="originalAmount"
              type="number"
              min="0"
              step="0.01"
              defaultValue={(d?.originalAmountCents ?? 0) / 100}
            />
          </label>
          <label>
            Già versato
            <input
              name="initialPaid"
              type="number"
              min="0"
              step="0.01"
              defaultValue={(d?.initialPaidCents ?? 0) / 100}
            />
            <small className="field-help">
              Puoi modificarlo per riallineare il finanziamento alla banca.
            </small>
          </label>
        </div>
        <label>
          Rata prevista
          <input
            name="installment"
            type="number"
            min="0"
            step="0.01"
            defaultValue={(d?.installmentCents ?? 0) / 100}
          />
        </label>
        <div className="form-row">
          <label>
            Inizio
            <input
              name="startDate"
              type="date"
              defaultValue={d?.startDate ?? today()}
              required
            />
          </label>
          <label>
            Scadenza finale
            <input name="endDate" type="date" defaultValue={d?.endDate ?? ""} />
          </label>
        </div>
        <div className="form-row">
          <label>
            Giorno rata
            <input
              name="dayOfMonth"
              type="number"
              min="1"
              max="31"
              defaultValue={d?.dayOfMonth ?? 15}
            />
          </label>
          <label>
            Avviso prima
            <select name="reminderDays" defaultValue={d?.reminderDays ?? 7}>
              <option value="1">1 giorno</option>
              <option value="2">2 giorni</option>
              <option value="7">1 settimana</option>
              <option value="30">1 mese</option>
            </select>
          </label>
        </div>
        <label>
          Conto comune facoltativo
          <select name="commonAccount" defaultValue={d?.commonAccount ?? ""}>
            <option value="">Nessuno</option>
            {commonAccounts.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label>
          Note
          <textarea name="notes" rows={3} defaultValue={d?.notes ?? ""} />
        </label>
        <label>
          Creato da
          <select name="author" defaultValue={d?.author ?? defaultAuthor}>
            <option>Davide</option>
            <option>Francesca</option>
          </select>
        </label>
        <label className="checkbox-label">
          <input
            name="variable"
            type="checkbox"
            defaultChecked={d?.variable ?? false}
          />{" "}
          Rata variabile: la inserisco volta per volta
        </label>
        <label className="checkbox-label">
          <input
            name="automatic"
            type="checkbox"
            defaultChecked={d?.automatic ?? false}
          />{" "}
          Genera la rata fissa automaticamente
        </label>
        <label className="checkbox-label">
          <input
            name="active"
            type="checkbox"
            defaultChecked={d?.active ?? true}
          />{" "}
          Voce attiva
        </label>
        <button className="primary-btn full">Salva</button>
      </form>
    );
  }
  const s = item as Schedule | undefined;
  return (
    <form onSubmit={onSubmit}>
      <label>
        Nome movimento
        <input
          name="name"
          defaultValue={s?.name ?? ""}
          placeholder="Es. Rata BYD"
          required
        />
      </label>
      <div className="form-row">
        <label>
          Tipo
          <select name="kind" defaultValue={s?.kind ?? "Spesa"}>
            <option>Spesa</option>
            <option>Entrata</option>
          </select>
        </label>
        <label>
          Categoria
          <input
            name="category"
            defaultValue={s?.category ?? "Altro"}
            required
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          Importo
          <input
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue={(s?.amountCents ?? 0) / 100 || ""}
            required
          />
        </label>
        <label>
          Profilo
          <select name="person" defaultValue={s?.person ?? person}>
            <option>Davide</option>
            <option>Francesca</option>
            <option>Comune</option>
          </select>
        </label>
      </div>
      <label>
        Collega a obiettivo
        <select name="goalId" defaultValue={s?.goalId ?? ""}>
          <option value="">Nessuno</option>
          {goals.map((g) => (
            <option value={g.id} key={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Conto comune
        <select name="commonAccount" defaultValue={s?.commonAccount ?? ""}>
          <option value="">Nessuno</option>
          {commonAccounts.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <small>Per una spesa personale dalla Ricaricabile BPER o dalla PREPAGATA Mediolanum, il saldo della carta viene ridotto.</small>
      </label>
      <div className="form-row">
        <label>
          Giorno del mese
          <input
            name="dayOfMonth"
            type="number"
            min="1"
            max="31"
            defaultValue={s?.dayOfMonth ?? 15}
          />
        </label>
        <label>
          Quota Ticket
          <input
            name="ticketAmount"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          Inizio
          <input
            name="startDate"
            type="date"
            defaultValue={s?.startDate ?? today()}
            required
          />
        </label>
        <label>
          Fine facoltativa
          <input name="endDate" type="date" defaultValue={s?.endDate ?? ""} />
        </label>
      </div>
      <label>
        Creato da
        <select name="author" defaultValue={s?.author ?? defaultAuthor}>
          <option>Davide</option>
          <option>Francesca</option>
        </select>
      </label>
      <label className="checkbox-label">
        <input
          name="active"
          type="checkbox"
          defaultChecked={s?.active ?? true}
        />{" "}
        Automatismo attivo
      </label>
      <button className="primary-btn full">Salva</button>
    </form>
  );
}
