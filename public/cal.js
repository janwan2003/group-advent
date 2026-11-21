import { $, h, api, getToken, setToken, dropToken, toast, share, copy, fmtDay } from './common.js';

const KINDS = {
  message: { icon: '💌', label: 'A message', chip: 'Message', ph: 'Write something for the group…' },
  joke: { icon: '😂', label: 'A joke', chip: 'Joke', ph: 'Your best (or worst) joke…' },
  song: { icon: '🎵', label: 'A song', chip: 'Song', ph: 'Why this song? Paste the link below.' },
  recipe: { icon: '🍪', label: 'A recipe', chip: 'Recipe', ph: 'Ingredients and steps…' },
  memory: { icon: '📸', label: 'A memory', chip: 'Memory', ph: 'Tell the story. Add the photo below.' },
  challenge: { icon: '🎯', label: 'A challenge', chip: 'Challenge', ph: 'A small challenge for everyone today…' },
  watch: { icon: '🎬', label: 'Something to watch', chip: 'To watch', ph: 'What should we watch, and why?' },
  other: { icon: '🎁', label: 'A surprise', chip: 'Other', ph: 'Anything you like…' },
};
const REACTIONS = ['❤️', '😂', '🥹', '🎄', '👏'];

const id = location.pathname.split('/').filter(Boolean)[1] || '';
const qs = new URLSearchParams(location.search);
if (location.hash.startsWith('#k=')) {
  setToken(id, decodeURIComponent(location.hash.slice(3)));
  history.replaceState(null, '', location.pathname + location.search);
}
if (qs.has('new')) history.replaceState(null, '', location.pathname);
let justCreated = qs.has('new');
let S = null; // last server state
const seenKey = 'ga:seen:' + id;
const sheet = $('#sheet');
const sheetIn = $('#sheetIn');
const photoUrls = new Map();

const tok = () => getToken(id);
const link = () => `${location.origin}/c/${id}`;
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const doorOf = (day) => S.doors[day - 1];

async function load() {
  try {
    S = await api('c/' + id, { token: tok() });
  } catch (e) {
    if (e.status === 404) return showGone(e.message);
    if (e.status === 401 || e.status === 403) dropToken(id);
    $('#loading').textContent = e.message;
    return;
  }
  if (!S.me && tok()) dropToken(id); // token no longer valid (left, or calendar recreated)
  render();
}
function showGone(msg) {
  $('#loading').classList.add('hidden');
  $('#view').classList.add('hidden');
  $('#gone').classList.remove('hidden');
  if (msg) $('#goneMsg').textContent = msg + ' Check the link in your chat.';
  document.title = 'Calendar not found · Advent Together';
}

// ---------- page ----------

function render() {
  const { cal, me } = S;
  $('#loading').classList.add('hidden');
  $('#view').classList.remove('hidden');
  document.title = `${cal.title} · Advent Together`;
  $('#t').textContent = cal.title;
  const fmtRange = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: cal.start.slice(0, 7) === cal.end.slice(0, 7) ? 'long' : 'short', timeZone: 'UTC' });
  const range = fmtRange.formatRange(new Date(cal.start + 'T12:00:00Z'), new Date(cal.end + 'T12:00:00Z'));
  const meta = $('#meta');
  meta.replaceChildren(
    h('span', { text: `${cal.days} doors · ${range}` }),
    h('span', { text: `A door opens at midnight (${cal.tz.replace(/_/g, ' ')})` })
  );
  $('#prog').style.width = `${Math.round((cal.filled / cal.days) * 100)}%`;
  const free = cal.days - cal.claimed;
  $('#progTxt').textContent = `${cal.filled} of ${cal.days} doors filled · ${plural(free, 'door', 'doors')} still free · ${plural(S.members.length, 'person', 'people')}`;
  renderNotices();
  renderBoard();
  $('#people').replaceChildren(...S.members.map((m) => h('li', { class: me && m.id === me.id ? 'me' : '' }, m.name + (m.isHost ? ' (made it)' : '') + (me && m.id === me.id ? ' · you' : ''))));
  renderYou();
}

function todayDoor() {
  return S.cal.opened > 0 && S.cal.opened <= S.cal.days ? doorOf(S.cal.opened) : null;
}
const seenMax = () => Number(localStorage.getItem(seenKey) || 0);

