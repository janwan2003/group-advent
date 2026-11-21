// Serves the calendar page with a link preview (Open Graph) showing live state, e.g.
// "Day 7 opened · 18 of 24 doors filled · 9 people".
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function onRequestGet({ request, env, params }) {
  const url = new URL(request.url);
  const page = await env.ASSETS.fetch(new URL('/c', url.origin));
  let html = await page.text();
  let title = 'Advent Together · a group advent calendar';
  let desc = 'Pick a door and leave a surprise for the group. One door opens each day. No sign-up, no app.';
  try {
    const id = String(params.id || '');
    if (/^[A-Za-z0-9]{6,16}$/.test(id)) {
      const stub = env.CALS.get(env.CALS.idFromName('main'));
      const r = await stub.fetch(new Request(`https://do/__preview/${id}`));
      const p = await r.json();
      if (p) {
        title = `${p.title} · Advent Together`;
        desc = `${p.line}. ${p.opened >= p.days ? 'Open every door and make one for another group.' : 'Pick a door and leave a surprise for the group. No sign-up.'}`;
      }
    }
  } catch (e) {
    console.error(e);
  }
  const meta = `<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Advent Together">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url.origin + url.pathname)}">
<meta property="og:image" content="${url.origin}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="noindex">`;
  html = html.replace(/<!--META-->[\s\S]*?<!--\/META-->/, meta);
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
