// Preserve existing .html pages and expose the gift catalogue at its canonical URL.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/korporativni-pokloni/' || url.pathname === '/korporativni-pokloni.html') {
      url.pathname = '/korporativni-pokloni';
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === '/') url.pathname = '/index.html';
    if (url.pathname === '/korporativni-pokloni') url.pathname = '/korporativni-pokloni.html';
    return env.ASSETS.fetch(new Request(url, request));
  }
};
