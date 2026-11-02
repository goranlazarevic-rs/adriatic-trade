/* Operator-only synthetic pilot. No arbitrary cart, customer or endpoint input. */
function createProbeController({api,esc,money,onAccepted}) {
  const section=document.querySelector('[data-probe-section]'),content=section.querySelector('[data-probe-content]'),message=section.querySelector('[data-probe-message]');
  const labels={STANDARD:'Pojedinačni artikli',PAKET:'Probaj paket + pojedinačni artikal',BESPLATNA:'Premium paket + besplatna dostava',GURMAN:'Za svaki dan paket'};
  let generation=0,busy=false;
  function reset(){generation++;busy=false;content.innerHTML='';message.textContent='';section.classList.add('hidden');}
  async function load(){
    const current=++generation;busy=true;section.classList.remove('hidden');content.innerHTML='';message.textContent='Učitavanje probnih scenarija...';
    try {
      const data=await api('/admin/probe-orders',{cache:'no-store'});if(current!==generation)return;
      if(!Array.isArray(data.scenarios)||data.scenarios.length!==4)throw Error('Pregled nije potpun.');
      content.innerHTML=data.scenarios.map(o=>`<article class="admin-box"><h3>${esc(labels[o.scenario]||o.scenario)}</h3>
        <p>${esc(o.id)}</p><p>${o.items.map(i=>esc(i.name)+' × '+esc(i.qty)).join(' + ')}</p>
        <p>Roba ${esc(money(o.goodsTotal))} · dostava ${esc(money(o.shipping))} · ukupno ${esc(money(o.total))}</p>
        <button class="btn btn-secondary" type="button" data-probe-admit="${esc(o.scenario)}">Prihvati / proveri istu probnu porudžbinu</button>
        <div data-probe-result="${esc(o.scenario)}"></div></article>`).join('');
      content.querySelectorAll('[data-probe-admit]').forEach(button=>button.addEventListener('click',()=>admit(button.dataset.probeAdmit)));
      message.textContent='Pregled ne menja kvote. Za prijem kliknite odgovarajuću probu; ponavljanje koristi isti broj.';
    }catch(error){if(current===generation)message.textContent='Probni pregled nije učitan. '+error.message;}
    finally{if(current===generation)busy=false;}
  }
  async function admit(scenario){
    if(busy)return;
    if(!confirm('Prihvatiti ili proveriti istu sintetičku porudžbinu? Prvi uspešan prijem umanjuje samo probne kvote. Minimax se još ne poziva.'))return;
    const current=generation;busy=true;content.querySelectorAll('button').forEach(b=>b.disabled=true);message.textContent='Provera prijema porudžbine...';
    try {
      const result=await api('/admin/probe-orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scenario,confirm:true})});
      if(current!==generation)return;
      const order=result.order,node=content.querySelector(`[data-probe-result="${scenario}"]`);
      node.innerHTML=`<p>${esc(order.id)} · sačuvano ${esc(money(order.total))}. ${result.duplicate?'Postojeća porudžbina; kvote nisu ponovo umanjene.':'Prijem je sačuvan; kvote su jednom umanjene.'}</p>
        ${order.status==='new'?'<button class="btn btn-primary" type="button" data-probe-confirm disabled>Potvrdi probnu porudžbinu</button>':'<p>Porudžbina je potvrđena. Minimax pregled je u detaljima porudžbine.</p>'}`;
      node.querySelector('[data-probe-confirm]')?.addEventListener('click',()=>confirmOrder(order.id,node));
      message.textContent='Prijem je proveren. Za Minimax nacrt prvo potvrdite probnu porudžbinu.';
      await onAccepted(order.id);
    }catch(error){if(current===generation)message.textContent=error.message+' Ponovite samo isti scenario; broj porudžbine ostaje isti.';}
    finally{if(current===generation){busy=false;content.querySelectorAll('button').forEach(b=>b.disabled=false);}}
  }
  async function confirmOrder(id,node){
    if(busy||!confirm('Potvrditi sintetičku porudžbinu bez slanja poruka? Minimax nacrt se zatim kreira zasebnim dugmetom.'))return;
    const current=generation;busy=true;content.querySelectorAll('button').forEach(b=>b.disabled=true);
    try {
      await api('/admin/probe-orders/'+encodeURIComponent(id)+'/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true})});
      if(current!==generation)return;
      node.innerHTML='<p>Probna porudžbina je potvrđena. Minimax pregled je u detaljima porudžbine.</p>';
      await onAccepted(id);if(current===generation)message.textContent='Potvrđeno. Pregledajte stavke u detaljima i zasebno pokrenite probni Minimax nacrt.';
    }catch(error){if(current===generation)message.textContent=error.message+' Ponovite potvrdu iste porudžbine.';}
    finally{if(current===generation){busy=false;content.querySelectorAll('button').forEach(b=>b.disabled=false);}}
  }
  return {load,reset};
}
