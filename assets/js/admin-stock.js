/* Stage-only observation. Never copies accounting stock into checkout quotas. */
function createMinimaxStockController({api,esc,dt}) {
  const section=document.querySelector('[data-minimax-stock-section]');
  const button=section.querySelector('[data-minimax-stock-read]'),message=section.querySelector('[data-minimax-stock-message]'),content=section.querySelector('[data-minimax-stock-content]');
  let generation=0,busy=false;
  function reset(){generation++;busy=false;button.disabled=false;content.innerHTML='';message.textContent='Podaci još nisu očitani.';section.classList.add('hidden');content.setAttribute('aria-busy','false');}
  function show(){section.classList.remove('hidden');}
  async function read(){
    if(busy)return;
    const current=++generation;busy=true;button.disabled=true;content.innerHTML='';content.setAttribute('aria-busy','true');message.textContent='Čitanje zaliha iz Minimax-a...';
    try {
      const data=await api('/admin/minimax-stock',{cache:'no-store'});
      if(current!==generation)return;
      if(data.readOnly!==true||data.organisationId!==81179||data.warehouseId!==40999||!Array.isArray(data.rows)||data.rows.length!==5||!Number.isFinite(Date.parse(data.readAt)))throw Error('Nepotpun pregled');
      content.innerHTML=data.rows.map(r=>`<article><h3>${esc(r.name)}</h3><p>SKU <strong>${esc(r.sku)}</strong></p>
        <p><strong>${r.state==='reported'&&Number.isSafeInteger(r.quantity)?esc(r.quantity)+' kom.':'Nije prijavljeno'}</strong></p>
        ${r.quantity<0?'<p>Negativno stanje — proverite u Minimax-u.</p>':''}</article>`).join('');
      message.textContent='Očitano: '+dt(data.readAt)+'. Ovo je trenutni pregled; za novo stanje ponovo kliknite dugme. Izostanak podatka nije nulta zaliha.';
    }catch(error){if(current===generation){
      content.innerHTML='';
      const steps={authentication:'prijava u Minimax',organisation:'provera organizacije',stock:'čitanje zaliha'};
      const codes=new Set(['MINIMAX_SECRETS_REQUIRED','MINIMAX_HTTP_ERROR','MINIMAX_INVALID_RESPONSE','MINIMAX_TIMEOUT','MINIMAX_NETWORK_ERROR','MINIMAX_INVALID_AUTH','MINIMAX_ORG_ACCESS_REQUIRED','MINIMAX_INVALID_STOCK','MINIMAX_STOCK_UNAVAILABLE']);
      const parts=[];
      if(Object.hasOwn(steps,error.step))parts.push('Korak: '+steps[error.step]);
      if(['10086','10012','10240','10306','10307'].includes(error.sku))parts.push('SKU '+error.sku);
      if(Number.isInteger(error.upstreamStatus)&&error.upstreamStatus>=300&&error.upstreamStatus<=599)parts.push('Minimax HTTP '+error.upstreamStatus);
      if(codes.has(error.code))parts.push('Kod: '+error.code);
      message.textContent='Zalihe nisu učitane. '+(parts.length?parts.join(' · ')+'. ':'Proverite vezu i Minimax pristup. ')+'Probne kvote nisu promenjene.';
    }}
    finally{if(current===generation){busy=false;button.disabled=false;content.setAttribute('aria-busy','false');}}
  }
  button.addEventListener('click',read);
  return {show,reset};
}
