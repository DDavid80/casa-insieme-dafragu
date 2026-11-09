(() => {
  const endpoint = "https://script.google.com/macros/s/AKfycbzDdamH7lUicUX2RzqqlHtKtSUxf9TNSdHjNNtnCGvFjPBkQVS07L3qf_qqrnHjhhGQ7A/exec";
  const core = new Set(["/api/movements","/api/notes","/api/settings","/api/utilities","/api/common-accounts","/api/planning","/api/chat","/api/finance-plans","/api/balance-adjustments"]);
  const originalFetch = window.fetch.bind(window);
  const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  const rows = (data, name) => Array.isArray(data[name]) ? data[name] : [];
  const snapshot = (path, data) => {
    if (path === "/api/movements") return { movements: rows(data,"movements").map(row => ({ ...row, amount: Number(row.amountCents || 0) / 100, ticketAmount: Number(row.ticketAmountCents || 0) / 100 })) };
    if (path === "/api/notes") return { notes: rows(data,"notes") };
    if (path === "/api/utilities") return { bills: rows(data,"utilityBills") };
    if (path === "/api/common-accounts") return { transactions: rows(data,"commonAccountTransactions") };
    if (path === "/api/planning") return { budgets: rows(data,"budgets"), goals: rows(data,"goals"), contributions: rows(data,"goalContributions"), deadlines: rows(data,"deadlines") };
    if (path === "/api/chat") return { messages: rows(data,"chatMessages") };
    if (path === "/api/balance-adjustments") return { adjustments: rows(data,"balanceAdjustments") };
    if (path === "/api/finance-plans") return { plans: rows(data,"personalPlans"), planPayments: rows(data,"personalPlanPayments").filter(row => !row.skipped), planAdjustments: rows(data,"personalPlanAdjustments"), debts: rows(data,"debts"), debtAdjustments: rows(data,"debtAdjustments"), debtPayments: rows(data,"debtPayments") };
    if (path === "/api/settings") {
      const setting = rows(data,"settings")[0] || {};
      let commonAccounts = ["N26","BBVA Dafragu","BBVA Utenze","Ticket Satispay"];
      try { const parsed = JSON.parse(setting.commonAccounts || "[]"); if (Array.isArray(parsed) && parsed.length) commonAccounts = parsed; } catch {}
      return { title: setting.title || "Casa Insieme", commonAccounts };
    }
  };
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.origin);
    if ((init.method || "GET").toUpperCase() !== "GET" || !core.has(url.pathname)) return originalFetch(input, init);
    const token = localStorage.getItem("dafragu-sheets-session");
    if (!token) return originalFetch(input, init);
    try {
      const r = await globalThis.fetch.call(globalThis, endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "backup:get", token }) });
      const body = await r.json();
      if (!body.ok || !body.data) return response({ error: body.error || "Archivio Google non disponibile" }, 503);
      return response(snapshot(url.pathname, body.data));
    } catch {
      return response({ error: "Archivio Google non disponibile" }, 503);
    }
  };
})();