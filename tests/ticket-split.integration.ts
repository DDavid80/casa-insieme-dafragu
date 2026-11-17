import assert from 'node:assert/strict';
import {loadDatabase,exportDatabase} from '../parallel-ui/browser-db';
import {POST,PATCH} from '../app/api/movements/route';
import {GET as plans} from '../app/api/finance-plans/route';
const base={kind:'Spesa',description:'Test ticket',category:'Supermercato',person:'Comune',commonAccount:'REVOLUT',amount:59.62,ticketAmount:55,date:'2026-11-14'};
const request=(body:any)=>new Request('https://test/api/movements',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
await loadDatabase({});
let res=await POST(request(base)); assert.equal(res.status,201); const id=(await res.json()).movement.id;
async function check(bank:number,ticket:number,total:number){const d=await exportDatabase();const tx=d.commonAccountTransactions.filter(t=>t.sourceMovementId===id);assert.equal(tx.filter(t=>t.account==='REVOLUT').reduce((s,t)=>s+t.amountCents,0),bank);assert.equal(tx.filter(t=>t.account==='Ticket Satispay').reduce((s,t)=>s+t.amountCents,0),ticket);assert.equal(d.movements.find(m=>m.id===id).amountCents,total);assert.equal(tx.length,ticket?2:1);}
await check(462,5500,5962);
for(const ticketAmount of [55,20,0,59.62,55]) {res=await PATCH(request({...base,id,ticketAmount}));assert.equal(res.status,200);await check(5962-Math.round(ticketAmount*100),Math.round(ticketAmount*100),5962);}
res=await PATCH(request({...base,id,ticketAmount:60}));assert.equal(res.status,400);await check(462,5500,5962);
await loadDatabase({});res=await POST(request({...base,kind:'Entrata',ticketAmount:0}));assert.equal(res.status,201);let d=await exportDatabase();assert.equal(d.commonAccountTransactions[0].amountCents,5962);
await loadDatabase({scheduledMovements:[{id:1,name:'Ricorrenza test',kind:'Spesa',category:'Supermercato',person:'Comune',commonAccount:'REVOLUT',amountCents:5962,ticketAmountCents:5500,dayOfMonth:1,startDate:'2026-11-01',endDate:'2026-11-01',active:true,author:'Davide'}]});
res=await plans(new Request('https://test/api/finance-plans'));assert.equal(res.status,200);d=await exportDatabase();assert.equal(d.commonAccountTransactions.find(t=>t.account==='REVOLUT').amountCents,462);assert.equal(d.commonAccountTransactions.find(t=>t.account==='Ticket Satispay').amountCents,5500);assert.equal(d.movements[0].amountCents,5962);
console.log('PASS: create, repeated edits, zero/full ticket, validation, income and recurring split');
// Reordering changes the settings list only: transactions must keep their accounts.
const {PATCH:settingsPatch}=await import('../app/api/settings/route');
await loadDatabase({settings:[{id:1,title:'Casa',commonAccounts:JSON.stringify(['N26','REVOLUT'])}],movements:[{id:1,...base,amountCents:5962,ticketAmountCents:5500}],commonAccountTransactions:[{id:1,account:'REVOLUT',direction:'Spesa',description:'Test',category:'Supermercato',amountCents:462,date:'2026-11-14',sourceMovementId:1}]});
const before=await exportDatabase();
res=await settingsPatch(request({mode:'reorder',title:'Casa',commonAccounts:['REVOLUT','N26']}));assert.equal(res.status,200);d=await exportDatabase();assert.deepEqual(d.movements,before.movements);assert.deepEqual(d.commonAccountTransactions,before.commonAccountTransactions);assert.deepEqual(JSON.parse(d.settings[0].commonAccounts),['REVOLUT','N26']);
res=await settingsPatch(request({mode:'reorder',title:'Casa',commonAccounts:['REVOLUT','Other']}));assert.equal(res.status,409);
res=await POST(request({...base,commonAccount:''}));assert.equal(res.status,400);
res=await POST(request({...base,commonAccount:'Ticket Satispay'}));assert.equal(res.status,400);
console.log('PASS: persistent reordering preserves all financial records; missing/mixed accounts rejected');
// Renaming includes opening balances and survives swapped names without merging accounts.
await loadDatabase({settings:[{id:1,title:'Casa',commonAccounts:JSON.stringify(['N26','REVOLUT'])}],balanceAdjustments:[{id:1,account:'N26',deltaCents:0,resultingBalanceCents:10000,date:'2026-11-01',note:'Base',author:'Davide'}],commonAccountTransactions:[{id:1,account:'N26',direction:'Spesa',description:'Test',category:'Altro',amountCents:1000,date:'2026-11-14'},{id:2,account:'REVOLUT',direction:'Entrata',description:'Test2',category:'Altro',amountCents:5000,date:'2026-11-14'}]});
res=await settingsPatch(request({title:'Casa',expectedAccounts:['N26','REVOLUT'],commonAccounts:['Viaggi','REVOLUT']}));assert.equal(res.status,200);d=await exportDatabase();assert.equal(d.balanceAdjustments[0].account,'Viaggi');assert.equal(d.balanceAdjustments[0].resultingBalanceCents,10000);assert.equal(d.commonAccountTransactions[0].account,'Viaggi');
res=await settingsPatch(request({title:'Casa',expectedAccounts:['N26','REVOLUT'],commonAccounts:['Wrong','REVOLUT']}));assert.equal(res.status,409);
res=await settingsPatch(request({title:'Casa',expectedAccounts:['Viaggi','REVOLUT'],commonAccounts:['REVOLUT','Viaggi']}));assert.equal(res.status,200);d=await exportDatabase();assert.equal(d.commonAccountTransactions[0].account,'REVOLUT');assert.equal(d.commonAccountTransactions[1].account,'Viaggi');assert.equal(d.balanceAdjustments[0].account,'REVOLUT');
console.log('PASS: rename preserves balance references, simultaneous swaps and stale settings guard');
const {POST:commonPost,PATCH:commonPatch,DELETE:commonDelete}=await import('../app/api/common-accounts/route');
await loadDatabase({settings:[{id:1,title:'Casa',commonAccounts:JSON.stringify(['Ricaricabile BPER','REVOLUT','N26'])}]});
res=await commonPost(request({kind:'Trasferimento',account:'Ricaricabile BPER',destinationAccount:'REVOLUT',amount:50,date:'2026-11-13'}));assert.equal(res.status,201,await res.clone().text());let transfer=await res.json();d=await exportDatabase();assert.equal(d.movements.length,2);assert.equal(d.commonAccountTransactions.length,2);assert.equal(d.movements.every(m=>m.person==='Comune'&&m.category==='Trasferimento interno'&&m.transferId),true);assert.equal(d.commonAccountTransactions.reduce((n,t)=>n+(t.direction==='Entrata'?t.amountCents:-t.amountCents),0),0);for(const t of d.commonAccountTransactions)assert.equal(d.movements.find(m=>m.id===t.sourceMovementId)?.commonAccount,t.account);
res=await commonPatch(request({id:transfer.transactions[0].id,account:'Ricaricabile BPER',kind:'Spesa',description:'Ricarica Revolut',category:'Altro',amount:60,date:'2026-11-14'}));assert.equal(res.status,200);d=await exportDatabase();assert.equal(d.commonAccountTransactions.every(t=>t.amountCents===6000),true);assert.equal(d.movements.every(t=>t.amountCents===6000),true);
res=await commonPost(request({kind:'Trasferimento',account:'REVOLUT',destinationAccount:'REVOLUT',amount:50,date:'2026-11-13'}));assert.equal(res.status,400);
res=await commonDelete(new Request('https://test/api/common-accounts?id='+transfer.transactions[0].id,{method:'DELETE'}));assert.equal(res.status,200);d=await exportDatabase();assert.equal(d.movements.length,0);assert.equal(d.commonAccountTransactions.length,0);
console.log('PASS: transfers create paired debit/credit, preserve references, edit both sides, reject same account and delete both sides');
await loadDatabase({utilityBills:[{id:1,movementId:99,provider:'Prime Video',service:'Streaming',amountCents:4990,wallet:'Davide',date:'2025-11-01',billingFrequency:'annual',recurring:true}]});
res=await plans(new Request('https://test/api/finance-plans'));assert.equal(res.status,200,await res.clone().text());res=await plans(new Request('https://test/api/finance-plans'));d=await exportDatabase();assert.equal(d.utilityBills.length,2);assert.equal(d.movements.length,1);assert.equal(d.movements[0].date,'2026-11-01');assert.equal(d.movements[0].amountCents,4990);
await loadDatabase({scheduledMovements:[{id:3,name:'GOOGLE',kind:'Spesa',category:'Utenze',person:'Francesca',commonAccount:'PREPAGATA Mediolanum',amountCents:999,dayOfMonth:14,startDate:'2026-11-14',active:true,author:'Francesca'}]});
await plans(new Request('https://test/api/finance-plans'));await plans(new Request('https://test/api/finance-plans'));d=await exportDatabase();assert.equal(d.movements.length,1);assert.equal(d.commonAccountTransactions.length,1);assert.equal(d.commonAccountTransactions[0].direction,'Spesa');assert.equal(d.commonAccountTransactions[0].amountCents,999);
console.log('PASS: annual renewal and monthly prepaid generation are idempotent');
