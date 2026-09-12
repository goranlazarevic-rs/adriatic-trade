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

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const money=v=>new Intl.NumberFormat('sr-RS',{maximumFractionDigits:0}).format(Number(v||0))+' RSD';
  const dt=v=>{if(!v)return '—';try{return new Intl.DateTimeFormat('sr-RS',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Belgrade'}).format(new Date(v))}catch{return v}};
  const statusLabel=s=>({new:'Nova',confirmed:'Potvrđena',shipped:'Poslata'}[s]||s);
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
    list.innerHTML='<div class="admin-empty">Učitavanje...</div>';
    try{
      const data=await api('/admin/orders?'+params.toString());
      orders=data.orders||[];count.textContent=orders.length;
      renderList();
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
    const events=(o.events||[]).map(e=>`<div class="admin-event"><strong>${esc(eventTitle(e.event_type))}</strong>${e.note?`<div>${esc(e.note)}</div>`:''}<time>${esc(dt(e.created_at))}</time></div>`).join('')||'<div class="muted">Nema događaja.</div>';
    const address=o.delivery.method==='Dostava na adresu'?`${o.delivery.address}, ${o.delivery.postalCode} ${o.delivery.city}`:`Paketomat · ${o.delivery.postalCode} ${o.delivery.city}`;
    let actions='';
    if(o.status==='new')actions=`<div class="admin-actions"><h3>Sledeći korak</h3><p>Proverite podatke i raspoloživost robe. Potvrdom kupac automatski dobija email.</p><div class="admin-action-row"><button class="btn btn-primary" type="button" data-confirm>Potvrdi porudžbinu</button></div></div>`;
    if(o.status==='confirmed')actions=`<div class="admin-actions"><h3>Predaja kuriru</h3><p>Unesite podatke pošiljke. Fiskalni račun može biti dodat kao PDF i biće poslat kupcu u prilogu.</p><form class="admin-ship-form" data-ship-form>
      <div class="field"><label>Kurirska služba *</label><input name="courier" placeholder="npr. D Express" required></div>
      <div class="field"><label>Broj pošiljke *</label><input name="trackingNumber" required></div>
      <div class="field wide"><label>Link za praćenje</label><input name="trackingUrl" type="url" placeholder="https://..."></div>
      <div class="field wide"><label>Fiskalni račun (PDF)</label><input name="receipt" type="file" accept="application/pdf,.pdf"><div class="admin-file-note">PDF do 5 MB. Panel ne generiše fiskalni račun; šalje dokument iz vašeg fiskalnog sistema.</div></div>
      <div class="wide"><button class="btn btn-primary" type="submit">Označi kao poslato i obavesti kupca</button></div>
    </form></div>`;
    if(o.status==='shipped')actions=`<div class="admin-actions"><h3>Pošiljka je poslata</h3><div class="admin-info">
      ${row('Kurir',o.courier||'—')}${row('Broj pošiljke',o.trackingNumber||'—')}${o.trackingUrl?rowLink('Praćenje',o.trackingUrl,o.trackingUrl):''}${o.receiptFilename?`<div class="admin-action-row"><button class="btn btn-secondary" type="button" data-receipt>Preuzmi fiskalni račun</button></div>`:''}
    </div></div>`;

    detail.innerHTML=`<div class="admin-detail-head"><div><span class="eyebrow">Porudžbina</span><h2>${esc(o.id)}</h2></div>${chip(o.status)}</div>
    <div class="admin-detail-body">
      <div class="admin-detail-grid"><div class="admin-box"><h3>Kupac</h3><div class="admin-info">${row('Ime',o.customer.firstName+' '+o.customer.lastName)}${rowLink('Email','mailto:'+o.customer.email,o.customer.email)}${rowLink('Telefon','tel:'+o.customer.phone.replace(/\s+/g,''),o.customer.phone)}</div></div>
      <div class="admin-box"><h3>Isporuka</h3><div class="admin-info">${row('Način',o.delivery.method)}${row('Adresa',address)}${row('Napomena',o.delivery.note||'—')}${row('Plaćanje',o.payment||'Pouzećem')}</div></div></div>
      <div class="admin-items"><div class="admin-item admin-item-head"><div>Proizvod</div><div>Kol.</div><div>Iznos</div></div>${items}</div>
      <div class="admin-totals"><div class="admin-total-row"><span>Vrednost robe</span><strong>${esc(money(o.goodsTotal))}</strong></div><div class="admin-total-row"><span>Dostava</span><strong>${o.shipping===0?'Besplatna':esc(money(o.shipping))}</strong></div><div class="admin-total-row final"><span>Ukupno</span><span>${esc(money(o.total))}</span></div></div>
      ${actions}
      <div class="admin-events"><div class="admin-box"><h3>Istorija</h3>${events}</div></div>
    </div>`;

    detail.querySelector('[data-confirm]')?.addEventListener('click',()=>confirmOrder(o.id));
    detail.querySelector('[data-ship-form]')?.addEventListener('submit',e=>shipOrder(e,o.id));
    detail.querySelector('[data-receipt]')?.addEventListener('click',()=>downloadReceipt(o.id,o.receiptFilename));
  }

  function row(label,value){return `<div class="admin-info-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`}
  function rowLink(label,href,value){return `<div class="admin-info-row"><span>${esc(label)}</span><strong><a class="admin-link" href="${esc(href)}">${esc(value)}</a></strong></div>`}
  function eventTitle(v){return ({created:'Kreirana',confirmed:'Potvrđena',shipped:'Poslata'}[v]||v)}

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

  loginForm.addEventListener('submit',async e=>{e.preventDefault();token=tokenInput.value.trim();if(!token)return;sessionStorage.setItem(KEY,token);showApp();await loadOrders(true)});
  logout.addEventListener('click',()=>{sessionStorage.removeItem(KEY);token='';selectedId='';tokenInput.value='';showLogin()});
  refresh.addEventListener('click',()=>loadOrders());
  filter.addEventListener('change',()=>loadOrders());
  search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>loadOrders(),350)});

  if(token){showApp();loadOrders(true)}else showLogin();
})();
