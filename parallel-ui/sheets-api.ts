const ENDPOINT = 'https://script.google.com/macros/s/AKfycbzDdamH7lUicUX2RzqqlHtKtSUxf9TNSdHjNNtnCGvFjPBkQVS07L3qf_qqrnHjhhGQ7A/exec';
const TOKEN_KEY = 'dafragu-sheets-session';
const nativeFetch = window.fetch.bind(window);
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const token = () => localStorage.getItem(TOKEN_KEY) || '';
async function remote(request: Record<string, unknown>) {
  const response = await nativeFetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...request, token: request.token || token() }) });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || 'Archivio Google non disponibile');
  return data;
}
async function records(collection: string) { return (await remote({ action: 'records:list', collection })).records || []; }
function body(init?: RequestInit) { try { return init?.body ? JSON.parse(String(init.body)) : {}; } catch { return {}; } }
function collectionEndpoint(path: string) {
  return ({ '/api/movements':'movements','/api/notes':'notes','/api/utilities':'utilityBills','/api/common-accounts':'commonAccountTransactions','/api/balance-adjustments':'balanceAdjustments','/api/duplicate-acknowledgements':'duplicateAcknowledgements','/api/chat':'chatMessages','/api/decisions':'decisions' } as Record<string,string>)[path];
}
function shape(path: string, rows: any[]) {
  if (path === '/api/movements') return { movements: rows };
  if (path === '/api/notes') return { notes: rows };
  if (path === '/api/utilities') return { bills: rows };
  if (path === '/api/common-accounts') return { transactions: rows };
  if (path === '/api/balance-adjustments') return { adjustments: rows };
  if (path === '/api/duplicate-acknowledgements') return { acknowledgements: rows };
  if (path === '/api/chat') return { messages: rows };
  if (path === '/api/decisions') return { decisions: rows };
  return {};
}
export function installSheetsApi() {
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(raw, window.location.origin); const path = url.pathname;
    if (!path.startsWith('/api/')) return nativeFetch(input, init);
    try {
      if (path === '/api/security') {
        const state = await nativeFetch(ENDPOINT).then(r => r.json());
        if ((init?.method || 'GET') === 'GET') return json({ configured: Boolean(state.configured), unlocked: Boolean(token()), recoveryConfigured: false });
        if (init?.method === 'DELETE') { localStorage.removeItem(TOKEN_KEY); return json({ locked: true }); }
        const data = body(init); const action = state.configured ? 'unlock' : 'setup'; const result = await remote({ action, password: data.password }); localStorage.setItem(TOKEN_KEY, result.token); return json({ unlocked: true });
      }
      const collection = collectionEndpoint(path);
      if (collection) {
        if ((init?.method || 'GET') === 'GET') return json(shape(path, await records(collection)));
        if (init?.method === 'DELETE') { await remote({ action:'records:delete', collection, id:url.searchParams.get('id') || body(init).id }); return json({ ok:true }); }
        const record = body(init); if (!record.id) record.id = crypto.randomUUID(); await remote({ action:'records:put', collection, record }); return json(path === '/api/movements' ? { movement: record } : path === '/api/notes' ? { note: record } : { ok:true, record }, 201);
      }
      if (path === '/api/settings') { const settings = await records('settings'); const setting = settings[0] || {}; return json({ title: setting.title || 'Dafragu Home', commonAccounts: setting.commonAccounts || ['N26','BBVA Dafragu','BBVA Utenze','Ticket Satispay'], settings: setting }); }
      if (path === '/api/planning') { const [budgets,goals,contributions,deadlines] = await Promise.all(['budgets','goals','goalContributions','deadlines'].map(records)); return json({ budgets,goals,contributions,deadlines }); }
      if (path === '/api/finance-plans') { const [plans,planPayments,planAdjustments,debts,debtPayments] = await Promise.all(['personalPlans','personalPlanPayments','personalPlanAdjustments','debts','debtPayments'].map(records)); return json({ plans,planPayments,planAdjustments,debts,debtPayments }); }
      if (path === '/api/travel') { const [trips,expenses,repayments] = await Promise.all(['trips','tripExpenses','tripRepayments'].map(records)); return json({ trips,expenses,repayments }); }
      if (path === '/api/insurance-plans') { const plans = await records('insurancePlans'); return json({ plans }); }
      if (path === '/api/backup') { const result = await remote({ action:'backup:get' }); return json(result); }
      return json({ error: `Funzione parallela non ancora migrata: ${path}` }, 501);
    } catch (error) { return json({ error: error instanceof Error ? error.message : 'Errore di collegamento' }, 500); }
  }) as typeof window.fetch;
}
