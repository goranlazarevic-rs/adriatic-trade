const PRODUCTS={
 '10086':{sku:'10086',slug:'cvet-soli-100g',name:'Cvet soli - natron kesa 100 g',price:599,img:'/assets/img/products/cvet-soli-100g.png'},
 '10012':{sku:'10012',slug:'cvet-soli-125g',name:'Cvet soli - kutija sa plutanim poklopcem 125 g',price:799,img:'/assets/img/products/cvet-soli-125g.png'},
 '10306':{sku:'10306',slug:'nerafinisana-sitna-600g',name:'BIO nerafinisana sitna morska so 600 g ZIP',price:299,img:'/assets/img/products/nerafinisana-sitna-600g.png'},
 '10307':{sku:'10307',slug:'nerafinisana-krupna-600g',name:'BIO nerafinisana krupna morska so 600 g ZIP',price:299,img:'/assets/img/products/nerafinisana-krupna-600g.png'},
 '10240':{sku:'10240',slug:'nerafinisana-sitna-500g',name:'BIO nerafinisana sitna morska so 500 g - kutija sa poklopcem',price:549,img:'/assets/img/products/nerafinisana-sitna-500g.png'},
 'PKT-PROBA':{sku:'PKT-PROBA',name:'Probaj',price:1149,img:'/assets/img/story-premium/salt-in-hands.webp',detail:'Cvet soli 100 g + sitna 600 g ZIP + krupna 600 g ZIP'},
 'PKT-GURMAN':{sku:'PKT-GURMAN',name:'Za svaki dan',price:1649,img:'/assets/img/story-premium/harvest-workers-wide.webp',detail:'BIO nerafinisana sitna morska so 500 g - kutija + sitna 600 g ZIP + krupna 600 g ZIP + Cvet soli 100 g'},
 'PKT-KOMPLET':{sku:'PKT-KOMPLET',name:'Premium',price:1799,img:'/assets/img/story-premium/fleur-rake.webp',detail:'BIO nerafinisana sitna morska so 500 g - kutija + Cvet soli 125 g + Cvet soli 100 g'}
};
const FREE_SHIPPING=2500;
const SHIPPING_FEE=390;
const ORDER_ENDPOINT="https://adriatic-trade-orders.lakifinance.workers.dev/order";
const fmt=n=>new Intl.NumberFormat('sr-RS',{minimumFractionDigits:0,maximumFractionDigits:0}).format(n)+' RSD';
const getCart=()=>{try{return JSON.parse(localStorage.getItem('at_cart')||'{}')}catch(e){return {}}};
const saveCart=c=>{localStorage.setItem('at_cart',JSON.stringify(c));updateCartCount()};
const cartTotal=c=>Object.entries(c).reduce((s,[sku,q])=>s+(PRODUCTS[sku]?.price||0)*q,0);
const getsFreeShipping=c=>cartTotal(c)>=FREE_SHIPPING;
function updateCartCount(){const c=getCart();const n=Object.values(c).reduce((a,b)=>a+b,0);document.querySelectorAll('[data-cart-count]').forEach(x=>x.textContent=n)}
function addToCart(sku,qty=1){const c=getCart();c[sku]=(c[sku]||0)+qty;saveCart(c);const t=cartTotal(c),remain=Math.max(0,FREE_SHIPPING-t);showToast(t>=FREE_SHIPPING?'Dodato u korpu. Ostvarili ste besplatnu dostavu.':`Dodato u korpu. Još ${fmt(remain)} do besplatne dostave.`)}
function showToast(msg){let t=document.querySelector('.toast');if(!t){t=document.createElement('div');t.className='toast';Object.assign(t.style,{position:'fixed',right:'20px',bottom:'20px',zIndex:100,background:'#0e3f67',color:'#fff',padding:'13px 18px',borderRadius:'14px',boxShadow:'0 14px 35px rgba(0,0,0,.2)',fontWeight:'750'});document.body.appendChild(t)}t.innerHTML=`${msg} <a href="/korpa.html">Otvori korpu →</a>`;t.style.display='block';clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.style.display='none',2200)}
function bindAddButtons(){document.querySelectorAll('[data-add-cart]').forEach(b=>b.addEventListener('click',()=>addToCart(b.dataset.addCart,Number(b.dataset.qty||1))))}
function renderCart(){const root=document.querySelector('[data-cart-list]');if(!root)return;const c=getCart();const entries=Object.entries(c).filter(([s,q])=>PRODUCTS[s]&&q>0);if(!entries.length){root.innerHTML='<div class="card"><h2 class="h3">Korpa je prazna.</h2><p class="muted">Dodajte proizvod iz našeg asortimana.</p><a class="btn btn-primary" href="/proizvodi.html">Pogledaj proizvode</a></div>';document.querySelector('[data-cart-summary]').innerHTML='';return}root.innerHTML=entries.map(([sku,q])=>{const p=PRODUCTS[sku];return `<div class="cart-item"><img src="${p.img}" alt=""><div><b>${p.name}</b><div class="muted">${p.detail?p.detail+' · ':''}${fmt(p.price)} / kom</div><div class="qty" style="margin-top:8px"><button data-minus="${sku}" aria-label="Smanji količinu">−</button><strong>${q}</strong><button data-plus="${sku}" aria-label="Povećaj količinu">+</button><button class="btn btn-danger btn-small" data-remove="${sku}">Ukloni</button></div></div><strong>${fmt(p.price*q)}</strong></div>`}).join('');root.querySelectorAll('[data-minus]').forEach(b=>b.onclick=()=>{const c=getCart();c[b.dataset.minus]-=1;if(c[b.dataset.minus]<=0)delete c[b.dataset.minus];saveCart(c);renderCart()});root.querySelectorAll('[data-plus]').forEach(b=>b.onclick=()=>{const c=getCart();c[b.dataset.plus]+=1;saveCart(c);renderCart()});root.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{const c=getCart();delete c[b.dataset.remove];saveCart(c);renderCart()});renderSummary()}
function renderSummary(){const box=document.querySelector('[data-cart-summary]');if(!box)return;const c=getCart(),t=cartTotal(c),free=getsFreeShipping(c),shipping=free?0:SHIPPING_FEE,total=t+shipping,remain=Math.max(0,FREE_SHIPPING-t),pct=Math.min(100,t/FREE_SHIPPING*100);box.innerHTML=`<div class="order-box"><h2 class="h3">Pregled porudžbine</h2><div class="order-line"><span>Vrednost robe</span><b>${fmt(t)}</b></div><div class="order-line"><span>Dostava</span><b>${free?'Besplatna':fmt(shipping)}</b></div><div class="free-progress"><span style="width:${pct}%"></span></div><p class="muted" style="font-size:.88rem">${free?'Ostvarili ste besplatnu dostavu.':'Još '+fmt(remain)+' do besplatne dostave.'}</p><div class="order-total"><span>Ukupno za plaćanje</span><span>${fmt(total)}</span></div><a class="btn btn-primary" style="width:100%;margin-top:18px" href="/checkout.html">Nastavi na poručivanje</a><p class="muted" style="font-size:.78rem;margin-bottom:0">Plaćanje pouzećem. Dostava je 390 RSD za porudžbine ispod 2.500 RSD, a besplatna od 2.500 RSD.</p></div>`}
function cartFingerprint(entries){return entries.map(([sku,q])=>`${sku}:${q}`).sort().join('|')}
function makeSubmissionId(){const d=new Date(),date=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;let token='';if(window.crypto?.randomUUID)token=crypto.randomUUID();else if(window.crypto?.getRandomValues){const a=new Uint32Array(4);crypto.getRandomValues(a);token=Array.from(a,x=>x.toString(16).padStart(8,'0')).join('-')}else token=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;return `${date}-${token}`}
function getSubmissionId(fingerprint){try{const saved=JSON.parse(sessionStorage.getItem('at_pending_order')||'null');if(saved?.id&&saved?.fingerprint===fingerprint)return saved.id}catch(e){}const id=makeSubmissionId();try{sessionStorage.setItem('at_pending_order',JSON.stringify({id,fingerprint}))}catch(e){}return id}
function clearSubmissionId(){try{sessionStorage.removeItem('at_pending_order')}catch(e){}}
function setOrderStatus(el,message,type=''){if(!el)return;el.textContent=message;el.className=`order-status${type?' '+type:''}`}
function renderCheckout(){
 const root=document.querySelector('[data-checkout-summary]'),form=document.querySelector('[data-order-form]');if(!root||!form)return;
 const c=getCart(),entries=Object.entries(c).filter(([s,q])=>PRODUCTS[s]&&q>0);
 if(!entries.length){root.innerHTML='<div class="notice">Korpa je prazna. <a href="/proizvodi.html">Vratite se na proizvode.</a></div>';form.classList.add('hidden');return}
 const t=cartTotal(c),free=getsFreeShipping(c),shipping=free?0:SHIPPING_FEE,total=t+shipping;
 root.innerHTML=`<div class="checkout-summary"><h3 class="h3">Vaša porudžbina</h3><p class="muted">Broj porudžbine biće dodeljen nakon uspešnog slanja.</p>${entries.map(([sku,q])=>`<div class="order-line"><span>${PRODUCTS[sku].name} × ${q}</span><b>${fmt(PRODUCTS[sku].price*q)}</b></div>`).join('')}<div class="order-line"><span>Dostava</span><b>${free?'0 RSD - besplatna':fmt(shipping)}</b></div><div class="order-total"><span>Ukupno za plaćanje</span><span>${fmt(total)}</span></div></div>`;
 const address=form.querySelector('[name="Adresa"]'),addressLabel=document.querySelector('[data-address-label]'),addressField=document.querySelector('[data-address-field]'),deliveryRadios=form.querySelectorAll('[name="Nacin isporuke"]'),parcelNote=document.querySelector('[data-parcel-note]');
 function syncDelivery(){const method=form.querySelector('[name="Nacin isporuke"]:checked')?.value||'Dostava na adresu',parcel=method==='Paketomat';if(address){address.required=!parcel;address.placeholder='Ulica i broj';if(parcel)address.value=''}if(addressLabel)addressLabel.textContent='Adresa i broj *';if(addressField)addressField.classList.toggle('hidden',parcel);if(parcelNote)parcelNote.classList.toggle('hidden',!parcel)}
 deliveryRadios.forEach(r=>r.addEventListener('change',syncDelivery));syncDelivery();
 const button=form.querySelector('[data-order-submit]')||form.querySelector('[type="submit"]'),hint=document.querySelector('[data-checkout-hint]'),status=document.querySelector('[data-order-status]');
 button.textContent='Naruči uz obavezu plaćanja - pouzećem';if(hint)hint.textContent=`Klikom na dugme potvrđujete porudžbinu i obavezu plaćanja ukupnog iznosa ${fmt(total)}. Dostava je ${free?'besplatna':fmt(shipping)}.`;
 form.addEventListener('submit',async e=>{
   e.preventDefault();if(form.dataset.submitting==='1')return;
   const fingerprint=cartFingerprint(entries),submissionId=getSubmissionId(fingerprint),method=form.querySelector('[name="Nacin isporuke"]:checked')?.value||'Dostava na adresu';
   const payload={submissionId,customer:{firstName:form.querySelector('[name="Ime"]').value.trim(),lastName:form.querySelector('[name="Prezime"]').value.trim(),email:form.querySelector('[name="email"]').value.trim(),phone:form.querySelector('[name="Telefon"]').value.trim()},delivery:{method,address:method==='Dostava na adresu'?(address?.value.trim()||''):'',postalCode:form.querySelector('[name="Postanski broj"]').value.trim(),city:form.querySelector('[name="Mesto"]').value.trim(),note:form.querySelector('[name="Napomena"]').value.trim()},items:entries.map(([sku,qty])=>({sku,qty}))};
   form.dataset.submitting='1';button.disabled=true;const oldText=button.textContent;button.textContent='Porudžbina se šalje…';setOrderStatus(status,'Šaljemo porudžbinu. Molimo sačekajte…','sending');
   try{
     const response=await fetch(ORDER_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),credentials:'omit'});let data={};try{data=await response.json()}catch(err){}
     if(!response.ok||!data.ok||!data.orderId)throw new Error(data.error||'Porudžbina nije potvrđena od servera. Molimo pokušajte ponovo.');
     try{sessionStorage.setItem('at_last_order_id',data.orderId)}catch(e){}
     localStorage.removeItem('at_cart');clearSubmissionId();setOrderStatus(status,`Porudžbina ${data.orderId} je uspešno primljena.`,'success-message');
     window.location.href=`/hvala.html?order=${encodeURIComponent(data.orderId)}`;
   }catch(err){console.error('Order submit failed',err);setOrderStatus(status,err?.message||'Došlo je do greške. Molimo pokušajte ponovo.','error');form.dataset.submitting='0';button.disabled=false;button.textContent=oldText;}
 });
}