function renderNotices() {
  const { cal, me } = S;
  const box = $('#notices');
  box.replaceChildren();
  if (!me) {
    const inp = h('input', { type: 'text', id: 'joinName', maxlength: 30, placeholder: 'Your name', autocomplete: 'given-name', 'aria-label': 'Your name' });
    const err = h('p', { class: 'err', role: 'alert' });
    const form = h('form', { class: 'joinform', onsubmit: (e) => { e.preventDefault(); doJoin(inp.value, err); } }, inp, h('button', { class: 'btn', type: 'submit', text: 'Join' }));
    box.append(h('div', { class: 'notice gold' },
      h('h3', { text: `You’re invited to “${cal.title}”` }),
      h('p', { text: cal.opened ? 'Open any door that has opened, no name needed. Join to react and to hide a surprise behind a door of your own.' : 'Type your name, pick a door and hide a surprise behind it for the group. Nobody sees it until its day.' }),
      form, err));
  }
  if (justCreated && me) {
    box.append(h('div', { class: 'notice pine' },
      h('h3', { text: 'Your calendar is ready 🎄' }),
      h('p', { text: 'Now send the link to the group chat so everyone can claim a door. Then claim one yourself: tap any door.' }),
      h('button', { class: 'btn alt small', type: 'button', onclick: invite, text: 'Send the link' })));
  }
  const td = todayDoor();
  if (td && cal.opened < cal.days && seenMax() < td.day) {
    box.append(h('div', { class: 'notice gold' },
      h('h3', { text: `Door ${td.day} is open!` }),
      h('p', { text: td.filled ? `Today’s surprise is from ${td.from}.` : 'See what’s behind today’s door.' }),
      h('button', { class: 'btn small', type: 'button', onclick: () => openDoor(td.day), text: `Open door ${td.day}` })));
  }
  if (cal.opened >= cal.days) {
    box.append(h('div', { class: 'notice gold' },
      h('h3', { text: 'That’s a wrap: every door is open ✨' }),
      h('p', { text: `${cal.filled} of ${cal.days} doors came from the group. Scroll through them again, or start one for another group.` }),
      h('a', { class: 'btn small', href: '/#make', text: 'Make one for another group' })));
  }
  if (me) {
    const todo = S.doors.filter((d) => d.mine && !d.open && !d.filled);
    if (todo.length) {
      box.append(h('div', { class: 'notice' },
        h('h3', { text: `You claimed door ${todo.map((d) => d.day).join(', ')} but haven’t filled it yet` }),
        h('p', { class: 'muted', text: `It opens ${fmtDay(todo[0].date)}. If it’s still empty then, the group gets a surprise from us instead.` }),
        h('button', { class: 'btn small', type: 'button', onclick: () => openDoor(todo[0].day), text: `Fill door ${todo[0].day}` })));
    } else if (!S.doors.some((d) => d.mine && !d.open)) {
      const free = S.doors.filter((d) => !d.open && !d.taken);
      if (free.length) {
        box.append(h('div', { class: 'notice' },
          h('h3', { text: `${plural(free.length, 'door is', 'doors are')} still free` }),
          h('p', { class: 'muted', text: 'Claim one and hide a surprise for everyone: a message, a joke, a song, an old photo.' }),
          h('button', { class: 'btn small', type: 'button', onclick: () => openDoor(free[0].day), text: `Claim door ${free[0].day}` })));
      }
    }
  }
}

