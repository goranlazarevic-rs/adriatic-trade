const PRODUCTS={
 '10086':{sku:'10086',slug:'cvet-soli-100g',name:'Cvet soli - natron kesa 100 g',shortName:'Cvet soli 100 g',price:599,img:'/assets/img/products/cvet-soli-100g.png'},
 '10012':{sku:'10012',slug:'cvet-soli-125g',name:'Cvet soli - kutija sa plutanim poklopcem 125 g',shortName:'Cvet soli 125 g',price:799,img:'/assets/img/products/cvet-soli-125g.png'},
 '10306':{sku:'10306',slug:'nerafinisana-sitna-600g',name:'BIO nerafinisana sitna morska so 600 g ZIP',shortName:'BIO sitna 600 g',price:299,img:'/assets/img/products/nerafinisana-sitna-600g.png'},
 '10307':{sku:'10307',slug:'nerafinisana-krupna-600g',name:'BIO nerafinisana krupna morska so 600 g ZIP',shortName:'BIO krupna 600 g',price:299,img:'/assets/img/products/nerafinisana-krupna-600g.png'},
 '10240':{sku:'10240',slug:'nerafinisana-sitna-500g',name:'BIO nerafinisana sitna morska so 500 g - kutija sa poklopcem',shortName:'BIO sitna 500 g kutija',price:549,img:'/assets/img/products/nerafinisana-sitna-500g.png'},
 'PKT-PROBA':{sku:'PKT-PROBA',name:'Probaj',price:1149,img:'/assets/img/story-premium/salt-in-hands.webp',detail:'Cvet soli 100 g + sitna 600 g ZIP + krupna 600 g ZIP'},
 'PKT-GURMAN':{sku:'PKT-GURMAN',name:'Za svaki dan',price:1649,img:'/assets/img/story-premium/harvest-workers-wide.webp',detail:'BIO nerafinisana sitna morska so 500 g - kutija + sitna 600 g ZIP + krupna 600 g ZIP + Cvet soli 100 g'},
 'PKT-KOMPLET':{sku:'PKT-KOMPLET',name:'Premium',price:1799,img:'/assets/img/story-premium/fleur-rake.webp',detail:'BIO nerafinisana sitna morska so 500 g - kutija + Cvet soli 125 g + Cvet soli 100 g'}
};
const FREE_SHIPPING=2500;
const SHIPPING_FEE=390;
const AT_ANALYTICS=window.AT_ANALYTICS_CONFIG||{};
const GA_MEASUREMENT_ID=String(AT_ANALYTICS.measurementId||'').trim();
const GA_ENABLED=AT_ANALYTICS.enabled!==false&&/^G-[A-Z0-9]+$/i.test(GA_MEASUREMENT_ID)&&!GA_MEASUREMENT_ID.includes('XXXX');
const GA_CURRENCY=AT_ANALYTICS.currency||'RSD';
const GA_CONSENT_KEY='at_analytics_consent';
let gaLoaded=false;
function getAnalyticsConsent(){try{return localStorage.getItem(GA_CONSENT_KEY)||''}catch(e){return ''}}
function setAnalyticsConsent(value){try{localStorage.setItem(GA_CONSENT_KEY,value)}catch(e){}}
function analyticsCookieSuffix(){return GA_MEASUREMENT_ID.replace(/^G-/i,'').replace(/-/g,'_')}
function deleteAnalyticsCookies(){
 const names=['_ga',`_ga_${analyticsCookieSuffix()}`];
 names.forEach(name=>{document.cookie=`${name}=; Max-Age=0; path=/; SameSite=Lax`;document.cookie=`${name}=; Max-Age=0; path=/; domain=.${location.hostname}; SameSite=Lax`});
}
function loadGoogleAnalytics(){
 if(!GA_ENABLED||gaLoaded||getAnalyticsConsent()!=='granted')return;
 window[`ga-disable-${GA_MEASUREMENT_ID}`]=false;
 window.dataLayer=window.dataLayer||[];
 window.gtag=window.gtag||function(){window.dataLayer.push(arguments)};
 window.gtag('js',new Date());
 window.gtag('config',GA_MEASUREMENT_ID,{send_page_view:true,debug_mode:new URLSearchParams(location.search).get('ga_debug')==='1'});
 const script=document.createElement('script');script.async=true;script.src=`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;document.head.appendChild(script);
 gaLoaded=true;
}
function disableGoogleAnalytics(){if(!GA_ENABLED)return;window[`ga-disable-${GA_MEASUREMENT_ID}`]=true;deleteAnalyticsCookies()}
function gaEvent(name,params={}){if(!GA_ENABLED||getAnalyticsConsent()!=='granted')return;loadGoogleAnalytics();if(typeof window.gtag==='function')window.gtag('event',name,params)}
function gaItem(sku,qty=1){const p=PRODUCTS[sku];if(!p)return null;return {item_id:sku,item_name:p.name,item_category:sku.startsWith('PKT-')?'Paket':'Solana Nin',price:p.price,quantity:qty}}
function gaItemsFromCart(c){return Object.entries(c).map(([sku,qty])=>gaItem(sku,qty)).filter(Boolean)}
function gaCartValue(c){return cartTotal(c)}
function sessionOnce(key){try{if(sessionStorage.getItem(key)==='1')return false;sessionStorage.setItem(key,'1');return true}catch(e){return true}}
function analyticsConsentHtml(){return `<div class="analytics-consent" role="dialog" aria-label="Podešavanje analitičkih kolačića"><div class="analytics-consent-copy"><b>Analitika sajta</b><p>Uz vašu saglasnost koristimo Google Analytics da razumemo posećenost i kupovni tok. Ne šaljemo ime, email, telefon ni adresu.</p><a href="/politika-privatnosti.html">Saznajte više</a></div><div class="analytics-consent-actions"><button type="button" class="btn btn-secondary btn-small" data-analytics-decline>Samo neophodni</button><button type="button" class="btn btn-primary btn-small" data-analytics-accept>Prihvati analitiku</button></div></div>`}
function showAnalyticsConsent(){
 if(!GA_ENABLED)return;
 let box=document.querySelector('.analytics-consent');if(!box){document.body.insertAdjacentHTML('beforeend',analyticsConsentHtml());box=document.querySelector('.analytics-consent')}
 box.classList.add('is-visible');
 box.querySelector('[data-analytics-accept]').onclick=()=>{setAnalyticsConsent('granted');box.classList.remove('is-visible');loadGoogleAnalytics();trackPageCommerce();trackPendingPurchase()};
 box.querySelector('[data-analytics-decline]').onclick=()=>{setAnalyticsConsent('denied');disableGoogleAnalytics();box.classList.remove('is-visible')};
}
function setupAnalyticsConsent(){
 if(!GA_ENABLED)return;
 const choice=getAnalyticsConsent();if(choice==='granted')loadGoogleAnalytics();else if(choice==='denied')disableGoogleAnalytics();else showAnalyticsConsent();
 document.querySelectorAll('[data-cookie-settings]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();showAnalyticsConsent()}));
}
function trackPageCommerce(){
 if(!GA_ENABLED||getAnalyticsConsent()!=='granted')return;
 const path=location.pathname||'/';
 const sku=document.body.dataset.productSku;
 if(sku&&PRODUCTS[sku]&&sessionOnce(`ga_view_item:${path}`)){const item=gaItem(sku,1);gaEvent('view_item',{currency:GA_CURRENCY,value:item.price,items:[item]})}
 if(path==='/proizvodi.html'&&sessionOnce(`ga_view_item_list:${path}`)){const items=Object.keys(PRODUCTS).map(s=>gaItem(s,1)).filter(Boolean);gaEvent('view_item_list',{item_list_id:'catalog',item_list_name:'Proizvodi',items})}
 if(path==='/korpa.html'){const c=getCart();if(Object.keys(c).length&&sessionOnce(`ga_view_cart:${Date.now()}:${Math.random()}`))gaEvent('view_cart',{currency:GA_CURRENCY,value:gaCartValue(c),items:gaItemsFromCart(c)})}
}
function trackAddToCart(sku,qty=1,source='product'){const item=gaItem(sku,qty);if(!item)return;gaEvent('add_to_cart',{currency:GA_CURRENCY,value:item.price*qty,items:[item],at_source:source})}
function trackRemoveFromCart(sku,qty=1,source='product'){const item=gaItem(sku,qty);if(!item)return;gaEvent('remove_from_cart',{currency:GA_CURRENCY,value:item.price*qty,items:[item],at_source:source})}
function markSmartCartUsed(){try{sessionStorage.setItem('at_smart_cart_used','1')}catch(e){}}
function smartCartUsed(){try{return sessionStorage.getItem('at_smart_cart_used')==='1'}catch(e){return false}}
function clearSmartCartUsed(){try{sessionStorage.removeItem('at_smart_cart_used')}catch(e){}}
function trackSmartCartShown(rec,c){if(!rec)return;const key=`ga_smart_shown:${cartFingerprint(Object.entries(c))}:${rec.sku}`;if(!sessionOnce(key))return;gaEvent('smart_cart_shown',{currency:GA_CURRENCY,value:rec.price,item_id:rec.sku,item_name:rec.name,amount_to_free_shipping:rec.remain})}
function trackSmartCartAdded(rec){if(!rec)return;markSmartCartUsed();gaEvent('smart_cart_added',{currency:GA_CURRENCY,value:rec.price,item_id:rec.sku,item_name:rec.name,items:[gaItem(rec.sku,1)]})}
function storePendingPurchase(data,entries){try{sessionStorage.setItem('at_pending_purchase_event',JSON.stringify({transactionId:data.orderId,value:Number(data.goodsTotal)||0,orderTotal:Number(data.total)||0,shipping:Number(data.shipping)||0,items:entries.map(([sku,qty])=>({sku,qty})),smartCartUsed:smartCartUsed()}))}catch(e){}}
function trackPendingPurchase(){
 if(!GA_ENABLED||getAnalyticsConsent()!=='granted')return;
 let p=null;try{p=JSON.parse(sessionStorage.getItem('at_pending_purchase_event')||'null')}catch(e){}if(!p?.transactionId)return;
 const sentKey=`at_purchase_sent:${p.transactionId}`;try{if(sessionStorage.getItem(sentKey)==='1')return}catch(e){}
 const items=(p.items||[]).map(x=>gaItem(x.sku,x.qty)).filter(Boolean);
 gaEvent('purchase',{transaction_id:p.transactionId,currency:GA_CURRENCY,value:p.value,shipping:p.shipping,items,order_total:p.orderTotal,free_shipping:p.shipping===0?'yes':'no',smart_cart_used:p.smartCartUsed?'yes':'no'});
 if(p.shipping===0)gaEvent('free_shipping_purchase',{transaction_id:p.transactionId,value:p.value,currency:GA_CURRENCY});
 if(p.smartCartUsed)gaEvent('smart_cart_purchase',{transaction_id:p.transactionId,value:p.value,currency:GA_CURRENCY});
 try{sessionStorage.setItem(sentKey,'1');sessionStorage.removeItem('at_pending_purchase_event')}catch(e){}clearSmartCartUsed();
}
const PROMOTIONS={
 '10240':{regularPrice:549,promoPrice:499,start:'2026-09-27',end:'2026-10-27',label:'WEB AKCIJA',validUntil:'26.10.2026.'}
};
function belgradeDateKey(date=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Belgrade',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const m=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${m.year}-${m.month}-${m.day}`;
}
function promoActive(promo,dateKey=belgradeDateKey()){return Boolean(promo&&dateKey>=promo.start&&dateKey<promo.end)}
function applyScheduledPrices(){Object.entries(PROMOTIONS).forEach(([sku,promo])=>{if(PRODUCTS[sku])PRODUCTS[sku].price=promoActive(promo)?promo.promoPrice:promo.regularPrice})}
function applyPromoDisplay(){
 Object.entries(PROMOTIONS).forEach(([sku,promo])=>{
   const active=promoActive(promo),price=active?promo.promoPrice:promo.regularPrice;
   document.querySelectorAll(`[data-live-price="${sku}"]`).forEach(el=>{
     if(active)el.innerHTML=`<span class="price-sale-wrap"><span class="price-old">${fmt(promo.regularPrice)}</span><span class="price-sale">${fmt(promo.promoPrice)}</span></span><small>${promo.label} · važi do ${promo.validUntil} · sa PDV-om</small>`;
     else if(!el.dataset.regularRendered){el.innerHTML=`${fmt(price)}<small>sa PDV-om</small>`;el.dataset.regularRendered='1'}
   });
   document.querySelectorAll(`[data-promo-badge="${sku}"]`).forEach(el=>el.classList.toggle('hidden',!active));
   const jsonLd=document.querySelector(`[data-product-jsonld="${sku}"]`);
   if(jsonLd){try{const data=JSON.parse(jsonLd.textContent);if(data.offers){data.offers.price=String(price);if(active)data.offers.priceValidUntil='2026-10-26';else delete data.offers.priceValidUntil}jsonLd.textContent=JSON.stringify(data)}catch(e){}}
 })
 const bundleValues={
   'PKT-GURMAN':{regular:PRODUCTS['10240'].price+PRODUCTS['10306'].price+PRODUCTS['10307'].price+PRODUCTS['10086'].price,offer:PRODUCTS['PKT-GURMAN'].price},
   'PKT-KOMPLET':{regular:PRODUCTS['10240'].price+PRODUCTS['10012'].price+PRODUCTS['10086'].price,offer:PRODUCTS['PKT-KOMPLET'].price}
 };
 Object.entries(bundleValues).forEach(([sku,v])=>{
   document.querySelectorAll(`[data-bundle-regular="${sku}"]`).forEach(el=>el.textContent=fmt(v.regular));
   document.querySelectorAll(`[data-bundle-saving="${sku}"]`).forEach(el=>el.textContent=`Ušteda ${fmt(v.regular-v.offer)} • besplatna dostava od 2.500 RSD`);
 });
}
applyScheduledPrices();
const ORDER_ENDPOINT="https://adriatic-trade-orders.lakifinance.workers.dev/order";
const fmt=n=>new Intl.NumberFormat('sr-RS',{minimumFractionDigits:0,maximumFractionDigits:0}).format(n)+' RSD';
const getCart=()=>{try{return JSON.parse(localStorage.getItem('at_cart')||'{}')}catch(e){return {}}};
const saveCart=c=>{localStorage.setItem('at_cart',JSON.stringify(c));updateCartCount();updateProductQuantityControls()};
const cartTotal=c=>Object.entries(c).reduce((s,[sku,q])=>s+(PRODUCTS[sku]?.price||0)*q,0);
const getsFreeShipping=c=>cartTotal(c)>=FREE_SHIPPING;
function updateCartCount(){const c=getCart();const n=Object.values(c).reduce((a,b)=>a+b,0);document.querySelectorAll('[data-cart-count]').forEach(x=>{x.textContent=n;x.classList.toggle('is-empty',n===0)});document.querySelectorAll('.mobile-cart-link').forEach(a=>a.setAttribute('aria-label',n?`Korpa, ${n} proizvoda`:'Korpa'))}
function setCartQuantity(sku,qty){const c=getCart();if(qty>0)c[sku]=qty;else delete c[sku];saveCart(c)}
function changeCartQuantity(sku,delta,source='quantity_control'){const c=getCart(),current=Number(c[sku])||0,next=Math.max(0,current+delta);if(delta>0)trackAddToCart(sku,Math.min(delta,next-current)||1,source);else if(delta<0&&current>0)trackRemoveFromCart(sku,Math.min(Math.abs(delta),current),source);setCartQuantity(sku,next)}
function inlineQtyControlHtml(sku){const p=PRODUCTS[sku];return `<div class="inline-cart-control hidden" data-inline-cart="${sku}" aria-label="Količina ${p?.name||sku} u korpi"><span class="inline-cart-label">U korpi</span><div class="inline-cart-stepper"><button type="button" data-inline-minus="${sku}" aria-label="Smanji količinu ${p?.name||'stavke'}">−</button><strong data-inline-qty="${sku}" aria-live="polite">1</strong><button type="button" data-inline-plus="${sku}" aria-label="Povećaj količinu ${p?.name||'stavke'}">+</button></div></div>`}
function bindProductQuantityControls(){
 document.querySelectorAll('[data-add-cart]').forEach(button=>{
   const sku=button.dataset.addCart;if(!PRODUCTS[sku]||button.dataset.qtyControlBound==='1')return;
   button.dataset.qtyControlBound='1';button.insertAdjacentHTML('afterend',inlineQtyControlHtml(sku));
 });
 document.querySelectorAll('[data-inline-minus]').forEach(b=>b.addEventListener('click',()=>changeCartQuantity(b.dataset.inlineMinus,-1)));
 document.querySelectorAll('[data-inline-plus]').forEach(b=>b.addEventListener('click',()=>changeCartQuantity(b.dataset.inlinePlus,1)));
 updateProductQuantityControls();
}
function updateProductQuantityControls(){
 const c=getCart();
 document.querySelectorAll('[data-add-cart]').forEach(button=>{
   const sku=button.dataset.addCart;if(!PRODUCTS[sku])return;
   const qty=Number(c[sku])||0,control=button.parentElement?.querySelector(`[data-inline-cart="${sku}"]`);
   button.classList.toggle('hidden',qty>0);if(control){control.classList.toggle('hidden',qty<=0);const value=control.querySelector(`[data-inline-qty="${sku}"]`);if(value)value.textContent=qty}
 });
 document.querySelectorAll('[data-mobile-add]').forEach(button=>{
   const sku=button.dataset.mobileAdd,qty=Number(c[sku])||0,control=button.parentElement?.querySelector(`[data-mobile-cart="${sku}"]`);
   button.classList.toggle('hidden',qty>0);if(control){control.classList.toggle('hidden',qty<=0);const value=control.querySelector(`[data-mobile-qty="${sku}"]`);if(value)value.textContent=qty}
 });
}
function addToCart(sku,qty=1,source='product'){const c=getCart();c[sku]=(c[sku]||0)+qty;saveCart(c);trackAddToCart(sku,qty,source);const t=cartTotal(c),remain=Math.max(0,FREE_SHIPPING-t);showToast(t>=FREE_SHIPPING?'Dodato u korpu. Ostvarili ste besplatnu dostavu.':`Dodato u korpu. Još ${fmt(remain)} do besplatne dostave.`)}
function showToast(msg){let t=document.querySelector('.toast');if(!t){t=document.createElement('div');t.className='toast';Object.assign(t.style,{position:'fixed',right:'20px',bottom:'20px',zIndex:100,background:'#0e3f67',color:'#fff',padding:'13px 18px',borderRadius:'14px',boxShadow:'0 14px 35px rgba(0,0,0,.2)',fontWeight:'750'});document.body.appendChild(t)}t.innerHTML=`${msg} <a href="/korpa.html">Otvori korpu →</a>`;t.style.display='block';clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.style.display='none',2200)}
function bindAddButtons(){document.querySelectorAll('[data-add-cart]').forEach(b=>b.addEventListener('click',()=>addToCart(b.dataset.addCart,Number(b.dataset.qty||1),'product_button')))}
function renderCart(){const root=document.querySelector('[data-cart-list]');if(!root)return;const c=getCart();const entries=Object.entries(c).filter(([s,q])=>PRODUCTS[s]&&q>0);if(!entries.length){root.innerHTML='<div class="card"><h2 class="h3">Korpa je prazna.</h2><p class="muted">Dodajte proizvod iz našeg asortimana.</p><a class="btn btn-primary" href="/proizvodi.html">Pogledaj proizvode</a></div>';document.querySelector('[data-cart-summary]').innerHTML='';return}root.innerHTML=entries.map(([sku,q])=>{const p=PRODUCTS[sku];return `<div class="cart-item"><img src="${p.img}" alt=""><div><b>${p.name}</b><div class="muted">${p.detail?p.detail+' · ':''}${fmt(p.price)} / kom</div><div class="qty" style="margin-top:8px"><button data-minus="${sku}" aria-label="Smanji količinu">−</button><strong>${q}</strong><button data-plus="${sku}" aria-label="Povećaj količinu">+</button><button class="btn btn-danger btn-small" data-remove="${sku}">Ukloni</button></div></div><strong>${fmt(p.price*q)}</strong></div>`}).join('');root.querySelectorAll('[data-minus]').forEach(b=>b.onclick=()=>{changeCartQuantity(b.dataset.minus,-1,'cart');renderCart()});root.querySelectorAll('[data-plus]').forEach(b=>b.onclick=()=>{changeCartQuantity(b.dataset.plus,1,'cart');renderCart()});root.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{const c=getCart(),sku=b.dataset.remove,qty=Number(c[sku])||0;if(qty)trackRemoveFromCart(sku,qty,'cart_remove');setCartQuantity(sku,0);renderCart()});renderSummary()}
const SMART_TOPUP_SKUS=['10306','10307','10240','10086','10012'];
function getSmartTopUp(c){
 const t=cartTotal(c),remain=FREE_SHIPPING-t;
 if(remain<=0)return null;
 const maxUsefulPrice=SHIPPING_FEE+250;
 const candidates=SMART_TOPUP_SKUS.map(sku=>PRODUCTS[sku]).filter(p=>p&&p.price>=remain&&p.price<=maxUsefulPrice);
 if(!candidates.length)return null;
 candidates.sort((a,b)=>{if(a.price!==b.price)return a.price-b.price;return (c[a.sku]||0)-(c[b.sku]||0)});
 const p=candidates[0],difference=p.price-SHIPPING_FEE;
 return {sku:p.sku,name:p.shortName||p.name,price:p.price,difference,remain};
}
function smartTopUpHtml(rec){
 if(!rec)return '';
 const valueCopy=rec.difference<0
   ? `Dostava postaje besplatna, pa je konačan iznos <b>${fmt(Math.abs(rec.difference))} manji</b> nego da sada platite dostavu.`
   : rec.difference===0
     ? 'Dostava postaje besplatna, a za isti ukupan iznos dobijate i dodatni proizvod.'
     : `Dostava postaje besplatna. U odnosu na trenutnu korpu sa dostavom, za još <b>${fmt(rec.difference)}</b> dobijate dodatni proizvod.`;
 return `<div class="smart-topup"><div class="smart-topup-kicker">Predlog za besplatnu dostavu</div><div class="smart-topup-title">Dodajte ${rec.name} za ${fmt(rec.price)}</div><p>Do praga nedostaje ${fmt(rec.remain)}. ${valueCopy}</p><button class="btn btn-secondary btn-small" type="button" data-smart-add="${rec.sku}">Dodaj predlog u korpu</button></div>`;
}
function renderSummary(){const box=document.querySelector('[data-cart-summary]');if(!box)return;const c=getCart(),t=cartTotal(c),free=getsFreeShipping(c),shipping=free?0:SHIPPING_FEE,total=t+shipping,remain=Math.max(0,FREE_SHIPPING-t),pct=Math.min(100,t/FREE_SHIPPING*100),rec=free?null:getSmartTopUp(c);const progressCopy=free?'Ostvarili ste besplatnu dostavu.':rec?'':('Još '+fmt(remain)+' do besplatne dostave.');box.innerHTML=`<div class="order-box"><h2 class="h3">Pregled porudžbine</h2><div class="order-line"><span>Vrednost robe</span><b>${fmt(t)}</b></div><div class="order-line"><span>Dostava</span><b>${free?'Besplatna':fmt(shipping)}</b></div><div class="free-progress"><span style="width:${pct}%"></span></div>${progressCopy?`<p class="muted" style="font-size:.88rem">${progressCopy}</p>`:''}${smartTopUpHtml(rec)}<div class="order-total"><span>Ukupno za plaćanje</span><span>${fmt(total)}</span></div><a class="btn btn-primary" style="width:100%;margin-top:18px" href="/checkout.html">Nastavi na poručivanje</a><p class="muted" style="font-size:.78rem;margin-bottom:0">Plaćanje pouzećem. Dostava je 390 RSD za porudžbine ispod 2.500 RSD, a besplatna od 2.500 RSD.</p></div>`;if(rec)trackSmartCartShown(rec,c);const add=box.querySelector('[data-smart-add]');if(add)add.onclick=()=>{trackSmartCartAdded(rec);addToCart(add.dataset.smartAdd,1,'smart_cart');renderCart()}}
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
 if(sessionOnce(`ga_begin_checkout:${cartFingerprint(entries)}`))gaEvent('begin_checkout',{currency:GA_CURRENCY,value:t,shipping,order_total:total,items:gaItemsFromCart(c)});
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
     storePendingPurchase(data,entries);
     localStorage.removeItem('at_cart');clearSubmissionId();setOrderStatus(status,`Porudžbina ${data.orderId} je uspešno primljena.`,'success-message');
     window.location.href=`/hvala.html?order=${encodeURIComponent(data.orderId)}`;
   }catch(err){console.error('Order submit failed',err);setOrderStatus(status,err?.message||'Došlo je do greške. Molimo pokušajte ponovo.','error');form.dataset.submitting='0';button.disabled=false;button.textContent=oldText;}
 });
}