function setupMobileOrderBar(){
 const path=location.pathname;
 if(path.includes('/checkout')||path.includes('/hvala')||path.includes('/korpa')) return;
 const bar=document.createElement('div');bar.className='mobile-order-bar';
 const sku=document.body.dataset.productSku;const p=sku?PRODUCTS[sku]:null;
 if(p){bar.innerHTML=`<div class="mobile-order-copy"><b>${fmt(p.price)}</b><small>${p.name}</small></div><button class="btn btn-primary" data-mobile-add="${p.sku}">Dodaj u korpu</button>`;bar.querySelector('[data-mobile-add]').onclick=()=>addToCart(p.sku)}
 else{bar.innerHTML=`<div class="mobile-order-copy"><b>Poručite online</b><small>Dostava 390 RSD • besplatna od 2.500</small></div><a class="btn btn-primary" href="/proizvodi.html">Poruči</a>`}
 document.body.appendChild(bar)
}

function showThankYouOrder(){const el=document.querySelector('[data-order-id]');if(!el)return;let id=new URLSearchParams(location.search).get('order');if(!id||id==='undefined'||id==='null'){try{id=sessionStorage.getItem('at_last_order_id')||''}catch(e){id=''}}if(id&&id!=='undefined'&&id!=='null'){el.textContent=id;document.querySelector('[data-order-id-wrap]')?.classList.remove('hidden')}}
const toggle=document.querySelector('.nav-toggle'),links=document.querySelector('.nav-links');if(toggle&&links){toggle.onclick=()=>{links.classList.toggle('open');toggle.setAttribute('aria-expanded',links.classList.contains('open'))}}document.querySelectorAll('[data-year]').forEach(x=>x.textContent=new Date().getFullYear());updateCartCount();bindAddButtons();renderCart();renderCheckout();showThankYouOrder();setupMobileOrderBar();
