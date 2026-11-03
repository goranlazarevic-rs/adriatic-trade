/* global createAvailabilityController: readonly */
function createAvailabilityController({api,esc,dt,staging=false}) {
  const content=document.querySelector('[data-availability-content]');
  const message=document.querySelector('[data-availability-message]');
  const refresh=document.querySelector('[data-availability-refresh]');
  let snapshot=null,pending=null,generation=0,busy=false;
  const stateLabel={available:'Potvrđeno',unavailable:'Nedostupno',unknown:'Nije potvrđeno'};
  const actionLabel={pause:'Pauziranje prodaje',open:'Otvaranje prodaje',quantity:'Promena kvote'};
  const number=v=>v===null?'Nije potvrđeno':String(v)+' kom.';
  const operationId=()=>{
    const bytes=crypto.getRandomValues(new Uint8Array(16));
    bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const hex=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  };
  const text=s=>{message.textContent=s;};
  function reset(){generation++;snapshot=null;pending=null;busy=false;content.innerHTML='';refresh.disabled=false;text('Pregled još nije učitan.');}
  function controlsDisabled(value){content.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=value);refresh.disabled=value;}
  function render(){
    content.innerHTML=`<div class="availability-status"><strong>${staging?(snapshot.mode==='open'?'Probni prijem je OTVOREN':'Probni prijem je PAUZIRAN'):(snapshot.mode==='open'?'Prodaja je OTVORENA':'Prodaja je PAUZIRANA')}</strong>
      <button class="btn ${snapshot.mode==='open'?'btn-danger':'btn-secondary'}" type="button" data-intake-action="${snapshot.mode==='open'?'pause':'open'}" ${snapshot.mode!=='open'&&!snapshot.canOpen?'disabled':''}>${staging?(snapshot.mode==='open'?'Pauziraj probni prijem':'Pripremi otvaranje probnog prijema'):(snapshot.mode==='open'?'Pauziraj prodaju':'Pripremi otvaranje prodaje')}</button></div>
      ${snapshot.mode!=='open'&&!snapshot.canOpen?'<p>Za otvaranje prvo potvrdite svih pet kvota (i nule), uz bar jedan raspoloživ proizvod.</p>':''}
      <div class="availability-products">${snapshot.products.map(p=>`<article class="availability-product"><h3>${esc(p.name)}</h3><p>SKU <strong>${esc(p.sku)}</strong></p>
        <p><strong>${esc(number(p.remaining))}</strong>${p.remaining===null?'':' · '+esc(stateLabel[p.state]||'Nije potvrđeno')}</p><p class="muted">Poslednja promena: ${esc(dt(p.updatedAt))}</p>
        <button class="btn btn-secondary" type="button" data-quota-sku="${esc(p.sku)}">Izmeni kvotu</button></article>`).join('')}</div>
      <div data-availability-editor></div>
      <details class="availability-bundles"><summary>Paketi — zajedničke kvote</summary><p>Prikaz je za svaki paket zasebno. Količine paketa se ne sabiraju i ne podešavaju posebno.</p>
        ${snapshot.bundles.map(b=>`<p><strong>${esc(b.name)} · ${esc(number(b.remaining))}</strong><br>${Object.entries(b.components).map(([sku,qty])=>esc(sku)+' × '+esc(qty)).join(' + ')}</p>`).join('')}</details>
      <details class="availability-history"><summary>Istorija promena — poslednjih 20</summary><p>Identifikator označava korišćeni administratorski ključ. Zajednički ključ ne razlikuje osobe.</p>
        ${snapshot.history.length?snapshot.history.map(e=>`<article><strong>${esc(actionLabel[e.action])}${e.sku?' · '+esc(e.sku):''}</strong><p>${esc(e.action==='quantity'?number(e.before.remaining)+' → '+number(e.after.remaining):e.before.mode+' → '+e.after.mode)}</p><p>${esc(e.reason)}</p><small>${esc(dt(e.createdAt))} · ${esc(e.actor)} · ${esc(e.operationId)}</small></article>`).join(''):'<p>Nema promena preko panela.</p>'}</details>`;
    content.querySelectorAll('[data-quota-sku]').forEach(btn=>btn.addEventListener('click',()=>edit('quantity',btn.dataset.quotaSku)));
    content.querySelector('[data-intake-action]').addEventListener('click',e=>edit(e.currentTarget.dataset.intakeAction));
  }
  async function load(){
    if(busy||pending)return;
    const current=++generation;busy=true;snapshot=null;content.innerHTML='';refresh.disabled=true;text('Učitavanje dostupnosti...');
    try{
      const data=await api('/admin/availability',{cache:'no-store'});
      if(current!==generation)return;
      if(data.ok!==true||!Number.isSafeInteger(data.revision)||!['open','paused'].includes(data.mode)||data.products?.length!==5||!Array.isArray(data.bundles)||!Array.isArray(data.history))throw Error('Neispravan pregled dostupnosti.');
      snapshot=data;render();text('Osveženo: '+dt(Date.now())+'. Pre svake korekcije proverite preostalu slobodnu robu.');
    }catch(error){if(current===generation){snapshot=null;content.innerHTML='';text('Dostupnost nije učitana. '+error.message+' Koristite „Osveži dostupnost“.');}}
    finally{if(current===generation){busy=false;refresh.disabled=false;}}
  }
  function edit(action,sku){
    if(busy||pending||!snapshot)return;
    const p=snapshot.products.find(p=>p.sku===sku),editor=content.querySelector('[data-availability-editor]');
    editor.innerHTML=`<form class="availability-editor" data-quota-form><h3>${esc(actionLabel[action])}${p?' · SKU '+esc(sku):''}</h3>
      ${p?`<p>Trenutna kvota: <strong>${esc(number(p.remaining))}</strong>. Unesite novu ukupnu preostalu kvotu, posle već primljenih porudžbina. Ne unosite stanje koje uključuje rezervisanu robu.</p>
        <label>Nova preostala webshop kvota (kom.)<input name="quantity" type="number" inputmode="numeric" min="0" max="${snapshot.limits.maxQuota}" step="1" required value="${p.remaining===null?'':esc(p.remaining)}"></label><p>Najviše +${snapshot.limits.maxIncrease} komada po potvrdi. Nova kvota 0 blokira proizvod i pakete koji ga sadrže.</p>`:
        `<p>${action==='pause'?'Zaustavlja nove porudžbine. Već primljene porudžbine ostaju u obradi.':`${staging?'Otvara samo prijem sintetičkih porudžbina na probnom panelu.':'Otvara prijem stvarnih porudžbina.'} Količine se ovom radnjom ne menjaju.`}</p>`}
      <label>Razlog promene (5–500 znakova)<textarea name="reason" minlength="5" maxlength="500" required rows="2"></textarea></label>
      <div class="admin-action-row"><button class="btn btn-secondary" type="button" data-quota-cancel>Odustani</button><button class="btn btn-primary" type="submit">Pregledaj promenu</button></div></form>`;
    const form=editor.querySelector('form');
    editor.querySelector('[data-quota-cancel]').addEventListener('click',()=>editor.innerHTML='');
    form.addEventListener('submit',e=>{
      e.preventDefault();if(!form.reportValidity())return;
      const reason=form.elements.reason.value.trim(),quantity=p?Number(form.elements.quantity.value):undefined;
      if(reason.length<5)return text('Unesite razlog od najmanje pet znakova.');
      if(p&&(!Number.isSafeInteger(quantity)||quantity<0||quantity>snapshot.limits.maxQuota))return text('Unesite dozvoljeni ceo broj komada.');
      const increase=p?quantity-(p.state==='available'?(p.remaining??0):0):0;
      if(increase>snapshot.limits.maxIncrease)return text('Najveće povećanje po potvrdi je '+snapshot.limits.maxIncrease+' komada.');
      if(p&&quantity===p.remaining&&p.state===(quantity>0?'available':'unavailable'))return text('Količina je već evidentirana.');
      review({operationId:operationId(),revision:snapshot.revision,action,...(p?{sku,quantity}:{}),reason,confirmed:true},p,increase);
    });
    editor.scrollIntoView({behavior:'smooth',block:'center'});form.querySelector('input,textarea').focus({preventScroll:true});
  }
  function review(body,p,increase){
    const editor=content.querySelector('[data-availability-editor]'),opening=body.action==='open',increasing=increase>0;
    editor.innerHTML=`<form class="availability-editor" data-quota-review><h3>Potvrdite promenu</h3>
      <p><strong>${p?'SKU '+esc(body.sku)+': '+esc(number(p.remaining))+' → '+esc(number(body.quantity))+' (raspoloživo za prodaju: '+(increase>0?'+':'')+esc(increase)+' kom.)':opening?'PAUZIRANA → OTVORENA prodaja':'OTVORENA → PAUZIRANA prodaja'}</strong></p>
      <p>Razlog: ${esc(body.reason)}</p>
      ${opening||increasing?`<label>Upišite <strong>${opening?'OTVORI PRODAJU':esc(body.sku+' '+body.quantity)}</strong><input name="confirmation" autocomplete="off" required></label>
        <label class="availability-check"><input name="evidence" type="checkbox" required><span>${opening?(staging?'Potvrđujem otvaranje samo sintetičke probe.':'Potvrđujem da su ispunjeni operativni uslovi za početak prodaje.'):'Proverio/la sam da nova kvota sadrži samo slobodnu robu za webshop, bez već rezervisanih komada.'}</span></label>`:''}
      <label class="availability-check"><input name="confirmed" type="checkbox" required><span>Proverio/la sam prikazanu promenu i želim da je sačuvam.</span></label>
      <div class="admin-action-row"><button class="btn btn-secondary" type="button" data-review-cancel>Odustani</button><button class="btn ${opening?'btn-danger':'btn-primary'}" type="submit">${opening?'Otvori prodaju':p?'Sačuvaj novu kvotu':'Potvrdi pauzu'}</button></div></form>`;
    editor.querySelector('[data-review-cancel]').addEventListener('click',()=>editor.innerHTML='');
    const form=editor.querySelector('form');
    form.addEventListener('submit',e=>{
      e.preventDefault();if(busy||pending||!form.reportValidity())return;
      if(opening||increasing){
        if(form.elements.confirmation.value!==(opening?'OTVORI PRODAJU':body.sku+' '+body.quantity))return text('Tekst potvrde se ne poklapa.');
        body.confirmation=form.elements.confirmation.value;
        if(opening)body.readinessConfirmed=true;else body.increaseConfirmed=true;
      }
      pending=body;send();
    });
    editor.scrollIntoView({behavior:'smooth',block:'center'});form.querySelector('input').focus({preventScroll:true});
  }
  async function send(){
    if(busy||!pending)return;
    const current=generation,body=pending;busy=true;controlsDisabled(true);text('Čuvanje promene...');
    try{
      const data=await api('/admin/availability',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(current!==generation)return;
      if(data.ok!==true||data.operationId!==body.operationId)throw Error('Server nije potvrdio ishod.');
      pending=null;busy=false;await load();if(current+1===generation)text('Promena je sačuvana'+(data.duplicate?' ranijim zahtevom; nije ponovljena.':'.')+(snapshot?' Pregled je osvežen.':' Osvežite pregled kada veza bude dostupna.'));
    }catch(error){
      if(current!==generation)return;
      busy=false;
      if(error.status>=400&&error.status<500){pending=null;await load();text(error.message+' Promena nije ponovljena. Proverite osvežen pregled.');}
      else{
        // Keep the exact body and operation ID after an uncertain response.
        text('Ishod nije potvrđen. Ne unosite novu korekciju. Proverite i ponovite isti zahtev.');
        const editor=content.querySelector('[data-availability-editor]');
        editor.innerHTML='<button class="btn btn-primary" type="button" data-quota-retry>Proveri i ponovi isti zahtev</button>';
        editor.querySelector('button').addEventListener('click',send);
      }
    }
  }
  refresh.addEventListener('click',load);
  return {load,reset};
}