function setupMobileOrderBar(){
 const path=location.pathname||'/';
 const generalShopPaths=new Set(['/','/index.html','/proizvodi.html','/solana-nin.html']);
 const isProductDetail=path.startsWith('/proizvodi/');
 if(!generalShopPaths.has(path)&&!isProductDetail)return;
 const bar=document.createElement('div');bar.className='mobile-order-bar';
 const sku=document.body.dataset.productSku;const p=sku?PRODUCTS[sku]:null;
 if(p){bar.innerHTML=`<div class="mobile-order-copy"><b>${fmt(p.price)}</b><small>${p.name}</small></div><div class="mobile-order-action"><button class="btn btn-primary" data-mobile-add="${p.sku}">Dodaj u korpu</button><div class="mobile-cart-control hidden" data-mobile-cart="${p.sku}"><button type="button" data-mobile-minus="${p.sku}" aria-label="Smanji količinu ${p.name}">−</button><strong data-mobile-qty="${p.sku}" aria-live="polite">1</strong><button type="button" data-mobile-plus="${p.sku}" aria-label="Povećaj količinu ${p.name}">+</button><span>u korpi</span></div></div>`;bar.querySelector('[data-mobile-add]').onclick=()=>addToCart(p.sku,1,'mobile_sticky');bar.querySelector('[data-mobile-minus]').onclick=()=>changeCartQuantity(p.sku,-1);bar.querySelector('[data-mobile-plus]').onclick=()=>changeCartQuantity(p.sku,1)}
 else{bar.innerHTML=`<div class="mobile-order-copy"><b>Poručite online</b><small>Dostava 390 RSD • besplatna od 2.500</small></div><a class="btn btn-primary" href="/proizvodi.html">Poruči</a>`}
 document.body.classList.add('has-mobile-order-bar');document.body.appendChild(bar)
}

