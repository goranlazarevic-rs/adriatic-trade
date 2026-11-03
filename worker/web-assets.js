// Keep the existing .html URLs. With html_handling=none only the home page
// needs an explicit rewrite; all other public assets are served directly.
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname==='/')url.pathname='/index.html';
    return env.ASSETS.fetch(new Request(url,request));
  }
};