function doorIcon(d) {
  const k = d.filled ? d.kind : d.fallback && d.fallback.kind;
  return (KINDS[k] || KINDS.other).icon;
}
function renderBoard() {
  const board = $('#board');
  const td = todayDoor();
  board.style.gridTemplateColumns = S.cal.days <= 12 && innerWidth > 760 ? 'repeat(4, 1fr)' : '';
  board.replaceChildren(...S.order.map((day) => {
    const d = doorOf(day);
    const cls = ['door'];
    let tag = '';
    let label = `Door ${day}`;
    if (d.open) {
      cls.push('open');
      label += d.filled ? `, open, from ${d.from}` : ', open';
      if (td && td.day === day) { cls.push('today'); if (seenMax() >= day) cls.push('seen'); label += ', today'; }
    } else if (d.mine) {
      cls.push('mine');
      if (!d.filled) cls.push('todo');
      tag = d.filled ? 'yours ✓' : 'fill it';
      label += d.filled ? ', yours, filled' : ', yours, not filled yet';
    } else if (d.taken) {
      cls.push('taken');
      tag = 'taken';
      label += ', taken';
    } else {
      tag = fmtDay(d.date, { day: 'numeric', month: 'short' });
      label += ', free';
    }
    if (!d.open) label += `, opens ${fmtDay(d.date)}`;
    const kids = d.open ? [h('span', { class: 'icon', 'aria-hidden': 'true', text: doorIcon(d) }), h('span', { class: 'num', text: day })] : [h('span', { class: 'num', text: day }), h('span', { class: 'tag', text: tag })];
    return h('button', { class: cls.join(' '), type: 'button', 'aria-label': label, 'data-day': day, onclick: () => openDoor(day) }, ...kids);
  }));
}

function renderYou() {
  const { me } = S;
  const box = $('#you');
  box.replaceChildren();
  if (!me) return;
  box.append(h('h2', { text: 'You' }));
  const mine = S.doors.filter((d) => d.mine);
  box.append(h('p', { class: 'muted', text: mine.length ? `You’re hiding surprises behind door ${mine.map((d) => d.day).join(', ')}.` : 'You haven’t claimed a door yet.' }));
  const actions = h('div', { class: 'bar' });
  actions.append(h('button', { class: 'btn ghost small', type: 'button', onclick: async () => {
    const ok = await copy(`${link()}#k=${encodeURIComponent(tok())}`);
    toast(ok ? 'Personal link copied. Open it on your other device.' : 'Could not copy.');
  }, text: 'Copy my personal link' }));
  if (me.isHost) {
    actions.append(h('button', { class: 'btn ghost small', type: 'button', onclick: rename, text: 'Rename' }));
    actions.append(h('button', { class: 'btn danger small', type: 'button', onclick: deleteCal, text: 'Delete calendar' }));
  } else {
    actions.append(h('button', { class: 'btn danger small', type: 'button', onclick: leave, text: 'Leave' }));
  }
  box.append(actions);
  box.append(h('p', { class: 'small muted', text: 'Your personal link signs you in on another phone or computer. Keep it to yourself.' }));
}

// ---------- actions ----------

async function doJoin(name, err) {
  name = (name || '').trim();
  if (err) err.textContent = '';
  if (!name) { if (err) err.textContent = 'Please type your name.'; return false; }
  try {
    const r = await api(`c/${id}/join`, { method: 'POST', body: { name } });
    setToken(id, r.token);
    await load();
    toast(`Welcome, ${r.me.name}!`);
    return true;
  } catch (e) {
    if (err) err.textContent = e.message;
    return false;
  }
}

function invite() {
  justCreated = false;
  const { cal } = S;
  const free = cal.days - cal.claimed;
  const text = cal.opened && cal.opened < cal.days
    ? `Door ${cal.opened} of “${cal.title}” is open 🎄 Come see, and pick a door to hide a surprise for the group:`
    : `Join “${cal.title}” 🎄 Pick a door and hide a surprise behind it for the group. ${free} of ${cal.days} doors still free:`;
  share({ title: cal.title, text, url: link() });
  if (S.me) renderNotices();
}
$('#invite').addEventListener('click', invite);

async function rename() {
  const t = prompt('New name for the calendar', S.cal.title);
  if (t == null || !t.trim()) return;
  try { await api('c/' + id, { method: 'PATCH', token: tok(), body: { title: t } }); await load(); toast('Renamed.'); } catch (e) { toast(e.message); }
}
async function deleteCal() {
  if (!confirm('Delete this calendar for everyone? All doors and photos are removed. This cannot be undone.')) return;
  try { await api('c/' + id, { method: 'DELETE', token: tok() }); dropToken(id); showGone('Calendar deleted.'); } catch (e) { toast(e.message); }
}
async function leave() {
  if (!confirm('Leave this calendar? Your doors that haven’t opened yet go back to the group.')) return;
  try { await api(`c/${id}/leave`, { method: 'POST', token: tok() }); dropToken(id); await load(); toast('You left the calendar.'); } catch (e) { toast(e.message); }
}

// ---------- door sheet ----------

