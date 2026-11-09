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
 if(path==='/api/movements')return {movements:rows('movements').map(row=>({...row,amount:Number(row.amountCents??0)/100,ticketAmount:Number(row.ticketAmountCents??0)/100}))};
 if(path==='/api/notes')return {notes:rows('notes')};
 if(path==='/api/utilities')return {bills:rows('utilityBills')};
 if(path==='/api/common-accounts')return {transactions:rows('commonAccountTransactions')};
 if(path==='/api/planning')return {budgets:rows('budgets'),goals:rows('goals'),contributions:rows('goalContributions'),deadlines:rows('deadlines')};
 if(path==='/api/chat')return {messages:rows('chatMessages')};
 if(path==='/api/finance-plans')return {plans:rows('personalPlans'),planPayments:rows('personalPlanPayments').filter(row=>!row.skipped),planAdjustments:rows('personalPlanAdjustments'),debts:rows('debts'),debtAdjustments:rows('debtAdjustments'),debtPayments:rows('debtPayments')};
 if(path==='/api/balance-adjustments')return {adjustments:rows('balanceAdjustments')};
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
