"use client";

import {
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isScheduledPrepaidExpense } from "../lib/prepaid-card";
import {
  BackupView,
  DashboardAdvice,
  DecisionsView,
  PersonalFinanceView,
  SubscriptionsView,
  TravelView,
  UtilitiesAnalysis,
} from "./family-features";

type Person = "Davide" | "Francesca" | "Comune";
type Kind = "Spesa" | "Entrata";
type View =
  | "dashboard"
  | "movimenti"
  | "comune"
  | "utenze"
  | "abbonamenti"
  | "budget"
  | "obiettivi"
  | "piani"
  | "scadenze"
  | "viaggi"
  | "decisioni"
  | "note"
  | "chat"
  | "report"
  | "backup";
type CommonAccount = string;
type Theme = "crema" | "tortora" | "grigio" | "salvia" | "oceano" | "ametista" | "tramonto" | "byd";
type GraphicStyle = "base" | "ios" | "cartoon" | "eighties";

type Movement = {
  id: number;
  kind: Kind;
  description: string;
  category: string;
  amount: number;
  person: Person;
  commonAccount?: CommonAccount | null;
  ticketAmount?: number;
  goalId?: number | null;
  scheduleId?: number | null;
  date: string;
  createdAt?: string;
};
type DashboardPlanPayment = Movement & { planId: number };

type CommonTransaction = {
  id: number;
  account: CommonAccount;
  direction: Kind;
  description: string;
  category: string;
  amount: number;
  date: string;
  createdAt?: string;
  sourceMovementId?: number | null;
  person: Person;
};
type BalanceAdjustment = {
  id: number;
  account: string;
  delta: number;
  resultingBalance: number;
  date: string;
  note: string;
  author: "Davide" | "Francesca";
  createdAt?: string;
};
type Budget = { id: number; month: string; category: string; limit: number };
type Goal = {
  id: number;
  name: string;
  target: number;
  photoKey?: string | null;
};
type GoalContribution = {
  id: number;
  goalId: number;
  source: string;
  amount: number;
  date: string;
};
type Deadline = {
  id: number;
  title: string;
  date: string;
  reminderDays: number;
  note: string;
  completed: boolean;
  recurrence: "none" | "monthly" | "yearly";
  person: Person;
};

type Note = {
  id: number;
  date: string;
  content: string;
  author: "Davide" | "Francesca";
  createdAt?: string;
};
const COVER_MESSAGE_PREFIX = "__cover_message__:";

type UtilityBill = {
  id: number;
  movementId: number;
  provider: string;
  service: string;
  amount: number;
  wallet: "Davide" | "Francesca" | CommonAccount;
  commonAccount?: CommonAccount;
  date: string;
  dueDate?: string | null;
  recurring?: boolean;
  billingFrequency?: "monthly" | "annual";
  deadlineId?: number | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  consumption?: number | null;
  consumptionUnit?: string | null;
  meterReading?: number | null;
  invoiceNumber?: string | null;
  notes?: string | null;
};
type ChatMessage = {
  id: number;
  author: "Davide" | "Francesca";
  content: string;
  createdAt: string;
};

const initialMovements: Movement[] = [];

const euro = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
});
const shortDate = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const insertedDateTime = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parseStoredDateTime(value: string) {
  return new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
}
function accountBalance(account: string, transactions: CommonTransaction[], adjustments: BalanceAdjustment[]) {
  const today = localDateKey();
  const latest = adjustments
    .filter((item) => item.account === account && item.date <= today)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || b.id - a.id)[0];
  const relevantTransactions = transactions.filter((item) => {
    if (item.account !== account || item.date > today) return false;
    if (!latest) return true;
    if (item.date !== latest.date) return item.date > latest.date;
    return Boolean(item.createdAt && latest.createdAt && item.createdAt > latest.createdAt);
  });
  return (latest?.resultingBalance ?? 0) + relevantTransactions.reduce(
    (sum, item) => sum + (item.direction === "Entrata" ? item.amount : -item.amount),
    0,
  );
}
function smoothChartPath(points: Array<[number, number]>) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;
  let path = `M ${points[0][0]} ${points[0][1]}`;
  points.forEach((point, index) => {
    if (index === points.length - 1) return;
    const previous = points[index - 1] ?? point;
    const next = points[index + 1];
    const afterNext = points[index + 2] ?? next;
    path += ` C ${point[0] + (next[0] - previous[0]) / 6} ${point[1] + (next[1] - previous[1]) / 6}, ${next[0] - (afterNext[0] - point[0]) / 6} ${next[1] - (afterNext[1] - point[1]) / 6}, ${next[0]} ${next[1]}`;
  });
  return path;
}
function isOpeningBalance(movement: Movement) {
  return /^AL\s+\d{2}[./-]\d{2}[./-]\d{4}$/i.test(
    movement.description.trim(),
  );
}
function isInternalTransfer(movement: Movement) {
  // A personal transfer to a shared account is still a real monthly
  // outflow for that person. It must therefore contribute to Spese and
  // reduce Risparmio, while the mirrored account transaction updates the
  // destination balance separately. Only shared-account transfers remain
  // excluded as internal movements.
  if (movement.person === "Davide" || movement.person === "Francesca") {
    return false;
  }
  const description = movement.description.trim();
  if (/^fondo\b/i.test(description)) return true;
  if (/^ricarica\s+prepagata$/i.test(description)) return true;
  if (!movement.commonAccount) return false;
  return /(?:n\s*26\s*-?\s*fondo|ricarica\s+ticket)/i.test(description);
}
function isEconomicMovement(movement: Movement) {
  // Prepaid-card funding was already accounted for as a personal outflow.
  // Keep its scheduled purchases in the movement list and card ledger, but
  // avoid subtracting the same money again from personal savings.
  if (isScheduledPrepaidExpense(movement)) return false;
  return !isOpeningBalance(movement) && !isInternalTransfer(movement);
}

const navItems: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "✨" },
  { id: "movimenti", label: "Movimenti", icon: "↕️" },
  { id: "comune", label: "Conti comuni", icon: "🏠" },
  { id: "utenze", label: "Utenze", icon: "⚡" },
  { id: "abbonamenti", label: "Abbonamenti", icon: "🎬" },
  { id: "budget", label: "Budget", icon: "📊" },
  { id: "obiettivi", label: "Obiettivi", icon: "🎯" },
  { id: "piani", label: "Piani e rate", icon: "📅" },
  { id: "scadenze", label: "Scadenze", icon: "⏰" },
  { id: "viaggi", label: "Viaggi", icon: "🧳" },
  { id: "decisioni", label: "Decisioni", icon: "💡" },
  { id: "note", label: "Note", icon: "📝" },
  { id: "chat", label: "Chat", icon: "💬" },
  { id: "report", label: "Report", icon: "📈" },
  { id: "backup", label: "Backup", icon: "💾" },
];

const categoryIcons: Record<string, string> = {
  Spesa: "🛒",
  Casa: "💡",
  "Tempo libero": "🍽️",
  Trasporti: "🚗",
  Entrate: "💶",
  Viaggi: "✈️",
  Salute: "🩺",
  Utenze: "💡",
  Supermercato: "🛒",
  "Ticket Satispay": "🎫",
  Versamento: "↗",
  Altro: "📌",
};