function openSheet(...kids) {
  sheetIn.replaceChildren(...kids);
  if (!sheet.open) sheet.showModal();
  sheetIn.scrollTop = 0;
}
function closeSheet() { if (sheet.open) sheet.close(); }
$('#sheetX').addEventListener('click', closeSheet);
sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });

function openDoor(day) {
  const d = doorOf(day);
  if (d.open) return showOpen(d);
  if (d.mine) return showEditor(d);
  if (d.taken) return showTaken(d);
  return showFree(d);
}

async function photoUrl(day) {
  const key = `${day}:${S.cal.version}`;
  if (photoUrls.has(key)) return photoUrls.get(key);
  const blob = await api(`c/${id}/photo/${day}`, { token: tok() });
  const u = URL.createObjectURL(blob);
  photoUrls.set(key, u);
  return u;
}

function showOpen(d) {
  if (seenMax() < d.day && S.cal.opened === d.day) localStorage.setItem(seenKey, String(d.day));
  const c = d.filled ? d : d.fallback;
  const kind = KINDS[c.kind] || KINDS.other;
  const reveal = h('div', { class: 'reveal' },
    h('div', { class: 'big', 'aria-hidden': 'true', text: kind.icon }),
    h('p', { class: 'from', text: d.filled ? `${kind.label} from ${d.from}` : `${kind.label} from the Advent Together elves` }));
  const bodyText = d.filled ? d.body : d.fallback.text;
  if (bodyText) reveal.append(h('p', { class: 'body', text: bodyText }));
  if (d.filled && d.photo) {
    const img = h('img', { alt: `Photo from ${d.from}` });
    reveal.append(img);
    photoUrl(d.day).then((u) => { img.src = u; }).catch(() => img.remove());
  }
  if (d.filled && d.link) {
    let host = d.link;
    try { host = new URL(d.link).hostname.replace(/^www\./, ''); } catch {}
    reveal.append(h('a', { class: 'btn ghost small lnk', href: d.link, target: '_blank', rel: 'noopener noreferrer nofollow', text: `Open link · ${host} ↗` }));
  }
  if (!d.filled) reveal.append(h('p', { class: 'small muted', style: 'margin:12px 0 0', text: 'Nobody filled this door, so we did. Claim a later door to make sure the next one comes from the group.' }));

  const reacts = h('div', { class: 'reacts', role: 'group', 'aria-label': 'Reactions' });
  for (const e of REACTIONS) {
    const n = (d.reactions && d.reactions[e]) || 0;
    const btn = h('button', { type: 'button', 'aria-pressed': String(d.myReaction === e), 'aria-label': `React ${e}${n ? `, ${n}` : ''}` }, e, n ? h('span', { text: n }) : null);
    btn.addEventListener('click', async () => {
      if (!S.me) { toast('Join with your name first (top of the page) to react.'); return; }
      try {
        await api(`c/${id}/doors/${d.day}/react`, { method: 'POST', token: tok(), body: { emoji: d.myReaction === e ? null : e } });
        await load();
        showOpen(doorOf(d.day));
      } catch (ex) { toast(ex.message); }
    });
    reacts.append(btn);
  }
  const shareText = `Door ${d.day} of “${S.cal.title}”${d.filled ? `, from ${d.from}` : ''}: ${bodyText || kind.label}`.slice(0, 400);
  openSheet(
    h('div', { class: 'kicker', text: `Door ${d.day} · ${fmtDay(d.date)}` }),
    h('h2', { id: 'sheetTitle', text: d.filled ? `From ${d.from}` : 'A surprise from us' }),
    reveal,
    reacts,
    h('div', { class: 'actions' },
      h('button', { class: 'btn alt small', type: 'button', onclick: () => share({ title: S.cal.title, text: shareText, url: link() }), text: 'Share this door' }),
      h('button', { class: 'btn ghost small', type: 'button', onclick: closeSheet, text: 'Close' })));
  renderNotices();
  renderBoard();
}

