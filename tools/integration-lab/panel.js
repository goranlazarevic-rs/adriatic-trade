'use strict';
const token=document.querySelector('meta[name="lab-token"]').content;
const $=id=>document.getElementById(id);
const labels={new:'Nova',confirmed:'Potvrđena',pending:'Na čekanju',unpaid:'Nenaplaćeno',paid:'Naplaćeno (TEST)',received:'Preneto (TEST)',handed_over:'Predato (TEST)',delivered:'Isporučeno (TEST)',returned:'Vraćeno (TEST)',succeeded:'Potvrđeno (TEST)',uncertain:'NEIZVESTAN ISHOD',in_flight:'Potrebna provera',retryable:'Dozvoljeno ponavljanje',
  'received-order':'Primljena narudžbina','receipt-email':'PDF poruka',shipment:'Kurirska pošiljka'};
let state,selected='TEST-COD-001',busy=false;
const label=value=>labels[value]||value;
const money=value=>new Intl.NumberFormat('sr-Latn-RS',{style:'currency',currency:'RSD'}).format(value/100);
function el(tag,text,className) {const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
async function api(path,options={}) {
  const response=await fetch(path,{...options,headers:{'X-Lab-Token':token,...options.headers}});
  if(!response.ok){const data=await response.json();throw new Error(data.error);}
  return response;
}
function message(text,error=false) {$('message').textContent=text;$('message').className=error?'error':'success';}
function render() {
  const order=state.orders.find(o=>o.id===selected);
  $('orders').replaceChildren(...state.orders.map(o=>{const b=el('button',o.id,`order ${o.id===selected?'selected':''}`);b.type='button';b.setAttribute('aria-pressed',String(o.id===selected));b.disabled=busy;b.onclick=()=>{selected=o.id;message('');render();};return b;}));
  const s=order.snapshot;
  $('summary').replaceChildren(el('p',s.delivery==='courier'?'KURIRSKO POUZEĆE':'LIČNA DOSTAVA','eyebrow'),el('h2',order.id),el('p',`TEST kupac · ${s.customer.email}`),el('p',`Roba ${money(s.goodsTotal)} + dostava ${money(s.shipping)} = ${money(s.total)}`,'amount'));
  const transfer=order.jobs.find(j=>j.kind==='received-order'),email=order.jobs.find(j=>j.kind==='receipt-email'),shipment=order.jobs.find(j=>j.kind==='shipment');
  const cards=[['Porudžbina',label(order.status)],['Minimax TEST',label(transfer?.status||'pending')],['Dokument',order.receipt?'Povezan TEST PDF':'Bez dokumenta'],['PDF poruka',label(email?.status||'pending')],['Pošiljka',shipment?.external_id||label(shipment?.status||'pending')],['Isporuka',label(order.fulfillment)],['Naplata',label(order.payment)],['Prenos otkupnine',s.delivery==='local'?'Nije primenljivo':label(order.remittance)]];
  $('statuses').replaceChildren(...cards.map(([name,value])=>{const box=el('div',undefined,'status');box.append(el('span',name),el('strong',value));return box;}));
  $('jobs').replaceChildren(...order.jobs.map(j=>{const tr=el('tr');for(const value of [label(j.kind),label(j.status),j.attempts,j.external_id||'—'])tr.append(el('td',String(value)));return tr;}));
  if(!order.jobs.length){const tr=el('tr'),td=el('td','Još nema operacija.');td.colSpan=4;tr.append(td);$('jobs').append(tr);}
  $('events').replaceChildren(...[...order.events].reverse().map(e=>el('li',`${new Date(e.created_at).toLocaleTimeString('sr-Latn-RS')} · ${e.detail}`)));
  $('counts').textContent=state.providerCounts.map(c=>`${label(c.kind)}: ${c.count}`).join(' · ')||'Još nema zapisa.';
  document.querySelectorAll('[data-action]').forEach(button=>{
    button.disabled=busy || (s.delivery==='local' && ['shipment','reconcile-shipment','handoff','returned','remittance'].includes(button.dataset.action));
  });$('pdf').disabled=busy||!order.receipt;
}
document.querySelectorAll('[data-action]').forEach(button=>button.onclick=async()=>{
  if(busy)return;busy=true;render();
  try {state=await(await api('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:selected,action:button.dataset.action,scenario:$('scenario').value})})).json();message('TEST radnja je evidentirana. Proverite statuse i istoriju.');}
  catch(error){message(error.message,true);try{state=await(await api('/api/state')).json();}catch{ /* Keep the last known view if the local server is unavailable. */ }}
  finally{busy=false;render();}
});
$('pdf').onclick=async()=>{try{const response=await api('/api/receipt/'+selected),url=URL.createObjectURL(await response.blob()),a=el('a');a.href=url;a.download=selected+'-SIMULATION.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){message(error.message,true);}};
api('/api/state').then(r=>r.json()).then(data=>{state=data;render();}).catch(error=>message(error.message,true));
