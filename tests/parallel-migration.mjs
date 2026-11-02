import {createRequire} from 'node:module';globalThis.require=createRequire(import.meta.url);
import fs from 'node:fs';import assert from 'node:assert/strict';
const e=await import('../.parallel-test-build/engine.mjs');
const file=process.argv[2];if(!file)throw Error('Passare il percorso dello snapshot privato');
const parsed=JSON.parse(fs.readFileSync(file));const raw=parsed.data??parsed;
await e.loadDatabase(raw);let n=0;
for(const [k,rows]of Object.entries(raw)){const out=(await e.exportDatabase())[k];assert.equal(out.length,rows.length,k);for(const r of rows){const a=out.find(x=>x.id===r.id);for(const [f,v]of Object.entries(r))assert.deepEqual(a[f],v,`${k}/${r.id}/${f}`);}n+=rows.length;}
console.log('Confronto completo:',n,'record identici campo per campo');
const get=async path=>{const res=await e.routes[path].GET(new Request('https://test.invalid'+path));const d=await res.json();assert.equal(res.status,200,JSON.stringify(d));return d;};
const data={};for(const path of Object.keys(e.routes)){data[path]=await get(path);console.log('OK',path);}
const tx=data['/api/common-accounts'].transactions,adj=data['/api/balance-adjustments'].adjustments;
const dt=new Date().toISOString().slice(0,10),accounts=data['/api/settings'].commonAccounts;
for(const account of accounts){
 const rawAdj=(raw.balanceAdjustments||[]).filter(r=>r.account===account&&r.date<=dt).sort((a,b)=>b.date.localeCompare(a.date)||(b.createdAt||'').localeCompare(a.createdAt||'')||b.id-a.id)[0];
 const rawTotal=(rawAdj?.resultingBalanceCents||0)+(raw.commonAccountTransactions||[]).filter(t=>t.account===account&&t.date<=dt&&(!rawAdj||t.date>rawAdj.date||(t.date===rawAdj.date&&t.createdAt>rawAdj.createdAt))).reduce((n,t)=>n+(t.direction==='Entrata'?t.amountCents:-t.amountCents),0);
 const a=adj.filter(r=>r.account===account&&r.date<=dt).sort((a,b)=>b.date.localeCompare(a.date)||(b.createdAt||'').localeCompare(a.createdAt||'')||b.id-a.id)[0];
 const total=(a?.resultingBalance||0)+tx.filter(t=>t.account===account&&t.date<=dt&&(!a||t.date>a.date||(t.date===a.date&&t.createdAt>a.createdAt))).reduce((n,t)=>n+(t.direction==='Entrata'?t.amount:-t.amount),0);
 assert.equal(Math.round(total*100),rawTotal,account);console.log('SALDO OK',account,(rawTotal/100).toFixed(2));
}
const before=await e.exportDatabase();await get('/api/finance-plans');const after=await e.exportDatabase();assert.deepEqual(after,before,'Automatismi idempotenti');
for(const r of data['/api/movements'].movements)assert.equal(Math.round(r.amount*100),raw.movements.find(x=>x.id===r.id).amountCents);
for(const r of data['/api/utilities'].bills)assert.equal(Math.round(r.amount*100),raw.utilityBills.find(x=>x.id===r.id).amountCents);
for(const r of data['/api/travel'].trips)assert.equal(Math.round(r.budget*100),raw.trips.find(x=>x.id===r.id).budgetCents);
assert.equal(data['/api/finance-plans'].schedules.length,raw.scheduledMovements.length);
assert.equal(data['/api/finance-plans'].debtAdjustments.length,raw.debtAdjustments?.length||0);
assert.equal(data['/api/insurance-plans'].plans[0].name,JSON.parse(raw.insurancePlans.find(r=>!r.id.startsWith('system-')).data).name);
const call=async(path,method,p)=>{const r=await e.routes[path][method](new Request('https://test.invalid'+path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(p)}));const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;};
await e.loadDatabase(raw);
const m=await call('/api/movements','POST',{kind:'Spesa',person:'Davide',description:'test',category:'Altro',amount:12.34,date:dt,commonAccount:'BBVA Dafragu'});
assert.equal(m.movement.amount,12.34);let s=await e.exportDatabase();assert.ok(s.commonAccountTransactions.some(t=>t.sourceMovementId===m.movement.id&&t.direction==='Entrata'&&t.amountCents===1234));
{const r=await e.routes['/api/movements'].DELETE(new Request('https://test.invalid/api/movements?id='+m.movement.id,{method:'DELETE'}));assert.ok(r.ok,await r.text());}s=await e.exportDatabase();assert.ok(!s.movements.some(t=>t.id===m.movement.id));assert.ok(!s.commonAccountTransactions.some(t=>t.sourceMovementId===m.movement.id));
console.log('OK inserimento, effetti contabili ed eliminazione su copia in memoria. Nessuna scrittura sui dati reali.');