function showTaken(d) {
  const freeLater = S.doors.find((x) => !x.open && !x.taken);
  const kids = [
    h('div', { class: 'kicker', text: `Door ${d.day} · opens ${fmtDay(d.date)}` }),
    h('h2', { id: 'sheetTitle', text: 'Taken: no peeking!' }),
    h('p', { text: `Someone in the group is hiding a surprise behind door ${d.day}. You’ll see it, and who it’s from, on ${fmtDay(d.date, { weekday: 'long', day: 'numeric', month: 'long' })}.` }),
  ];
  const actions = h('div', { class: 'actions' });
  if (freeLater) actions.append(h('button', { class: 'btn small', type: 'button', onclick: () => showFree(freeLater), text: `Claim door ${freeLater.day} instead` }));
  if (S.me && S.me.isHost) {
    actions.append(h('button', { class: 'btn danger small', type: 'button', text: 'Free up this door', onclick: async () => {
      if (!confirm(`Free up door ${d.day}? Whatever is behind it is deleted.`)) return;
      try { await api(`c/${id}/doors/${d.day}`, { method: 'DELETE', token: tok() }); await load(); closeSheet(); toast(`Door ${d.day} is free again.`); } catch (e) { toast(e.message); }
    } }));
  }
  actions.append(h('button', { class: 'btn ghost small', type: 'button', onclick: closeSheet, text: 'Close' }));
  kids.push(actions);
  openSheet(...kids);
}

function showFree(d) {
  const kids = [
    h('div', { class: 'kicker', text: `Door ${d.day} · opens ${fmtDay(d.date)}` }),
    h('h2', { id: 'sheetTitle', text: `Door ${d.day} is free` }),
    h('p', { text: `Claim it and hide a surprise for the group. It stays secret until ${fmtDay(d.date, { weekday: 'long', day: 'numeric', month: 'long' })}.` }),
  ];
  const err = h('p', { class: 'err', role: 'alert' });
  const doClaim = async (btn) => {
    btn.disabled = true;
    try {
      await api(`c/${id}/doors/${d.day}/claim`, { method: 'POST', token: tok() });
      await load();
      showEditor(doorOf(d.day));
    } catch (e) {
      err.textContent = e.message;
      btn.disabled = false;
      if (e.status === 409) load();
    }
  };
  if (!S.me) {
    const inp = h('input', { type: 'text', maxlength: 30, placeholder: 'Your name', autocomplete: 'given-name', 'aria-label': 'Your name' });
    const btn = h('button', { class: 'btn', type: 'submit', text: `Join and claim door ${d.day}` });
    kids.push(h('form', { onsubmit: async (e) => {
      e.preventDefault();
      btn.disabled = true;
      if (await doJoin(inp.value, err)) await doClaim(btn);
      else btn.disabled = false;
    } }, h('label', { class: 'f', text: 'Your name' }), inp, err, h('div', { class: 'actions' }, btn)));
  } else {
    const btn = h('button', { class: 'btn', type: 'button', text: `Claim door ${d.day}` });
    btn.addEventListener('click', () => doClaim(btn));
    kids.push(err, h('div', { class: 'actions' }, btn, h('button', { class: 'btn ghost small', type: 'button', onclick: closeSheet, text: 'Not now' })));
  }
  openSheet(...kids);
}