function showThankYouOrder(){const el=document.querySelector('[data-order-id]');if(!el)return;let id=new URLSearchParams(location.search).get('order');if(!id||id==='undefined'||id==='null'){try{id=sessionStorage.getItem('at_last_order_id')||''}catch(e){id=''}}if(id&&id!=='undefined'&&id!=='null'){el.textContent=id;document.querySelector('[data-order-id-wrap]')?.classList.remove('hidden')}}
const toggle=document.querySelector('.nav-toggle'),links=document.querySelector('.nav-links');
if(toggle&&links){
 const setNavOpen=open=>{links.classList.toggle('open',open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Zatvori meni':'Otvori meni');toggle.textContent=open?'×':'☰'};
 toggle.onclick=e=>{e.stopPropagation();setNavOpen(!links.classList.contains('open'))};
 document.addEventListener('click',e=>{if(links.classList.contains('open')&&!links.contains(e.target))setNavOpen(false)});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&links.classList.contains('open')){setNavOpen(false);toggle.focus()}});
 links.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>setNavOpen(false)));
}
document.querySelectorAll('[data-year]').forEach(x=>x.textContent=new Date().getFullYear());applyPromoDisplay();setupAnalyticsConsent();updateCartCount();bindAddButtons();setupMobileOrderBar();bindProductQuantityControls();renderCart();renderCheckout();showThankYouOrder();updateProductQuantityControls();trackPageCommerce();trackPendingPurchase();