export default function Home() {
  const [view, setView] = useState<View>("dashboard");
  const viewRestored = useRef(false);
  const [movements, setMovements] = useState(initialMovements);
  const [dashboardPlanPayments, setDashboardPlanPayments] = useState<DashboardPlanPayment[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [deletingMovement, setDeletingMovement] = useState<Movement | null>(
    null,
  );
  const [filter, setFilter] = useState<"Tutti" | Person>("Tutti");
  const [syncState, setSyncState] = useState<
    "loading" | "online" | "demo" | "saving" | "error"
  >("loading");
  const [appTitle, setAppTitle] = useState("Dafragu Home");
  const [showCover, setShowCover] = useState(false);
  const [backupReminder, setBackupReminder] = useState(false);
  const [backupNotifications, setBackupNotifications] = useState(false);
  const [balancesVisible, setBalancesVisible] = useState(false);
  const [coverMessage, setCoverMessage] = useState("");
  const [coverMessageId, setCoverMessageId] = useState<number | null>(null);
  const [photoUrl, setPhotoUrl] = useState("/api/photo");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [utilityModalOpen, setUtilityModalOpen] = useState(false);
  const [utilityBills, setUtilityBills] = useState<UtilityBill[]>([]);
  const [editingUtility, setEditingUtility] = useState<UtilityBill | null>(
    null,
  );
  const [commonTransactions, setCommonTransactions] = useState<
    CommonTransaction[]
  >([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [contributions, setContributions] = useState<GoalContribution[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [draftAccount,setDraftAccount]=useState("");
  const [draftAmount,setDraftAmount]=useState("");
  const [draftDirection,setDraftDirection]=useState<"Entrata"|"Spesa">("Spesa");
  const [draftDate,setDraftDate]=useState(localDateKey());
  const [commonModalOpen, setCommonModalOpen] = useState(false);
  const [editingCommon, setEditingCommon] = useState<CommonTransaction | null>(
    null,
  );
  const [selectedCommonAccount, setSelectedCommonAccount] = useState<
    CommonAccount | "Tutti"
  >("Tutti");
  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [contributionGoal, setContributionGoal] = useState<Goal | null>(null);
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [deadlineModalOpen, setDeadlineModalOpen] = useState(false);
  const [editingDeadline, setEditingDeadline] = useState<Deadline | null>(null);
  const [reportMonth, setReportMonth] = useState(
    new Date().toISOString().slice(0, 7),
  );
  const [securityState, setSecurityState] = useState<
    "checking" | "setup" | "locked" | "recover" | "unlocked"
  >("checking");
  const [securityError, setSecurityError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [commonAccounts, setCommonAccounts] = useState<CommonAccount[]>([
    "N26",
    "BBVA Dafragu",
    "BBVA Utenze",
    "Ticket Satispay",
  ]);
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatAuthor, setChatAuthor] = useState<"Davide" | "Francesca">(
    "Davide",
  );
  const [chatClearOpen, setChatClearOpen] = useState(false);
  const [lastChatSeen, setLastChatSeen] = useState(0);
  const [balanceAdjustments, setBalanceAdjustments] = useState<
    BalanceAdjustment[]
  >([]);
  const [balanceModalOpen, setBalanceModalOpen] = useState(false);
  const [kpiBreakdown, setKpiBreakdown] = useState<"Entrate" | "Spese" | null>(null);
  const [dashboardPeriod, setDashboardPeriod] = useState(
    new Date().toISOString().slice(0, 7),
  );
  const [movementPeriod, setMovementPeriod] = useState(
    new Date().toISOString().slice(0, 7),
  );
  const [theme, setTheme] = useState<Theme>("crema");
  const [graphicStyle, setGraphicStyle] = useState<GraphicStyle>("base");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const storageKey = "casa-insieme:closed-cards:v1";
    const selector = [
      ".panel.page-panel", ".panel.chart-panel", ".panel.latest-panel",
      ".panel.account-detail", ".insight-box",
    ].join(",");
    let closed = new Set<string>();
    try {
      closed = new Set(JSON.parse(localStorage.getItem(storageKey) || "[]"));
    } catch {
      closed = new Set();
    }
    const save = () => localStorage.setItem(storageKey, JSON.stringify([...closed]));
    const prepare = (card: HTMLElement) => {
      if (card.dataset.persistentCollapse === "ready" || card.closest(".modal-card") || card.querySelector(":scope .collapse-card-btn")) return;
      card.dataset.persistentCollapse = "ready";
      card.classList.add("persistent-collapsible-card");
      const title = card.querySelector("h2,h3,strong,.panel-kicker")?.textContent?.trim() || card.textContent?.trim().slice(0, 70) || "scheda";
      const key = `${view}:${card.className}:${title}`.replace(/\s+/g, " ");
      let host = card.querySelector<HTMLElement>(":scope > .panel-heading, :scope > .trip-hero");
      if (!host) {
        host = document.createElement("div");
        host.className = "persistent-card-summary";
        const label = document.createElement("strong");
        label.textContent = card.querySelector("h3,strong")?.textContent?.trim() || "Scheda";
        host.append(label);
        card.prepend(host);
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "persistent-card-toggle";
      const render = () => {
        const isClosed = closed.has(key);
        card.classList.toggle("persistent-card-collapsed", isClosed);
        button.textContent = isClosed ? "▾ Apri" : "▴ Richiudi";
        button.setAttribute("aria-expanded", String(!isClosed));
        button.setAttribute("aria-label", isClosed ? "Apri questa scheda" : "Richiudi questa scheda");
      };
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (closed.has(key)) closed.delete(key); else closed.add(key);
        save();
        render();
      });
      host.append(button);
      render();
    };
    const prepareAll = () => document.querySelectorAll<HTMLElement>(selector).forEach(prepare);
    prepareAll();
    const observer = new MutationObserver(prepareAll);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [view]);

  useEffect(() => {
    let active = true;
    fetch("/api/security")
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Controllo sicurezza non disponibile");
        return response.json() as Promise<{
          configured: boolean;
          unlocked: boolean;
          recoveryConfigured: boolean;
        }>;
      })
      .then((data) => {
        if (!active) return;
        setSecurityState(
          data.unlocked ? "unlocked" : data.configured ? "locked" : "setup",
        );
      })
      .catch(() => {
        if (active) setSecurityState("locked");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const lastBackup = window.localStorage.getItem("casa-last-backup");
      const lastReminder = Number(window.localStorage.getItem("casa-backup-reminder-seen") ?? "0");
      const monthly = 31 * 86400000;
      const overdue = !lastBackup || Date.now() - new Date(lastBackup).getTime() > monthly;
      if (overdue && Date.now() - lastReminder > monthly) {
        setBackupReminder(true);
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Dafragu Home", { body: "È il momento di salvare il backup mensile della dashboard." });
        }
      }
      setBackupNotifications("Notification" in window && Notification.permission === "granted");
    }, 300);
    return () => window.clearTimeout(timer);
  }, []);
  async function enableBackupNotifications() {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setBackupNotifications(permission === "granted");
  }
  function dismissBackupReminder() {
    window.localStorage.setItem("casa-backup-reminder-seen", String(Date.now()));
    setBackupReminder(false);
  }

  useEffect(() => {
    if (securityState !== "unlocked") return;
    let active = true;
    Promise.all([
      fetch("/api/movements").then(async (response) => {
        if (!response.ok) throw new Error("Archivio non disponibile");
        return response.json() as Promise<{ movements: Movement[] }>;
      }),
      fetch("/api/notes").then(async (response) =>
        response.ok
          ? (response.json() as Promise<{ notes: Note[] }>)
          : { notes: [] },
      ),
      fetch("/api/settings").then(async (response) =>
        response.ok
          ? (response.json() as Promise<{
              title: string;
              commonAccounts: string[];
            }>)
          : {
              title: "Casa Insieme",
              commonAccounts: [
                "N26",
                "BBVA Dafragu",
                "BBVA Utenze",
                "Ticket Satispay",
              ],
            },
      ),
      fetch("/api/utilities").then(async (response) =>
        response.ok
          ? (response.json() as Promise<{ bills: UtilityBill[] }>)
          : { bills: [] },
      ),
      fetch("/api/common-accounts").then(async (response) =>
        response.ok
          ? (response.json() as Promise<{ transactions: CommonTransaction[] }>)
          : { transactions: [] },
      ),
      fetch("/api/planning").then(async (response) =>
        response.ok
          ? (response.json() as Promise<{
              budgets: Budget[];
              goals: Goal[];
              contributions: GoalContribution[];
              deadlines: Deadline[];
            }>)
          : { budgets: [], goals: [], contributions: [], deadlines: [] },
      ),
      fetch("/api/chat").then(async (response) =>
        response.ok
          ? (response.json() as Promise<{ messages: ChatMessage[] }>)
          : { messages: [] },
      ),
      fetch("/api/finance-plans").then(async (response) =>
        response.ok
          ? (response.json() as Promise<{
              plans: Array<{ id: number; name: string; person: Person }>;
              planPayments: Array<{ id: number; planId: number; amountCents: number; date: string }>;
            }>)
          : { plans: [], planPayments: [] },
      ),
    ])
      .then(
        ([
          movementData,
          noteData,
          settingData,
          utilityData,
          commonData,
          planningData,
          chatData,
          financeData,
        ]) => {
          if (!active) return;
          setMovements(movementData.movements);
          setNotes(noteData.notes);
          const coverNote = noteData.notes.find((note) => note.content.startsWith(COVER_MESSAGE_PREFIX));
          if (coverNote) {
            setCoverMessageId(coverNote.id);
            setCoverMessage(coverNote.content.slice(COVER_MESSAGE_PREFIX.length));
          }
          setAppTitle(settingData.title === "Casa Insieme" ? "Dafragu Home" : settingData.title);
          setCommonAccounts(settingData.commonAccounts);
          setUtilityBills(utilityData.bills);
          setCommonTransactions(commonData.transactions);
          setBudgets(planningData.budgets);
          setGoals(planningData.goals);
          setContributions(planningData.contributions);
          setDeadlines(planningData.deadlines);
          setChatMessages(chatData.messages);
          const plansById = new Map(financeData.plans.map((plan) => [plan.id, plan]));
          setDashboardPlanPayments(financeData.planPayments.flatMap((payment) => {
            const plan = plansById.get(payment.planId);
            if (!plan) return [];
            return [{
              id: -payment.id,
              planId: payment.planId,
              kind: "Spesa" as const,
              description: `PAC · ${plan.name}`,
              category: "PAC",
              amount: payment.amountCents / 100,
              person: plan.person,
              commonAccount: null,
              ticketAmount: 0,
              goalId: null,
              date: payment.date,
            }];
          }));
          setSyncState("online");
        },
      )
      .catch(() => {
        if (active) setSyncState("demo");
      });
    return () => {
      active = false;
    };
  }, [securityState]);

  useEffect(() => {
    if (securityState !== "unlocked") return;
    void fetch("/api/balance-adjustments")
      .then((r) => (r.ok ? r.json() : { adjustments: [] }))
      .then((data: { adjustments?: BalanceAdjustment[] }) =>
        setBalanceAdjustments(data.adjustments ?? []),
      );
  }, [securityState]);

  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setLastChatSeen(
          Number(window.localStorage.getItem("casa-chat-seen") ?? "0"),
        ),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem(
        "casa-current-view",
      ) as View | null;
      if (saved && navItems.some((item) => item.id === saved)) setView(saved);
      const savedPeriod = window.localStorage.getItem("casa-dashboard-period");
      if (savedPeriod) setDashboardPeriod(savedPeriod);
      const savedTheme = window.localStorage.getItem(
        "casa-theme",
      ) as Theme | null;
      if (
        savedTheme &&
        ["crema", "tortora", "grigio", "salvia", "oceano", "ametista", "tramonto", "byd"].includes(savedTheme)
      )
        setTheme(savedTheme);
      const savedGraphicStyle = window.localStorage.getItem("casa-graphic-style") as GraphicStyle | null;
      if (savedGraphicStyle === "base" || savedGraphicStyle === "ios" || savedGraphicStyle === "cartoon" || savedGraphicStyle === "eighties") setGraphicStyle(savedGraphicStyle);
      else if (savedGraphicStyle) window.localStorage.setItem("casa-graphic-style", "base");
      viewRestored.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (viewRestored.current)
      window.localStorage.setItem("casa-current-view", view);
  }, [view]);
  useEffect(() => {
    if (!viewRestored.current) return;
    window.localStorage.setItem("casa-dashboard-period", dashboardPeriod);
  }, [dashboardPeriod]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (viewRestored.current) window.localStorage.setItem("casa-theme", theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.graphicStyle = graphicStyle;
    if (viewRestored.current) window.localStorage.setItem("casa-graphic-style", graphicStyle);
  }, [graphicStyle]);
  useEffect(() => {
    if (view !== "chat" || !chatMessages.length) return;
    const timer = window.setTimeout(() => {
      const latest = chatMessages.at(-1)?.id ?? 0;
      setLastChatSeen(latest);
      window.localStorage.setItem("casa-chat-seen", String(latest));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [view, chatMessages]);

  const visibleMovements = useMemo(
    () =>
      filter === "Tutti"
        ? movements
        : movements.filter((movement) => movement.person === filter),
    [filter, movements],
  );
  const accountedVisibleMovements = useMemo(
    () => visibleMovements.filter((movement) => movement.date <= localDateKey()),
    [visibleMovements],
  );
  const reportableVisibleMovements = useMemo(
    () => accountedVisibleMovements.filter(isEconomicMovement),
    [accountedVisibleMovements],
  );
  const accountedPlanPayments = useMemo(
    () => dashboardPlanPayments.filter((payment) => payment.date <= localDateKey()),
    [dashboardPlanPayments],
  );
  const visiblePlanPayments = useMemo(
    () => filter === "Tutti"
      ? accountedPlanPayments
      : accountedPlanPayments.filter((payment) => payment.person === filter),
    [accountedPlanPayments, filter],
  );
  const accountedCommonTransactions = useMemo(
    () => commonTransactions.filter((item) => item.date <= localDateKey()),
    [commonTransactions],
  );
  const accountedContributions = useMemo(
    () => contributions.filter((item) => item.date <= localDateKey()),
    [contributions],
  );
  const visibleUtilityBills = useMemo(
    () =>
      filter === "Tutti"
        ? utilityBills
        : utilityBills.filter((bill) =>
            filter === "Comune"
              ? commonAccounts.includes(bill.wallet)
              : bill.wallet === filter,
          ),
    [filter, utilityBills, commonAccounts],
  );
  const accountedUtilityBills = useMemo(
    () => visibleUtilityBills.filter((item) => item.date <= localDateKey()),
    [visibleUtilityBills],
  );
  const movementMonths = useMemo(
    () =>
      Array.from(
        new Set([
          new Date().toISOString().slice(0, 7),
          ...visibleMovements.map((movement) => movement.date.slice(0, 7)),
          ...visiblePlanPayments.map((payment) => payment.date.slice(0, 7)),
        ]),
      )
        .sort()
        .reverse(),
    [visibleMovements],
  );
  const movementPeriodItems = useMemo(
    () =>
      movementPeriod === "all"
        ? visibleMovements
        : visibleMovements.filter((movement) =>
            movement.date.startsWith(movementPeriod),
          ),
    [movementPeriod, visibleMovements],
  );
  const dashboardMovements = useMemo(
    () =>
      dashboardPeriod === "all"
        ? [...reportableVisibleMovements, ...visiblePlanPayments]
        : [...reportableVisibleMovements, ...visiblePlanPayments].filter((movement) =>
            movement.date.startsWith(dashboardPeriod),
          ),
    [reportableVisibleMovements, visiblePlanPayments, dashboardPeriod],
  );
  const income = dashboardMovements
    .filter((movement) => movement.kind === "Entrata")
    .reduce((sum, movement) => sum + movement.amount, 0);
  const expenses = dashboardMovements
    .filter((movement) => movement.kind === "Spesa")
    .reduce((sum, movement) => sum + movement.amount, 0);
  const savings = income - expenses;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const budget = budgets
    .filter(
      (item) =>
        dashboardPeriod === "all" || item.month.startsWith(dashboardPeriod),
    )
    .reduce((sum, item) => sum + item.limit, 0);
  const dashboardMonths = Array.from(
    new Set([
      ...movements.map((item) => item.date.slice(0, 7)),
      ...budgets.map((item) => item.month),
      currentMonth,
    ]),
  )
    .sort()
    .reverse();
  const dashboardYears = Array.from(
    new Set(dashboardMonths.map((item) => item.slice(0, 4))),
  )
    .sort()
    .reverse();
  const dashboardPeriodLabel =
    dashboardPeriod === "all"
      ? "Tutto lo storico"
      : dashboardPeriod.length === 4
        ? `Anno ${dashboardPeriod}`
        : new Intl.DateTimeFormat("it-IT", {
            month: "long",
            year: "numeric",
          }).format(new Date(`${dashboardPeriod}-01T12:00:00`));
  const deadlineAlerts = deadlines.filter((item) => {
    if (item.completed || (filter !== "Tutti" && item.person !== filter))
      return false;
    const days = Math.ceil(
      (new Date(`${item.date}T12:00:00`).getTime() -
        new Date().setHours(0, 0, 0, 0)) /
        86400000,
    );
    return days >= 0 && days <= item.reminderDays;
  });
  const unreadChat = Math.max(0, (chatMessages.at(-1)?.id ?? 0) - lastChatSeen);
  const monthLabel = new Intl.DateTimeFormat("it-IT", {
    month: "long",
    year: "numeric",
  }).format(new Date());

  async function addMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selectedCategory = String(form.get("category"));
    const customCategory = String(form.get("customCategory") ?? "").trim();
    const movement: Movement = {
      id: Date.now(),
      kind: form.get("kind") as Kind,
      description: String(form.get("description")),
      category:
        selectedCategory === "Altro" && customCategory
          ? customCategory
          : selectedCategory,
      amount: Number(form.get("amount")),
      person: form.get("person") as Person,
      commonAccount: (String(form.get("commonAccount") ?? "") || undefined) as
        | CommonAccount
        | undefined,
      ticketAmount: Number(form.get("ticketAmount") ?? 0),
      goalId: Number(form.get("goalId")) || null,
      date: String(form.get("date")),
    };
    setSyncState("saving");
    try {
      const response = await fetch("/api/movements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...movement,
          automaticMonthly: form.get("automaticMonthly") === "on",
          monthlyDay: Number(
            form.get("monthlyDay") || movement.date.slice(8, 10),
          ),
          endDate: String(form.get("endDate") || "") || null,
          author: String(form.get("author") || "Davide"),
        }),
      });
      if (!response.ok) throw new Error("Salvataggio non riuscito");
      const data = (await response.json()) as { movement: Movement };
      setMovements((current) => [data.movement, ...current]);
      if (data.movement.commonAccount || (data.movement.ticketAmount ?? 0) > 0) {
        const commonResponse = await fetch("/api/common-accounts");
        if (commonResponse.ok)
          setCommonTransactions(
            (
              (await commonResponse.json()) as {
                transactions: CommonTransaction[];
              }
            ).transactions,
          );
      }
      setSyncState("online");
      setModalOpen(false);
    } catch {
      setMovements((current) => [movement, ...current]);
      setSyncState("error");
      setModalOpen(false);
    }
  }

  async function deleteMovement() {
    if (!deletingMovement) return;
    setSyncState("saving");
    try {
      const response = await fetch(`/api/movements?id=${deletingMovement.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Eliminazione non riuscita");
      setMovements((current) =>
        current.filter((movement) => movement.id !== deletingMovement.id),
      );
      setUtilityBills((current) =>
        current.filter((bill) => bill.movementId !== deletingMovement.id),
      );
      setCommonTransactions((current) =>
        current.filter((item) => item.sourceMovementId !== deletingMovement.id),
      );
      setSyncState("online");
      setDeletingMovement(null);
    } catch {
      setSyncState("error");
    }
  }

  async function updateMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingMovement) return;
    const form = new FormData(event.currentTarget);
    const selectedCategory = String(form.get("category"));
    const customCategory = String(form.get("customCategory") ?? "").trim();
    const payload = {
      id: editingMovement.id,
      kind: String(form.get("kind")),
      description: String(form.get("description")),
      category:
        selectedCategory === "Altro" && customCategory
          ? customCategory
          : selectedCategory,
      amount: Number(form.get("amount")),
      person: String(form.get("person")),
      commonAccount: String(form.get("commonAccount") ?? "") || null,
      ticketAmount: Number(form.get("ticketAmount") ?? 0),
      goalId: Number(form.get("goalId")) || null,
      date: String(form.get("date")),
    };
    const response = await fetch("/api/movements", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as { movement?: Movement };
    if (!response.ok || !data.movement) {
      setSyncState("error");
      return;
    }
    setMovements((items) =>
      items.map((item) =>
        item.id === editingMovement.id ? data.movement! : item,
      ),
    );
    setEditingMovement(null);
    window.location.reload();
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const renamedAccounts = commonAccounts.map((_, index) =>
      String(form.get(`account${index}`) ?? "").trim(),
    );
    const photo = form.get("photo");
    setSyncState("saving");
    try {
      const settingResponse = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, commonAccounts: renamedAccounts }),
      });
      if (!settingResponse.ok) throw new Error("Nome non salvato");
      if (photo instanceof File && photo.size) {
        const photoResponse = await fetch("/api/photo", {
          method: "POST",
          headers: { "content-type": photo.type },
          body: photo,
        });
        if (!photoResponse.ok) throw new Error("Foto non salvata");
        setPhotoUrl(`/api/photo?v=${Date.now()}`);
      }
      setAppTitle(title);
      setCommonAccounts(renamedAccounts);
      setSettingsOpen(false);
      setSyncState("online");
    } catch {
      setSyncState("error");
    }
  }

  async function alignBalance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/balance-adjustments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        account: form.get("account"),
        actualBalance: Number(form.get("actualBalance")),
        date: form.get("date"),
        note: form.get("note"),
        author: form.get("author"),
        recoveryCode: form.get("recoveryCode"),
      }),
    });
    const data = (await response.json()) as {
      adjustment?: BalanceAdjustment;
      error?: string;
    };
    if (!response.ok || !data.adjustment) {
      setSecurityError(data.error ?? "Allineamento non riuscito");
      return;
    }
    setBalanceAdjustments((items) => [data.adjustment!, ...items]);
    setBalanceModalOpen(false);
    setSecurityError("");
  }

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      date: String(form.get("date")),
      content: String(form.get("content")),
      author: String(form.get("author")),
    };
    setSyncState("saving");
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Nota non salvata");
      const data = (await response.json()) as { note: Note };
      setNotes((current) =>
        [data.note, ...current].sort((a, b) => b.date.localeCompare(a.date)),
      );
      setNoteModalOpen(false);
      setSyncState("online");
    } catch {
      setSyncState("error");
    }
  }

  async function saveCoverMessage(value: string) {
    const content = value.trim();
    if (!content && !coverMessageId) return;
    const payload = {
      date: localDateKey(),
      content: `${COVER_MESSAGE_PREFIX}${content}`,
      author: "Davide",
    };
    setSyncState("saving");
    try {
      const response = await fetch("/api/notes", {
        method: coverMessageId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(coverMessageId ? { ...payload, id: coverMessageId } : payload),
      });
      if (!response.ok) throw new Error("Box non salvato");
      const data = (await response.json()) as { note: Note };
      setCoverMessageId(data.note.id);
      setNotes((current) => [data.note, ...current.filter((note) => note.id !== data.note.id)]);
      setSyncState("online");
    } catch {
      setSyncState("error");
    }
  }

  async function deleteNote(note: Note) {
    if (!window.confirm("Eliminare questa nota dall’archivio condiviso?"))
      return;
    setSyncState("saving");
    try {
      const response = await fetch(`/api/notes?id=${note.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Nota non eliminata");
      setNotes((current) => current.filter((item) => item.id !== note.id));
      setSyncState("online");
    } catch {
      setSyncState("error");
    }
  }

  async function updateNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingNote) return;
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/notes", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: editingNote.id,
        date: String(form.get("date")),
        content: String(form.get("content")),
        author: String(form.get("author")),
      }),
    });
    const data = (await response.json()) as { note?: Note };
    if (!response.ok || !data.note) {
      setSyncState("error");
      return;
    }
    setNotes((items) =>
      items
        .map((item) => (item.id === editingNote.id ? data.note! : item))
        .sort((a, b) => b.date.localeCompare(a.date)),
    );
    setEditingNote(null);
  }

  async function addUtilityBill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selectedProvider = String(form.get("provider"));
    const customProvider = String(form.get("customProvider") ?? "").trim();
    const payload = {
      provider:
        selectedProvider === "Altro" ? customProvider : selectedProvider,
      service: String(form.get("service")),
      amount: Number(form.get("amount")),
      wallet: String(form.get("wallet")),
      date: String(form.get("date")),
      dueDate: String(form.get("dueDate") ?? "") || null,
      recurring: form.get("recurring") === "on",
      billingFrequency: String(form.get("billingFrequency") ?? "monthly"),
      periodStart: String(form.get("periodStart") ?? "") || null,
      periodEnd: String(form.get("periodEnd") ?? "") || null,
      consumption: form.get("consumption") ? Number(form.get("consumption")) : null,
      consumptionUnit: String(form.get("consumptionUnit") ?? "") || null,
      meterReading: form.get("meterReading") ? Number(form.get("meterReading")) : null,
      invoiceNumber: String(form.get("invoiceNumber") ?? "").trim() || null,
      notes: String(form.get("notes") ?? "").trim() || null,
    };
    setSyncState("saving");
    try {
      const response = await fetch("/api/utilities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Fattura non salvata");
      const data = (await response.json()) as {
        bill: UtilityBill;
        movement: Movement;
      };
      setUtilityBills((current) => [data.bill, ...current]);
      setMovements((current) => [data.movement, ...current]);
      setUtilityModalOpen(false);
      setSyncState("online");
    } catch {
      setSyncState("error");
    }
  }

  async function updateUtilityBill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingUtility) return;
    const form = new FormData(event.currentTarget);
    const selectedProvider = String(form.get("provider"));
    const customProvider = String(form.get("customProvider") ?? "").trim();
    const payload = {
      id: editingUtility.id,
      provider:
        selectedProvider === "Altro" ? customProvider : selectedProvider,
      service: String(form.get("service")),
      amount: Number(form.get("amount")),
      wallet: String(form.get("wallet")),
      date: String(form.get("date")),
      dueDate: String(form.get("dueDate") ?? "") || null,
      recurring: form.get("recurring") === "on",
      billingFrequency: String(form.get("billingFrequency") ?? "monthly"),
      periodStart: String(form.get("periodStart") ?? "") || null,
      periodEnd: String(form.get("periodEnd") ?? "") || null,
      consumption: form.get("consumption") ? Number(form.get("consumption")) : null,
      consumptionUnit: String(form.get("consumptionUnit") ?? "") || null,
      meterReading: form.get("meterReading") ? Number(form.get("meterReading")) : null,
      invoiceNumber: String(form.get("invoiceNumber") ?? "").trim() || null,
      notes: String(form.get("notes") ?? "").trim() || null,
    };
    const response = await fetch("/api/utilities", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as {
      bill?: UtilityBill;
      movement?: Movement;
    };
    if (!response.ok || !data.bill || !data.movement) {
      setSyncState("error");
      return;
    }
    setUtilityBills((items) =>
      items.map((item) => (item.id === editingUtility.id ? data.bill! : item)),
    );
    setMovements((items) =>
      items.map((item) =>
        item.id === data.movement!.id ? data.movement! : item,
      ),
    );
    setEditingUtility(null);
    window.location.reload();
  }

  async function toggleSubscriptionStatus(bill: UtilityBill) {
    setSyncState("saving");
    const response = await fetch("/api/utilities", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...bill, recurring: !bill.recurring }),
    });
    const data = (await response.json()) as { bill?: UtilityBill; movement?: Movement };
    if (!response.ok || !data.bill) {
      setSyncState("error");
      return;
    }
    setUtilityBills((items) => items.map((item) => item.id === bill.id ? data.bill! : item));
    if (data.movement) setMovements((items) => items.map((item) => item.id === data.movement!.id ? data.movement! : item));
    setSyncState("online");
  }

  async function submitSecurity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSecurityError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    const recoveryCode = String(form.get("recoveryCode") ?? "");
    if (
      (securityState === "setup" || securityState === "recover") &&
      password !== confirmation
    ) {
      setSecurityError("Le due password non coincidono.");
      return;
    }
    try {
      const response = await fetch("/api/security", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode:
            securityState === "setup"
              ? "setup"
              : securityState === "recover"
                ? "recover"
                : "unlock",
          password,
          recoveryCode,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Accesso non riuscito");
      setSecurityState("unlocked");
      setSyncState("loading");
    } catch (error) {
      setSecurityError(
        error instanceof Error ? error.message : "Accesso non riuscito",
      );
    }
  }

  async function lockApp() {
    await fetch("/api/security", { method: "DELETE" });
    setMovements([]);
    setNotes([]);
    setUtilityBills([]);
    setSecurityState("locked");
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPasswordMessage("");
    const form = new FormData(formElement);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (newPassword !== confirmation) {
      setPasswordMessage("Le nuove password non coincidono.");
      return;
    }
    try {
      const response = await fetch("/api/security", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error ?? "Password non modificata");
      formElement.reset();
      setPasswordMessage("Password modificata.");
    } catch (error) {
      setPasswordMessage(
        error instanceof Error ? error.message : "Password non modificata",
      );
    }
  }

  async function setRecoveryCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const code = String(form.get("recoveryCode") ?? "");
    const confirmation = String(form.get("recoveryConfirmation") ?? "");
    if (code !== confirmation) {
      setPasswordMessage("I codici non coincidono.");
      return;
    }
    try {
      const response = await fetch("/api/security", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "recovery", recoveryCode: code }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Codice non salvato");
      formElement.reset();
      setPasswordMessage("Codice di recupero salvato.");
    } catch (error) {
      setPasswordMessage(
        error instanceof Error ? error.message : "Codice non salvato",
      );
    }
  }

  async function deleteUtilityBill(bill: UtilityBill) {
    if (
      !window.confirm(
        "Eliminare questa fattura? Verrà rimossa anche dalle spese.",
      )
    )
      return;
    setSyncState("saving");
    try {
      const response = await fetch(`/api/utilities?id=${bill.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Fattura non eliminata");
      setUtilityBills((current) =>
        current.filter((item) => item.id !== bill.id),
      );
      setMovements((current) =>
        current.filter((item) => item.id !== bill.movementId),
      );
      setCommonTransactions((current) =>
        current.filter((item) => item.sourceMovementId !== bill.movementId),
      );
      setSyncState("online");
    } catch {
      setSyncState("error");
    }
  }

  async function addCommonTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selectedCategory = String(form.get("category"));
    const customCategory = String(form.get("customCategory") ?? "").trim();
    const payload = {
      account: String(form.get("account")),
      kind: String(form.get("kind")),
      description: String(form.get("description")),
      category:
        selectedCategory === "Altro" && customCategory
          ? customCategory
          : selectedCategory,
      amount: Number(form.get("amount")),
      date: String(form.get("date")),
    };
    try {
      const response = await fetch("/api/common-accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        transaction?: CommonTransaction;
        movement?: Movement;
        error?: string;
      };
      if (!response.ok || !data.transaction || !data.movement)
        throw new Error(data.error ?? "Registrazione non salvata");
      setCommonTransactions((current) => [data.transaction!, ...current]);
      setMovements((current) => [data.movement!, ...current]);
      setCommonModalOpen(false);
      setSyncState("online");
    } catch {
      setSyncState("error");
    }
  }

  async function deleteCommonTransaction(transaction: CommonTransaction) {
    if (!window.confirm("Eliminare questa registrazione del conto?")) return;
    try {
      const response = await fetch(
        `/api/common-accounts?id=${transaction.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error();
      setCommonTransactions((current) =>
        current.filter((item) => item.id !== transaction.id),
      );
      if (transaction.sourceMovementId)
        setMovements((current) =>
          current.filter((item) => item.id !== transaction.sourceMovementId),
        );
    } catch {
      setSyncState("error");
    }
  }

  async function updateCommonTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCommon) return;
    const form = new FormData(event.currentTarget);
    const selectedCategory = String(form.get("category"));
    const customCategory = String(form.get("customCategory") ?? "").trim();
    const payload = {
      id: editingCommon.id,
      account: String(form.get("account")),
      kind: String(form.get("kind")),
      description: String(form.get("description")),
      category:
        selectedCategory === "Altro" && customCategory
          ? customCategory
          : selectedCategory,
      amount: Number(form.get("amount")),
      date: String(form.get("date")),
    };
    const response = await fetch("/api/common-accounts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as {
      transaction?: CommonTransaction;
      movement?: Movement | null;
    };
    if (!response.ok || !data.transaction) {
      setSyncState("error");
      return;
    }
    setCommonTransactions((items) =>
      items.map((item) =>
        item.id === editingCommon.id ? data.transaction! : item,
      ),
    );
    if (data.movement)
      setMovements((items) =>
        items.map((item) =>
          item.id === data.movement!.id ? data.movement! : item,
        ),
      );
    setEditingCommon(null);
  }

  async function createCommonAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const logo = form.get("logo");
    if (
      !name ||
      commonAccounts.some((item) => item.toLowerCase() === name.toLowerCase())
    )
      return;
    const updated = [...commonAccounts, name];
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: appTitle, commonAccounts: updated }),
    });
    if (!response.ok) {
      setSyncState("error");
      return;
    }
    if (logo instanceof File && logo.size)
      await fetch(`/api/account-logo?account=${encodeURIComponent(name)}`, {
        method: "POST",
        headers: { "content-type": logo.type },
        body: logo,
      });
    setCommonAccounts(updated);
    setNewAccountOpen(false);
  }

  async function deleteCommonAccount(account: CommonAccount) {
    if (!window.confirm(`Vuoi eliminare il conto “${account}”?`)) return;
    if (!window.confirm(`Confermi definitivamente l’eliminazione di “${account}”? I movimenti storici resteranno archiviati, ma il conto non sarà più mostrato.`)) return;
    const response = await fetch(`/api/settings?account=${encodeURIComponent(account)}`, { method: "DELETE" });
    const result = (await response.json()) as { commonAccounts?: CommonAccount[]; error?: string };
    if (!response.ok || !result.commonAccounts) {
      window.alert(result.error ?? "Conto non eliminato");
      return;
    }
    setCommonAccounts(result.commonAccounts);
    setSelectedCommonAccount("Tutti");
  }

  async function updateGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingGoal) return;
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/planning", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "goal",
        id: editingGoal.id,
        name: String(form.get("name")),
        target: Number(form.get("target")),
      }),
    });
    const data = (await response.json()) as { item?: Goal };
    if (!response.ok || !data.item) {
      setSyncState("error");
      return;
    }
    const photo = form.get("photo");
    if (photo instanceof File && photo.size)
      await fetch(`/api/goal-photo?id=${editingGoal.id}`, {
        method: "POST",
        headers: { "content-type": photo.type },
        body: photo,
      });
    setGoals((items) =>
      items.map((item) =>
        item.id === editingGoal.id
          ? {
              ...data.item!,
              photoKey:
                photo instanceof File && photo.size
                  ? `family/goals/${editingGoal.id}`
                  : item.photoKey,
            }
          : item,
      ),
    );
    setEditingGoal(null);
  }

  async function updateBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingBudget) return;
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/planning", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "budget",
        id: editingBudget.id,
        month: String(form.get("month")),
        category: String(form.get("category")),
        limit: Number(form.get("limit")),
      }),
    });
    const data = (await response.json()) as { item?: Budget };
    if (!response.ok || !data.item) {
      setSyncState("error");
      return;
    }
    setBudgets((items) =>
      items.map((item) => (item.id === editingBudget.id ? data.item! : item)),
    );
    setEditingBudget(null);
  }

  async function createPlanning(
    action: "budget" | "goal" | "contribution" | "deadline",
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const goalPhoto = form.get("photo");
    const payload = Object.fromEntries(form.entries()) as Record<
      string,
      string
    >;
    try {
      const response = await fetch("/api/planning", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...payload,
          action,
          goalId: Number(payload.goalId),
          target: Number(payload.target),
          amount: Number(payload.amount),
          limit: Number(payload.limit),
          reminderDays: Number(payload.reminderDays),
        }),
      });
      const data = (await response.json()) as {
        item?: Budget | Goal | GoalContribution | Deadline;
        error?: string;
      };
      if (!response.ok || !data.item)
        throw new Error(data.error ?? "Salvataggio non riuscito");
      if (action === "budget")
        setBudgets((current) => [data.item as Budget, ...current]);
      if (action === "goal")
        setGoals((current) => [data.item as Goal, ...current]);
      if (action === "goal" && goalPhoto instanceof File && goalPhoto.size) {
        const goal = data.item as Goal;
        await fetch(`/api/goal-photo?id=${goal.id}`, {
          method: "POST",
          headers: { "content-type": goalPhoto.type },
          body: goalPhoto,
        });
        setGoals((current) =>
          current.map((item) =>
            item.id === goal.id
              ? { ...item, photoKey: `family/goals/${goal.id}` }
              : item,
          ),
        );
      }
      if (action === "contribution")
        setContributions((current) => [
          data.item as GoalContribution,
          ...current,
        ]);
      if (action === "deadline")
        setDeadlines((current) =>
          [...current, data.item as Deadline].sort((a, b) =>
            a.date.localeCompare(b.date),
          ),
        );
      setBudgetModalOpen(false);
      setGoalModalOpen(false);
      setContributionGoal(null);
      setDeadlineModalOpen(false);
    } catch {
      setSyncState("error");
    }
  }

  async function deletePlanning(
    type: "budget" | "goal" | "contribution" | "deadline",
    id: number,
  ) {
    if (!window.confirm("Eliminare questo elemento?")) return;
    try {
      const response = await fetch(`/api/planning?type=${type}&id=${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error();
      if (type === "budget")
        setBudgets((current) => current.filter((item) => item.id !== id));
      if (type === "goal") {
        setGoals((current) => current.filter((item) => item.id !== id));
        setContributions((current) =>
          current.filter((item) => item.goalId !== id),
        );
      }
      if (type === "contribution")
        setContributions((current) => current.filter((item) => item.id !== id));
      if (type === "deadline")
        setDeadlines((current) => current.filter((item) => item.id !== id));
    } catch {
      setSyncState("error");
    }
  }

  async function setDeadlineCompleted(deadline: Deadline, completed: boolean) {
    const response = await fetch("/api/planning", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "deadline-completed",
        id: deadline.id,
        completed,
      }),
    });
    const data = (await response.json()) as { item?: Deadline };
    if (!response.ok || !data.item) {
      setSyncState("error");
      return;
    }
    setDeadlines((items) =>
      items.map((item) => (item.id === deadline.id ? data.item! : item)),
    );
  }

  async function updateDeadline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingDeadline) return;
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/planning", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "deadline",
        id: editingDeadline.id,
        title: String(form.get("title")),
        date: String(form.get("date")),
        reminderDays: Number(form.get("reminderDays")),
        note: String(form.get("note") ?? ""),
        recurrence: String(form.get("recurrence")),
      }),
    });
    const data = (await response.json()) as { item?: Deadline };
    if (!response.ok || !data.item) {
      setSyncState("error");
      return;
    }
    setDeadlines((items) =>
      items
        .map((item) => (item.id === editingDeadline.id ? data.item! : item))
        .sort((a, b) => a.date.localeCompare(b.date)),
    );
    setEditingDeadline(null);
  }

  async function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const content = String(
      new FormData(formElement).get("content") ?? "",
    ).trim();
    if (!content) return;
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ author: chatAuthor, content }),
    });
    if (!response.ok) {
      setSyncState("error");
      return;
    }
    const data = (await response.json()) as { message: ChatMessage };
    setChatMessages((items) => [...items, data.message]);
    formElement.reset();
  }

  async function clearChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const mode = String(form.get("mode"));
    const beforeDate = String(form.get("beforeDate") ?? "");
    const recoveryCode = String(form.get("recoveryCode") ?? "");
    if (
      !window.confirm(
        mode === "all"
          ? "Seconda conferma: eliminare definitivamente tutti i messaggi?"
          : `Seconda conferma: eliminare i messaggi precedenti al ${beforeDate.split("-").reverse().join("/")}?`,
      )
    )
      return;
    const response = await fetch("/api/chat", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, beforeDate, recoveryCode }),
    });
    const data = (await response.json()) as {
      messages?: ChatMessage[];
      error?: string;
    };
    if (!response.ok) {
      window.alert(data.error ?? "Chat non svuotata");
      return;
    }
    setChatMessages(data.messages ?? []);
    setChatClearOpen(false);
    window.localStorage.setItem(
      "casa-chat-seen",
      String(data.messages?.at(-1)?.id ?? 0),
    );
  }

  function exportChat() {
    const rows = [
      ["Data e ora", "Autore", "Messaggio"],
      ...chatMessages.map((message) => [
        new Intl.DateTimeFormat("it-IT", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(message.createdAt)),
        message.author,
        message.content,
      ]),
    ];
    const csv =
      "\ufeff" +
      rows
        .map((row) =>
          row
            .map((value) => `"${String(value).replaceAll('"', '""')}"`)
            .join(";"),
        )
        .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    link.download = `chat-casa-insieme-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  if (securityState !== "unlocked") {
    return (
      <main className="security-screen">
        <section className="security-card">
          <div className="security-mark">⌂</div>
          <p className="panel-kicker">Area privata</p>
          <h1>
            {securityState === "setup"
              ? "Crea la password"
              : securityState === "recover"
                ? "Recupera l’accesso"
                : securityState === "checking"
                  ? "Controllo sicurezza…"
                  : "Inserisci la password"}
          </h1>
          {securityState === "checking" ? (
            <p>Sto verificando l’accesso alla dashboard.</p>
          ) : (
            <>
              <p>
                {securityState === "setup"
                  ? "Questa sarà la password interna condivisa fra gli account autorizzati. Non scriverla in chat."
                  : securityState === "recover"
                    ? "Inserisci il codice di recupero scelto da voi e crea una nuova password."
                    : "La dashboard è protetta da una seconda password oltre all’accesso ChatGPT."}
              </p>
              <form onSubmit={submitSecurity}>
                {securityState === "recover" && (
                  <label>
                    Codice di recupero
                    <input
                      name="recoveryCode"
                      type="password"
                      minLength={6}
                      required
                      autoFocus
                    />
                  </label>
                )}
                <label>
                  {securityState === "recover" ? "Nuova password" : "Password"}
                  <input
                    name="password"
                    type="password"
                    minLength={6}
                    autoComplete={
                      securityState === "locked"
                        ? "current-password"
                        : "new-password"
                    }
                    required
                    autoFocus={securityState !== "recover"}
                  />
                </label>
                {(securityState === "setup" || securityState === "recover") && (
                  <label>
                    Ripeti password
                    <input
                      name="confirmation"
                      type="password"
                      minLength={6}
                      autoComplete="new-password"
                      required
                    />
                  </label>
                )}
                {securityError && (
                  <div className="security-error">{securityError}</div>
                )}
                <button className="primary-btn full" type="submit">
                  {securityState === "setup"
                    ? "Crea password e accedi"
                    : securityState === "recover"
                      ? "Reimposta e accedi"
                      : "Accedi"}
                </button>
              </form>
              {securityState === "locked" && (
                <button
                  className="text-btn forgot-password"
                  type="button"
                  onClick={() => {
                    setSecurityError("");
                    setSecurityState("recover");
                  }}
                >
                  Password dimenticata?
                </button>
              )}
              {securityState === "recover" && (
                <button
                  className="text-btn forgot-password"
                  type="button"
                  onClick={() => setSecurityState("locked")}
                >
                  Torna all’accesso
                </button>
              )}
            </>
          )}
          <small>
            Il link resta inoltre limitato agli account ChatGPT autorizzati.
          </small>
        </section>
      </main>
    );
  }

  const coverMonth = localDateKey().slice(0, 7);
  const coverAccountsTotal = commonAccounts.reduce(
    (sum, account) => sum + accountBalance(account, commonTransactions, balanceAdjustments),
    0,
  );
  const coverUtilitySpend = utilityBills
    .filter((bill) => bill.date.startsWith(coverMonth))
    .reduce((sum, bill) => sum + bill.amount, 0);
  const coverSubscriptions = utilityBills.filter((bill) => bill.recurring).length;
  const coverAnnualSubscriptionSpend = utilityBills
    .filter((bill) => bill.recurring)
    .reduce(
      (sum, bill) =>
        sum + bill.amount * (bill.billingFrequency === "annual" ? 1 : 12),
      0,
    );

  if (showCover) {
    return (
      <main className="dafragu-cover">
        <div className="cover-orbit cover-orbit-one" /><div className="cover-orbit cover-orbit-two" />
        <section className="cover-card">
          <div className="cover-mark">⌂<span>♥</span></div>
          <p className="cover-kicker">LA VOSTRA CASA, I VOSTRI PROGETTI</p>
          <h1>Dafragu Home</h1>
          <p>Tutto sotto controllo, insieme.</p>
          <button className="cover-enter" onClick={() => setShowCover(false)}>Entra nella dashboard <span>→</span></button>
          <div className="cover-status"><i /> Dati sincronizzati e protetti</div>
        </section>
        <div className="cover-glance" aria-label="Riepilogo della dashboard">
          <article className="cover-insight cyan"><span className="cover-insight-icon">◉</span><div><b>Conti</b><small>Saldo totale</small><strong className={balancesVisible ? (coverAccountsTotal >= 0 ? "positive-text" : "negative-text") : "balance-masked"}>{balancesVisible ? euro.format(coverAccountsTotal) : "••••••"}</strong><button className="cover-balance-eye" onClick={() => setBalancesVisible((visible) => !visible)} aria-label={balancesVisible ? "Nascondi saldo conti" : "Mostra saldo conti"}>{balancesVisible ? "◉ Nascondi saldo" : "◌ Mostra saldo"}</button><em>Conti in comune</em><div className="cover-line cyan-line" /></div></article>
          <article className="cover-insight green"><span className="cover-insight-icon">ϟ</span><div><b>Utenze</b><small>Spesa di questo mese</small><strong>{euro.format(coverUtilitySpend)}</strong><em>Fatture registrate</em><div className="cover-bars"><i /><i /><i /><i /><i /><i /></div></div></article>
          <article className="cover-insight purple"><span className="cover-insight-icon">▣</span><div><b>Abbonamenti</b><small>{coverSubscriptions} servizi attivi</small><strong>{euro.format(coverAnnualSubscriptionSpend)}</strong><em>Spesa annua stimata</em><div className="cover-dots"><i /><i /><i /><i /><i /><i /></div></div></article>
          <article className="cover-insight mint"><span className="cover-insight-icon">✎</span><div><b>Box cosine</b><small>Uno spazio libero</small><input className="cover-editable-note" value={coverMessage} onChange={(event) => setCoverMessage(event.target.value)} onBlur={(event) => void saveCoverMessage(event.currentTarget.value)} maxLength={120} placeholder="Scrivi qui…" aria-label="Box cosine" /><em>Salvato nelle note condivise</em><div className="cover-progress"><i /></div></div></article>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      {mobileMenuOpen && (
        <button
          className="mobile-menu-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Chiudi menu"
        />
      )}
      <aside className={`sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}>
        <div className="brand">
          <button
            className="brand-home"
            onClick={() => setView("dashboard")}
            aria-label="Vai alla dashboard"
          >
            <span className="brand-photo">
              <img
                src={photoUrl}
                alt=""
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
              <b>⌂</b>
            </span>
            <span>{appTitle}</span>
          </button>
          <button
            className="brand-edit"
            onClick={() => setSettingsOpen(true)}
            aria-label="Personalizza nome e foto"
            title="Personalizza"
          >
            ✎
          </button>
        </div>

        <nav aria-label="Navigazione principale">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              onClick={() => {
                setView(item.id);
                setMobileMenuOpen(false);
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
              {item.id === "chat" && unreadChat > 0 && (
                <b className="chat-badge">
                  {unreadChat > 99 ? "99+" : unreadChat}
                </b>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-note">
          <div className="tiny-home">♡</div>
          <strong>Il nostro progetto</strong>
          <span>Un passo alla volta, insieme.</span>
        </div>
        <div className="mobile-drawer-actions">
          <button
            onClick={() => {
              window.location.reload();
            }}
          >
            ↻ Aggiorna dati
          </button>
          <button
            onClick={() => {
              setSettingsOpen(true);
              setMobileMenuOpen(false);
            }}
          >
            ⚙ Personalizza
          </button>
          <button onClick={lockApp}>🔒 Blocca</button>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">{monthLabel}</p>
            <h1>
              {view === "dashboard"
                ? "Ciao Davide e Francesca"
                : navItems.find((item) => item.id === view)?.label}
            </h1>
            <div className={`sync-status ${syncState}`}>
              <span />
              {syncState === "online" && "Dati condivisi aggiornati"}
              {syncState === "loading" && "Collegamento ai dati…"}
              {syncState === "saving" && "Salvataggio…"}
              {syncState === "demo" && "Modalità dimostrativa"}
              {syncState === "error" && "Salvato solo su questo dispositivo"}
            </div>
          </div>
          <div className="top-actions">
            <button className="cover-return-btn" onClick={() => setShowCover(true)} title="Torna alla copertina">
              ← Copertina
            </button>
            <div className="graphic-switch" role="group" aria-label="Stile grafico">
              <button
                className={graphicStyle === "base" ? "selected" : ""}
                onClick={() => setGraphicStyle("base")}
                title="Grafica attuale"
              >
                Base
              </button>
              <button
                className={graphicStyle === "ios" ? "selected" : ""}
                onClick={() => setGraphicStyle("ios")}
                title="Grafica iOS con effetto neon"
              >
                iOS Neon
              </button>
              <button
                className={graphicStyle === "cartoon" ? "selected" : ""}
                onClick={() => setGraphicStyle("cartoon")}
                title="Grafica Cartoon colorata e giocosa"
              >
                Cartoon
              </button>
              <button
                className={graphicStyle === "eighties" ? "selected" : ""}
                onClick={() => setGraphicStyle("eighties")}
                title="Grafica anni Ottanta"
              >
                80s
              </button>
            </div>
            <label className="theme-picker" title="Colorazione della dashboard">
              🎨
              <select
                value={theme}
                onChange={(event) => setTheme(event.target.value as Theme)}
                aria-label="Scegli colorazione"
              >
                <option value="crema">Crema · Corallo</option>
                <option value="tortora">Tortora · Rame</option>
                <option value="grigio">Perla · Grafite</option>
                <option value="salvia">Salvia · Bosco</option>
                <option value="oceano">Oceano · Turchese</option>
                <option value="ametista">Ametista · Lilla</option>
                <option value="tramonto">Tramonto · Corallo</option>
                <option value="byd">Antracite · Verde</option>
              </select>
            </label>
            <div className="people-filter" aria-label="Filtra per persona">
              {(["Tutti", "Davide", "Francesca", "Comune"] as const).map(
                (person) => (
                  <button
                    key={person}
                    className={filter === person ? "selected" : ""}
                    onClick={() => setFilter(person)}
                    title={`Mostra: ${person}`}
                  >
                    {person}
                  </button>
                ),
              )}
            </div>
            <button
              className="lock-btn"
              onClick={lockApp}
              title="Blocca la dashboard"
            >
              🔒 Blocca
            </button>
            <button
              className="lock-btn"
              onClick={() => window.location.reload()}
              title="Aggiorna dati"
            >
              ↻ Aggiorna
            </button>
            <button className="primary-btn" onClick={() => setModalOpen(true)}>
              <span>＋</span> Aggiungi movimento
            </button>
          </div>
        </header>
        {backupReminder && (
          <aside className="backup-reminder" role="status">
            <span>💾</span>
            <div><strong>Promemoria backup mensile</strong><small>Salva una copia aggiornata dei dati della dashboard.</small></div>
            <div className="row-actions">
              <button className="secondary-btn" onClick={() => { setView("backup"); dismissBackupReminder(); }}>Vai al backup</button>
              {!backupNotifications && <button className="text-btn" onClick={enableBackupNotifications}>Attiva notifiche</button>}
              <button className="delete-btn" aria-label="Chiudi promemoria" onClick={dismissBackupReminder}>×</button>
            </div>
          </aside>
        )}

        {view === "dashboard" && (
          <div className="dashboard-view">
            <section
              className="dashboard-period-bar"
              aria-label="Periodo del riepilogo"
            >
              <div>
                <span>Periodo visualizzato</span>
                <strong>{dashboardPeriodLabel}</strong>
              </div>
              <select
                value={dashboardPeriod}
                onChange={(event) => setDashboardPeriod(event.target.value)}
                aria-label="Filtra riepilogo per mese o anno"
              >
                <option value="all">Tutto lo storico</option>
                {dashboardYears.map((year) => (
                  <option value={year} key={`year-${year}`}>
                    Anno {year}
                  </option>
                ))}
                {dashboardMonths.map((month) => (
                  <option value={month} key={month}>
                    {new Intl.DateTimeFormat("it-IT", {
                      month: "long",
                      year: "numeric",
                    }).format(new Date(`${month}-01T12:00:00`))}
                  </option>
                ))}
              </select>
            </section>
            <section className="kpi-grid" aria-label="Riepilogo economico">
              <Kpi
                icon="👛"
                tone="sage positive"
                label="Entrate"
                value={euro.format(income)}
                onClick={() => setKpiBreakdown("Entrate")}
                note={
                  dashboardMovements.length
                    ? `${dashboardMovements.filter((item) => item.kind === "Entrata").length} entrate nel periodo`
                    : "Nessuna entrata nel periodo"
                }
              />
              <Kpi
                icon="🛒"
                tone="peach negative"
                label="Spese"
                value={euro.format(expenses)}
                onClick={() => setKpiBreakdown("Spese")}
                note={
                  dashboardMovements.length
                    ? `${dashboardMovements.filter((item) => item.kind === "Spesa").length} spese nel periodo`
                    : "Nessuna spesa nel periodo"
                }
              />
              <Kpi
                icon="🐷"
                tone={savings >= 0 ? "sage positive" : "peach negative"}
                label="Risparmio"
                value={euro.format(savings)}
                note={
                  income
                    ? `${Math.round((savings / income) * 100)}% delle entrate`
                    : "Si calcolerà automaticamente"
                }
              />
              <Kpi
                icon="◔"
                tone="peach"
                label="Budget del periodo"
                value={budget ? euro.format(budget) : "Da impostare"}
                note={
                  budget
                    ? `Limiti di ${dashboardPeriodLabel.toLocaleLowerCase("it")}`
                    : "Nessun limite nel periodo"
                }
              />
            </section>

            {deadlineAlerts.length > 0 && (
              <section className="deadline-alerts">
                <strong>
                  ⏰ Scadenze vicine{filter !== "Tutti" ? ` · ${filter}` : ""}
                </strong>
                {deadlineAlerts.map((item) => (
                  <button key={item.id} onClick={() => setView("scadenze")}>
                    {item.title} ·{" "}
                    {shortDate.format(new Date(`${item.date}T12:00:00`))}
                  </button>
                ))}
              </section>
            )}

            <DashboardAdvice
              movements={visibleMovements}
              bills={visibleUtilityBills}
              budgets={budgets}
              transactions={commonTransactions}
              deadlines={deadlines}
              onNavigate={setView}
            />

            <section className="dashboard-grid">
              <article className="panel chart-panel">
                <div className="panel-heading">
                  <div>
                    <p className="panel-kicker">Ultimi 6 mesi</p>
                    <h2>Andamento entrate e uscite</h2>
                  </div>
                </div>
                <ExpenseChart movements={reportableVisibleMovements} />
              </article>

              <article className="panel latest-panel">
                <div className="panel-heading">
                  <div>
                    <p className="panel-kicker">Aggiornato ora</p>
                    <h2>Ultimi movimenti</h2>
                  </div>
                  <button
                    className="text-btn"
                    onClick={() => setView("movimenti")}
                  >
                    Vedi tutti →
                  </button>
                </div>
                <MovementList
                  movements={visibleMovements.slice(0, 4)}
                  onDelete={setDeletingMovement}
                  onEdit={setEditingMovement}
                />
              </article>
            </section>
          </div>
        )}

        {view === "movimenti" && (
          <section className="panel page-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">
                  {movementPeriodItems.length} registrazioni nel periodo
                </p>
                <h2>Registro familiare</h2>
              </div>
              <div className="movement-period-actions">
                <label className="month-picker">
                  Mese visualizzato
                  <select
                    value={movementPeriod}
                    onChange={(event) => setMovementPeriod(event.target.value)}
                  >
                    <option value="all">Tutti i movimenti</option>
                    {movementMonths.map((month) => (
                      <option value={month} key={month}>
                        {new Intl.DateTimeFormat("it-IT", {
                          month: "long",
                          year: "numeric",
                        }).format(new Date(`${month}-01T12:00:00`))}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="secondary-btn"
                  onClick={() => setView("report")}
                >
                  Esporta dati
                </button>
              </div>
            </div>
            <MovementList
              movements={movementPeriodItems}
              expanded
              onDelete={setDeletingMovement}
              onEdit={setEditingMovement}
            />
          </section>
        )}

        {view === "comune" && (
          <CommonAccountsView
            accounts={commonAccounts}
            transactions={commonTransactions}
            adjustments={balanceAdjustments}
            selectedAccount={selectedCommonAccount}
            selectedPerson={filter}
            onSelect={setSelectedCommonAccount}
            onAdd={() => {setDraftAccount(selectedCommonAccount === "Tutti" ? commonAccounts[0] : selectedCommonAccount);setDraftAmount("");setDraftDirection("Spesa");setDraftDate(localDateKey());setCommonModalOpen(true);}}
            onAddAccount={() => setNewAccountOpen(true)}
            onAlign={() => setBalanceModalOpen(true)}
            balancesVisible={balancesVisible}
            onToggleBalances={() => setBalancesVisible((visible) => !visible)}
            onEdit={setEditingCommon}
            onDelete={deleteCommonTransaction}
            onDeleteAccount={deleteCommonAccount}
          />
        )}
        {view === "utenze" && (
          <UtilitiesView
            bills={visibleUtilityBills}
            onAdd={() => setUtilityModalOpen(true)}
            onEdit={setEditingUtility}
            onDelete={deleteUtilityBill}
          />
        )}
        {view === "abbonamenti" && (
          <SubscriptionsView
            bills={utilityBills}
            onAdd={() => setUtilityModalOpen(true)}
            onEdit={(bill) => setEditingUtility(bill as UtilityBill)}
            onToggleStatus={(bill) => toggleSubscriptionStatus(bill as UtilityBill)}
          />
        )}
        {view === "budget" && (
          <BudgetView
            budgets={budgets}
            movements={movements.filter(
              (item) => item.date <= localDateKey() && isEconomicMovement(item),
            )}
            onAdd={() => setBudgetModalOpen(true)}
            onEdit={setEditingBudget}
            onDelete={(id) => deletePlanning("budget", id)}
          />
        )}
        {view === "obiettivi" && (
          <GoalsView
            goals={goals}
            contributions={accountedContributions}
            onAdd={() => setGoalModalOpen(true)}
            onEdit={setEditingGoal}
            onContribute={setContributionGoal}
            onDelete={(id) => deletePlanning("goal", id)}
          />
        )}
        {view === "piani" && (
          <PersonalFinanceView
            commonAccounts={commonAccounts}
            goals={goals}
            onMovementChange={() => window.location.reload()}
            selectedPerson={filter}
          />
        )}
        {view === "scadenze" && (
          <DeadlinesView
            deadlines={deadlines}
            onAdd={() => setDeadlineModalOpen(true)}
            onEdit={setEditingDeadline}
            onDelete={(id) => deletePlanning("deadline", id)}
            onCompleted={setDeadlineCompleted}
          />
        )}
        {view === "viaggi" && (
          <TravelView
            commonAccounts={commonAccounts}
            onMovementChange={() => window.location.reload()}
          />
        )}
        {view === "decisioni" && <DecisionsView />}
        {view === "note" && (
          <NotesView
            notes={notes.filter((note) => !note.content.startsWith(COVER_MESSAGE_PREFIX))}
            onAdd={() => setNoteModalOpen(true)}
            onDelete={deleteNote}
            onEdit={setEditingNote}
          />
        )}
        {view === "chat" && (
          <ChatView
            messages={chatMessages}
            author={chatAuthor}
            onAuthor={setChatAuthor}
            onSend={sendChat}
            onExport={exportChat}
            onClear={() => setChatClearOpen(true)}
          />
        )}
        {view === "report" && (
          <ReportView
            movements={[...reportableVisibleMovements, ...visiblePlanPayments]}
            commonTransactions={accountedCommonTransactions}
            utilityBills={accountedUtilityBills}
            budgets={budgets}
            goals={goals}
            deadlines={deadlines}
            notes={notes}
            selectedMonth={reportMonth}
            onMonthChange={setReportMonth}
          />
        )}
        {view === "backup" && <BackupView />}
      </section>

      <nav className="mobile-dock" aria-label="Navigazione mobile">
        <button
          className={view === "dashboard" ? "active" : ""}
          onClick={() => setView("dashboard")}
        >
          <span>▦</span>
          <small>Home</small>
        </button>
        <button
          className={view === "movimenti" ? "active" : ""}
          onClick={() => setView("movimenti")}
        >
          <span>⇄</span>
          <small>Movimenti</small>
        </button>
        <button
          className="mobile-add"
          onClick={() => setModalOpen(true)}
          aria-label="Aggiungi movimento"
        >
          <span>＋</span>
          <small>Aggiungi</small>
        </button>
        <button
          className={view === "comune" ? "active" : ""}
          onClick={() => setView("comune")}
        >
          <span>🏠</span>
          <small>Conti</small>
        </button>
        <button
          className={
            !(["dashboard", "movimenti", "comune"] as View[]).includes(view)
              ? "active"
              : ""
          }
          onClick={() => setMobileMenuOpen(true)}
        >
          <span>☰</span>
          <small>Menu</small>
        </button>
      </nav>

      {modalOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setModalOpen(false)}
        >
          <section
            className="modal movement-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="movement-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="close-btn"
              onClick={() => setModalOpen(false)}
              aria-label="Chiudi"
            >
              ×
            </button>
            <p className="panel-kicker">Nuova registrazione</p>
            <h2 id="movement-title">Aggiungi movimento</h2>
            <form className="movement-form" onSubmit={addMovement}>
              <div className="segmented">
                <label>
                  <input
                    type="radio"
                    name="kind"
                    value="Spesa"
                    defaultChecked
                  />{" "}
                  Spesa
                </label>
                <label>
                  <input type="radio" name="kind" value="Entrata" /> Entrata
                </label>
              </div>
              <label className="movement-description">
                Descrizione
                <input
                  name="description"
                  placeholder="Es. Supermercato"
                  required
                />
              </label>
              <div className="form-row">
                <label>
                  Importo
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0,00"
                    required
                  />
                </label>
                <label>
                  Data
                  <input
                    name="date"
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    required
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Categoria
                  <select name="category" defaultValue="Supermercato">
                    <option>Supermercato</option>
                    <option>Casa</option>
                    <option>Utenze</option>
                    <option>Trasporti</option>
                    <option>Tempo libero</option>
                    <option>Viaggi</option>
                    <option>Salute</option>
                    <option>Ticket Satispay</option>
                    <option>Altro</option>
                  </select>
                </label>
                <label>
                  Pagato da
                  <select name="person" defaultValue="Comune">
                    <option>Comune</option>
                    <option>Davide</option>
                    <option>Francesca</option>
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label>
                  Categoria libera (solo se “Altro”)
                  <input name="customCategory" placeholder="Es. Animali" />
                </label>
                <label>
                  Versamento / conto comune (facoltativo)
                  <select name="commonAccount" defaultValue="">
                    <option value="">Nessuno</option>
                    {commonAccounts.map((account) => (
                      <option key={account}>{account}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="movement-ticket">
                Quota pagata con Ticket Satispay (facoltativa)
                <input
                  name="ticketAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Es. 27,00 su una spesa da 30,00"
                />
              </label>
              <label className="movement-goal">
                Collega a un obiettivo
                <select name="goalId" defaultValue="">
                  <option value="">Nessuno</option>
                  {goals.map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {goal.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox-label movement-repeat">
                <input name="automaticMonthly" type="checkbox" /> Ripeti
                automaticamente ogni mese
              </label>
              <div className="form-row">
                <label>
                  Giorno del mese
                  <input
                    name="monthlyDay"
                    type="number"
                    min="1"
                    max="31"
                    defaultValue={15}
                  />
                </label>
                <label>
                  Fine automatismo (facoltativa)
                  <input name="endDate" type="date" />
                </label>
              </div>
              <label className="movement-author">
                Creato da
                <select name="author" defaultValue="Davide">
                  <option>Davide</option>
                  <option>Francesca</option>
                </select>
              </label>
              <p className="form-note movement-note">
                La quota Ticket viene scalata subito dal conto “Ticket
                Satispay”. Se scegli “Ticket Satispay” come categoria e lasci la
                quota vuota, viene scalato automaticamente l’intero importo. Se
                scegliete un obiettivo, il movimento viene sommato automaticamente
                anche lì.
              </p>
              <button className="primary-btn full movement-submit" type="submit">
                Salva movimento
              </button>
            </form>
          </section>
        </div>
      )}

      {deletingMovement && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setDeletingMovement(null)}
        >
          <section
            className="modal confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className="warning-icon">🗑️</span>
            <p className="panel-kicker">Conferma eliminazione</p>
            <h2 id="delete-title">Eliminare questo movimento?</h2>
            <div className="delete-summary">
              <strong>{deletingMovement.description}</strong>
              <span>
                {shortDate.format(
                  new Date(`${deletingMovement.date}T12:00:00`),
                )}{" "}
                · {deletingMovement.person}
              </span>
              <b>
                {deletingMovement.kind === "Entrata" ? "+" : "−"}{" "}
                {euro.format(deletingMovement.amount)}
              </b>
            </div>
            <p className="confirm-copy">
              Il movimento verrà rimosso dall’archivio condiviso di entrambi.
            </p>
            <div className="confirm-actions">
              <button
                className="secondary-btn"
                onClick={() => setDeletingMovement(null)}
              >
                Annulla
              </button>
              <button className="danger-btn" onClick={deleteMovement}>
                Sì, elimina
              </button>
            </div>
          </section>
        </div>
      )}

      {editingMovement && (
        <Modal
          title="Modifica movimento"
          onClose={() => setEditingMovement(null)}
        >
          <form onSubmit={updateMovement}>
            <div className="segmented">
              <label>
                <input
                  type="radio"
                  name="kind"
                  value="Spesa"
                  defaultChecked={editingMovement.kind === "Spesa"}
                />{" "}
                Spesa
              </label>
              <label>
                <input
                  type="radio"
                  name="kind"
                  value="Entrata"
                  defaultChecked={editingMovement.kind === "Entrata"}
                />{" "}
                Entrata
              </label>
            </div>
            <label>
              Descrizione
              <input
                name="description"
                defaultValue={editingMovement.description}
                required
              />
            </label>
            <div className="form-row">
              <label>
                Importo
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  defaultValue={editingMovement.amount}
                  required
                />
              </label>
              <label>
                Data
                <input
                  name="date"
                  type="date"
                  defaultValue={editingMovement.date}
                  required
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                Categoria
                <select
                  name="category"
                  defaultValue={
                    categoryIcons[editingMovement.category]
                      ? editingMovement.category
                      : "Altro"
                  }
                >
                  <option>Supermercato</option>
                  <option>Casa</option>
                  <option>Utenze</option>
                  <option>Trasporti</option>
                  <option>Tempo libero</option>
                  <option>Viaggi</option>
                  <option>Salute</option>
                  <option>Ticket Satispay</option>
                  <option>Altro</option>
                </select>
              </label>
              <label>
                Pagato da
                <select name="person" defaultValue={editingMovement.person}>
                  <option>Comune</option>
                  <option>Davide</option>
                  <option>Francesca</option>
                </select>
              </label>
            </div>
            <label>
              Categoria libera (se Altro)
              <input
                name="customCategory"
                defaultValue={
                  categoryIcons[editingMovement.category]
                    ? ""
                    : editingMovement.category
                }
              />
            </label>
            <label>
              Conto comune
              <select
                name="commonAccount"
                defaultValue={editingMovement.commonAccount ?? ""}
              >
                <option value="">Nessuno</option>
                {commonAccounts.map((account) => (
                  <option key={account}>{account}</option>
                ))}
              </select>
            </label>
            <label>
              Quota Ticket
              <input
                name="ticketAmount"
                type="number"
                min="0"
                step="0.01"
                defaultValue={editingMovement.ticketAmount ?? 0}
              />
            </label>
            <label>
              Collega a un obiettivo
              <select name="goalId" defaultValue={editingMovement.goalId ?? ""}>
                <option value="">Nessuno</option>
                {goals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary-btn full" type="submit">
              Salva modifiche
            </button>
          </form>
        </Modal>
      )}

      {chatClearOpen && (
        <Modal title="Svuota chat" onClose={() => setChatClearOpen(false)}>
          <form onSubmit={clearChat}>
            <p className="form-note">
              Operazione amministrativa. Prima puoi esportare una copia della
              conversazione.
            </p>
            <button
              className="secondary-btn full"
              type="button"
              onClick={exportChat}
            >
              ↓ Esporta chat prima di cancellare
            </button>
            <label>
              Cosa vuoi eliminare?
              <select name="mode" defaultValue="all">
                <option value="all">Tutti i messaggi</option>
                <option value="before">
                  Solo i messaggi precedenti a una data
                </option>
              </select>
            </label>
            <label>
              Data limite
              <input
                name="beforeDate"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <label>
              Codice di recupero
              <input
                name="recoveryCode"
                type="password"
                minLength={6}
                required
                autoComplete="off"
              />
            </label>
            <label className="checkbox-label">
              <input type="checkbox" required /> Confermo di voler cancellare i
              messaggi selezionati
            </label>
            <button className="danger-btn full" type="submit">
              Continua alla seconda conferma
            </button>
          </form>
        </Modal>
      )}

      {editingNote && (
        <Modal title="Modifica nota" onClose={() => setEditingNote(null)}>
          <form onSubmit={updateNote}>
            <label>
              Scritta da
              <select
                name="author"
                defaultValue={editingNote.author ?? "Davide"}
              >
                <option>Davide</option>
                <option>Francesca</option>
              </select>
            </label>
            <label>
              Data
              <input
                name="date"
                type="date"
                defaultValue={editingNote.date}
                required
              />
            </label>
            <label>
              Nota
              <textarea
                name="content"
                rows={7}
                defaultValue={editingNote.content}
                required
              />
            </label>
            <button className="primary-btn full" type="submit">
              Salva modifiche
            </button>
          </form>
        </Modal>
      )}

      {balanceModalOpen && (
        <Modal
          title="Allinea saldo reale"
          onClose={() => {
            setBalanceModalOpen(false);
            setSecurityError("");
          }}
        >
          <form onSubmit={alignBalance}>
            <p className="form-note">
              La correzione non cancella lo storico: registra una rettifica
              tracciata per riallineare il conto.
            </p>
            <label>
              Conto
              <select
                name="account"
                defaultValue={
                  selectedCommonAccount === "Tutti"
                    ? commonAccounts[0]
                    : selectedCommonAccount
                }
              >
                {commonAccounts.map((account) => (
                  <option key={account}>{account}</option>
                ))}
              </select>
            </label>
            <label>
              Saldo reale attuale
              <input name="actualBalance" type="number" step="0.01" required />
            </label>
            <div className="form-row">
              <label>
                Data
                <input
                  name="date"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </label>
              <label>
                Autore
                <select name="author">
                  <option>Davide</option>
                  <option>Francesca</option>
                </select>
              </label>
            </div>
            <label>
              Motivo della correzione
              <input
                name="note"
                placeholder="Es. riallineamento con estratto conto"
              />
            </label>
            <label>
              Codice di recupero
              <input
                name="recoveryCode"
                type="password"
                autoComplete="off"
                required
              />
            </label>
            {securityError && <p className="form-error">{securityError}</p>}
            <button className="primary-btn full">Conferma allineamento</button>
          </form>
        </Modal>
      )}

      {settingsOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setSettingsOpen(false)}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="close-btn"
              onClick={() => setSettingsOpen(false)}
              aria-label="Chiudi"
            >
              ×
            </button>
            <p className="panel-kicker">Personalizzazione condivisa</p>
            <h2 id="settings-title">Nome e foto</h2>
            <form onSubmit={saveSettings}>
              <label>
                Nome della dashboard
                <input
                  name="title"
                  defaultValue={appTitle}
                  maxLength={40}
                  required
                />
              </label>
              <label>
                Foto
                <input
                  name="photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                />
                <small className="field-help">
                  JPG, PNG o WebP. Massimo 4 MB.
                </small>
              </label>
              <h3>Conti comuni</h3>
              <p className="form-note">
                Potete rinominarli se cambiate banca: i movimenti già salvati
                restano collegati al conto corrispondente.
              </p>
              {commonAccounts.map((account, index) => (
                <label key={index}>
                  Nome conto {index + 1}
                  <input
                    name={`account${index}`}
                    defaultValue={account}
                    maxLength={60}
                    required
                  />
                </label>
              ))}
              <button
                className="secondary-btn"
                type="button"
                onClick={() =>
                  setCommonAccounts((items) => [...items, "Nuovo conto"])
                }
              >
                ＋ Aggiungi conto comune
              </button>
              <button className="primary-btn full" type="submit">
                Salva personalizzazione
              </button>
            </form>
            <div className="password-section">
              <h3>Password di accesso</h3>
              <p>Per cambiarla, inserisci quella attuale e scegli la nuova.</p>
              <form onSubmit={changePassword}>
                <label>
                  Password attuale
                  <input
                    name="currentPassword"
                    type="password"
                    minLength={6}
                    autoComplete="current-password"
                    required
                  />
                </label>
                <label>
                  Nuova password
                  <input
                    name="newPassword"
                    type="password"
                    minLength={6}
                    autoComplete="new-password"
                    required
                  />
                </label>
                <label>
                  Ripeti nuova password
                  <input
                    name="confirmation"
                    type="password"
                    minLength={6}
                    autoComplete="new-password"
                    required
                  />
                </label>
                {passwordMessage && (
                  <small
                    className={
                      passwordMessage === "Password modificata."
                        ? "password-success"
                        : "password-error"
                    }
                  >
                    {passwordMessage}
                  </small>
                )}
                <button className="secondary-btn" type="submit">
                  Cambia password
                </button>
              </form>
              <h3 className="recovery-title">Codice di recupero</h3>
              <p>
                Serve solo se dimenticate la password. Conservatelo fuori dalla
                dashboard e non scrivetelo in chat.
              </p>
              <form onSubmit={setRecoveryCode}>
                <label>
                  Nuovo codice di recupero
                  <input
                    name="recoveryCode"
                    type="password"
                    minLength={6}
                    autoComplete="new-password"
                    required
                  />
                </label>
                <label>
                  Ripeti codice
                  <input
                    name="recoveryConfirmation"
                    type="password"
                    minLength={6}
                    autoComplete="new-password"
                    required
                  />
                </label>
                <button className="secondary-btn" type="submit">
                  Salva codice di recupero
                </button>
              </form>
            </div>
          </section>
        </div>
      )}

      {noteModalOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setNoteModalOpen(false)}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="note-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="close-btn"
              onClick={() => setNoteModalOpen(false)}
              aria-label="Chiudi"
            >
              ×
            </button>
            <p className="panel-kicker">Diario familiare</p>
            <h2 id="note-title">Nuova nota</h2>
            <form onSubmit={addNote}>
              <label>
                Scritta da
                <select name="author" defaultValue="Davide">
                  <option>Davide</option>
                  <option>Francesca</option>
                </select>
              </label>
              <label>
                Data
                <input
                  name="date"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </label>
              <label>
                Nota
                <textarea
                  name="content"
                  rows={7}
                  placeholder="Scrivi liberamente…"
                  required
                />
              </label>
              <button className="primary-btn full" type="submit">
                Salva nota
              </button>
            </form>
          </section>
        </div>
      )}

      {utilityModalOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setUtilityModalOpen(false)}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="utility-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="close-btn"
              onClick={() => setUtilityModalOpen(false)}
              aria-label="Chiudi"
            >
              ×
            </button>
            <p className="panel-kicker">Nuova fattura</p>
            <h2 id="utility-title">Registra un’utenza</h2>
            <form onSubmit={addUtilityBill}>
              <div className="form-row">
                <label>
                  Fornitore / piattaforma
                  <select name="provider" defaultValue="Iren">
                    <option>Iren</option>
                    <option>Eni Plenitude</option>
                    <option>Netflix</option>
                    <option>Prime Video</option>
                    <option>Sky</option>
                    <option>Disney+</option>
                    <option>NOW</option>
                    <option>DAZN</option>
                    <option>Apple TV+</option>
                    <option>Paramount+</option>
                    <option>Spotify</option>
                    <option>Altro</option>
                  </select>
                </label>
                <label>
                  Servizio
                  <select name="service" defaultValue="Luce">
                    <option>Luce</option>
                    <option>Gas</option>
                    <option>Acqua</option>
                    <option>Internet</option>
                    <option>Telefonia</option>
                    <option>Streaming</option>
                    <option>Abbonamento</option>
                    <option>TARI</option>
                    <option>Altro</option>
                  </select>
                </label>
              </div>
              <label>
                Nome libero (se hai scelto “Altro”)
                <input
                  name="customProvider"
                  placeholder="Inserisci il fornitore o la piattaforma"
                />
              </label>
              <div className="form-row">
                <label>
                  Importo fattura
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0,00"
                    required
                  />
                </label>
                <label>
                  Data fattura
                  <input
                    name="date"
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    required
                  />
                </label>
                <label>Scadenza fattura<input name="dueDate" type="date" /></label>
              </div>
              <div className="utility-consumption-fields">
                <p className="form-note"><b>Dati consumo luce o gas</b> · facoltativi per le altre utenze</p>
                <div className="form-row">
                  <label>Periodo dal<input name="periodStart" type="date" /></label>
                  <label>Periodo al<input name="periodEnd" type="date" /></label>
                </div>
                <div className="form-row utility-three-fields">
                  <label>Consumo<input name="consumption" type="number" min="0" step="0.001" placeholder="0" /></label>
                  <label>Unità<select name="consumptionUnit" defaultValue="kWh"><option>kWh</option><option>Smc</option></select></label>
                  <label>Lettura contatore<input name="meterReading" type="number" min="0" step="0.001" placeholder="Facoltativa" /></label>
                </div>
                <div className="form-row">
                  <label>Numero fattura<input name="invoiceNumber" placeholder="Facoltativo" /></label>
                  <label>Note<input name="notes" placeholder="Tariffa, conguaglio, dettagli…" /></label>
                </div>
              </div>
              <label>
                Portafoglio di pagamento
                <select name="wallet" defaultValue="BBVA Utenze">
                  <option>Davide</option>
                  <option>Francesca</option>
                  {commonAccounts.map((account) => (
                    <option key={account}>{account}</option>
                  ))}
                </select>
              </label>
              <label className="checkbox-label">
                <input name="recurring" type="checkbox" /> Abbonamento ricorrente
              </label>
              <label>
                Frequenza di addebito
                <select name="billingFrequency" defaultValue="monthly">
                  <option value="monthly">Mensile</option>
                  <option value="annual">Annuale</option>
                </select>
              </label>
              <p className="form-note">
                La fattura verrà aggiunta automaticamente anche alle spese e al
                report del mese indicato.
              </p>
              <button className="primary-btn full" type="submit">
                Salva fattura
              </button>
            </form>
          </section>
        </div>
      )}

      {editingUtility && (
        <Modal title="Modifica utenza" onClose={() => setEditingUtility(null)}>
          <form onSubmit={updateUtilityBill}>
            <div className="form-row">
              <label>
                Fornitore / piattaforma
                <select
                  name="provider"
                  defaultValue={
                    [
                      "Iren",
                      "Eni Plenitude",
                      "Netflix",
                      "Prime Video",
                      "Sky",
                      "Disney+",
                      "NOW",
                      "DAZN",
                      "Apple TV+",
                      "Paramount+",
                      "Spotify",
                    ].includes(editingUtility.provider)
                      ? editingUtility.provider
                      : "Altro"
                  }
                >
                  <option>Iren</option>
                  <option>Eni Plenitude</option>
                  <option>Netflix</option>
                  <option>Prime Video</option>
                  <option>Sky</option>
                  <option>Disney+</option>
                  <option>NOW</option>
                  <option>DAZN</option>
                  <option>Apple TV+</option>
                  <option>Paramount+</option>
                  <option>Spotify</option>
                  <option>Altro</option>
                </select>
              </label>
              <label>
                Servizio
                <select name="service" defaultValue={editingUtility.service}>
                  <option>Luce</option>
                  <option>Gas</option>
                  <option>Acqua</option>
                  <option>Internet</option>
                  <option>Telefonia</option>
                  <option>Streaming</option>
                  <option>Abbonamento</option>
                  <option>TARI</option>
                  <option>Altro</option>
                </select>
              </label>
            </div>
            <label>
              Nome libero (se hai scelto “Altro”)
              <input
                name="customProvider"
                defaultValue={
                  [
                    "Iren",
                    "Eni Plenitude",
                    "Netflix",
                    "Prime Video",
                    "Sky",
                    "Disney+",
                    "NOW",
                    "DAZN",
                    "Apple TV+",
                    "Paramount+",
                    "Spotify",
                  ].includes(editingUtility.provider)
                    ? ""
                    : editingUtility.provider
                }
              />
            </label>
            <div className="form-row">
              <label>
                Importo fattura
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  defaultValue={editingUtility.amount}
                  required
                />
              </label>
              <label>
                Data fattura
                <input
                  name="date"
                  type="date"
                  defaultValue={editingUtility.date}
                  required
                />
              </label>
            </div>
            <div className="utility-consumption-fields">
              <p className="form-note"><b>Dati consumo luce o gas</b> · sempre modificabili</p>
              <div className="form-row">
                <label>Periodo dal<input name="periodStart" type="date" defaultValue={editingUtility.periodStart ?? ""} /></label>
                <label>Periodo al<input name="periodEnd" type="date" defaultValue={editingUtility.periodEnd ?? ""} /></label>
              </div>
              <div className="form-row utility-three-fields">
                <label>Consumo<input name="consumption" type="number" min="0" step="0.001" defaultValue={editingUtility.consumption ?? ""} /></label>
                <label>Unità<select name="consumptionUnit" defaultValue={editingUtility.consumptionUnit ?? (editingUtility.service === "Gas" ? "Smc" : "kWh")}><option>kWh</option><option>Smc</option></select></label>
                <label>Lettura contatore<input name="meterReading" type="number" min="0" step="0.001" defaultValue={editingUtility.meterReading ?? ""} /></label>
              </div>
              <div className="form-row">
                <label>Numero fattura<input name="invoiceNumber" defaultValue={editingUtility.invoiceNumber ?? ""} /></label>
                <label>Scadenza fattura<input name="dueDate" type="date" defaultValue={editingUtility.dueDate ?? ""} /></label>
                <label>Note<input name="notes" defaultValue={editingUtility.notes ?? ""} /></label>
              </div>
            </div>
            <label>
              Portafoglio di pagamento
              <select name="wallet" defaultValue={editingUtility.wallet}>
                <option>Davide</option>
                <option>Francesca</option>
                {commonAccounts.map((account) => (
                  <option key={account}>{account}</option>
                ))}
              </select>
            </label>
            <label className="checkbox-label">
              <input
                name="recurring"
                type="checkbox"
                defaultChecked={Boolean(editingUtility.recurring)}
              />{" "}
              Abbonamento ricorrente
            </label>
            <label>
              Frequenza di addebito
              <select name="billingFrequency" defaultValue={editingUtility.billingFrequency ?? "monthly"}>
                <option value="monthly">Mensile</option>
                <option value="annual">Annuale</option>
              </select>
            </label>
            <p className="form-note">
              Se attiva, la scadenza viene creata o aggiornata automaticamente
              ogni mese.
            </p>
            <button className="primary-btn full" type="submit">
              Salva modifiche
            </button>
          </form>
        </Modal>
      )}

      {commonModalOpen && (
        <Modal
          title="Movimento conto comune"
          onClose={() => setCommonModalOpen(false)}
        >
          <form onSubmit={addCommonTransaction}>
            <div className="segmented">
              <label>
                <input type="radio" name="kind" value="Spesa" checked={draftDirection==="Spesa"} onChange={()=>setDraftDirection("Spesa")} />{" "}
                Uscita
              </label>
              <label>
                <input type="radio" name="kind" value="Entrata" checked={draftDirection==="Entrata"} onChange={()=>setDraftDirection("Entrata")} /> Entrata
              </label>
            </div>
            <label>
              Conto
              <select name="account" value={draftAccount} onChange={e=>setDraftAccount(e.target.value)}>
                {commonAccounts.map((account) => (
                  <option key={account}>{account}</option>
                ))}
              </select>
            </label>
            <p>Saldo attuale · {draftAccount}: <strong>{euro.format(accountBalance(draftAccount,commonTransactions,balanceAdjustments))}</strong></p>
            <label>
              Descrizione
              <input
                name="description"
                placeholder="Es. Cena, bonifico, rimborso…"
                required
              />
            </label>
            <div className="form-row">
              <label>
                Categoria
                <select name="category" defaultValue="Altro">
                  <option>Supermercato</option>
                  <option>Utenze</option>
                  <option>Casa</option>
                  <option>Viaggi</option>
                  <option>Trasporti</option>
                  <option>Altro</option>
                </select>
              </label>
              <label>
                Categoria libera
                <input name="customCategory" placeholder="Se Altro" />
              </label>
            </div>
            <div className="form-row">
              <label>
                Importo
                <input
                  name="amount" value={draftAmount} onChange={e=>setDraftAmount(e.target.value)}
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                />
              </label>
              <label>
                Data
                <input
                  name="date"
                  type="date"
                  value={draftDate} onChange={e=>setDraftDate(e.target.value)}
                  required
                />
              </label>
            </div>
            <p aria-live="polite">Saldo di oggi dopo il salvataggio: <strong>{draftDate && Number(draftAmount)>0 ? euro.format(accountBalance(draftAccount,[...commonTransactions,{account:draftAccount,date:draftDate,createdAt:new Date().toISOString().replace("T"," ").slice(0,19),direction:draftDirection,amount:Math.round(Number(draftAmount)*100)/100} as CommonTransaction],balanceAdjustments)) : "—"}</strong>{draftDate>localDateKey() && <small> · Movimento futuro: il saldo di oggi non cambia.</small>}</p>
            <button className="primary-btn full">Salva movimento</button>
          </form>
        </Modal>
      )}

      {editingCommon && (
        <Modal
          title="Modifica movimento conto"
          onClose={() => setEditingCommon(null)}
        >
          <form onSubmit={updateCommonTransaction}>
            <div className="segmented">
              <label>
                <input
                  type="radio"
                  name="kind"
                  value="Spesa"
                  defaultChecked={editingCommon.direction === "Spesa"}
                />{" "}
                Uscita
              </label>
              <label>
                <input
                  type="radio"
                  name="kind"
                  value="Entrata"
                  defaultChecked={editingCommon.direction === "Entrata"}
                />{" "}
                Entrata
              </label>
            </div>
            <label>
              Conto
              <select name="account" defaultValue={editingCommon.account}>
                {commonAccounts.map((account) => (
                  <option key={account}>{account}</option>
                ))}
              </select>
            </label>
            <label>
              Descrizione
              <input
                name="description"
                defaultValue={editingCommon.description}
                required
              />
            </label>
            <div className="form-row">
              <label>
                Categoria
                <select
                  name="category"
                  defaultValue={
                    categoryIcons[editingCommon.category]
                      ? editingCommon.category
                      : "Altro"
                  }
                >
                  <option>Supermercato</option>
                  <option>Utenze</option>
                  <option>Casa</option>
                  <option>Viaggi</option>
                  <option>Trasporti</option>
                  <option>Altro</option>
                </select>
              </label>
              <label>
                Categoria libera
                <input
                  name="customCategory"
                  defaultValue={
                    categoryIcons[editingCommon.category]
                      ? ""
                      : editingCommon.category
                  }
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
                  defaultValue={editingCommon.amount}
                  required
                />
              </label>
              <label>
                Data
                <input
                  name="date"
                  type="date"
                  defaultValue={editingCommon.date}
                  required
                />
              </label>
            </div>
            <button className="primary-btn full">Salva modifiche</button>
          </form>
        </Modal>
      )}

      {newAccountOpen && (
        <Modal
          title="Nuovo conto comune"
          onClose={() => setNewAccountOpen(false)}
        >
          <form onSubmit={createCommonAccount}>
            <label>
              Nome del conto
              <input
                name="name"
                placeholder="Es. Nuova banca"
                maxLength={60}
                required
              />
            </label>
            <label>
              Logo facoltativo
              <input
                name="logo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
              />
            </label>
            <button className="primary-btn full">Crea conto</button>
          </form>
        </Modal>
      )}

      {budgetModalOpen && (
        <Modal
          title="Nuovo budget mensile"
          onClose={() => setBudgetModalOpen(false)}
        >
          <form onSubmit={(event) => createPlanning("budget", event)}>
            <label>
              Mese
              <input
                name="month"
                type="month"
                defaultValue={currentMonth}
                required
              />
            </label>
            <div className="form-row">
              <label>
                Categoria
                <select name="category" defaultValue="Supermercato">
                  <option>Supermercato</option>
                  <option>Utenze</option>
                  <option>Casa</option>
                  <option>Viaggi</option>
                  <option>Trasporti</option>
                  <option>Tempo libero</option>
                  <option>Altro</option>
                </select>
              </label>
              <label>
                Limite (€)
                <input
                  name="limit"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                />
              </label>
            </div>
            <button className="primary-btn full">Salva budget</button>
          </form>
        </Modal>
      )}

      {editingBudget && (
        <Modal title="Modifica budget" onClose={() => setEditingBudget(null)}>
          <form onSubmit={updateBudget}>
            <label>
              Mese
              <input
                name="month"
                type="month"
                defaultValue={editingBudget.month}
                required
              />
            </label>
            <div className="form-row">
              <label>
                Categoria
                <input
                  name="category"
                  defaultValue={editingBudget.category}
                  required
                />
              </label>
              <label>
                Limite (€)
                <input
                  name="limit"
                  type="number"
                  min="0.01"
                  step="0.01"
                  defaultValue={editingBudget.limit}
                  required
                />
              </label>
            </div>
            <button className="primary-btn full">Salva modifiche</button>
          </form>
        </Modal>
      )}

      {goalModalOpen && (
        <Modal title="Nuovo obiettivo" onClose={() => setGoalModalOpen(false)}>
          <form onSubmit={(event) => createPlanning("goal", event)}>
            <label>
              Nome obiettivo
              <input
                name="name"
                placeholder="Es. Viaggio giro del mondo"
                required
              />
            </label>
            <label>
              Cifra da raggiungere (€)
              <input
                name="target"
                type="number"
                min="0.01"
                step="0.01"
                required
              />
            </label>
            <label>
              Foto facoltativa
              <input
                name="photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
              />
            </label>
            <button className="primary-btn full">Crea obiettivo</button>
          </form>
        </Modal>
      )}

      {editingGoal && (
        <Modal title="Modifica obiettivo" onClose={() => setEditingGoal(null)}>
          <form onSubmit={updateGoal}>
            <label>
              Nome obiettivo
              <input name="name" defaultValue={editingGoal.name} required />
            </label>
            <label>
              Cifra da raggiungere (€)
              <input
                name="target"
                type="number"
                min="0.01"
                step="0.01"
                defaultValue={editingGoal.target}
                required
              />
            </label>
            <label>
              Nuova foto facoltativa
              <input
                name="photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
              />
            </label>
            <button className="primary-btn full">Salva modifiche</button>
          </form>
        </Modal>
      )}

      {contributionGoal && (
        <Modal
          title={`Versamento · ${contributionGoal.name}`}
          onClose={() => setContributionGoal(null)}
        >
          <form onSubmit={(event) => createPlanning("contribution", event)}>
            <input type="hidden" name="goalId" value={contributionGoal.id} />
            <label>
              Da quale conto / persona
              <select name="source" defaultValue={commonAccounts[0]}>
                <option>Davide</option>
                <option>Francesca</option>
                {commonAccounts.map((account) => (
                  <option key={account}>{account}</option>
                ))}
              </select>
            </label>
            <div className="form-row">
              <label>
                Quota (€)
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                />
              </label>
              <label>
                Data
                <input
                  name="date"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </label>
            </div>
            <button className="primary-btn full">Aggiungi quota</button>
          </form>
        </Modal>
      )}

      {deadlineModalOpen && (
        <Modal
          title="Nuova scadenza"
          onClose={() => setDeadlineModalOpen(false)}
        >
          <form onSubmit={(event) => createPlanning("deadline", event)}>
            <label>
              Da ricordare
              <input
                name="title"
                placeholder="Es. Assicurazione auto"
                required
              />
            </label>
            <div className="form-row">
              <label>
                Riferita a
                <select name="person" defaultValue="Comune">
                  <option>Davide</option>
                  <option>Francesca</option>
                  <option>Comune</option>
                </select>
              </label>
              <label>
                Data
                <input name="date" type="date" required />
              </label>
            </div>
            <label>
              Avvisami
              <select name="reminderDays" defaultValue="7">
                <option value="1">1 giorno prima</option>
                <option value="2">2 giorni prima</option>
                <option value="7">1 settimana prima</option>
              </select>
            </label>
            <label>
              Ricorrenza
              <select name="recurrence" defaultValue="none">
                <option value="none">Una sola volta</option>
                <option value="monthly">Ogni mese</option>
                <option value="yearly">Ogni anno</option>
              </select>
            </label>
            <label>
              Nota facoltativa
              <textarea name="note" rows={3} />
            </label>
            <button className="primary-btn full">Salva scadenza</button>
          </form>
        </Modal>
      )}

      {editingDeadline && (
        <Modal
          title="Modifica scadenza"
          onClose={() => setEditingDeadline(null)}
        >
          <form onSubmit={updateDeadline}>
            <label>
              Da ricordare
              <input
                name="title"
                defaultValue={editingDeadline.title}
                required
              />
            </label>
            <div className="form-row">
              <label>
                Riferita a
                <select
                  name="person"
                  defaultValue={editingDeadline.person ?? "Comune"}
                >
                  <option>Davide</option>
                  <option>Francesca</option>
                  <option>Comune</option>
                </select>
              </label>
              <label>
                Data
                <input
                  name="date"
                  type="date"
                  defaultValue={editingDeadline.date}
                  required
                />
              </label>
            </div>
            <label>
              Avvisami
              <select
                name="reminderDays"
                defaultValue={String(editingDeadline.reminderDays)}
              >
                <option value="1">1 giorno prima</option>
                <option value="2">2 giorni prima</option>
                <option value="7">1 settimana prima</option>
              </select>
            </label>
            <label>
              Ricorrenza
              <select
                name="recurrence"
                defaultValue={editingDeadline.recurrence ?? "none"}
              >
                <option value="none">Una sola volta</option>
                <option value="monthly">Ogni mese</option>
                <option value="yearly">Ogni anno</option>
              </select>
            </label>
            <label>
              Nota facoltativa
              <textarea
                name="note"
                rows={3}
                defaultValue={editingDeadline.note}
              />
            </label>
            <button className="primary-btn full">Salva modifiche</button>
          </form>
        </Modal>
      )}
      {kpiBreakdown && (
        <Modal title={kpiBreakdown + " · " + dashboardPeriodLabel} onClose={() => setKpiBreakdown(null)}>
          <div className="breakdown-list">
            {dashboardMovements.filter((item) => item.kind === (kpiBreakdown === "Entrate" ? "Entrata" : "Spesa")).length ? dashboardMovements.filter((item) => item.kind === (kpiBreakdown === "Entrate" ? "Entrata" : "Spesa")).map((item) => (
              <div className="breakdown-row" key={item.id}>
                <div><strong>{item.description}</strong><small>{item.category} · {item.person} · {shortDate.format(new Date(item.date + "T12:00:00"))}</small></div>
                <b className={kpiBreakdown === "Entrate" ? "positive-text" : "negative-text"}>{kpiBreakdown === "Entrate" ? "+" : "−"} {euro.format(item.amount)}</b>
              </div>
            )) : <p className="form-note">Nessuna voce nel periodo selezionato.</p>}
          </div>
        </Modal>
      )}
    </main>
  );
}

function Kpi({
  icon,
  tone,
  label,
  value,
  note,
  onClick,
}: {
  icon: string;
  tone: string;
  label: string;
  value: string;
  note: string;
  onClick?: () => void;
}) {
  return (
    <article className={"kpi-card" + (onClick ? " kpi-clickable" : "")} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}>
      <div className={`kpi-icon ${tone}`}>{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </article>
  );
}

function MovementList({
  movements,
  expanded = false,
  onDelete,
  onEdit,
}: {
  movements: Movement[];
  expanded?: boolean;
  onDelete: (movement: Movement) => void;
  onEdit: (movement: Movement) => void;
}) {
  if (!movements.length) {
    return (
      <div className="empty-state compact">
        <span>＋</span>
        <strong>Nessun movimento</strong>
        <p>Le entrate e le spese che inserirete appariranno qui.</p>
      </div>
    );
  }
  return (
    <div className={`movement-list ${expanded ? "expanded" : ""}`}>
      {movements.map((movement) => (
        <article className="movement-row" key={movement.id}>
          <span className="movement-icon">
            {categoryIcons[movement.category] ?? "📌"}
            <i className="owner-mark">
              {movement.person === "Davide"
                ? "D"
                : movement.person === "Francesca"
                  ? "F"
                  : "C"}
            </i>
          </span>
          <span className="movement-copy">
            <strong>{movement.description}</strong>
            <small>
              {shortDate.format(new Date(`${movement.date}T12:00:00`))} ·{" "}
              {movement.person}
              {movement.commonAccount ? ` → ${movement.commonAccount}` : ""}
              {movement.ticketAmount
                ? ` · Ticket ${euro.format(movement.ticketAmount)}`
                : ""}
            </small>
            <small className="movement-audit">
              {movement.date > localDateKey() && (
                <b className="scheduled-badge">Programmato</b>
              )}
              {movement.createdAt
                ? `Inserito il ${insertedDateTime.format(parseStoredDateTime(movement.createdAt))}`
                : "Data di inserimento non disponibile"}
            </small>
          </span>
          {expanded && (
            <span className="category-pill">{movement.category}</span>
          )}
          <strong
            className={
              movement.kind === "Entrata" ? "amount positive" : "amount"
            }
          >
            {movement.kind === "Entrata" ? "+" : "−"}{" "}
            {euro.format(movement.amount)}
          </strong>
          <span className="row-actions">
            <button
              className="delete-btn"
              onClick={() => onEdit(movement)}
              aria-label={`Modifica ${movement.description}`}
              title="Modifica movimento"
            >
              ✎
            </button>
            <button
              className="delete-btn"
              onClick={() => onDelete(movement)}
              aria-label={`Elimina ${movement.description}`}
              title="Elimina movimento"
            >
              🗑️
            </button>
          </span>
        </article>
      ))}
    </div>
  );
}

function ExpenseChart({ movements }: { movements: Movement[] }) {
  const [mode, setMode] = useState<"income" | "expense" | "combined">(
    "combined",
  );
  if (!movements.length) {
    return (
      <div className="empty-chart">
        <div className="empty-chart-grid" />
        <div className="empty-state compact">
          <span>⌁</span>
          <strong>Il grafico è pronto</strong>
          <p>Comparirà quando registrerete le prime entrate o uscite.</p>
        </div>
      </div>
    );
  }

  const incomeTotals = new Map<string, number>();
  const expenseTotals = new Map<string, number>();
  movements.forEach((movement) => {
    const key = movement.date.slice(0, 7);
    const totals = movement.kind === "Entrata" ? incomeTotals : expenseTotals;
    totals.set(key, (totals.get(key) ?? 0) + movement.amount);
  });
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (5 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return {
      label: new Intl.DateTimeFormat("it-IT", { month: "short" }).format(date),
      income: incomeTotals.get(key) ?? 0,
      expense: expenseTotals.get(key) ?? 0,
    };
  });
  const max = Math.max(
    ...months.flatMap((month) => [month.income, month.expense]),
    1,
  );
  const scaleMax = Math.max(100, Math.ceil(max / 100) * 100);
  const incomePoints = months
    .map(
      (month, index) =>
        `${15 + index * 112},${165 - (month.income / scaleMax) * 125}`,
    )
    .join(" ");
  const expensePoints = months
    .map(
      (month, index) =>
        `${15 + index * 112},${165 - (month.expense / scaleMax) * 125}`,
    )
    .join(" ");
  return (
    <div
      className="chart finance-chart"
      aria-label="Grafico entrate e uscite degli ultimi sei mesi"
    >
      <div className="chart-switch" aria-label="Scegli grafico">
        <button
          className={mode === "income" ? "selected" : ""}
          onClick={() => setMode("income")}
        >
          Entrate
        </button>
        <button
          className={mode === "expense" ? "selected" : ""}
          onClick={() => setMode("expense")}
        >
          Uscite
        </button>
        <button
          className={mode === "combined" ? "selected" : ""}
          onClick={() => setMode("combined")}
        >
          Confronto
        </button>
      </div>
      <div className="chart-legend">
        {mode !== "expense" && (
          <span>
            <i className="income-dot" /> Entrate
          </span>
        )}
        {mode !== "income" && (
          <span>
            <i className="expense-dot" /> Uscite
          </span>
        )}
      </div>
      <div className="y-labels">
        <span>{euro.format(scaleMax)}</span>
        <span>{euro.format(scaleMax * 0.66)}</span>
        <span>{euro.format(scaleMax * 0.33)}</span>
        <span>{euro.format(0)}</span>
      </div>
      <svg viewBox="0 0 590 180" role="img">
        {[30, 75, 120, 165].map((y) => (
          <line key={y} x1="10" x2="580" y1={y} y2={y} className="grid-line" />
        ))}
        {mode !== "expense" && (
          <polyline points={incomePoints} className="income-line" />
        )}
        {mode !== "income" && (
          <polyline points={expensePoints} className="expense-line" />
        )}
      </svg>
      <div className="x-labels">
        {months.map((month) => (
          <span key={month.label}>{month.label}</span>
        ))}
      </div>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="close-btn" onClick={onClose} aria-label="Chiudi">
          ×
        </button>
        <p className="panel-kicker">Gestione familiare</p>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}

function CommonAccountsView({
  accounts,
  transactions,
  adjustments,
  selectedAccount,
  selectedPerson,
  onSelect,
  onAdd,
  onAddAccount,
  onAlign,
  balancesVisible,
  onToggleBalances,
  onEdit,
  onDelete,
  onDeleteAccount,
}: {
  accounts: CommonAccount[];
  transactions: CommonTransaction[];
  adjustments: BalanceAdjustment[];
  selectedAccount: CommonAccount | "Tutti";
  selectedPerson: "Tutti" | Person;
  onSelect: (account: CommonAccount | "Tutti") => void;
  onAdd: () => void;
  onAddAccount: () => void;
  onAlign: () => void;
  balancesVisible: boolean;
  onToggleBalances: () => void;
  onEdit: (item: CommonTransaction) => void;
  onDelete: (item: CommonTransaction) => void;
  onDeleteAccount: (account: CommonAccount) => void;
}) {
  const [accountMonth, setAccountMonth] = useState("all");
  useEffect(() => setAccountMonth("all"), [selectedAccount]);
  const accountedTransactions = transactions.filter(
    (item) => item.date <= localDateKey(),
  );
  const total = accounts.reduce(
    (sum, account) => sum + accountBalance(account, transactions, adjustments),
    0,
  );
  const shownByAccount =
    selectedAccount === "Tutti"
      ? transactions
      : transactions.filter((item) => item.account === selectedAccount);
  const shown =
    selectedPerson === "Tutti"
      ? shownByAccount
      : shownByAccount.filter((item) => item.person === selectedPerson);
  const monthOptions = Array.from(
    new Set([
      ...shown.map((item) => item.date.slice(0, 7)),
      ...adjustments
        .filter(
          (item) =>
            (selectedAccount === "Tutti" || item.account === selectedAccount) &&
            (selectedPerson === "Tutti" || item.author === selectedPerson),
        )
        .map((item) => item.date.slice(0, 7)),
    ]),
  ).sort((a, b) => b.localeCompare(a));
  const visibleTransactions = shown.filter(
    (item) => accountMonth === "all" || item.date.startsWith(accountMonth),
  );
  const visibleAdjustments = adjustments.filter(
    (item) =>
      (selectedAccount === "Tutti" || item.account === selectedAccount) &&
      (selectedPerson === "Tutti" || item.author === selectedPerson) &&
      (accountMonth === "all" || item.date.startsWith(accountMonth)),
  );
  const running = visibleTransactions
    .filter((item) => item.date <= localDateKey())
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    .reduce<{ label: string; value: number }[]>(
      (items, item) => [
        ...items,
        {
          label: item.date.slice(5),
          value:
            (items.at(-1)?.value ?? 0) +
            (item.direction === "Entrata" ? item.amount : -item.amount),
        },
      ],
      [],
    );
  return (
    <section className="page-grid">
      <article className="panel page-panel wide">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">Patrimonio dei conti condivisi</p>
            <h2>Conti comuni</h2>
          </div>
          <div className="inline-actions">
            <button className="secondary-btn privacy-toggle" onClick={onToggleBalances} aria-pressed={balancesVisible}>
              {balancesVisible ? "◉ Nascondi saldi" : "◌ Mostra saldi"}
            </button>
            <button className="secondary-btn" onClick={onAlign}>
              ⚖ Allinea saldo
            </button>
            <button className="secondary-btn" onClick={onAddAccount}>
              ＋ Nuovo conto
            </button>
            <button className="primary-btn" onClick={onAdd}>
              ＋ Movimento conto
            </button>
          </div>
        </div>
        <div className="closed-account-strip">{accounts.map((account) => <div key={account}><small>{account}</small><b className={balancesVisible ? (accountBalance(account, transactions, adjustments) >= 0 ? "positive-text" : "negative-text") : "balance-masked"}>{balancesVisible ? euro.format(accountBalance(account, transactions, adjustments)) : "••••••"}</b></div>)}</div>
        <div className="account-grid">
          {accounts.map((account) => {
            const balance = accountBalance(account, transactions, adjustments);
            return (
              <button
                className={`account-card ${balance >= 0 ? "positive" : "negative"} ${selectedAccount === account ? "selected" : ""}`}
                key={account}
                onClick={() => onSelect(account)}
              >
                <img
                  src={`/api/account-logo?account=${encodeURIComponent(account)}`}
                  alt=""
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
                <span>{account}</span>
                <strong className={balancesVisible ? "" : "balance-masked"}>{balancesVisible ? euro.format(balance) : "••••••"}</strong>
                <small>Apri movimenti e andamento</small>
                <span
                  className="account-delete"
                  role="button"
                  tabIndex={0}
                  title={`Elimina ${account}`}
                  aria-label={`Elimina ${account}`}
                  onClick={(event) => { event.preventDefault(); event.stopPropagation(); onDeleteAccount(account); }}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onDeleteAccount(account); } }}
                >
                  🗑
                </span>
              </button>
            );
          })}
        </div>
        <button
          className={`patrimony-card ${total >= 0 ? "positive" : "negative"}`}
          onClick={() => onSelect("Tutti")}
        >
          <span>Patrimonio totale</span>
          <strong className={balancesVisible ? "" : "balance-masked"}>{balancesVisible ? euro.format(total) : "••••••"}</strong>
          <small>Somma di tutti i conti · clicca per vederli insieme</small>
        </button>
        <div className="panel account-detail">
          <div className="panel-heading">
            <h3>
              {selectedAccount === "Tutti" ? "Tutti i conti" : selectedAccount}
              {selectedPerson !== "Tutti" ? ` · ${selectedPerson}` : ""}
            </h3>
            <div className="inline-actions account-detail-actions">
              <label className="compact-filter">
                <span>Mese</span>
                <select value={accountMonth} onChange={(event) => setAccountMonth(event.target.value)}>
                  <option value="all">Tutti i mesi</option>
                  {monthOptions.map((month) => (
                    <option key={month} value={month}>
                      {new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`))}
                    </option>
                  ))}
                </select>
              </label>
              <button className="text-btn" onClick={() => onSelect("Tutti")}>
                Mostra tutti
              </button>
            </div>
          </div>
          <AccountChart values={running} />
          <div className="movement-list expanded">
            {visibleTransactions.map((item) => (
              <article className="movement-row" key={item.id}>
                <span className="movement-icon">
                  {item.direction === "Entrata" ? "↙" : "↗"}
                </span>
                <span className="movement-copy">
                  <strong>{item.description}</strong>
                  <small>
                    {item.account} ·{" "}
                    {shortDate.format(new Date(`${item.date}T12:00:00`))}
                    {item.person !== "Comune" ? ` · ${item.person}` : ""}
                    {item.date > localDateKey() ? " · Programmato" : ""}
                  </small>
                  {item.createdAt && (
                    <small className="movement-audit">
                      Inserito il {insertedDateTime.format(parseStoredDateTime(item.createdAt))}
                    </small>
                  )}
                </span>
                <span className="category-pill">{item.category}</span>
                <strong
                  className={
                    item.direction === "Entrata" ? "amount positive" : "amount"
                  }
                >
                  {item.direction === "Entrata" ? "+" : "−"}{" "}
                  {euro.format(item.amount)}
                </strong>
                <span className="row-actions">
                  <button
                    className="delete-btn"
                    onClick={() => onEdit(item)}
                    aria-label="Modifica movimento conto"
                  >
                    ✎
                  </button>
                  <button
                    className="delete-btn"
                    onClick={() => onDelete(item)}
                    aria-label="Elimina movimento conto"
                  >
                    🗑️
                  </button>
                </span>
              </article>
            ))}
            {adjustments
              .filter((item) => visibleAdjustments.some((visible) => visible.id === item.id))
              .map((item) => (
                <article
                  className="movement-row adjustment-row"
                  key={`adj-${item.id}`}
                >
                  <span className="movement-icon">⚖</span>
                  <span className="movement-copy">
                    <strong>Rettifica saldo · {item.author}</strong>
                    <small>
                      {item.account} ·{" "}
                      {shortDate.format(new Date(`${item.date}T12:00:00`))}
                      {item.note ? ` · ${item.note}` : ""}
                    </small>
                  </span>
                  <span className="category-pill">Allineamento</span>
                  <strong
                    className={item.delta >= 0 ? "amount positive" : "amount"}
                  >
                    {item.delta >= 0 ? "+" : "−"}{" "}
                    {euro.format(Math.abs(item.delta))}
                  </strong>
                </article>
              ))}
          </div>
        </div>
      </article>
    </section>
  );
}

function AccountChart({
  values,
}: {
  values: { label: string; value: number }[];
}) {
  if (!values.length)
    return (
      <div className="empty-chart">
        <div className="empty-state compact">
          <span>⌁</span>
          <strong>Andamento pronto</strong>
          <p>Comparirà al primo movimento del conto.</p>
        </div>
      </div>
    );
  const min = Math.min(...values.map((item) => item.value), 0);
  const max = Math.max(...values.map((item) => item.value), 1);
  const span = Math.max(max - min, 1);
  const points = values
    .map(
      (item, index) =>
        `${10 + index * (560 / Math.max(values.length - 1, 1))},${165 - ((item.value - min) / span) * 130}`,
    )
    .join(" ");
  return (
    <div className="chart">
      <svg viewBox="0 0 590 180">
        <polyline points={points} className="expense-line account-line" />
      </svg>
      <div className="x-labels">
        {values.slice(-6).map((item, index) => (
          <span key={`${item.label}${index}`}>{item.label}</span>
        ))}
      </div>
    </div>
  );
}

function BudgetView({
  budgets,
  movements,
  onAdd,
  onEdit,
  onDelete,
}: {
  budgets: Budget[];
  movements: Movement[];
  onAdd: () => void;
  onEdit: (budget: Budget) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <section className="panel page-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">Limiti mensili per categoria</p>
          <h2>Budget</h2>
        </div>
        <button className="primary-btn" onClick={onAdd}>
          ＋ Nuovo budget
        </button>
      </div>
      {!budgets.length ? (
        <div className="empty-state">
          <span>◔</span>
          <h2>Nessun budget impostato</h2>
          <p>
            Impostate un limite per categoria e il confronto con le spese sarà
            automatico.
          </p>
          <button className="primary-btn" onClick={onAdd}>
            Imposta il primo budget
          </button>
        </div>
      ) : (
        <div className="budget-list">
          {budgets.map((item) => {
            const spent = movements
              .filter(
                (movement) =>
                  movement.kind === "Spesa" &&
                  movement.category === item.category &&
                  movement.date.startsWith(item.month),
              )
              .reduce((sum, movement) => sum + movement.amount, 0);
            const percent = Math.min(
              100,
              Math.round((spent / item.limit) * 100),
            );
            return (
              <article className="budget-row" key={item.id}>
                <span className="movement-icon">
                  {categoryIcons[item.category] ?? "📌"}
                </span>
                <div>
                  <strong>{item.category}</strong>
                  <small>
                    {new Intl.DateTimeFormat("it-IT", {
                      month: "long",
                      year: "numeric",
                    }).format(new Date(`${item.month}-01T12:00:00`))}{" "}
                    · {euro.format(spent)} su {euro.format(item.limit)}
                  </small>
                  <div className="mini-progress">
                    <span style={{ width: `${percent}%` }} />
                  </div>
                </div>
                <strong>{percent}%</strong>
                <span className="row-actions">
                  <button
                    className="delete-btn"
                    onClick={() => onEdit(item)}
                    aria-label="Modifica budget"
                  >
                    ✎
                  </button>
                  <button
                    className="delete-btn"
                    onClick={() => onDelete(item.id)}
                    aria-label="Elimina budget"
                  >
                    🗑️
                  </button>
                </span>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function GoalsView({
  goals,
  contributions,
  onAdd,
  onEdit,
  onContribute,
  onDelete,
}: {
  goals: Goal[];
  contributions: GoalContribution[];
  onAdd: () => void;
  onEdit: (goal: Goal) => void;
  onContribute: (goal: Goal) => void;
  onDelete: (id: number) => void;
}) {
  const [collapsedGoals, setCollapsedGoals] = useState<Set<number>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set<number>(JSON.parse(localStorage.getItem("casa-insieme:goals-closed:v1") || "[]"));
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    localStorage.setItem("casa-insieme:goals-closed:v1", JSON.stringify([...collapsedGoals]));
  }, [collapsedGoals]);
  return (
    <section className="panel page-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">Risparmi dedicati</p>
          <h2>Obiettivi</h2>
        </div>
        <button className="primary-btn" onClick={onAdd}>
          ＋ Nuovo obiettivo
        </button>
      </div>
      {!goals.length ? (
        <div className="empty-state">
          <span>◎</span>
          <h2>Nessun obiettivo inserito</h2>
          <p>
            Indicate quanto serve e aggiungete le quote versate dai vostri
            conti.
          </p>
          <button className="primary-btn" onClick={onAdd}>
            Crea il primo obiettivo
          </button>
        </div>
      ) : (
        <div className="goals-grid">
          {goals.map((goal) => {
            const paid = contributions
              .filter((item) => item.goalId === goal.id)
              .reduce((sum, item) => sum + item.amount, 0);
            const percent = Math.min(
              100,
              Math.round((paid / goal.target) * 100),
            );
            return (
              <article
                className={`goal-card ${collapsedGoals.has(goal.id) ? "collapsed" : ""}`}
                key={goal.id}
              >
                <span className="row-actions goal-delete">
                  <button
                    className="collapse-card-btn"
                    onClick={() =>
                      setCollapsedGoals((current) => {
                        const next = new Set(current);
                        if (next.has(goal.id)) next.delete(goal.id);
                        else next.add(goal.id);
                        return next;
                      })
                    }
                    aria-label={
                      collapsedGoals.has(goal.id)
                        ? "Apri obiettivo"
                        : "Richiudi obiettivo"
                    }
                  >
                    {collapsedGoals.has(goal.id) ? "▾" : "▴"}
                  </button>
                  <button
                    className="delete-btn"
                    onClick={() => onEdit(goal)}
                    aria-label="Modifica obiettivo"
                  >
                    ✎
                  </button>
                  <button
                    className="delete-btn"
                    onClick={() => onDelete(goal.id)}
                    aria-label="Elimina obiettivo"
                  >
                    🗑️
                  </button>
                </span>
                {goal.photoKey ? (
                  <img
                    className="goal-photo"
                    src={`/api/goal-photo?id=${goal.id}`}
                    alt=""
                  />
                ) : (
                  <span>◎</span>
                )}
                <h3>{goal.name}</h3>
                <strong>
                  {euro.format(paid)}{" "}
                  <small>di {euro.format(goal.target)}</small>
                </strong>
                <div className="mini-progress">
                  <span style={{ width: `${percent}%` }} />
                </div>
                <p>{percent}% raggiunto</p>
                <button
                  className="secondary-btn"
                  onClick={() => onContribute(goal)}
                >
                  Aggiungi quota
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DeadlinesView({
  deadlines,
  onAdd,
  onEdit,
  onDelete,
  onCompleted,
}: {
  deadlines: Deadline[];
  onAdd: () => void;
  onEdit: (deadline: Deadline) => void;
  onDelete: (id: number) => void;
  onCompleted: (deadline: Deadline, completed: boolean) => void;
}) {
  return (
    <section className="panel page-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">Promemoria in dashboard</p>
          <h2>Scadenze</h2>
        </div>
        <button className="primary-btn" onClick={onAdd}>
          ＋ Aggiungi una scadenza
        </button>
      </div>
      {!deadlines.length ? (
        <div className="empty-state">
          <span>□</span>
          <h2>Nessuna scadenza inserita</h2>
          <p>
            Scegliete quando far comparire l’avviso: 1 giorno, 2 giorni o 1
            settimana prima.
          </p>
          <button className="primary-btn" onClick={onAdd}>
            Aggiungi una scadenza
          </button>
        </div>
      ) : (
        <div className="deadline-list">
          {deadlines.map((item) => (
            <article
              className={`deadline-row ${item.completed ? "done" : ""}`}
              key={item.id}
            >
              <button
                className="complete-btn"
                onClick={() => onCompleted(item, !item.completed)}
                aria-label={
                  item.completed ? "Segna come da fare" : "Segna come eseguita"
                }
              >
                {item.completed ? "✓" : "○"}
              </button>
              <span className="movement-icon">□</span>
              <div>
                <strong>{item.title}</strong>
                <small>
                  {shortDate.format(new Date(`${item.date}T12:00:00`))} ·{" "}
                  {item.recurrence === "monthly" ? "mensile · " : item.recurrence === "yearly" ? "annuale · " : ""}
                  {item.completed
                    ? "eseguita"
                    : `avviso ${item.reminderDays === 7 ? "1 settimana" : `${item.reminderDays} giorno${item.reminderDays > 1 ? "i" : ""}`} prima`}
                  {item.note ? ` · ${item.note}` : ""}
                </small>
              </div>
              <span className="row-actions">
                <button
                  className="delete-btn"
                  onClick={() => onEdit(item)}
                  aria-label="Modifica scadenza"
                >
                  ✎
                </button>
                <button
                  className="delete-btn"
                  onClick={() => onDelete(item.id)}
                  aria-label="Elimina scadenza"
                >
                  🗑️
                </button>
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function EnergyUtilityCard({
  kind,
  bills,
  onEdit,
}: {
  kind: "Luce" | "Gas";
  bills: UtilityBill[];
  onEdit: (bill: UtilityBill) => void;
}) {
  const [open, setOpen] = useState(() => typeof window === "undefined" ? true : localStorage.getItem(`casa-utility-${kind}-open`) !== "false");
  const history = bills
    .filter((bill) => kind === "Luce" ? ["Luce", "Energia elettrica", "Elettricità"].includes(bill.service) : bill.service === "Gas")
    .sort((a, b) => a.date.localeCompare(b.date));
  const totalCost = history.reduce((sum, bill) => sum + bill.amount, 0);
  const totalConsumption = history.reduce((sum, bill) => sum + (bill.consumption ?? 0), 0);
  const maxConsumption = Math.max(...history.map((bill) => bill.consumption ?? 0), 1);
  const unit = kind === "Luce" ? "kWh" : "Smc";
  const chartBills = history.slice(-12);
  const chartPoints: Array<[number, number]> = chartBills.map((bill, index) => [
    ((index + 0.5) / chartBills.length) * 1000,
    100 - Math.max(8, ((bill.consumption ?? 0) / maxConsumption) * 100),
  ]);
  return (
    <article className={`energy-utility-card ${kind === "Gas" ? "gas" : "electricity"}`}>
      <div className="energy-card-heading">
        <span className="energy-icon">{kind === "Luce" ? "⚡" : "🔥"}</span>
        <div><p className="panel-kicker">Controllo consumi</p><h3>{kind === "Luce" ? "Energia elettrica" : "Gas"}</h3></div>
        <div className="energy-card-actions">
          {!open && <strong className="energy-closed-cost">{euro.format(totalCost)}</strong>}
          <span className="energy-count">{history.length} fatture</span>
          <button
            type="button"
            className="collapse-card-btn"
            onClick={() => setOpen((value) => { const next = !value; localStorage.setItem(`casa-utility-${kind}-open`, String(next)); return next; })}
            aria-expanded={open}
          >
            {open ? "▴ Richiudi" : "▾ Apri"}
          </button>
        </div>
      </div>
      {open && <>
        <div className="energy-kpis">
          <div><span>Spesa registrata</span><strong>{euro.format(totalCost)}</strong></div>
          <div><span>Consumo registrato</span><strong>{totalConsumption ? `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(totalConsumption)} ${unit}` : "Da inserire"}</strong></div>
        </div>
        {history.length ? (
        <>
          <div className="consumption-chart" aria-label={`Andamento consumi ${kind}`}>
            <svg className="consumption-curve" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
              <path d={smoothChartPath(chartPoints)} />
              {chartPoints.map(([x, y], index) => (
                <circle key={`${chartBills[index].id}-point`} cx={x} cy={y} r="7" vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
            {chartBills.map((bill) => (
              <button key={bill.id} onClick={() => onEdit(bill)} title={`${bill.provider}: ${bill.consumption ?? 0} ${bill.consumptionUnit ?? unit} · ${euro.format(bill.amount)}`}>
                <span className="consumption-bar-area">
                  <em>{new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(bill.consumption ?? 0)}</em>
                  <i style={{ height: `${Math.max(8, ((bill.consumption ?? 0) / maxConsumption) * 100)}%` }} />
                </span>
                <small>{new Intl.DateTimeFormat("it-IT", { month: "short", year: "2-digit" }).format(new Date(`${bill.date}T12:00:00`))}</small>
              </button>
            ))}
          </div>
          <div className="consumption-legend"><span><i /> Consumo in {unit}</span><span><i /> Andamento</span></div>
          <div className="energy-history">
            {history.slice().reverse().slice(0, 6).map((bill) => (
              <button key={bill.id} onClick={() => onEdit(bill)}>
                <span className="energy-history-info"><b>{bill.provider}</b><small>{bill.periodStart && bill.periodEnd ? `${shortDate.format(new Date(`${bill.periodStart}T12:00:00`))} – ${shortDate.format(new Date(`${bill.periodEnd}T12:00:00`))}` : shortDate.format(new Date(`${bill.date}T12:00:00`))}</small></span>
                <span className="energy-history-values"><b>{euro.format(bill.amount)}</b><small>{bill.consumption != null ? `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(bill.consumption)} ${bill.consumptionUnit ?? unit}` : "Consumo da inserire"}</small></span><small className="energy-due-date">{bill.dueDate ? "Scade il " + shortDate.format(new Date(bill.dueDate + "T12:00:00")) : "Scadenza da inserire"}</small>
              </button>
            ))}
          </div>
        </>
        ) : <p className="energy-empty">Nessuna fattura registrata. Usa “Nuova fattura” e scegli {kind}.</p>}
      </>}
    </article>
  );
}

function UtilitiesView({
  bills,
  onAdd,
  onEdit,
  onDelete,
}: {
  bills: UtilityBill[];
  onAdd: () => void;
  onEdit: (bill: UtilityBill) => void;
  onDelete: (bill: UtilityBill) => void;
}) {
  const [detail, setDetail] = useState<string | null>(null);
  const currentYear = String(new Date().getFullYear());
  const availableYears = Array.from(new Set(bills.map((bill) => (bill.periodEnd || bill.date).slice(0, 4))))
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [billsOpen, setBillsOpen] = useState(() => typeof window === "undefined" ? false : localStorage.getItem("casa-utility-list-open") === "true");
  const effectiveYear = selectedYear === "all" || availableYears.includes(selectedYear)
    ? selectedYear
    : (availableYears.includes(currentYear) ? currentYear : (availableYears[0] ?? currentYear));
  const visibleBills = effectiveYear === "all"
    ? bills
    : bills.filter((bill) => (bill.periodEnd || bill.date).startsWith(effectiveYear));
  const total = visibleBills.reduce((sum, bill) => sum + bill.amount, 0);
  const byWallet = (wallet: UtilityBill["wallet"]) =>
    visibleBills
      .filter((bill) => bill.wallet === wallet)
      .reduce((sum, bill) => sum + bill.amount, 0);
  return (
    <section className="panel page-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">{visibleBills.length} fatture · {effectiveYear === "all" ? "tutti gli anni" : effectiveYear}</p>
          <h2>Utenze</h2>
        </div>
        <div className="utility-heading-actions">
          <label className="utility-year-picker">
            <span>Anno visualizzato</span>
            <select value={effectiveYear} onChange={(event) => setSelectedYear(event.target.value)}>
              {availableYears.map((year) => <option value={year} key={year}>{year}</option>)}
              <option value="all">Tutti gli anni</option>
            </select>
          </label>
          <button className="primary-btn" onClick={onAdd}>＋ Nuova fattura</button>
        </div>
      </div>
      <div className="utility-totals">
        {["Totale", "Davide", "Francesca", "Conti comuni"].map((label) => {
          const items = visibleBills.filter((bill) => label === "Totale" || (label === "Conti comuni" ? !["Davide", "Francesca"].includes(bill.wallet) : bill.wallet === label));
          return <button type="button" className="utility-total-button" key={label} onClick={() => setDetail(label)} aria-label={`Mostra fatture ${label}`}><div><span>{label}</span><strong>{euro.format(items.reduce((sum, bill) => sum + bill.amount, 0))}</strong></div></button>;
        })}
      </div>
      {detail && <Modal title={`Fatture · ${detail}`} onClose={() => setDetail(null)}>
        <p>{effectiveYear === "all" ? "Tutti gli anni" : effectiveYear}</p>
        {(() => {
          const items = visibleBills.filter((bill) => detail === "Totale" || (detail === "Conti comuni" ? !["Davide", "Francesca"].includes(bill.wallet) : bill.wallet === detail)).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
          return <><p><strong>{items.length} fatture · {euro.format(items.reduce((sum, bill) => sum + bill.amount, 0))}</strong></p>
            <div className="utility-detail-list">{items.length ? items.map((bill) => <article key={bill.id} className="utility-detail-row"><div><strong>{bill.provider} · {bill.service}</strong><small>{shortDate.format(new Date(bill.date + "T12:00:00"))} · {bill.wallet}</small>{bill.periodStart && bill.periodEnd && <small>Periodo: {shortDate.format(new Date(bill.periodStart + "T12:00:00"))} – {shortDate.format(new Date(bill.periodEnd + "T12:00:00"))}</small>}{bill.dueDate && <small>Scadenza: {shortDate.format(new Date(bill.dueDate + "T12:00:00"))}</small>}</div><strong>{euro.format(bill.amount)}</strong></article>) : <p>Nessuna fattura per questo filtro.</p>}</div></>;
        })()}
      </Modal>}
      <div className="energy-utility-grid">
        <EnergyUtilityCard kind="Luce" bills={visibleBills} onEdit={onEdit} />
        <EnergyUtilityCard kind="Gas" bills={visibleBills} onEdit={onEdit} />
      </div>
      <UtilitiesAnalysis bills={visibleBills} />
      {!visibleBills.length ? (
        <div className="empty-state">
          <span>⌁</span>
          <h2>Nessuna utenza registrata</h2>
          <p>
            Inserite fornitore, servizio, importo, data e portafoglio. La
            fattura confluirà automaticamente nelle spese.
          </p>
          <button className="primary-btn" onClick={onAdd}>
            Registra la prima fattura
          </button>
        </div>
      ) : (
        <section className="utility-list-section">
          <div className="utility-list-heading">
            <div>
              <p className="panel-kicker">Archivio utenze</p>
              <h3>Fatture registrate</h3>
              <small>{visibleBills.length} voci · apri solo se devi controllare, modificare o eliminare</small>
            </div>
            <button
              type="button"
              className="collapse-card-btn"
              onClick={() => setBillsOpen((value) => { const next = !value; localStorage.setItem("casa-utility-list-open", String(next)); return next; })}
              aria-expanded={billsOpen}
            >
              {billsOpen ? "▴ Richiudi elenco" : `▾ Apri elenco (${visibleBills.length})`}
            </button>
          </div>
          {billsOpen && <div className="utility-list">
          {visibleBills.map((bill) => (
            <article className="utility-row" key={bill.id}>
              <span className="movement-icon">💡</span>
              <div>
                <strong>{bill.provider}</strong>
                <small>
                  {bill.service} ·{" "}
                  {shortDate.format(new Date(`${bill.date}T12:00:00`))}
                  {bill.recurring ? ` · Ricorrente ${bill.billingFrequency === "annual" ? "annuale" : "mensile"}` : ""}
                  {bill.consumption != null ? ` · ${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(bill.consumption)} ${bill.consumptionUnit ?? ""}` : ""}
                </small>
              </div>
              <span className="category-pill">{bill.wallet}</span>
              <strong>{euro.format(bill.amount)}</strong>
              <span className="row-actions">
                <button
                  className="delete-btn"
                  onClick={() => onEdit(bill)}
                  aria-label={`Modifica fattura ${bill.provider}`}
                  title="Modifica fattura"
                >
                  ✎
                </button>
                <button
                  className="delete-btn"
                  onClick={() => onDelete(bill)}
                  aria-label={`Elimina fattura ${bill.provider}`}
                  title="Elimina fattura"
                >
                  🗑️
                </button>
              </span>
            </article>
          ))}
          </div>}
        </section>
      )}
    </section>
  );
}

function NotesView({
  notes,
  onAdd,
  onDelete,
  onEdit,
}: {
  notes: Note[];
  onAdd: () => void;
  onDelete: (note: Note) => void;
  onEdit: (note: Note) => void;
}) {
  return (
    <section className="panel page-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">{notes.length} note salvate</p>
          <h2>Note e promemoria</h2>
        </div>
        <button className="primary-btn" onClick={onAdd}>
          ＋ Nuova nota
        </button>
      </div>
      {!notes.length ? (
        <div className="empty-state">
          <span>✎</span>
          <h2>Nessuna nota inserita</h2>
          <p>
            Scrivete liberamente ciò che volete ricordare. Ogni nota avrà la sua
            data e resterà nello storico condiviso.
          </p>
          <button className="primary-btn" onClick={onAdd}>
            Scrivi la prima nota
          </button>
        </div>
      ) : (
        <div className="notes-list">
          {notes.map((note) => (
            <article className="note-card" key={note.id}>
              <div className="note-date">
                <strong>
                  {new Intl.DateTimeFormat("it-IT", { day: "2-digit" }).format(
                    new Date(`${note.date}T12:00:00`),
                  )}
                </strong>
                <span>
                  {new Intl.DateTimeFormat("it-IT", {
                    month: "short",
                    year: "numeric",
                  }).format(new Date(`${note.date}T12:00:00`))}
                </span>
              </div>
              <div>
                <span
                  className={`note-author ${note.author === "Francesca" ? "francesca" : "davide"}`}
                >
                  {note.author === "Francesca" ? "F" : "D"} · {note.author}
                </span>
                <p>{note.content}</p>
                <small className="note-time">
                  Inserita alle{" "}
                  {note.createdAt
                    ? new Intl.DateTimeFormat("it-IT", {
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(
                        new Date(
                          note.createdAt.replace(" ", "T") +
                            (note.createdAt.endsWith("Z") ? "" : "Z"),
                        ),
                      )
                    : "—"}
                </small>
              </div>
              <span className="row-actions">
                <button
                  className="delete-btn"
                  onClick={() => onEdit(note)}
                  aria-label="Modifica nota"
                >
                  ✎
                </button>
                <button
                  className="delete-btn"
                  onClick={() => onDelete(note)}
                  aria-label="Elimina nota"
                  title="Elimina nota"
                >
                  🗑️
                </button>
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ChatView({
  messages,
  author,
  onAuthor,
  onSend,
  onExport,
  onClear,
}: {
  messages: ChatMessage[];
  author: "Davide" | "Francesca";
  onAuthor: (author: "Davide" | "Francesca") => void;
  onSend: (event: FormEvent<HTMLFormElement>) => void;
  onExport: () => void;
  onClear: () => void;
}) {
  return (
    <section className="panel page-panel chat-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">Messaggi condivisi</p>
          <h2>Chat interna</h2>
        </div>
        <div className="chat-heading-actions">
          <div className="people-filter">
            <button
              className={author === "Davide" ? "selected" : ""}
              onClick={() => onAuthor("Davide")}
            >
              Davide
            </button>
            <button
              className={author === "Francesca" ? "selected" : ""}
              onClick={() => onAuthor("Francesca")}
            >
              Francesca
            </button>
          </div>
          <button
            className="secondary-btn"
            onClick={onExport}
            disabled={!messages.length}
          >
            ↓ Esporta
          </button>
          <button
            className="danger-btn"
            onClick={onClear}
            disabled={!messages.length}
          >
            Svuota chat
          </button>
        </div>
      </div>
      <p className="report-copy">
        Se siete collegati, premete ↻ Aggiorna per vedere subito gli ultimi
        messaggi.
      </p>
      <div className="chat-list">
        {messages.map((message) => (
          <article
            key={message.id}
            className={`chat-bubble ${message.author === "Davide" ? "david" : "francesca"}`}
          >
            <strong>{message.author}</strong>
            <p>{message.content}</p>
            <small>
              {new Intl.DateTimeFormat("it-IT", {
                hour: "2-digit",
                minute: "2-digit",
                day: "2-digit",
                month: "2-digit",
              }).format(new Date(message.createdAt))}
            </small>
          </article>
        ))}
        {!messages.length && (
          <p className="report-copy">Nessun messaggio ancora.</p>
        )}
      </div>
      <form className="chat-form" onSubmit={onSend}>
        <textarea
          name="content"
          rows={3}
          placeholder="Scrivi a chi è collegato…"
          maxLength={1000}
          required
        />
        <button className="primary-btn" type="submit">
          Invia
        </button>
      </form>
    </section>
  );
}

function ReportView({
  movements,
  commonTransactions,
  utilityBills,
  budgets,
  goals,
  deadlines,
  notes,
  selectedMonth,
  onMonthChange,
}: {
  movements: Movement[];
  commonTransactions: CommonTransaction[];
  utilityBills: UtilityBill[];
  budgets: Budget[];
  goals: Goal[];
  deadlines: Deadline[];
  notes: Note[];
  selectedMonth: string;
  onMonthChange: (month: string) => void;
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPeriod, setExportPeriod] = useState<"month" | "year" | "all">(
    "month",
  );
  const [exportSections, setExportSections] = useState({
    movements: true,
    common: false,
    utilities: false,
    budgets: false,
    goals: false,
    deadlines: false,
    notes: false,
  });
  const [movementOwners, setMovementOwners] = useState<Person[]>([
    "Davide",
    "Francesca",
    "Comune",
  ]);
  const [movementKinds, setMovementKinds] = useState<Kind[]>([
    "Entrata",
    "Spesa",
  ]);
  const [movementCategories, setMovementCategories] = useState<string[]>([]);
  const [commonAccountsFilter, setCommonAccountsFilter] = useState<string[]>(
    [],
  );
  const [commonDirections, setCommonDirections] = useState<Kind[]>([
    "Entrata",
    "Spesa",
  ]);
  const [utilityServices, setUtilityServices] = useState<string[]>([]);
  const monthKeys = Array.from(
    new Set([
      new Date().toISOString().slice(0, 7),
      ...movements.map((movement) => movement.date.slice(0, 7)),
    ]),
  )
    .sort()
    .reverse();
  const selectedMovements = movements.filter((movement) =>
    movement.date.startsWith(selectedMonth),
  );
  const selectedCommon = commonTransactions.filter((item) =>
    item.date.startsWith(selectedMonth),
  );
  const commonIncome = selectedCommon
    .filter((item) => item.direction === "Entrata")
    .reduce((sum, item) => sum + item.amount, 0);
  const commonExpenses = selectedCommon
    .filter((item) => item.direction === "Spesa")
    .reduce((sum, item) => sum + item.amount, 0);
  const income = selectedMovements
    .filter((movement) => movement.kind === "Entrata")
    .reduce((sum, movement) => sum + movement.amount, 0);
  const expenses = selectedMovements
    .filter((movement) => movement.kind === "Spesa")
    .reduce((sum, movement) => sum + movement.amount, 0);
  const savings = income - expenses;
  const previousDate = new Date(`${selectedMonth}-01T12:00:00`);
  previousDate.setMonth(previousDate.getMonth() - 1);
  const previousMonth = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, "0")}`;
  const previousMovements = movements.filter((movement) =>
    movement.date.startsWith(previousMonth),
  );
  const previousIncome = previousMovements
    .filter((movement) => movement.kind === "Entrata")
    .reduce((sum, movement) => sum + movement.amount, 0);
  const previousExpenses = previousMovements
    .filter((movement) => movement.kind === "Spesa")
    .reduce((sum, movement) => sum + movement.amount, 0);
  const expenseChange = previousExpenses
    ? ((expenses - previousExpenses) / previousExpenses) * 100
    : null;
  const incomeChange = previousIncome
    ? ((income - previousIncome) / previousIncome) * 100
    : null;
  const byOwner = (["Davide", "Francesca", "Comune"] as const).map(
    (person) => ({
      person,
      amount: selectedMovements
        .filter(
          (movement) => movement.kind === "Spesa" && movement.person === person,
        )
        .reduce((sum, movement) => sum + movement.amount, 0),
    }),
  );
  const monthCategories = Array.from(
    selectedMovements
      .filter((movement) => movement.kind === "Spesa")
      .reduce(
        (map, movement) =>
          map.set(
            movement.category,
            (map.get(movement.category) ?? 0) + movement.amount,
          ),
        new Map<string, number>(),
      ),
  ).sort((a, b) => b[1] - a[1]);
  const recurringMap = new Map<string, UtilityBill>();
  utilityBills
    .filter((bill) => bill.recurring)
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((bill) => {
      const key = `${bill.wallet}|${bill.provider}|${bill.service}`;
      if (!recurringMap.has(key)) recurringMap.set(key, bill);
    });
  const recurringForecast = [...recurringMap.values()].reduce(
    (sum, bill) => sum + (bill.billingFrequency === "annual" ? bill.amount / 12 : bill.amount),
    0,
  );
  const selectedBudgets = budgets.filter(
    (budget) => budget.month === selectedMonth,
  );
  const budgetLimit = selectedBudgets.reduce(
    (sum, budget) => sum + budget.limit,
    0,
  );
  const hasData = income !== 0 || expenses !== 0;
  const selectedDate = new Date(`${selectedMonth}-01T12:00:00`);
  const reportTitle = new Intl.DateTimeFormat("it-IT", {
    month: "long",
    year: "numeric",
  }).format(selectedDate);
  const selectedYear = selectedMonth.slice(0, 4);
  const categoryTotals = Array.from(
    movements
      .filter(
        (movement) =>
          movement.kind === "Spesa" && movement.date.startsWith(selectedYear),
      )
      .reduce(
        (map, movement) =>
          map.set(
            movement.category,
            (map.get(movement.category) ?? 0) + movement.amount,
          ),
        new Map<string, number>(),
      ),
  ).sort((a, b) => b[1] - a[1]);
  const maxCategory = Math.max(
    ...categoryTotals.map(([, amount]) => amount),
    1,
  );
  const insights = [
    expenseChange === null
      ? "Non c’è ancora un mese precedente completo da confrontare."
      : `Le spese sono ${Math.abs(expenseChange).toFixed(1)}% ${expenseChange > 0 ? "più alte" : "più basse"} del mese precedente.`,
    monthCategories[0]
      ? `La categoria più pesante del mese è ${monthCategories[0][0]} con ${euro.format(monthCategories[0][1])}.`
      : "Non risultano ancora spese nel mese selezionato.",
    income > 0
      ? `Il risparmio rappresenta ${Math.round((savings / income) * 100)}% delle entrate del mese.`
      : "La percentuale di risparmio sarà disponibile dopo la prima entrata.",
    recurringForecast > 0
      ? `Per il prossimo mese risultano circa ${euro.format(recurringForecast)} di spese ricorrenti già note.`
      : "Non risultano ancora spese ricorrenti da proiettare.",
  ];
  const matchesExportPeriod = (date: string) =>
    exportPeriod === "all" ||
    date.startsWith(exportPeriod === "year" ? selectedYear : selectedMonth);
  const allMovementCategories = Array.from(
    new Set(movements.map((item) => item.category)),
  ).sort();
  const allCommonAccounts = Array.from(
    new Set(commonTransactions.map((item) => item.account)),
  ).sort();
  const allUtilityServices = Array.from(
    new Set(utilityBills.map((item) => item.service)),
  ).sort();
  const exportedMovements = movements.filter(
    (item) =>
      matchesExportPeriod(item.date) &&
      movementOwners.includes(item.person) &&
      movementKinds.includes(item.kind) &&
      (!movementCategories.length ||
        movementCategories.includes(item.category)),
  );
  const exportedCommon = commonTransactions.filter(
    (item) =>
      matchesExportPeriod(item.date) &&
      commonDirections.includes(item.direction) &&
      (!commonAccountsFilter.length ||
        commonAccountsFilter.includes(item.account)),
  );
  const exportedUtilities = utilityBills.filter(
    (item) =>
      matchesExportPeriod(item.date) &&
      (!utilityServices.length || utilityServices.includes(item.service)),
  );
  const exportedBudgets = budgets.filter((item) =>
    matchesExportPeriod(item.month),
  );
  const exportedDeadlines = deadlines.filter((item) =>
    matchesExportPeriod(item.date),
  );
  const exportedNotes = notes.filter((item) => matchesExportPeriod(item.date));
  const selectedSectionCount =
    Object.values(exportSections).filter(Boolean).length;

  function toggleArrayValue<T extends string>(
    value: T,
    current: T[],
    setter: (values: T[]) => void,
  ) {
    setter(
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  function exportRows() {
    const blocks: { title: string; rows: (string | number)[][] }[] = [];
    if (exportSections.movements)
      blocks.push({
        title: "Movimenti",
        rows: [
          [
            "Data",
            "Tipo",
            "Descrizione",
            "Categoria",
            "Profilo",
            "Conto comune",
            "Ticket",
            "Importo",
          ],
          ...exportedMovements.map((item) => [
            item.date,
            item.kind,
            item.description,
            item.category,
            item.person,
            item.commonAccount ?? "",
            item.ticketAmount ?? 0,
            item.amount,
          ]),
        ],
      });
    if (exportSections.common)
      blocks.push({
        title: "Conti comuni",
        rows: [
          ["Data", "Conto", "Tipo", "Descrizione", "Categoria", "Importo"],
          ...exportedCommon.map((item) => [
            item.date,
            item.account,
            item.direction,
            item.description,
            item.category,
            item.amount,
          ]),
        ],
      });
    if (exportSections.utilities)
      blocks.push({
        title: "Utenze",
        rows: [
          [
            "Data",
            "Fornitore",
            "Servizio",
            "Portafoglio",
            "Ricorrente",
            "Importo",
          ],
          ...exportedUtilities.map((item) => [
            item.date,
            item.provider,
            item.service,
            item.wallet,
            item.recurring ? "Sì" : "No",
            item.amount,
          ]),
        ],
      });
    if (exportSections.budgets)
      blocks.push({
        title: "Budget",
        rows: [
          ["Mese", "Categoria", "Limite"],
          ...exportedBudgets.map((item) => [
            item.month,
            item.category,
            item.limit,
          ]),
        ],
      });
    if (exportSections.goals)
      blocks.push({
        title: "Obiettivi",
        rows: [
          ["Nome", "Obiettivo economico"],
          ...goals.map((item) => [item.name, item.target]),
        ],
      });
    if (exportSections.deadlines)
      blocks.push({
        title: "Scadenze",
        rows: [
          [
            "Data",
            "Titolo",
            "Stato",
            "Ricorrenza",
            "Promemoria giorni",
            "Nota",
          ],
          ...exportedDeadlines.map((item) => [
            item.date,
            item.title,
            item.completed ? "Completata" : "Da fare",
            item.recurrence,
            item.reminderDays,
            item.note,
          ]),
        ],
      });
    if (exportSections.notes)
      blocks.push({
        title: "Note",
        rows: [
          ["Data", "Autore", "Ora inserimento", "Nota"],
          ...exportedNotes.map((item) => [
            item.date,
            item.author,
            item.createdAt ?? "",
            item.content,
          ]),
        ],
      });
    return blocks;
  }

  function exportExcel() {
    const blocks = exportRows();
    const rows = blocks.flatMap((block, index) => [
      [block.title],
      ...block.rows,
      ...(index < blocks.length - 1 ? [[""]] : []),
    ]);
    const csv =
      "\ufeff" +
      rows
        .map((row) =>
          row
            .map(
              (cell) =>
                `"${String(typeof cell === "number" ? cell.toFixed(2).replace(".", ",") : cell).replaceAll('"', '""')}"`,
            )
            .join(";"),
        )
        .join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `casa-insieme-${exportPeriod === "all" ? "storico" : exportPeriod === "year" ? selectedYear : selectedMonth}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    const escape = (value: string | number) =>
      String(value).replace(
        /[&<>"']/g,
        (char) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;",
          })[char] ?? char,
      );
    const blocks = exportRows();
    const label =
      exportPeriod === "all"
        ? "Tutto lo storico"
        : exportPeriod === "year"
          ? `Anno ${selectedYear}`
          : reportTitle;
    const body = blocks
      .map(
        (block) =>
          `<section><h2>${escape(block.title)}</h2><table><thead><tr>${block.rows[0].map((cell) => `<th>${escape(cell)}</th>`).join("")}</tr></thead><tbody>${block.rows
            .slice(1)
            .map(
              (row) =>
                `<tr>${row.map((cell) => `<td>${escape(typeof cell === "number" ? euro.format(cell) : cell)}</td>`).join("")}</tr>`,
            )
            .join("")}</tbody></table></section>`,
      )
      .join("");
    const popup = window.open("", "_blank");
    if (!popup) {
      window.alert(
        "Il browser ha bloccato la finestra del PDF. Consenti i popup per Casa Insieme e riprova.",
      );
      return;
    }
    popup.document.open();
    popup.document.write(
      `<!doctype html><html lang="it"><head><title>Casa Insieme · ${escape(label)}</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial,sans-serif;color:#222}h1{margin:0 0 4px}p{color:#666;margin:0 0 22px}section{break-inside:avoid;margin:0 0 26px}h2{font-size:18px;border-bottom:2px solid #5e876a;padding-bottom:6px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #ccc;padding:6px;text-align:left;vertical-align:top}th{background:#e5eee5}</style></head><body><h1>Casa Insieme</h1><p>${escape(label)} · generato il ${escape(new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeStyle: "short" }).format(new Date()))}</p>${body || "<p>Nessun dato selezionato.</p>"}</body></html>`,
    );
    popup.document.close();
    window.setTimeout(() => {
      popup.focus();
      popup.print();
    }, 250);
  }
  return (
    <section className="page-grid">
      <article className="panel page-panel wide">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">Archivio mensile</p>
            <h2>Report di {reportTitle}</h2>
          </div>
          <label className="month-picker">
            Mese
            <select
              value={selectedMonth}
              onChange={(event) => onMonthChange(event.target.value)}
            >
              {monthKeys.map((month) => (
                <option key={month} value={month}>
                  {new Intl.DateTimeFormat("it-IT", {
                    month: "long",
                    year: "numeric",
                  }).format(new Date(`${month}-01T12:00:00`))}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="report-numbers">
          <div className="positive">
            <span>Entrate</span>
            <strong>{euro.format(income)}</strong>
            <small>
              {incomeChange === null
                ? "nessun confronto"
                : `${incomeChange > 0 ? "+" : ""}${incomeChange.toFixed(1)}% sul mese prima`}
            </small>
          </div>
          <div className="negative">
            <span>Spese</span>
            <strong>{euro.format(expenses)}</strong>
            <small>
              {expenseChange === null
                ? "nessun confronto"
                : `${expenseChange > 0 ? "+" : ""}${expenseChange.toFixed(1)}% sul mese prima`}
            </small>
          </div>
          <div className={savings >= 0 ? "positive" : "negative"}>
            <span>Risparmio</span>
            <strong>{euro.format(savings)}</strong>
          </div>
          <div className="positive">
            <span>Conti comuni: entrate</span>
            <strong>{euro.format(commonIncome)}</strong>
          </div>
          <div className="negative">
            <span>Conti comuni: uscite</span>
            <strong>{euro.format(commonExpenses)}</strong>
          </div>
          <div
            className={
              commonIncome - commonExpenses >= 0 ? "positive" : "negative"
            }
          >
            <span>Saldo conti comuni</span>
            <strong>{euro.format(commonIncome - commonExpenses)}</strong>
          </div>
        </div>
        <div className="month-close">
          <div>
            <p className="panel-kicker">Ripartizione delle spese</p>
            <div className="owner-split">
              {byOwner.map((item) => (
                <span key={item.person}>
                  <b>{item.person}</b>
                  <strong>{euro.format(item.amount)}</strong>
                  <i
                    style={{
                      width: `${expenses ? (item.amount / expenses) * 100 : 0}%`,
                    }}
                  />
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="panel-kicker">Budget del mese</p>
            <strong
              className={
                budgetLimit && expenses > budgetLimit
                  ? "negative-text"
                  : "positive-text"
              }
            >
              {budgetLimit
                ? `${euro.format(expenses)} su ${euro.format(budgetLimit)}`
                : "Nessun budget impostato"}
            </strong>
          </div>
        </div>
        <div className="monthly-reading">
          <p className="panel-kicker">Considerazioni automatiche</p>
          <h3>Lettura del mese</h3>
          <ul>
            {insights.map((text, index) => (
              <li key={index}>{text}</li>
            ))}
          </ul>
        </div>
        <h3>{hasData ? "Dati registrati" : "Report ancora vuoto"}</h3>
        <p className="report-copy">
          {hasData
            ? `Il riepilogo comprende ${selectedMovements.length} movimenti registrati nel mese selezionato.`
            : "Questo report si compilerà automaticamente quando inserirete movimenti con una data appartenente al mese selezionato."}
        </p>
        <button
          className="primary-btn"
          onClick={() => setExportOpen((current) => !current)}
        >
          {exportOpen ? "Chiudi esportazione" : "Scegli cosa esportare"}
        </button>
        {exportOpen && (
          <section className="export-builder" aria-label="Componi esportazione">
            <div className="export-heading">
              <div>
                <p className="panel-kicker">Esportazione personalizzata</p>
                <h3>Componi il tuo file</h3>
              </div>
              <span>{selectedSectionCount} sezioni selezionate</span>
            </div>
            <fieldset>
              <legend>1. Periodo</legend>
              <div className="export-options">
                <label>
                  <input
                    type="radio"
                    name="exportPeriod"
                    checked={exportPeriod === "month"}
                    onChange={() => setExportPeriod("month")}
                  />{" "}
                  Mese selezionato
                </label>
                <label>
                  <input
                    type="radio"
                    name="exportPeriod"
                    checked={exportPeriod === "year"}
                    onChange={() => setExportPeriod("year")}
                  />{" "}
                  Anno {selectedYear}
                </label>
                <label>
                  <input
                    type="radio"
                    name="exportPeriod"
                    checked={exportPeriod === "all"}
                    onChange={() => setExportPeriod("all")}
                  />{" "}
                  Tutto lo storico
                </label>
              </div>
            </fieldset>
            <fieldset>
              <legend>2. Sezioni</legend>
              <div className="export-section-grid">
                {(
                  [
                    ["movements", "Movimenti"],
                    ["common", "Conti comuni"],
                    ["utilities", "Utenze"],
                    ["budgets", "Budget"],
                    ["goals", "Obiettivi"],
                    ["deadlines", "Scadenze"],
                    ["notes", "Note"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className={exportSections[key] ? "selected" : ""}
                  >
                    <input
                      type="checkbox"
                      checked={exportSections[key]}
                      onChange={() =>
                        setExportSections((current) => ({
                          ...current,
                          [key]: !current[key],
                        }))
                      }
                    />{" "}
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            {exportSections.movements && (
              <fieldset className="export-subsection">
                <legend>Movimenti · filtri</legend>
                <div className="export-filter-columns">
                  <div>
                    <b>Profili</b>
                    {(["Davide", "Francesca", "Comune"] as Person[]).map(
                      (item) => (
                        <label key={item}>
                          <input
                            type="checkbox"
                            checked={movementOwners.includes(item)}
                            onChange={() =>
                              toggleArrayValue(
                                item,
                                movementOwners,
                                setMovementOwners,
                              )
                            }
                          />{" "}
                          {item}
                        </label>
                      ),
                    )}
                  </div>
                  <div>
                    <b>Tipi</b>
                    {(["Entrata", "Spesa"] as Kind[]).map((item) => (
                      <label key={item}>
                        <input
                          type="checkbox"
                          checked={movementKinds.includes(item)}
                          onChange={() =>
                            toggleArrayValue(
                              item,
                              movementKinds,
                              setMovementKinds,
                            )
                          }
                        />{" "}
                        {item}
                      </label>
                    ))}
                  </div>
                  <div>
                    <b>Categorie</b>
                    <small>Nessuna selezione = tutte</small>
                    {allMovementCategories.map((item) => (
                      <label key={item}>
                        <input
                          type="checkbox"
                          checked={movementCategories.includes(item)}
                          onChange={() =>
                            toggleArrayValue(
                              item,
                              movementCategories,
                              setMovementCategories,
                            )
                          }
                        />{" "}
                        {item}
                      </label>
                    ))}
                  </div>
                </div>
              </fieldset>
            )}
            {exportSections.common && (
              <fieldset className="export-subsection">
                <legend>Conti comuni · filtri</legend>
                <div className="export-filter-columns">
                  <div>
                    <b>Conti</b>
                    <small>Nessuna selezione = tutti</small>
                    {allCommonAccounts.map((item) => (
                      <label key={item}>
                        <input
                          type="checkbox"
                          checked={commonAccountsFilter.includes(item)}
                          onChange={() =>
                            toggleArrayValue(
                              item,
                              commonAccountsFilter,
                              setCommonAccountsFilter,
                            )
                          }
                        />{" "}
                        {item}
                      </label>
                    ))}
                  </div>
                  <div>
                    <b>Tipi</b>
                    {(["Entrata", "Spesa"] as Kind[]).map((item) => (
                      <label key={item}>
                        <input
                          type="checkbox"
                          checked={commonDirections.includes(item)}
                          onChange={() =>
                            toggleArrayValue(
                              item,
                              commonDirections,
                              setCommonDirections,
                            )
                          }
                        />{" "}
                        {item}
                      </label>
                    ))}
                  </div>
                </div>
              </fieldset>
            )}
            {exportSections.utilities && (
              <fieldset className="export-subsection">
                <legend>Utenze · filtri</legend>
                <div className="export-filter-columns">
                  <div>
                    <b>Servizi</b>
                    <small>Nessuna selezione = tutti</small>
                    {allUtilityServices.map((item) => (
                      <label key={item}>
                        <input
                          type="checkbox"
                          checked={utilityServices.includes(item)}
                          onChange={() =>
                            toggleArrayValue(
                              item,
                              utilityServices,
                              setUtilityServices,
                            )
                          }
                        />{" "}
                        {item}
                      </label>
                    ))}
                  </div>
                </div>
              </fieldset>
            )}
            <div className="export-actions">
              <button
                className="secondary-btn"
                disabled={!selectedSectionCount}
                onClick={exportExcel}
              >
                ↓ Excel
              </button>
              <button
                className="primary-btn"
                disabled={!selectedSectionCount}
                onClick={exportPdf}
              >
                ↓ PDF
              </button>
            </div>
            <p className="form-note">
              Nel PDF si aprirà la schermata di stampa: scegli “Salva come PDF”.
              Il file Excel mantiene le sezioni selezionate in blocchi separati.
            </p>
          </section>
        )}
      </article>
      <article className="panel tip-card">
        <span>🗓️</span>
        <h3>Uno storico per mese</h3>
        <p>
          Ogni movimento viene assegnato automaticamente al report del mese
          indicato nella sua data.
        </p>
      </article>
      <article className="panel page-panel wide">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">Totali {selectedYear}</p>
            <h2>Spese per categoria</h2>
          </div>
        </div>
        {categoryTotals.length ? (
          <div className="category-bars">
            {categoryTotals.map(([category, amount]) => (
              <div key={category}>
                <div>
                  <span>{category}</span>
                  <strong>{euro.format(amount)}</strong>
                </div>
                <span>
                  <i style={{ width: `${(amount / maxCategory) * 100}%` }} />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="report-copy">
            I totali annuali compariranno quando registrerete le prime spese.
          </p>
        )}
      </article>
    </section>
  );
}