// Resize a picked photo in the browser so uploads stay small (max ~170 KB JPEG).
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('That file is not a photo we can read.')); i.src = url; });
    for (const max of [1200, 900, 700]) {
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      for (const q of [0.82, 0.7, 0.6]) {
        const b = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', q));
        if (b && b.size <= 170000) return b;
      }
    }
    throw new Error('That photo is too large. Try another one.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function showEditor(d) {
  let kind = d.kind || 'message';
  let newPhoto = null; // Blob to upload
  let removePhoto = false;
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'What is it?' });
  const ta = h('textarea', { id: 'doorBody', maxlength: 700, 'aria-label': 'What’s behind the door?' });
  ta.value = d.body || '';
  const setKind = (k) => {
    kind = k;
    for (const c of chips.children) c.setAttribute('aria-pressed', String(c.dataset.k === k));
    ta.placeholder = KINDS[k].ph;
  };
  for (const [k, v] of Object.entries(KINDS)) chips.append(h('button', { type: 'button', class: 'chip', 'data-k': k, onclick: () => setKind(k) }, `${v.icon} ${v.chip}`));
  setKind(kind);
  const linkIn = h('input', { type: 'url', id: 'doorLink', maxlength: 400, placeholder: 'https://… (a song, video, recipe, anything)', inputmode: 'url', autocomplete: 'off' });
  linkIn.value = d.link || '';
  const file = h('input', { type: 'file', accept: 'image/*', class: 'hidden', id: 'doorPhoto' });
  const prev = h('div', { class: 'photo-prev' });
  const drawPhoto = (src) => {
    prev.replaceChildren();
    if (src) {
      prev.append(h('img', { src, alt: 'Your photo' }), h('button', { type: 'button', class: 'btn ghost small', text: 'Remove photo', onclick: () => { newPhoto = null; removePhoto = true; drawPhoto(null); } }));
    } else {
      prev.append(h('button', { type: 'button', class: 'btn ghost small', text: '📷 Add a photo', onclick: () => file.click() }));
    }
  };
  drawPhoto(null);
  if (d.photo) photoUrl(d.day).then((u) => { if (!newPhoto && !removePhoto) drawPhoto(u); }).catch(() => {});
  const err = h('p', { class: 'err', role: 'alert' });
  file.addEventListener('change', async () => {
    const f = file.files[0];
    file.value = '';
    if (!f) return;
    err.textContent = '';
    try {
      newPhoto = await shrink(f);
      removePhoto = false;
      drawPhoto(URL.createObjectURL(newPhoto));
    } catch (e) { err.textContent = e.message; }
  });
  const save = h('button', { class: 'btn', type: 'submit', text: d.filled ? 'Save changes' : 'Hide it behind the door' });
  const form = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    err.textContent = '';
    const body = ta.value.trim();
    const lnk = linkIn.value.trim();
    const willHavePhoto = newPhoto || (d.photo && !removePhoto);
    if (!body && !lnk && !willHavePhoto) { err.textContent = 'Write something, add a link or a photo.'; ta.focus(); return; }
    save.disabled = true;
    save.textContent = 'Saving…';
    try {
      if (newPhoto) await api(`c/${id}/doors/${d.day}/photo`, { method: 'PUT', token: tok(), raw: newPhoto });
      else if (removePhoto && d.photo) await api(`c/${id}/doors/${d.day}/photo`, { method: 'DELETE', token: tok() });
      await api(`c/${id}/doors/${d.day}`, { method: 'PUT', token: tok(), body: { kind, body, link: lnk } });
      await load();
      closeSheet();
      toast(`Saved. It stays secret until ${fmtDay(d.date)}.`);
    } catch (ex) {
      err.textContent = ex.message;
      save.disabled = false;
      save.textContent = d.filled ? 'Save changes' : 'Hide it behind the door';
    }
  } },
    h('label', { class: 'f', text: 'What is it?' }), chips,
    h('label', { class: 'f', for: 'doorBody', text: 'What’s behind the door?' }), ta,
    h('label', { class: 'f', for: 'doorLink' }, 'Link ', h('span', { class: 'hint', text: '(optional)' })), linkIn,
    h('label', { class: 'f' }, 'Photo ', h('span', { class: 'hint', text: '(optional)' })), file, prev,
    err,
    h('div', { class: 'actions' }, save,
      h('button', { class: 'btn danger small', type: 'button', text: 'Give this door back', onclick: async () => {
        if (!confirm(`Give door ${d.day} back? What you wrote is deleted.`)) return;
        try { await api(`c/${id}/doors/${d.day}`, { method: 'DELETE', token: tok() }); await load(); closeSheet(); toast(`Door ${d.day} is free again.`); } catch (ex) { err.textContent = ex.message; }
      } })));
  openSheet(
    h('div', { class: 'kicker', text: `Your door · opens ${fmtDay(d.date)}` }),
    h('h2', { id: 'sheetTitle', text: `Door ${d.day}` }),
    h('p', { class: 'muted small', style: 'margin:0', text: 'Only you can see this until the door opens. Then everyone sees it, with your name.' }),
    form);
}

// ---------- live updates ----------

async function poll() {
  if (!S || document.hidden || sheet.open) return;
  try {
    const r = await api(`c/${id}?v=${S.cal.version}&me=${S.me ? S.me.id : ''}`, { token: tok() });
    if (!r.same || r.today !== S.cal.today) await load();
  } catch (e) {
    if (e.status === 404) showGone(e.message);
  }
}
setInterval(poll, 20000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

load();
