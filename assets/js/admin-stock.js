/* Stage-only observation. Never copies accounting stock into checkout quotas. */
function createMinimaxStockController({api,esc,dt}) {
  const section=document.querySelector('[data-minimax-stock-section]');
  const button=section.querySelector('[data-minimax-stock-read]'),calculationButton=section.querySelector('[data-minimax-reservations-read]'),message=section.querySelector('[data-minimax-stock-message]'),content=section.querySelector('[data-minimax-stock-content]');
  let generation=0,busy=false;
  function reset(){generation++;busy=false;button.disabled=false;calculationButton.disabled=false;content.innerHTML='';message.textContent='Podaci još nisu očitani.';section.classList.add('hidden');content.setAttribute('aria-busy','false');}
  function show(){section.classList.remove('hidden');}
  async function read(calculate=false){
    if(busy)return;
    const current=++generation;busy=true;button.disabled=true;calculationButton.disabled=true;content.innerHTML='';content.setAttribute('aria-busy','true');message.textContent=calculate?'Provera probnih rezervacija, Minimax nacrta i zaliha...':'Čitanje zaliha iz Minimax-a, artikal po artikal...';
    try {
      const data=await api(calculate?'/admin/minimax-availability':'/admin/minimax-stock',{cache:'no-store'});
      if(current!==generation)return;
      if(data.readOnly!==true||data.organisationId!==81179||data.warehouseId!==40999||!Array.isArray(data.rows)||data.rows.length!==5||!Number.isFinite(Date.parse(data.readAt)))throw Error('Nepotpun pregled');
      if(calculate&&(data.scope!=='synthetic-reservation-preview'||data.salesReady!==false||data.quotaWrite!==false||!Array.isArray(data.bundles)||data.bundles.length!==3||!Number.isSafeInteger(data.reservationCount)))throw Error('Nepotpun obračun');
      const stockRows=data.rows.map(r=>`<tr><th scope="row">${esc(r.sku)}</th><td>${esc(r.name)}</td>
        <td class="stock-number">${r.state==='reported'&&Number.isSafeInteger(r.quantity)?esc(r.quantity):'Nije prijavljeno'}${r.quantity<0?'<small class="stock-warning">Negativno stanje</small>':''}</td>
        ${calculate?`<td class="stock-number">${esc(r.reserved)}</td><td class="stock-number"><strong>${r.simulationRemaining===null?'Nepoznato':esc(r.simulationRemaining)}</strong>${r.shortage>0?'<small class="stock-warning">Manjak: '+esc(r.shortage)+'</small>':''}</td>`:''}</tr>`).join('');
      content.innerHTML=`<div class="admin-stock-table-wrap" role="region" aria-labelledby="minimax-items-caption" tabindex="0"><table class="admin-stock-table" data-minimax-items-table>
        <caption id="minimax-items-caption">${calculate?'Probni obračun artikala':'Minimax zalihe'} · količine u komadima</caption>
        <thead><tr><th scope="col">Šifra</th><th scope="col">Artikal</th><th scope="col" class="stock-number">Minimax</th>${calculate?'<th scope="col" class="stock-number">Rezervisano</th><th scope="col" class="stock-number">Probni ostatak</th>':''}</tr></thead><tbody>${stockRows}</tbody></table></div>`;
      if(calculate)content.innerHTML+=`<div class="admin-stock-table-wrap admin-stock-bundles" role="region" aria-labelledby="minimax-bundles-caption" tabindex="0"><table class="admin-stock-table" data-minimax-bundles-table>
        <caption id="minimax-bundles-caption">Probni kapacitet paketa · paketi dele iste komade</caption><thead><tr><th scope="col">Paket</th><th scope="col" class="stock-number">Kapacitet (kom.)</th></tr></thead>
        <tbody>${data.bundles.map(b=>`<tr><th scope="row">${esc(b.name)}</th><td class="stock-number"><strong>${b.simulationRemaining===null?'Nepoznato':esc(b.simulationRemaining)}</strong></td></tr>`).join('')}</tbody></table></div>`;
      message.textContent=(calculate?'Probni obračun: '+data.reservationCount+' sintetičkih porudžbina. Paketi dele iste komade; kapaciteti se ne sabiraju. ':'')+'Očitano: '+dt(data.readAt)+'. Ovo je trenutni pregled; za novo stanje ponovo kliknite dugme. Izostanak podatka nije nulta zaliha.';
    }catch(error){if(current===generation){
      content.innerHTML='';
      const steps={authentication:'prijava u Minimax',organisation:'provera organizacije',stock:'čitanje zaliha',reservations:'provera probnih rezervacija',drafts:'provera postojećih Minimax nacrta'};
      const codes=new Set(['MINIMAX_SECRETS_REQUIRED','MINIMAX_HTTP_ERROR','MINIMAX_INVALID_RESPONSE','MINIMAX_TIMEOUT','MINIMAX_NETWORK_ERROR','MINIMAX_INVALID_AUTH','MINIMAX_ORG_ACCESS_REQUIRED','MINIMAX_INVALID_STOCK','MINIMAX_STOCK_UNAVAILABLE','MINIMAX_INVALID_RESERVATIONS','MINIMAX_RESERVATION_RECONCILIATION_REQUIRED','MINIMAX_RESERVATIONS_CHANGED']);
      const parts=[];
      if(Object.hasOwn(steps,error.step))parts.push('Korak: '+steps[error.step]);
      if(['10086','10012','10240','10306','10307'].includes(error.sku))parts.push('SKU '+error.sku);
      if(Number.isInteger(error.upstreamStatus)&&error.upstreamStatus>=300&&error.upstreamStatus<=599)parts.push('Minimax HTTP '+error.upstreamStatus);
      if(codes.has(error.code))parts.push('Kod: '+error.code);
      const reasons={MINIMAX_RESERVATIONS_CHANGED:'Podaci su promenjeni tokom čitanja. Ponovite ceo probni obračun.',MINIMAX_RESERVATION_RECONCILIATION_REQUIRED:'Potrebno je usaglasiti rezervacije i Minimax dokumente pre obračuna.',MINIMAX_INVALID_RESERVATIONS:'Evidencija probnih rezervacija nije potpuna ili usklađena.'};
      message.textContent=(calculate?'Probni obračun nije potvrđen. ':'Zalihe nisu učitane. ')+(Object.hasOwn(reasons,error.code)?reasons[error.code]+' ':'')+(parts.length?parts.join(' · ')+'. ':'Proverite vezu i Minimax pristup. ')+'Probne kvote nisu promenjene.';
    }}
    finally{if(current===generation){busy=false;button.disabled=false;calculationButton.disabled=false;content.setAttribute('aria-busy','false');}}
  }
  button.addEventListener('click',()=>read(false));
  calculationButton.addEventListener('click',()=>read(true));
  return {show,reset};
}
