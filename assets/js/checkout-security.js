(()=>{
  const WORKER_BASE='https://adriatic-trade-orders.lakifinance.workers.dev';
  const ORDER_URL=WORKER_BASE+'/order';
  const CONFIG_URL=WORKER_BASE+'/security/config';
  const TURNSTILE_SCRIPT='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  const startedAt=Date.now();
  const nativeFetch=window.fetch.bind(window);
  let widgetId=null;
  let token='';
  let securityError='';
  let waiters=[];

  function orderForm(){return document.querySelector('[data-order-form]')}
  function orderStatus(){return document.querySelector('[data-order-status]')}

  function showSecurityStatus(message){
    const el=orderStatus();
    if(!el||!message)return;
    if(!el.textContent||el.classList.contains('hidden')){
      el.textContent=message;
      el.className='order-status';
    }
  }

  function ensureHoneypot(){
    const form=orderForm();
    if(!form)return null;
    let input=form.querySelector('[data-security-honeypot]');
    if(input)return input;
    const wrap=document.createElement('div');
    wrap.setAttribute('aria-hidden','true');
    wrap.style.cssText='position:absolute!important;left:-10000px!important;top:auto!important;width:1px!important;height:1px!important;overflow:hidden!important;';
    wrap.innerHTML='<label for="checkout-company-website">Website</label><input id="checkout-company-website" data-security-honeypot name="website" type="text" tabindex="-1" autocomplete="off">';
    form.prepend(wrap);
    return wrap.querySelector('[data-security-honeypot]');
  }

  function ensureTurnstileContainer(){
    const form=orderForm();
    if(!form)return null;
    let box=form.querySelector('[data-turnstile-box]');
    if(box)return box;
    box=document.createElement('div');
    box.setAttribute('data-turnstile-box','');
    box.setAttribute('aria-live','polite');
    box.style.cssText='margin:12px 0;max-width:100%;';
    const button=form.querySelector('[data-order-submit]')||form.querySelector('[type="submit"]');
    if(button)button.before(box);else form.appendChild(box);
    return box;
  }

  function resolveWaiters(value){
    const current=waiters;waiters=[];
    current.forEach(w=>w.resolve(value));
  }
  function rejectWaiters(error){
    const current=waiters;waiters=[];
    current.forEach(w=>w.reject(error));
  }

  function setToken(value){
    token=String(value||'');
    securityError='';
    if(token)resolveWaiters(token);
  }

  function resetTurnstile(){
    token='';
    try{if(widgetId!==null&&window.turnstile)window.turnstile.reset(widgetId)}catch(e){}
  }

  function loadTurnstileApi(){
    if(window.turnstile)return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-at-turnstile]');
      if(existing){
        existing.addEventListener('load',()=>resolve(),{once:true});
        existing.addEventListener('error',()=>reject(new Error('Bezbednosna provera nije mogla da se učita.')), {once:true});
        return;
      }
      const s=document.createElement('script');
      s.src=TURNSTILE_SCRIPT;s.async=true;s.defer=true;s.dataset.atTurnstile='1';
      s.onload=()=>resolve();
      s.onerror=()=>reject(new Error('Bezbednosna provera nije mogla da se učita.'));
      document.head.appendChild(s);
    });
  }

  async function initSecurity(){
    if(!orderForm())return;
    ensureHoneypot();
    const box=ensureTurnstileContainer();
    try{
      const cfgRes=await nativeFetch(CONFIG_URL,{method:'GET',credentials:'omit',headers:{'Accept':'application/json'}});
      let cfg={};try{cfg=await cfgRes.json()}catch(e){}
      if(!cfgRes.ok||!cfg.ok||!cfg.turnstileSiteKey)throw new Error(cfg.error||'Zaštita porudžbine nije podešena.');
      await loadTurnstileApi();
      if(!window.turnstile)throw new Error('Bezbednosna provera nije dostupna.');
      widgetId=window.turnstile.render(box,{
        sitekey:cfg.turnstileSiteKey,
        action:'checkout_order',
        appearance:'interaction-only',
        execution:'render',
        theme:'auto',
        size:'flexible',
        callback:value=>setToken(value),
        'expired-callback':()=>{token='';resetTurnstile()},
        'timeout-callback':()=>{token='';resetTurnstile()},
        'error-callback':()=>{
          token='';
          securityError='Bezbednosna provera nije uspela. Pokušajte ponovo.';
          rejectWaiters(new Error(securityError));
          setTimeout(()=>{securityError='';resetTurnstile()},1200);
          return true;
        }
      });
    }catch(err){
      securityError=err?.message||'Bezbednosna provera trenutno nije dostupna.';
      rejectWaiters(new Error(securityError));
      showSecurityStatus(securityError);
    }
  }

  const initPromise=new Promise(resolve=>{
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>resolve(initSecurity()),{once:true});
    else resolve(initSecurity());
  });

  async function getTurnstileToken(){
    await initPromise;
    if(token)return token;
    if(securityError)throw new Error(securityError);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        waiters=waiters.filter(w=>w.resolve!==wrappedResolve);
        reject(new Error('Bezbednosna provera traje predugo. Osvežite stranicu i pokušajte ponovo.'));
      },60000);
      const wrappedResolve=value=>{clearTimeout(timer);resolve(value)};
      const wrappedReject=err=>{clearTimeout(timer);reject(err)};
      waiters.push({resolve:wrappedResolve,reject:wrappedReject});
    });
  }

  window.fetch=async function(input,init={}){
    const rawUrl=typeof input==='string'?input:(input&&input.url)||'';
    let absolute='';try{absolute=new URL(rawUrl,location.href).href}catch(e){absolute=rawUrl}
    const method=String(init?.method||(input&&input.method)||'GET').toUpperCase();
    if(absolute===ORDER_URL&&method==='POST'&&typeof init?.body==='string'){
      let body=null;try{body=JSON.parse(init.body)}catch(e){return nativeFetch(input,init)}
      const turnstileToken=await getTurnstileToken();
      const hp=ensureHoneypot();
      body.security={
        ...(body.security||{}),
        website:hp?.value||'',
        startedAt,
        turnstileToken
      };
      const response=await nativeFetch(input,{...init,body:JSON.stringify(body)});
      if(!response.ok)setTimeout(resetTurnstile,0);
      return response;
    }
    return nativeFetch(input,init);
  };
})();
