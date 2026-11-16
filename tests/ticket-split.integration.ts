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
