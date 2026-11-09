import { loadDatabase, exportDatabase } from './browser-db';
import { routes } from './original-routes';
const ENDPOINT='https://script.google.com/macros/s/AKfycbzDdamH7lUicUX2RzqqlHtKtSUxf9TNSdHjNNtnCGvFjPBkQVS07L3qf_qqrnHjhhGQ7A/exec';
const TOKEN_KEY='dafragu-sheets-session';
const nativeFetch=window.fetch.bind(window);
const json=(d:unknown,status=200)=>new Response(JSON.stringify(d),{status,headers:{'Content-Type':'application/json'}});
let loaded=false,rawData:Record<string,any[]>={},queue=Promise.resolve();
async function remote(request:Record<string,any>){
 const r=await nativeFetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...request,token:localStorage.getItem(TOKEN_KEY)||''})});
 const d=await r.json();if(!d.ok)throw new Error(d.error||'Archivio Google non disponibile');return d;
}
async function reload(){const b=await remote({action:'backup:get'});if(!b.data||typeof b.data!=='object')throw new Error('Backup Google non valido');rawData=b.data;loaded=true;}
async function prepareWrite(){await reload();await loadDatabase(rawData);}
async function persist(before:Record<string,any[]>,after:Record<string,any[]>){
 // Update only records affected by the original Sites operation; never restore or replace the whole archive.
 for(const [collection,rows] of Object.entries(after)){
  const old=new Map((before[collection]||[]).map(r=>[String(r.id),r]));
  const current=new Map(rows.map(r=>[String(r.id),r]));
  for(const row of rows){const prev=old.get(String(row.id));if(!prev||JSON.stringify(prev)!==JSON.stringify(row))await remote({action:'records:put',collection,record:row});}
  for(const [id] of old)if(!current.has(id))await remote({action:'records:delete',collection,id});
 }
}
function snapshot(path:string){
 const rows=(name:string)=>Array.isArray(rawData[name])?rawData[name]:[];
 // Stessa forma delle rotte originali: importi in euro (non centesimi), stesso ordine e stessi limiti.
 // Senza questi campi (amount, limit, target, delta...) la dashboard non riesce a mostrare i dati.
 const euro=(cents:any)=>Number(cents??0)/100;
 const cmp=(a:any,b:any)=>a<b?-1:a>b?1:0;
 const sortBy=(list:any[],...order:Array<[string,'asc'|'desc']>)=>[...list].sort((x,y)=>{for(const [key,dir] of order){const c=dir==='asc'?cmp(x[key],y[key]):cmp(y[key],x[key]);if(c)return c;}return 0;});
 if(path==='/api/movements')return {movements:sortBy(rows('movements'),['date','desc'],['id','desc']).slice(0,500).map(row=>({...row,amount:euro(row.amountCents),ticketAmount:euro(row.ticketAmountCents)}))};
 if(path==='/api/notes')return {notes:sortBy(rows('notes'),['date','desc'],['id','desc']).slice(0,500)};
 if(path==='/api/utilities')return {bills:sortBy(rows('utilityBills'),['date','desc'],['id','desc']).slice(0,500).map(row=>({...row,amount:euro(row.amountCents),commonAccount:row.commonAccount??'BBVA Utenze'}))};
 if(path==='/api/common-accounts'){
  const personByMovement=new Map(rows('movements').map(row=>[row.id,row.person]));
  return {transactions:sortBy(rows('commonAccountTransactions'),['date','desc'],['id','desc']).slice(0,1000).map(row=>({...row,amount:euro(row.amountCents),person:personByMovement.get(row.sourceMovementId)??'Comune'}))};
 }
 if(path==='/api/planning')return {
  budgets:sortBy(rows('budgets'),['month','desc'],['category','asc']).map(row=>({...row,limit:euro(row.limitCents)})),
  goals:sortBy(rows('goals'),['id','desc']).map(row=>({...row,target:euro(row.targetCents)})),
  contributions:sortBy(rows('goalContributions'),['date','desc'],['id','desc']).map(row=>({...row,amount:euro(row.amountCents)})),
  deadlines:sortBy(rows('deadlines'),['date','asc'],['id','asc']),
 };
 if(path==='/api/chat')return {messages:sortBy(rows('chatMessages'),['id','asc']).slice(0,300)};
 if(path==='/api/finance-plans')return {
  plans:sortBy(rows('personalPlans'),['id','desc']),
  planPayments:sortBy(rows('personalPlanPayments'),['date','desc'],['id','desc']).filter(row=>!row.skipped),
  planAdjustments:sortBy(rows('personalPlanAdjustments'),['adjustedAt','desc'],['id','desc']),
  debts:sortBy(rows('debts'),['id','desc']),
  debtAdjustments:sortBy(rows('debtAdjustments'),['adjustedAt','desc'],['id','desc']),
  debtPayments:sortBy(rows('debtPayments'),['date','desc'],['id','desc']),
  schedules:sortBy(rows('scheduledMovements'),['id','desc']),
 };
 if(path==='/api/balance-adjustments')return {adjustments:sortBy(rows('balanceAdjustments'),['date','desc'],['id','desc']).map(row=>({...row,delta:euro(row.deltaCents),resultingBalance:euro(row.resultingBalanceCents)}))};
 if(path==='/api/settings'){
  const setting=rows('settings')[0]??{};let commonAccounts=['N26','BBVA Dafragu','BBVA Utenze','Ticket Satispay'];
  try{const parsed=JSON.parse(setting.commonAccounts??'[]');if(Array.isArray(parsed)&&parsed.length)commonAccounts=parsed;}catch{}
  return {title:setting.title??'Casa Insieme',commonAccounts};
 }
 return null;
}
async function handle(input:RequestInfo|URL,init?:RequestInit){
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin);
 const method=init?.method||'GET';
 if(url.pathname==='/api/security'){
  if(method==='DELETE'){localStorage.removeItem(TOKEN_KEY);loaded=false;return json({locked:true});}
  const state=await nativeFetch(ENDPOINT).then(r=>r.json());
  if(method==='GET'){
   let unlocked=false;if(localStorage.getItem(TOKEN_KEY)){try{await reload();unlocked=true;}catch{localStorage.removeItem(TOKEN_KEY);}}
   return json({configured:!!state.configured,unlocked,recoveryConfigured:false});
  }
  const body=JSON.parse(String(init?.body||'{}'));
  if(body.mode&& !['unlock','setup'].includes(body.mode))return json({error:'Password e recupero devono essere configurati separatamente nel nuovo archivio.'},501);
  const d=await remote({action:state.configured?'unlock':'setup',password:body.password});
  localStorage.setItem(TOKEN_KEY,d.token);loaded=false;return json({unlocked:true});
 }
 if(!localStorage.getItem(TOKEN_KEY))return json({error:'Accesso richiesto'},401);
 const route=routes[url.pathname];if(!route?.[method])return json({error:'Operazione non disponibile sul nuovo archivio'},501);
 if(!loaded)await reload();
 if(method==='GET'){const cached=snapshot(url.pathname);if(cached)return json(cached);}
 if(method!=='GET')await prepareWrite();else await loadDatabase(rawData);
 const before=await exportDatabase();
 const req=new Request(url.href,{...init,method});
 const result:Response=await route[method](req);
 if(!result.ok){await loadDatabase(before);return result;}
 try{const after=await exportDatabase();await persist(before,after);rawData=after;}catch(e){loaded=false;throw e;}
 return result;
}
export function installSheetsApi(){
 window.fetch=((input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin);
  if(!url.pathname.startsWith('/api/'))return nativeFetch(input,init);
  const pending=queue.then(()=>handle(input,init)).catch(e=>json({error:e instanceof Error?e.message:'Errore archivio'},500));
  queue=pending.then(()=>undefined);return pending;
 }) as typeof window.fetch;
}
