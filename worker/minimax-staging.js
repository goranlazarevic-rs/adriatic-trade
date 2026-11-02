import orders from './adriatic-trade-worker-v4.5.0.js';

const HOST='adriatic-trade-minimax-staging.lakifinance.workers.dev';
const ORIGIN='https://'+HOST;
export default {
  async fetch(request,env,ctx) {
    const url=new URL(request.url);
    if(url.origin!==ORIGIN)return new Response('Not found',{status:404});
    if(env.MINIMAX_ENV!=='staging'||env.MINIMAX_MODE!=='draft')return new Response('Staging disabled',{status:503});
    let marker;try{marker=await env.DB.prepare('SELECT name FROM minimax_environment WHERE id=1').first();}catch{}
    if(marker?.name!=='minimax-staging')return new Response('Isolated staging database required',{status:503});
    let response;
    if(url.pathname.startsWith('/admin/')) {
      const origin=request.headers.get('Origin');
      if((request.method!=='GET'&&origin!==ORIGIN)||(origin&&origin!==ORIGIN))return new Response('Forbidden',{status:403});
      // The isolated pilot permits quota controls and fixed synthetic admissions.
      // Public checkout, customer emails, shipping and issuing stay blocked.
      const read=request.method==='GET' && /^\/admin\/(?:availability|minimax-stock|probe-orders|orders(?:\/[^/]+(?:\/minimax-draft)?)?|metrics|attention|courier-exports|inquiries)$/.test(url.pathname);
      const write=request.method==='POST' && (/^\/admin\/orders\/AT-MMTEST-[A-Z0-9-]+\/minimax-draft$/.test(url.pathname) || url.pathname==='/admin/availability' || /^\/admin\/probe-orders(?:\/AT-MMTEST-FLOW-(?:STANDARD|PAKET|BESPLATNA|GURMAN)\/confirm)?$/.test(url.pathname));
      if(!read&&!write)return new Response(JSON.stringify({ok:false,error:'Probni panel dozvoljava kvote, sintetičke porudžbine i Minimax nacrte.'}),{status:403,headers:{'Content-Type':'application/json'}});
      const headers=new Headers(request.headers);headers.set('Origin','https://adriatictrade.rs');
      response=await orders.fetch(new Request(request,{headers}),{DB:env.DB,ADMIN_TOKEN:env.ADMIN_TOKEN,
        MINIMAX_ENV:env.MINIMAX_ENV,MINIMAX_MODE:env.MINIMAX_MODE,MINIMAX_CLIENT_ID:env.MINIMAX_CLIENT_ID,
        MINIMAX_CLIENT_SECRET:env.MINIMAX_CLIENT_SECRET,MINIMAX_USERNAME:env.MINIMAX_USERNAME,MINIMAX_PASSWORD:env.MINIMAX_PASSWORD},ctx);
    }else if(request.method==='GET' && (url.pathname==='/'||url.pathname==='/admin.html'||url.pathname.startsWith('/assets/'))) {
      if(url.pathname==='/')return Response.redirect(ORIGIN+'/admin.html',302);
      response=await env.ASSETS.fetch(request);
    }else return new Response('Not found',{status:404});
    response=new Response(response.body,response);
    response.headers.set('Cache-Control','no-store');response.headers.set('X-Robots-Tag','noindex, nofollow');
    response.headers.set('Referrer-Policy','no-referrer');response.headers.set('X-Content-Type-Options','nosniff');
    response.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    return response;
  }
};
