// Shared helpers for Advent Together pages.
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

const local = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);

export async function api(path, { method = 'GET', body, token, raw } = {}) {
  const headers = {};
  if (token) headers['x-token'] = token;
  if (local && localStorage.getItem('ga:now')) headers['x-now'] = localStorage.getItem('ga:now'); // e2e clock (local only)
  let payload;
  if (raw) { payload = raw; headers['content-type'] = raw.type || 'image/jpeg'; }
  else if (body !== undefined) { payload = JSON.stringify(body); headers['content-type'] = 'application/json'; }
  let res;
  try {
    res = await fetch('/api/' + path, { method, headers, body: payload });
  } catch {
    throw Object.assign(new Error('No connection. Check your internet and try again.'), { status: 0 });
  }
  if (raw === 'blob' || (method === 'GET' && path.includes('/photo/'))) {
    if (!res.ok) throw Object.assign(new Error('Photo not available.'), { status: res.status });
    return res.blob();
  }
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Please try again.'), { status: res.status });
  return data;
}

export const tokenKey = (id) => 'ga:tok:' + id;
export const getToken = (id) => localStorage.getItem(tokenKey(id));
export const setToken = (id, t) => localStorage.setItem(tokenKey(id), t);
export const dropToken = (id) => localStorage.removeItem(tokenKey(id));

let toastTimer;
export function toast(msg) {
  let t = $('.toast');
  if (!t) { t = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    ta.remove();
    return ok;
  }
}

// Share sheet on phones, clipboard elsewhere.
export async function share({ title, text, url }) {
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title, text, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  if (await copy(url ? `${text} ${url}` : text)) toast('Copied. Paste it in your group chat.');
  else prompt('Copy this:', url || text);
}

export function fmtDay(ymd, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(ymd + 'T12:00:00Z').toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
}
