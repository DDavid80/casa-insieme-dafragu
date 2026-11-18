// Shared by the Sites and Pages builds. Presentation only.
(() => {
  const phone = matchMedia('(max-width:760px)');
  const screen = window.visualViewport;
  function size() {
    if (!screen || screen.scale !== 1) return;
    const root = document.documentElement.style;
    root.setProperty('--phone-height', screen.height + 'px');
    root.setProperty('--phone-top', screen.offsetTop + 'px');
  }
  screen?.addEventListener('resize',size);
  screen?.addEventListener('scroll',size);
  size();
  let heading;
  function refresh() {
    if (!phone.matches) return;
    const header = document.querySelector('.app-shell .topbar');
    const actions = header?.querySelector('.top-actions');
    if (!actions) { heading=undefined; return; }
    let button = header.querySelector('.phone-tools');
    if (!button) {
      button = document.createElement('button');
      button.type='button'; button.className='phone-tools'; button.textContent='Opzioni';
      button.setAttribute('aria-label','Opzioni di visualizzazione');
      button.setAttribute('aria-expanded','false');
      actions.id ||= 'casa-view-tools'; button.setAttribute('aria-controls',actions.id);
      button.onclick=()=>button.setAttribute('aria-expanded', String(button.getAttribute('aria-expanded')!=='true'));
      header.insertBefore(button,actions);
    }
    const next=header.querySelector('h1')?.textContent;
    if (heading && heading!==next) {
      button.setAttribute('aria-expanded','false'); window.scrollTo(0,0);
    }
    heading=next;
  }
  let pending=false;
  function schedule() {
    if(pending || !phone.matches)return;
    pending=true;requestAnimationFrame(()=>{pending=false;refresh()});
  }
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,characterData:true});
  document.addEventListener('click',event=>{
    if(!phone.matches || !(event.target instanceof Element)) return;
    const card=event.target.closest('.account-card,.patrimony-card');
    if(!card || card.closest('[draggable=true]') || event.target.closest('.account-delete')) return;
    requestAnimationFrame(()=>document.querySelector('.account-detail')?.scrollIntoView({block:'start'}));
  });
  phone.addEventListener('change',schedule); refresh();
})();
