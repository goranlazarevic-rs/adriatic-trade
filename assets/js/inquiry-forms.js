(()=>{
  const form=document.querySelector('[data-inquiry-form]');
  if(!form)return;
  const BASE='https://adriatic-trade-orders.lakifinance.workers.dev';
  const button=form.querySelector('[type="submit"]');
  const retry=form.querySelector('[data-inquiry-retry]');
  const status=form.querySelector('[data-inquiry-status]');
  const label=button.textContent;
  let widget=null,token='',ticket='',sending=false,submissionId='',snapshot='',keepStatus=false;
  const show=message=>{status.textContent=message;};
  const update=()=>{retry.disabled=sending;button.disabled=sending||!token;button.textContent=sending?'Šaljem...':label;};
  const clear=()=>{token='';update();};
  const fallback='Pokušajte ponovo ili pišite na info@adriatictrade.rs. Uneti podaci ostaju u formi.';
  async function fetchJSON(url,options={}){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetch(url,{...options,credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
      let data;
      try{data=await response.json();}catch{throw new Error('Prijem upita nije potvrđen. ');}
      return {response,data};
    }finally{clearTimeout(timer);}
  }
  function loadAPI(){
    if(window.turnstile)return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      const timer=setTimeout(()=>{script.remove();reject(new Error('timeout'));},12000);
      script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async=true;
      script.onload=()=>{clearTimeout(timer);resolve();};
      script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('script'));};
      document.head.appendChild(script);
    });
  }
  async function init(){
    keepStatus=false;clear();retry.hidden=true;show('Učitavanje bezbednosne provere...');
    try{
      const {response,data}=await fetchJSON(BASE+'/inquiry/config');
      if(!response.ok||data.ok!==true||!data.turnstileSiteKey||!data.ticket)throw new Error('config');
      ticket=data.ticket;
      await loadAPI();
      if(widget!==null)window.turnstile.remove(widget);
      widget=window.turnstile.render(form.querySelector('[data-inquiry-turnstile]'),{
        sitekey:data.turnstileSiteKey,action:'inquiry_'+form.dataset.inquiryForm,
        size:'flexible',theme:'auto',
        callback:value=>{token=value;if(!keepStatus&&!sending)show('');update();},
        'expired-callback':()=>{clear();show('Ponovite bezbednosnu proveru.');window.turnstile.reset(widget);},
        'timeout-callback':()=>{clear();retry.hidden=false;show('Bezbednosna provera je istekla. '+fallback);},
        'error-callback':()=>{keepStatus=true;clear();retry.hidden=false;show('Bezbednosna provera nije uspela. '+fallback);return true;}
      });
      if(!token)show('Završite bezbednosnu proveru pre slanja.');
    }catch{
      clear();retry.hidden=false;show('Prijem upita trenutno nije dostupan. '+fallback);
    }
  }
  retry.addEventListener('click',init);
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(sending||!form.reportValidity())return;
    if(!token){show('Završite bezbednosnu proveru. '+fallback);return;}
    const fields=Object.fromEntries(new FormData(form).entries());
    const website=fields._honey||'';delete fields._honey;delete fields['cf-turnstile-response'];
    for(const [key,value]of Object.entries(fields))fields[key]=value.trim();
    for(const key of ['Ime','email','Poruka',...(form.dataset.inquiryForm==='b2b'?['Kompanija']:[])]){
      if(!fields[key]){show('Popunite sva obavezna polja.');form.elements.namedItem(key).focus();return;}
    }
    const current=JSON.stringify(fields);
    if(current!==snapshot){submissionId=crypto.randomUUID();snapshot=current;}
    keepStatus=false;sending=true;update();show('Slanje upita...');
    try{
      const {response,data}=await fetchJSON(BASE+'/inquiry',{
        method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify({type:form.dataset.inquiryForm,fields,submissionId,security:{website,ticket,turnstileToken:token}})
      });
      if(!response.ok||data.ok!==true||data.accepted!==true||!['sent','pending'].includes(data.delivery)){
        const message=response.status===429?'Previše pokušaja sa ove mreže. Sačekajte '+(response.headers.get('Retry-After')==='3600'?'sat vremena':'10 minuta')+'. ':'';
        if(response.status===409){snapshot='';submissionId='';}
        throw new Error(message||'Prijem upita nije potvrđen. ');
      }
      window.location.assign(form.dataset.inquiryForm==='b2b'?'/saradnja-hvala.html':'/kontakt-hvala.html');
    }catch(error){
      keepStatus=true;show((error.name==='AbortError'?'Odgovor nije stigao na vreme. Ponovite isti upit; ponovni pokušaj neće napraviti duplikat. ':error instanceof TypeError?'Veza je prekinuta. ':error.message||'Prijem upita nije potvrđen. ')+fallback);
      sending=false;clear();retry.hidden=false;
      try{window.turnstile.reset(widget);}catch{}
    }
  });
  init();
})();