/* v3.16.0 — Solana Nin film modal on homepage */
(function(){
  const modal=document.querySelector('[data-solana-video-modal]');
  const openBtn=document.querySelector('[data-solana-video-open]');
  if(!modal||!openBtn) return;
  const closeBtn=modal.querySelector('[data-solana-video-close]');
  const video=modal.querySelector('[data-solana-video]');
  let lastFocus=null;

  function closeModal(reset=true){
    if(modal.hidden) return;
    if(video){
      video.pause();
      if(reset){ try{ video.currentTime=0; }catch(e){} }
    }
    modal.hidden=true;
    modal.setAttribute('aria-hidden','true');
    document.body.classList.remove('solana-video-modal-open');
    if(lastFocus&&typeof lastFocus.focus==='function') lastFocus.focus();
  }

  function openModal(){
    lastFocus=document.activeElement;
    modal.hidden=false;
    modal.setAttribute('aria-hidden','false');
    document.body.classList.add('solana-video-modal-open');
    if(closeBtn) closeBtn.focus();
    if(video){
      try{ video.currentTime=0; }catch(e){}
      const playPromise=video.play();
      if(playPromise&&typeof playPromise.catch==='function') playPromise.catch(()=>{});
    }
  }

  openBtn.addEventListener('click',openModal);
  if(closeBtn) closeBtn.addEventListener('click',()=>closeModal());
  modal.addEventListener('click',(e)=>{ if(e.target===modal) closeModal(); });
  document.addEventListener('keydown',(e)=>{ if(e.key==='Escape'&&!modal.hidden) closeModal(); });
  if(video) video.addEventListener('ended',()=>closeModal(false));
})();
