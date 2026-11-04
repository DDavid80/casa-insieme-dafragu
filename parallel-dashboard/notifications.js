(() => {
  const SCRIPT = document.currentScript;
  const BASE = new URL('.', SCRIPT && SCRIPT.src || location.href).href;
  const PREFS_KEY = 'casa_notify_prefs_v1';
  const FLAG_PREFIX = 'casa_notify_flag_';
  const DEFAULTS = { enabled:false, deadlines:true, deadlineDays:7, automatic:true, automaticDays:2, budget:true, budgetThreshold:80, lowBalances:true, lowBalance:50 };

  const clamp = (value, min, max, fallback) => Math.max(min, Math.min(max, Number(value) || fallback));
  const todayKey = () => { const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const dateAtNoon = value => { const d = new Date(String(value||'')+'T12:00:00'); return Number.isNaN(d.getTime()) ? null : d; };
  const daysUntil = value => { const date = dateAtNoon(value); if (!date) return null; const now = dateAtNoon(todayKey()); return Math.ceil((date-now)/86400000); };
  const loadPrefs = () => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY)||'{}') }; } catch (_) { return { ...DEFAULTS }; } };
  const savePrefs = prefs => localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const once = key => { const storageKey = FLAG_PREFIX + key + '_' + todayKey(); if (localStorage.getItem(storageKey)) return false; localStorage.setItem(storageKey,'1'); return true; };

  function injectHead() {
    if (!document.querySelector('link[rel="manifest"]')) { const link=document.createElement('link'); link.rel='manifest'; link.href=BASE+'manifest.webmanifest'; document.head.appendChild(link); }
    [['theme-color','#0f171d'],['apple-mobile-web-app-capable','yes'],['apple-mobile-web-app-status-bar-style','black-translucent'],['apple-mobile-web-app-title','Casa DaFragu']].forEach(([name,content])=>{if(!document.querySelector('meta[name="'+name+'"]')){const meta=document.createElement('meta');meta.name=name;meta.content=content;document.head.appendChild(meta);}});
    if (!document.querySelector('link[rel="apple-touch-icon"]')) { const icon=document.createElement('link'); icon.rel='apple-touch-icon'; icon.href=BASE+'icon.svg'; document.head.appendChild(icon); }
  }
  async function registerSW() {
    if (!('serviceWorker' in navigator)) return null;
    try { return await navigator.serviceWorker.register(BASE+'sw.js', {scope:BASE}); } catch (error) { console.warn('[Casa notify] service worker',error); return null; }
  }
  async function permission() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission !== 'default') return Notification.permission;
    try { return await Notification.requestPermission(); } catch (_) { return 'denied'; }
  }
  async function show(title, body, data={}) {
    const prefs=loadPrefs(); if (!prefs.enabled && !data.force) return {ok:false,reason:'disabled'};
    const granted=await permission(); if (granted!=='granted') return {ok:false,reason:'permission:'+granted};
    const options={body:body||'',icon:BASE+'icon.svg',badge:BASE+'icon.svg',tag:data.tag||'casa-'+Date.now(),renotify:true,requireInteraction:!!data.force,vibrate:[120,60,120],data:{url:data.url||BASE}};
    try { let sw=await registerSW(); if(sw){try{sw=await navigator.serviceWorker.ready;}catch(_){} if(sw && sw.showNotification){await sw.showNotification(title,options);return {ok:true,via:'service-worker'};}} new Notification(title,options);return {ok:true,via:'notification-api'}; } catch(error) { return {ok:false,reason:String(error&&error.message||error)}; }
  }
  async function backup() {
    const response=await fetch('/api/backup'); if(!response.ok) throw new Error('Dati non disponibili'); const payload=await response.json(); return payload.data||{};
  }
  function nextMonthlyDate(day) {
    const now=dateAtNoon(todayKey()); let d=new Date(now.getFullYear(),now.getMonth(),Math.max(1,Math.min(28,Number(day)||1)),12);
    if(d<now) d=new Date(now.getFullYear(),now.getMonth()+1,Math.max(1,Math.min(28,Number(day)||1)),12);
    return d.toISOString().slice(0,10);
  }
  function upcomingAutomatic(data, threshold) {
    const rows=[];
    (data.scheduledMovements||[]).filter(x=>x.active).forEach(x=>{const date=nextMonthlyDate(x.dayOfMonth);const days=daysUntil(date);if(days!==null&&days<=threshold)rows.push({name:x.name||'Uscita automatica',date,days});});
    (data.personalPlans||[]).filter(x=>x.active&&x.automatic&&x.paymentTiming!=='libera').forEach(x=>{const date=nextMonthlyDate(x.dayOfMonth);const days=daysUntil(date);if(days!==null&&days<=threshold)rows.push({name:x.name||'PAC / piano',date,days});});
    (data.debts||[]).filter(x=>x.active&&x.automatic&&!x.variable).forEach(x=>{const date=nextMonthlyDate(x.dayOfMonth);const days=daysUntil(date);if(days!==null&&days<=threshold)rows.push({name:x.name||'Rata',date,days});});
    return rows.sort((a,b)=>a.date.localeCompare(b.date));
  }
  function currentBalances(data) {
    const result=new Map(); const today=todayKey();
    (data.balanceAdjustments||[]).filter(x=>x.date<=today).sort((a,b)=>String(a.date).localeCompare(String(b.date))).forEach(x=>result.set(x.account,Number(x.resultingBalanceCents||0)/100));
    (data.commonAccountTransactions||[]).filter(x=>x.date<=today).forEach(x=>result.set(x.account,(result.get(x.account)||0)+(x.direction==='Entrata'?1:-1)*Number(x.amountCents||0)/100));
    return [...result.entries()];
  }
  async function reminders() {
    const prefs=loadPrefs(); if(!prefs.enabled || !('Notification' in window) || Notification.permission!=='granted') return;
    let data; try { data=await backup(); } catch (_) { return; }
    if(prefs.deadlines){const alert=(data.deadlines||[]).filter(x=>!x.completed).map(x=>({...x,days:daysUntil(x.date)})).filter(x=>x.days!==null&&x.days>=0&&x.days<=clamp(prefs.deadlineDays,1,90,7)).sort((a,b)=>a.days-b.days)[0];if(alert&&once('deadline-'+alert.id+'-'+alert.days))show('Scadenza Casa DaFragu',alert.days===0?alert.title+' scade oggi.':alert.title+' scade tra '+alert.days+' giorni.',{tag:'casa-deadline-'+alert.id});}
    if(prefs.automatic){const alert=upcomingAutomatic(data,clamp(prefs.automaticDays,0,31,2))[0];if(alert&&once('automatic-'+alert.name+'-'+alert.date))show('Uscita automatica in arrivo',alert.days===0?alert.name+' è prevista oggi.':alert.name+' è prevista tra '+alert.days+' giorni.',{tag:'casa-auto-'+alert.date});}
    if(prefs.budget){const month=todayKey().slice(0,7), threshold=clamp(prefs.budgetThreshold,1,100,80);const alert=(data.budgets||[]).filter(x=>x.month===month).map(x=>{const spent=(data.movements||[]).filter(m=>m.kind==='Spesa'&&m.category===x.category&&String(m.date).startsWith(month)).reduce((n,m)=>n+Number(m.amountCents||0),0);return {name:x.category,ratio:Number(x.limitCents||0)?spent/Number(x.limitCents||0)*100:0};}).filter(x=>x.ratio>=threshold).sort((a,b)=>b.ratio-a.ratio)[0];if(alert&&once('budget-'+month+'-'+alert.name))show('Budget da controllare',alert.name+' è al '+Math.round(alert.ratio)+'% del limite.',{tag:'casa-budget-'+month});}
    if(prefs.lowBalances){const alert=currentBalances(data).filter(([,amount])=>amount<clamp(prefs.lowBalance,0,5000,50)).sort((a,b)=>a[1]-b[1])[0];if(alert&&once('balance-'+alert[0]))show('Conto sotto soglia',alert[0]+' è a '+new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(alert[1])+'.',{tag:'casa-balance-'+alert[0]});}
  }
  function styles(){if(document.getElementById('casa-notify-style'))return;const style=document.createElement('style');style.id='casa-notify-style';style.textContent=`
    #casaNotifyPanel{display:none;position:fixed;inset:0;z-index:1000;background:rgba(8,13,22,.62);align-items:flex-end;justify-content:center;padding:12px;backdrop-filter:blur(5px)}
    #casaNotifyPanel.open{display:flex}#casaNotifySheet{width:min(540px,100%);max-height:min(88dvh,720px);overflow:auto;background:var(--card,#18252d);border:1px solid var(--line,#30444d);border-radius:22px;padding:18px 16px calc(22px + env(safe-area-inset-bottom));color:var(--ink,#eef6f3);box-shadow:0 24px 64px rgba(0,0,0,.48)}
    #casaNotifySheet h2{margin:0 0 5px;font:800 1.2rem/1.2 system-ui}#casaNotifySheet .sub{margin:0 0 13px;color:var(--muted,#9fb1ae);font:.82rem/1.4 system-ui}.casa-np-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--line,#30444d)}.casa-np-row label{font:700 .9rem/1.25 system-ui}.casa-np-row p{margin:4px 0 0;color:var(--muted,#9fb1ae);font:.76rem/1.35 system-ui}.casa-np-row input[type=checkbox]{width:21px;height:21px;margin-top:2px;accent-color:var(--coral,#eb7058)}.casa-np-row input[type=number]{width:68px;padding:7px 8px;border-radius:9px;border:1px solid var(--line,#30444d);background:var(--canvas,#0f171d);color:var(--ink,#eef6f3);font-weight:800}.casa-np-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.casa-np-actions button{flex:1;min-width:118px;min-height:44px;border-radius:12px;border:1px solid var(--line,#30444d);font:800 13px system-ui;cursor:pointer}.casa-np-primary{background:var(--coral,#eb7058);color:white;border:0!important}.casa-np-ghost{background:var(--canvas,#0f171d);color:var(--ink,#eef6f3)}#casaNpStatus{margin-top:11px;color:var(--sage-dark,#77e39b);font:600 .76rem/1.4 system-ui}.casa-notify-nav{margin-top:6px!important}
  `;document.head.appendChild(style);}
  function close(){document.getElementById('casaNotifyPanel')?.classList.remove('open');}
  function open(){const panel=document.getElementById('casaNotifyPanel');if(!panel)return;const p=loadPrefs();[['Enabled','enabled'],['Deadlines','deadlines'],['DeadlineDays','deadlineDays'],['Automatic','automatic'],['AutomaticDays','automaticDays'],['Budget','budget'],['BudgetThreshold','budgetThreshold'],['Balances','lowBalances'],['BalanceAmount','lowBalance']].forEach(([id,key])=>{const el=panel.querySelector('#casaNp'+id);if(el)el.type==='checkbox'?el.checked=!!p[key]:el.value=p[key];});panel.querySelector('#casaNpStatus').textContent='Permesso: '+(window.Notification?Notification.permission:'non supportato')+(standalone()?' · App Home':' · Browser');panel.classList.add('open');}
  function ui(){if(document.getElementById('casaNotifyPanel'))return;styles();const panel=document.createElement('div');panel.id='casaNotifyPanel';panel.innerHTML=`<div id="casaNotifySheet" role="dialog" aria-label="Impostazioni notifiche Casa DaFragu"><h2>Notifiche Casa DaFragu</h2><p class="sub">Scegli gli avvisi. Su iPhone aggiungi la dashboard alla Home e aprila dall’icona.</p>
    <div class="casa-np-row"><div><label for="casaNpEnabled">Notifiche attive</label><p>Interruttore generale.</p></div><input type="checkbox" id="casaNpEnabled"></div>
    <div class="casa-np-row"><div><label for="casaNpDeadlines">Scadenze</label><p>Avvisi per scadenze non concluse.</p></div><input type="checkbox" id="casaNpDeadlines"></div>
    <div class="casa-np-row"><div><label for="casaNpDeadlineDays">Anticipo scadenze</label><p>Giorni di preavviso.</p></div><input type="number" id="casaNpDeadlineDays" min="1" max="90"></div>
    <div class="casa-np-row"><div><label for="casaNpAutomatic">Uscite automatiche</label><p>PAC, rate e movimenti ricorrenti.</p></div><input type="checkbox" id="casaNpAutomatic"></div>
    <div class="casa-np-row"><div><label for="casaNpAutomaticDays">Anticipo uscite</label><p>Giorni di preavviso.</p></div><input type="number" id="casaNpAutomaticDays" min="0" max="31"></div>
    <div class="casa-np-row"><div><label for="casaNpBudget">Budget da controllare</label><p>Avviso quando una categoria supera la soglia.</p></div><input type="checkbox" id="casaNpBudget"></div>
    <div class="casa-np-row"><div><label for="casaNpBudgetThreshold">Soglia budget</label><p>Percentuale da controllare.</p></div><input type="number" id="casaNpBudgetThreshold" min="1" max="100"></div>
    <div class="casa-np-row"><div><label for="casaNpBalances">Conti sotto soglia</label><p>Avviso sui conti comuni.</p></div><input type="checkbox" id="casaNpBalances"></div>
    <div class="casa-np-row"><div><label for="casaNpBalanceAmount">Soglia conti</label><p>Importo minimo in euro.</p></div><input type="number" id="casaNpBalanceAmount" min="0" max="5000"></div>
    <div class="casa-np-actions"><button type="button" class="casa-np-primary" id="casaNpSave">Salva</button><button type="button" class="casa-np-ghost" id="casaNpTest">Prova notifica</button><button type="button" class="casa-np-ghost" id="casaNpClose">Chiudi</button></div><div id="casaNpStatus"></div></div>`;document.body.appendChild(panel);
    panel.addEventListener('click',e=>{if(e.target===panel)close();});panel.querySelector('#casaNpClose').onclick=close;
    panel.querySelector('#casaNpSave').onclick=async()=>{const p=loadPrefs();p.enabled=panel.querySelector('#casaNpEnabled').checked;p.deadlines=panel.querySelector('#casaNpDeadlines').checked;p.deadlineDays=clamp(panel.querySelector('#casaNpDeadlineDays').value,1,90,7);p.automatic=panel.querySelector('#casaNpAutomatic').checked;p.automaticDays=clamp(panel.querySelector('#casaNpAutomaticDays').value,0,31,2);p.budget=panel.querySelector('#casaNpBudget').checked;p.budgetThreshold=clamp(panel.querySelector('#casaNpBudgetThreshold').value,1,100,80);p.lowBalances=panel.querySelector('#casaNpBalances').checked;p.lowBalance=clamp(panel.querySelector('#casaNpBalanceAmount').value,0,5000,50);if(p.enabled){if(/iPhone|iPad|iPod/.test(navigator.userAgent||'')&&!standalone())alert('Su iPhone aggiungi Casa DaFragu alla Home, aprila dall’icona e poi attiva le notifiche.');const grant=await permission();if(grant!=='granted'){p.enabled=false;panel.querySelector('#casaNpEnabled').checked=false;alert('Permesso notifiche non concesso.');}}savePrefs(p);panel.querySelector('#casaNpStatus').textContent='Preferenze salvate.';reminders();};
    panel.querySelector('#casaNpTest').onclick=async()=>{const s=panel.querySelector('#casaNpStatus');if(/iPhone|iPad|iPod/.test(navigator.userAgent||'')&&!standalone()){s.textContent='Su iPhone aggiungi la dashboard alla Home, aprila dall’icona e riprova.';return;}s.textContent='Invio prova…';const r=await show('Prova Casa DaFragu','Le notifiche della dashboard funzionano.',{force:true,tag:'casa-test-'+Date.now()});s.textContent=r.ok?'Notifica inviata via '+r.via+'.':'Invio non riuscito: '+(r.reason||'errore');};
  }
  function menu(){const nav=document.querySelector('.sidebar nav[aria-label="Navigazione principale"]');if(!nav||document.getElementById('casaNotifyOpen'))return;const button=document.createElement('button');button.type='button';button.id='casaNotifyOpen';button.className='nav-item casa-notify-nav';button.innerHTML='<span class="nav-icon">🔔</span> Notifiche';button.onclick=()=>{ui();open();};nav.appendChild(button);}
  window.CasaDaFraguNotifications={open:()=>{ui();open();},show,preferences:loadPrefs};
  injectHead();registerSW();
  const boot=()=>{ui();menu();setTimeout(reminders,6000);setInterval(reminders,10*60*1000);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,900));else setTimeout(boot,900);
  setInterval(menu,2500);
})();