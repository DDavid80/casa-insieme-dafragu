const API_URL = 'https://script.google.com/macros/s/AKfycbzDdamH7lUicUX2RzqqlHtKtSUxf9TNSdHjNNtnCGvFjPBkQVS07L3qf_qqrnHjhhGQ7A/exec';
const tokenKey = 'dafragu-google-sheets-token';
const euro = new Intl.NumberFormat('it-IT', {style:'currency', currency:'EUR'});
const dateFmt = new Intl.DateTimeFormat('it-IT', {day:'numeric', month:'short', year:'numeric'});
const access = document.querySelector('#access'), dash = document.querySelector('#dashboard');
const copy = document.querySelector('#access-copy'), form = document.querySelector('#access-form'), error = document.querySelector('#access-error');

async function api(body) {
  const response = await fetch(API_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(body)});
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || 'Il servizio dati non risponde');
  return payload;
}
function amount(value){return euro.format(Number(value || 0));}
function monthLabel(d){return new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'}).format(d);}
function addRow(target, title, subtitle, value, tone){const t=document.querySelector('#row-template').content.cloneNode(true);t.querySelector('b').textContent=title;t.querySelector('small').textContent=subtitle||'';const valueNode=t.querySelector('strong');valueNode.textContent=value;if(tone)valueNode.classList.add(tone);target.append(t)}
function empty(target,text){target.textContent='';const n=document.createElement('p');n.textContent=text;n.style.color='var(--muted)';target.append(n)}
async function list(collection, token){ return (await api({action:'records:list',collection,token})).records || []; }

async function loadDashboard(){
  const token=localStorage.getItem(tokenKey); if(!token) return;
  copy.textContent='Carico i dati condivisi…'; error.textContent='';
  const names=['movements','commonAccountTransactions','scheduledMovements','utilityBills'];
  const [movements,accounts,schedules,utilities] = await Promise.all(names.map(n=>list(n,token)));
  const now=new Date(), key=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const current=movements.filter(m=>String(m.date||'').startsWith(key));
  const income=current.filter(m=>m.kind==='Entrata').reduce((sum,m)=>sum+Number(m.amount||0),0);
  const expense=current.filter(m=>m.kind==='Spesa').reduce((sum,m)=>sum+Number(m.amount||0),0);
  document.querySelector('#period-label').textContent=monthLabel(now);
  document.querySelector('#income').textContent=amount(income);document.querySelector('#expense').textContent=amount(expense);document.querySelector('#saving').textContent=amount(income-expense);document.querySelector('#movement-total').textContent=movements.length;
  document.querySelector('#income-count').textContent=`${current.filter(m=>m.kind==='Entrata').length} entrate nel periodo`;document.querySelector('#expense-count').textContent=`${current.filter(m=>m.kind==='Spesa').length} spese nel periodo`;
  const mbox=document.querySelector('#movements');mbox.textContent='';movements.sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,8).forEach(m=>addRow(mbox,m.description||'Movimento',`${m.category||'Senza categoria'} · ${m.person||''} · ${m.date||''}`,`${m.kind==='Entrata'?'+':'−'} ${amount(m.amount)}`,m.kind==='Entrata'?'positive':'negative'));if(!movements.length)empty(mbox,'Nessun movimento importato.');
  const abox=document.querySelector('#accounts');abox.textContent='';const balances={};accounts.forEach(t=>balances[t.account]=(balances[t.account]||0)+(t.direction==='Entrata'?1:-1)*Number(t.amount||0));Object.entries(balances).sort().forEach(([name,value])=>addRow(abox,name,'Saldo calcolato dai movimenti',amount(value),value>=0?'positive':'negative'));if(!Object.keys(balances).length)empty(abox,'Nessun conto comune importato.');
  const sbox=document.querySelector('#schedules');sbox.textContent='';schedules.filter(s=>s.active!==false).slice(0,7).forEach(s=>addRow(sbox,s.name||'Movimento ricorrente',`Il giorno ${s.dayOfMonth||'—'} · ${s.person||''}`,amount(s.amount)));if(!sbox.children.length)empty(sbox,'Nessun automatismo attivo.');
  const ubox=document.querySelector('#utilities');ubox.textContent='';utilities.sort((a,b)=>String(b.date||b.dueDate).localeCompare(String(a.date||a.dueDate))).slice(0,7).forEach(u=>addRow(ubox,u.provider||u.description||'Bolletta',u.date||u.dueDate||'Data non disponibile',amount(u.amount||u.amountDue)));if(!ubox.children.length)empty(ubox,'Nessuna bolletta importata.');
  access.hidden=true;dash.hidden=false;document.querySelector('#refresh').hidden=false;
}
async function init(){
  try {const state=await fetch(API_URL).then(r=>r.json());copy.textContent=state.configured?'Inserisci la password della dashboard per aprire l’archivio condiviso.':'Primo accesso: scegli una password di almeno 8 caratteri per proteggere la copia GitHub.';form.hidden=false;form.dataset.setup=String(!state.configured);if(localStorage.getItem(tokenKey)) await loadDashboard();}catch(e){copy.textContent='Non riesco a raggiungere l’archivio Google.';error.textContent=e.message;}
}
form.addEventListener('submit',async e=>{e.preventDefault();error.textContent='';const password=document.querySelector('#password').value;try{const result=await api({action:form.dataset.setup==='true'?'setup':'unlock',password});localStorage.setItem(tokenKey,result.token);await loadDashboard();}catch(e){error.textContent=e.message;}});
document.querySelector('#refresh').addEventListener('click',()=>loadDashboard().catch(e=>alert(e.message)));
init();
