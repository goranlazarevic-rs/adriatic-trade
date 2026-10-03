(()=>{
  const API='https://adriatic-trade-orders.lakifinance.workers.dev';
  const KEY='at_admin_token';
  const login=document.querySelector('[data-admin-login]');
  const app=document.querySelector('[data-admin-app]');
  const loginForm=document.querySelector('[data-admin-login-form]');
  const tokenInput=document.querySelector('[data-admin-token]');
  const loginError=document.querySelector('[data-admin-login-error]');
  const logout=document.querySelector('[data-admin-logout]');
  const list=document.querySelector('[data-admin-orders]');
  const detail=document.querySelector('[data-admin-detail]');
  const count=document.querySelector('[data-admin-count]');
  const search=document.querySelector('[data-admin-search]');
  const filter=document.querySelector('[data-admin-filter]');
  const refresh=document.querySelector('[data-admin-refresh]');
  const alertBox=document.querySelector('[data-admin-alert]');
  let token=sessionStorage.getItem(KEY)||'';
  let orders=[];
  let selectedId='';
  let timer=null;
  let attention='';
  let pendingExport=sessionStorage.getItem('at_pending_export')||'';

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const money=v=>new Intl.NumberFormat('sr-RS',{maximumFractionDigits:0}).format(Number(v||0))+' RSD';
  const dt=v=>{if(!v)return '—';try{return new Intl.DateTimeFormat('sr-RS',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Belgrade'}).format(new Date(v))}catch{return v}};
  const statusLabel=s=>({new:'Nova',confirmed:'Potvrđena',shipped:'Poslata',rejected:'Odbijena',cancelled:'Otkazana'}[s]||s);
  const chip=s=>`<span class="status-chip status-${esc(s)}">${esc(statusLabel(s))}</span>`;

  async function api(path,options={}){
    const headers=new Headers(options.headers||{});
    headers.set('Authorization','Bearer '+token);
    const res=await fetch(API+path,{...options,headers,credentials:'omit'});
    let data={};try{data=await res.json()}catch{}
    if(res.status===401){sessionStorage.removeItem(KEY);token='';showLogin('Administratorski ključ nije prihvaćen.');throw new Error('Unauthorized')}
    if(!res.ok||data.ok===false)throw new Error(data.error||'Greška pri komunikaciji sa serverom.');
    return data;
  }

  function showLogin(message=''){
    login.classList.remove('hidden');app.classList.add('hidden');logout.classList.add('hidden');
    loginError.textContent=message;loginError.classList.toggle('hidden',!message);
  }
  function showApp(){login.classList.add('hidden');app.classList.remove('hidden');logout.classList.remove('hidden')}
  function notify(message,type=''){
    alertBox.textContent=message;alertBox.classList.remove('hidden','success');if(type==='success')alertBox.classList.add('success');
    setTimeout(()=>alertBox.classList.add('hidden'),4500);
  }
  function setBusy(el,busy){if(!el)return;el.classList.toggle('admin-busy',busy);el.querySelectorAll?.('button,input,select').forEach(x=>x.disabled=busy)}

  async function loadOrders(selectFirst=false){
    const params=new URLSearchParams();
    if(filter.value)params.set('status',filter.value);
    if(search.value.trim())params.set('q',search.value.trim());
    params.set('limit','100');
    if(attention)params.set('attention',attention);
    for(const key of ['from','to']) {const v=document.querySelector('[data-date-'+key+']').value;if(v)params.set(key,v);}
    list.innerHTML='<div class="admin-empty">Učitavanje...</div>';
    try{
      const data=await api('/admin/orders?'+params.toString());
      const mode=document.querySelector('[data-ops-filter]').value;
      orders=(data.orders||[]).filter(o=>!mode || (!['rejected','cancelled'].includes(o.status) && (mode==='risk'?o.securityFlagged&&o.operations.riskReview==='pending':mode==='unpaid'?o.operations.paymentStatus==='unpaid':o.operations.fulfillment===mode)));
      count.textContent=orders.length+(data.orders?.length===100?' (limit 100; suzite datume)':'');
      const active=orders.filter(o=>!['rejected','cancelled'].includes(o.status));
      document.querySelector('[data-sales-summary]').textContent='Prikazane porudžbine: '+orders.length+' · Aktivne: '+active.length+' · Vrednost robe: '+money(active.reduce((n,o)=>n+o.goodsTotal,0))+' · Naplaćeno (sa dostavom): '+money(orders.filter(o=>o.operations.paymentStatus==='paid').reduce((n,o)=>n+o.total,0));
      renderList();
      await loadOperationsOverview();
      if(selectedId&&!orders.some(o=>o.id===selectedId)){selectedId='';detail.innerHTML='<div class="admin-empty admin-empty-large">Izaberite porudžbinu sa leve strane.</div>'}
      if(selectFirst&&orders[0])await openOrder(orders[0].id);
    }catch(err){if(token)list.innerHTML=`<div class="admin-empty">${esc(err.message)}</div>`}
  }

  function renderList(){
    if(!orders.length){list.innerHTML='<div class="admin-empty">Nema porudžbina za izabrani filter.</div>';return}
    list.innerHTML=orders.map(o=>`<button type="button" class="admin-order-card ${o.id===selectedId?'active':''}" data-order-id="${esc(o.id)}">
      <div class="admin-order-top"><span class="admin-order-id">${esc(o.id)}</span>${chip(o.status)}</div>
      <div class="admin-order-name">${esc(o.customer.firstName)} ${esc(o.customer.lastName)}</div>
      <div class="admin-order-meta"><span>${esc(dt(o.createdAt))}</span><strong>${esc(money(o.total))}</strong></div>
    </button>`).join('');
    list.querySelectorAll('[data-order-id]').forEach(btn=>btn.addEventListener('click',()=>openOrder(btn.dataset.orderId)));
  }

  async function openOrder(id){
    selectedId=id;renderList();detail.innerHTML='<div class="admin-empty admin-empty-large">Učitavanje porudžbine...</div>';
    try{const data=await api('/admin/orders/'+encodeURIComponent(id));renderDetail(data.order)}catch(err){detail.innerHTML=`<div class="admin-empty admin-empty-large">${esc(err.message)}</div>`}
  }

  function renderDetail(o){
    const items=(o.items||[]).map(i=>`<div class="admin-item"><div><strong>${esc(i.name)}</strong><div class="muted">SKU ${esc(i.sku)}${i.detail?' · '+esc(i.detail):''}</div></div><div>${esc(i.qty)}</div><div>${esc(money(i.lineTotal))}</div></div>`).join('');
    const securityEvent=[...(o.events||[])].reverse().find(e=>e.event_type==='security_flag');
    const securityWarning=securityEvent?`<div class="admin-security-warning"><strong>⚠ Proverite porudžbinu pre potvrde</strong><span>${esc(securityEvent.note||'Automatska kontrola je označila porudžbinu za dodatnu proveru.')}</span></div>`:'';
    const events=(o.events||[]).map(e=>`<div class="admin-event ${e.event_type==='security_flag'?'admin-event-security':''}"><strong>${esc(eventTitle(e.event_type))}</strong>${e.note?`<div>${esc(eventNote(e))}</div>`:''}<time>${esc(dt(e.created_at))}</time></div>`).join('')||'<div class="muted">Nema događaja.</div>';
    const address=o.delivery.method==='Dostava na adresu'?`${o.delivery.address}, ${o.delivery.postalCode} ${o.delivery.city}`:`Paketomat · ${o.delivery.postalCode} ${o.delivery.city}`;
    let actions='';
    if(o.status==='new')actions=`<div class="admin-actions"><h3>Sledeći korak</h3><p>Proverite podatke i raspoloživost robe. Potvrdom kupac automatski dobija email.</p><div class="admin-action-row"><button class="btn btn-primary" type="button" data-confirm>Potvrdi porudžbinu</button><button class="btn btn-danger" type="button" data-reject>Odbij porudžbinu</button></div></div>`;
    if(o.status==='confirmed')actions=`<div class="admin-actions"><h3>Predaja kuriru</h3><p>Unesite podatke pošiljke. Fiskalni račun može biti dodat kao PDF i biće poslat kupcu u prilogu.</p><form class="admin-ship-form" data-ship-form>
      <div class="field"><label>Kurirska služba *</label><input name="courier" placeholder="npr. D Express" required></div>
      <div class="field"><label>Broj pošiljke *</label><input name="trackingNumber" required></div>
      <div class="field wide"><label>Link za praćenje</label><input name="trackingUrl" type="url" placeholder="https://..."></div>
      <div class="field wide"><label>Fiskalni račun (PDF)</label><input name="receipt" type="file" accept="application/pdf,.pdf"><div class="admin-file-note">PDF do 5 MB. Panel ne generiše fiskalni račun; šalje dokument iz vašeg fiskalnog sistema.</div></div>
      <div class="wide"><button class="btn btn-primary" type="submit">Označi kao poslato i obavesti kupca</button></div>
    </form><div class="admin-action-row admin-action-row-secondary"><button class="btn btn-danger-outline" type="button" data-cancel>Otkaži porudžbinu</button></div></div>`;
    if(o.status==='shipped')actions=`<div class="admin-actions"><h3>Pošiljka je poslata</h3><div class="admin-info">
      ${row('Kurir',o.courier||'—')}${row('Broj pošiljke',o.trackingNumber||'—')}${o.trackingUrl?rowLink('Praćenje',o.trackingUrl,o.trackingUrl):''}${o.receiptFilename?`<div class="admin-action-row"><button class="btn btn-secondary" type="button" data-receipt>Preuzmi fiskalni račun</button></div>`:''}
    </div></div>`;
    if(o.status==='rejected')actions=`<div class="admin-actions admin-terminal-action"><h3>Porudžbina je odbijena</h3><p>${esc(lastDecisionNote(o,'rejected')||'Kupac je obavešten emailom. Porudžbina ostaje sačuvana u evidenciji.')}</p></div>`;
    if(o.status==='cancelled')actions=`<div class="admin-actions admin-terminal-action"><h3>Porudžbina je otkazana</h3><p>${esc(lastDecisionNote(o,'cancelled')||'Kupac je obavešten emailom. Porudžbina ostaje sačuvana u evidenciji.')}</p></div>`;

    detail.innerHTML=`<div class="admin-detail-head"><div><span class="eyebrow">Porudžbina</span><h2>${esc(o.id)}</h2></div>${chip(o.status)}</div>
    <div class="admin-detail-body">
      ${securityWarning}
      <div class="admin-detail-grid"><div class="admin-box"><h3>Kupac</h3><div class="admin-info">${row('Ime',o.customer.firstName+' '+o.customer.lastName)}${rowLink('Email','mailto:'+o.customer.email,o.customer.email)}${rowLink('Telefon','tel:'+o.customer.phone.replace(/\s+/g,''),o.customer.phone)}</div></div>
      <div class="admin-box"><h3>Isporuka</h3><div class="admin-info">${row('Način',o.delivery.method)}${row('Adresa',address)}${row('Napomena',o.delivery.note||'—')}${row('Plaćanje',o.payment||'Pouzećem')}</div></div></div>
      <div class="admin-items"><div class="admin-item admin-item-head"><div>Proizvod</div><div>Kol.</div><div>Iznos</div></div>${items}</div>
      <div class="admin-totals"><div class="admin-total-row"><span>Vrednost robe</span><strong>${esc(money(o.goodsTotal))}</strong></div><div class="admin-total-row"><span>Dostava</span><strong>${o.shipping===0?'Besplatna':esc(money(o.shipping))}</strong></div><div class="admin-total-row final"><span>Ukupno</span><span>${esc(money(o.total))}</span></div></div>
      ${actions}
      ${operationsForm(o)}
      <div class="admin-events"><div class="admin-box"><h3>Istorija</h3>${events}</div></div>
    </div>`;

    detail.querySelector('[data-operations]')?.addEventListener('submit',async e=>{
      e.preventDefault(); const body=Object.fromEntries(new FormData(e.currentTarget));body.revision=o.operationsRevision;
      setBusy(detail,true);
      try {const data=await api('/admin/orders/'+encodeURIComponent(o.id)+'/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});await loadOrders();renderDetail(data.order);notify('Izmene su sačuvane.','success');} catch(err){notify(err.message);} finally {setBusy(detail,false);}
    });
    detail.querySelector('[data-print-label]')?.addEventListener('click',()=>printLabel(o));
    detail.querySelector('[data-confirm]')?.addEventListener('click',()=>confirmOrder(o.id));
    detail.querySelector('[data-reject]')?.addEventListener('click',()=>openDecisionDialog('reject',o.id));
    detail.querySelector('[data-cancel]')?.addEventListener('click',()=>openDecisionDialog('cancel',o.id));
    detail.querySelector('[data-ship-form]')?.addEventListener('submit',e=>shipOrder(e,o.id));
    detail.querySelector('[data-receipt]')?.addEventListener('click',()=>downloadReceipt(o.id,o.receiptFilename));
  }

  function row(label,value){return `<div class="admin-info-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`}
  function rowLink(label,href,value){return `<div class="admin-info-row"><span>${esc(label)}</span><strong><a class="admin-link" href="${esc(href)}">${esc(value)}</a></strong></div>`}
  function eventTitle(v){return ({created:'Kreirana',confirmed:'Potvrđena',shipped:'Poslata',rejected:'Odbijena',cancelled:'Otkazana',security_flag:'Bezbednosni signal',courier_export:'Izvezeno za kurira'}[v]||v)}

  function lastDecisionNote(o,type){
    const ev=[...(o.events||[])].reverse().find(e=>e.event_type===type);
    return ev?.note||'';
  }

  function openDecisionDialog(action,id){
    const isReject=action==='reject';
    const title=isReject?'Odbij porudžbinu':'Otkaži porudžbinu';
    const intro=isReject
      ?'Kupac će dobiti email da porudžbina nije potvrđena. Porudžbina se ne briše iz evidencije.'
      :'Kupac će dobiti email da je već potvrđena porudžbina otkazana pre slanja.';
    const modal=document.createElement('div');
    modal.className='admin-modal';
    modal.innerHTML=`<div class="admin-modal-backdrop" data-close></div><div class="admin-modal-card" role="dialog" aria-modal="true" aria-labelledby="decision-title">
      <div class="admin-modal-head"><div><span class="eyebrow">Promena statusa</span><h3 id="decision-title">${esc(title)}</h3></div><button type="button" class="admin-modal-x" aria-label="Zatvori" data-close>×</button></div>
      <p class="admin-modal-intro">${esc(intro)}</p>
      <form data-decision-form>
        <div class="field"><label for="decision-reason">Razlog *</label><select id="decision-reason" name="reasonCode" required>
          <option value="">Izaberite razlog</option>
          <option value="unavailable">Proizvod trenutno nije dostupan</option>
          <option value="delivery">Isporuka na navedenu adresu/lokaciju nije moguća</option>
          <option value="invalid">Podaci porudžbine nisu potpuni ili ispravni</option>
          <option value="duplicate">Dupla ili test porudžbina</option>
          <option value="customer_request">Na zahtev kupca</option>
          <option value="other">Drugo</option>
        </select></div>
        <div class="field"><label for="decision-note">Napomena</label><textarea id="decision-note" name="note" rows="3" maxlength="500" placeholder="Kratko objašnjenje koje će videti i kupac (opciono, osim za 'Drugo')."></textarea></div>
        <div class="admin-modal-actions"><button type="button" class="btn btn-secondary" data-close>Odustani</button><button type="submit" class="btn btn-danger">${esc(title)}</button></div>
      </form>
    </div>`;
    document.body.appendChild(modal);
    const close=()=>modal.remove();
    modal.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',close));
    modal.querySelector('[data-decision-form]').addEventListener('submit',async e=>{
      e.preventDefault();
      const form=e.currentTarget;
      const reasonCode=form.reasonCode.value;
      const note=form.note.value.trim();
      if(!reasonCode){notify('Izaberite razlog.');return}
      if(reasonCode==='other'&&!note){notify("Za opciju 'Drugo' unesite kratku napomenu.");return}
      const submit=form.querySelector('button[type="submit"]');submit.disabled=true;
      try{
        const data=await api('/admin/orders/'+encodeURIComponent(id)+'/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reasonCode,note})});
        close();notify(isReject?'Porudžbina je odbijena. Kupac je obavešten.':'Porudžbina je otkazana. Kupac je obavešten.','success');
        await loadOrders();renderDetail(data.order);
      }catch(err){notify(err.message);submit.disabled=false}
    });
    setTimeout(()=>modal.querySelector('select')?.focus(),30);
  }

  async function confirmOrder(id){
    if(!confirm('Potvrditi porudžbinu i poslati kupcu email potvrde?'))return;
    setBusy(detail,true);
    try{const data=await api('/admin/orders/'+encodeURIComponent(id)+'/confirm',{method:'POST'});notify('Porudžbina je potvrđena. Email je poslat kupcu.','success');await loadOrders();renderDetail(data.order)}catch(err){notify(err.message)}finally{setBusy(detail,false)}
  }

  async function shipOrder(e,id){
    e.preventDefault();
    const form=e.currentTarget;
    const file=form.elements.receipt?.files?.[0];
    if(file&&file.size>5*1024*1024){notify('PDF može imati najviše 5 MB.');return}
    if(!confirm('Označiti porudžbinu kao poslatu i poslati kupcu email?'))return;
    const fd=new FormData(form);
    setBusy(detail,true);
    try{const data=await api('/admin/orders/'+encodeURIComponent(id)+'/ship',{method:'POST',body:fd});notify('Kupac je obavešten da je porudžbina poslata.','success');await loadOrders();renderDetail(data.order)}catch(err){notify(err.message)}finally{setBusy(detail,false)}
  }

  async function downloadReceipt(id,filename){
    try{
      const res=await fetch(API+'/admin/orders/'+encodeURIComponent(id)+'/receipt',{headers:{Authorization:'Bearer '+token},credentials:'omit'});
      if(!res.ok){let d={};try{d=await res.json()}catch{}throw new Error(d.error||'Račun nije moguće preuzeti.')}
      const blob=await res.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename||`fiskalni-racun-${id}.pdf`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(err){notify(err.message)}
  }


  const opsLabels={pending:'Čeka pripremu',ready:'Spremna za slanje',shipped:'Poslata',delivered:'Isporučena',returned:'Vraćena',failed:'Neuspešna isporuka',unpaid:'Nenaplaćena',paid:'Naplaćena',refunded:'Refundirana',approved:'Proverena — prihvatljiva',rejected:'Proverena — odbijena'};
  function eventNote(e){if(e.event_type!=='operations')return e.note;try{const n=JSON.parse(e.note);return n.actor+' · '+n.reason+' · '+n.changes.map(c=>c.key+': '+(opsLabels[c.before]||c.before||'—')+' → '+(opsLabels[c.after]||c.after||'—')).join('; ')}catch{return e.note}}
  function operationsForm(o){const v=o.operations||{};
    if(['rejected','cancelled'].includes(o.status)) {
      return `<div class="admin-box admin-operations-locked"><h3>Operativna evidencija — zaključana</h3><p>Porudžbina je ${o.status==='rejected'?'odbijena':'otkazana'}. Priprema, isporuka i štampanje nalepnice su obustavljeni. Sačuvani podaci i istorija ostaju dostupni za pregled.</p><div class="admin-info">
        ${row('Isporuka','Obustavljena')}
        ${row('Evidentirana naplata',opsLabels[v.paymentStatus]||'Nenaplaćena')}
        ${row('Datum prenosa novca od kurira',v.remittanceDate||'—')}
        ${row('Referenca naplate / refundacije',v.paymentReference||'—')}
        ${row('Provera porudžbine',v.riskReview==='pending'?'Nije završena':opsLabels[v.riskReview]||'—')}
        ${row('Interna beleška',v.internalNote||'—')}
        ${row('Fiskalni sistem',v.fiscalProvider||'—')}
        ${row('Broj fiskalnog računa',v.fiscalNumber||'—')}
        ${row('Referenca izvornog računa / refundacije',v.fiscalReference||'—')}
      </div></div>`;
    }
    const field=(name,label,type='text')=>`<div class="field"><label>${label}<input name="${name}" type="${type}" value="${esc(v[name]||'')}" maxlength="160"></label></div>`;
    const select=(name,label,values)=>`<div class="field"><label>${label}<select name="${name}">${values.map(x=>`<option value="${x}" ${v[name]===x?'selected':''}>${name==='riskReview'&&x==='pending'?'Čeka proveru':opsLabels[x]}</option>`).join('')}</select></label></div>`;
    return `<div class="admin-box"><h3>Operativna evidencija</h3><form data-operations class="admin-ship-form">
      ${select('fulfillment','Isporuka',['pending','ready','shipped','delivered','returned','failed'])}
      ${select('paymentStatus','Naplata',['unpaid','paid','refunded'])}
      ${field('remittanceDate','Datum prenosa novca od kurira','date')}${field('paymentReference','Referenca naplate / refundacije')}
      ${select('riskReview','Provera porudžbine',['pending','approved','rejected'])}
      <div class="field wide"><label>Interna beleška<textarea name="internalNote" maxlength="2000" rows="3">${esc(v.internalNote||'')}</textarea></label><small>Vidljivo samo administratoru.</small></div>
      <div class="wide"><h3>Fiskalizacija</h3><p>Priprema za integraciju. Ovde se evidentira račun iz fiskalnog sistema; unos broja ne izdaje niti proverava račun.</p></div>
      ${field('fiscalProvider','Fiskalni sistem')}${field('fiscalNumber','Broj fiskalnog računa')}${field('fiscalReference','Referenca izvornog računa / refundacije')}
      <div class="field wide"><label>Razlog izmene *<input name="reason" required maxlength="500"></label></div>
      <div class="wide"><button class="btn btn-primary" type="submit">Sačuvaj evidenciju</button></div>
    </form><h3>Nalepnica za paket</h3><label>Format <select data-label-size><option value="100x150">100 × 150 mm</option><option value="80x100">80 × 100 mm</option></select></label> <button class="btn btn-secondary" type="button" data-print-label>Štampaj adresnu nalepnicu</button><p>Adresna nalepnica. Kurirska nalepnica sa barkodom biće dostupna nakon povezivanja kurira.</p></div>`;
  }
  function printLabel(o){
    if(['rejected','cancelled'].includes(o.status) || o.operations.fulfillment==='returned') {notify('Ova porudžbina nije za isporuku.');return;}
    const w=window.open('','_blank');if(!w){notify('Dozvolite otvaranje prozora za štampu.');return;}
    const size=detail.querySelector('[data-label-size]').value.split('x');
    w.document.write(`<!doctype html><html lang="sr"><head><title>Nalepnica ${esc(o.id)}</title><style>@page{size:${size[0]}mm ${size[1]}mm;margin:5mm}body{font:14px Arial;color:#000;overflow-wrap:anywhere}h2{font-size:20px}p{margin:10px 0}</style></head><body><strong>ADRIATIC TRADE d.o.o.</strong><p>Cvetna 6, 21208 Sremska Kamenica<br>+381 65 216 9764</p><hr><h2>${esc(o.customer.firstName+' '+o.customer.lastName)}</h2><p>${esc(o.delivery.address)}<br>${esc(o.delivery.postalCode+' '+o.delivery.city)}<br>${esc(o.customer.phone)}</p><p>${esc(o.delivery.method)}</p><hr><p>Porudžbina: ${esc(o.id)}<br>${o.trackingNumber?'Pošiljka: '+esc(o.trackingNumber)+'<br>':''}Pouzeće: ${esc(money(['paid','refunded'].includes(o.operations.paymentStatus)?0:o.total))}</p><small>Adresna nalepnica — nije kurirski dokument.</small></body></html>`);
    w.document.close();w.focus();w.print();
  }
  function exportOrders(){
    const header=['Porudžbina','Datum','Status','Isporuka','Naplata','Ime','Prezime','Telefon','Email','Adresa','Poštanski broj','Mesto','Kurir','Pošiljka','Roba RSD','Dostava RSD','Ukupno RSD','Pouzeće RSD','Datum prenosa','Fiskalni račun'];
    const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
    const rows=orders.map(o=>[o.id,o.createdAt,statusLabel(o.status),opsLabels[o.operations.fulfillment],opsLabels[o.operations.paymentStatus],o.customer.firstName,o.customer.lastName,o.customer.phone,o.customer.email,o.delivery.address,o.delivery.postalCode,o.delivery.city,o.courier,o.trackingNumber,o.goodsTotal,o.shipping,o.total,['paid','refunded'].includes(o.operations.paymentStatus)?0:o.total,o.operations.remittanceDate,o.operations.fiscalNumber]);
    const url=URL.createObjectURL(new Blob(['\uFEFF'+[header,...rows].map(row=>row.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='porudzbine.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  document.querySelector('[data-export]').addEventListener('click',exportOrders);
  for(const selector of ['[data-date-from]','[data-date-to]','[data-ops-filter]'])document.querySelector(selector).addEventListener('change',()=>loadOrders());


  async function loadOperationsOverview(){
    const [a,b]=await Promise.all([api('/admin/attention'),api('/admin/courier-exports')]);
    const cards=[['new','Nove',a.counts.newOrders],['prepare','Za pripremu',a.counts.prepare],['export','Spremne za izvoz',a.counts.exportReady],['unpaid','Neuplaćene otkupnine',a.counts.unpaid]];
    document.querySelector('[data-attention-cards]').innerHTML=cards.map(([key,label,n])=>`<button class="btn ${attention===key?'btn-primary':'btn-secondary'}" type="button" data-attention="${key}">${label}: ${n}</button>`).join('')+'<button class="btn btn-secondary" type="button" data-attention="">Sve</button>';
    document.querySelectorAll('[data-attention]').forEach(btn=>btn.addEventListener('click',()=>{attention=btn.dataset.attention;filter.value='';search.value='';document.querySelector('[data-ops-filter]').value='';for(const key of ['from','to'])document.querySelector('[data-date-'+key+']').value='';loadOrders();}));
    document.querySelector('[data-export-batches]').innerHTML=(b.batches||[]).map(batch=>`<div class="admin-info-row"><span>${esc(dt(batch.created_at))} · ${batch.order_count} porudžbina<br>${esc(batch.id)}</span><button class="btn btn-secondary" type="button" data-batch="${esc(batch.id)}">Ponovo preuzmi</button></div>`).join('')||'<p>Nema prethodnih izvoza.</p>';
    document.querySelectorAll('[data-batch]').forEach(btn=>btn.addEventListener('click',()=>downloadBatch(btn.dataset.batch).catch(err=>notify(err.message))));
  }
  async function downloadBatch(id){
    const res=await fetch(API+'/admin/courier-exports/'+encodeURIComponent(id),{headers:{Authorization:'Bearer '+token},credentials:'omit'});
    if(!res.ok)throw new Error('Izvozni paket nije moguće preuzeti.');
    const url=URL.createObjectURL(await res.blob());const a=document.createElement('a');a.href=url;a.download=id+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  document.querySelector('[data-courier-export]').addEventListener('click',async e=>{
    if(!confirm('Kreirati izvozni paket svih spremnih, neizvezenih porudžbina? Status slanja ostaje nepromenjen.'))return;
    const btn=e.currentTarget;btn.disabled=true;
    if(!pendingExport){pendingExport=crypto.randomUUID();sessionStorage.setItem('at_pending_export',pendingExport);}
    try{
      const data=await api('/admin/courier-exports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:pendingExport})});
      pendingExport='';sessionStorage.removeItem('at_pending_export');
      if(data.batch.order_count){await downloadBatch(data.batch.id);notify('Izvozni paket je sačuvan. Ako preuzimanje nije uspelo, koristite „Ponovo preuzmi“.','success');}else notify('Nema spremnih neizvezenih porudžbina.');
      await loadOrders();
    }catch(err){notify(err.message+' Sačuvani paket možete ponovo preuzeti iz istorije.');await loadOperationsOverview().catch(()=>{});}finally{btn.disabled=false;}
  });

  loginForm.addEventListener('submit',async e=>{e.preventDefault();token=tokenInput.value.trim();if(!token)return;sessionStorage.setItem(KEY,token);showApp();await loadOrders(true)});
  logout.addEventListener('click',()=>{sessionStorage.removeItem(KEY);token='';selectedId='';tokenInput.value='';showLogin()});
  refresh.addEventListener('click',()=>loadOrders());
  filter.addEventListener('change',()=>loadOrders());
  search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>loadOrders(),350)});

  if(token){showApp();loadOrders(true)}else showLogin();
})();

