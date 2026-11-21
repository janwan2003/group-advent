// Advent Together: JSON API. Ordinary D1-style code; in production `env.DB` is a shim over the SQLite storage of
// one Durable Object (worker/index.js). Members join with a nickname only and get a random token (stored hashed).
//
// Privacy rule enforced here, not in the client: a door's content, and who filled it, is only returned once the door
// is open in the calendar's time zone. Before that, others see only "taken" or "free"; the filler sees their own door.
import {
  KINDS, REACTIONS, MIN_DAYS, MAX_DAYS, isYmd, addDays, diffDays, validTz, todayIn, doorDate, isOpen, openCount,
  doorOrder, fallbackFor, resolveDates, stateLine,
} from './advent.js';

const LIM = { members: 120, text: 700, link: 400, title: 60, name: 30, photoBytes: 180000 };
const DAY = 86400000;
const KEEP_AFTER_END_DAYS = 60;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
class HttpError extends Error {
  constructor(status, msg) {
    super(msg);
    this.status = status;
  }
}
const bad = (msg) => new HttpError(400, msg);

function rid(n = 10) {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.getRandomValues(new Uint8Array(n));
  let s = '';
  for (const x of b) s += abc[x % abc.length];
  return s;
}
function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function clean(v, max, name, required = false) {
  let s = typeof v === 'string' ? v : v == null ? '' : String(v);
  s = s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (required && !s) throw bad(`Please enter ${name}.`);
  if (s.length > max) throw bad(`${name[0].toUpperCase() + name.slice(1)} is too long (max ${max} characters).`);
  return s;
}
function cleanText(v, max) {
  let s = typeof v === 'string' ? v : '';
  s = s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (s.length > max) throw bad(`The message is too long (max ${max} characters).`);
  return s;
}
function cleanLink(v) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return '';
  if (s.length > LIM.link) throw bad('That link is too long.');
  let u;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : 'https://' + s);
  } catch {
    throw bad('That link does not look right.');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw bad('Links must start with https://');
  if (!u.hostname.includes('.')) throw bad('That link does not look right.');
  return u.toString();
}

async function readJson(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > 16000) throw bad('Request too large.');
  try {
    const t = await request.text();
    if (t.length > 16000) throw bad('Request too large.');
    return t ? JSON.parse(t) : {};
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw bad('Invalid request.');
  }
}

// Fixed-window rate limit per IP (hashed), so one visitor cannot burn the free quota.
async function limit(env, request, bucket, max, windowMs = 3600000) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const k = `${bucket}:${await sha(ip)}`;
  const now = Date.now();
  const row = await env.DB.prepare(
    `INSERT INTO rate (k, n, reset_at) VALUES (?1, 1, ?2)
     ON CONFLICT(k) DO UPDATE SET
       n = CASE WHEN rate.reset_at < ?3 THEN 1 ELSE rate.n + 1 END,
       reset_at = CASE WHEN rate.reset_at < ?3 THEN ?2 ELSE rate.reset_at END
     RETURNING n`
  ).bind(k, now + windowMs, now).first();
  if (row && row.n > max) throw new HttpError(429, 'Too many requests from your connection. Please wait a bit and try again.');
}

// Test hook (local dev only, TEST_HOOKS=1): the x-now header moves the clock so e2e tests can open doors.
function nowMs(env, request) {
  if (env.TEST_HOOKS && request.headers.get('x-now')) {
    const n = Number(request.headers.get('x-now'));
    if (Number.isFinite(n)) return n;
  }
  return Date.now();
}

async function getCal(env, id) {
  if (!/^[A-Za-z0-9]{6,16}$/.test(id || '')) throw new HttpError(404, 'This calendar does not exist (or was deleted).');
  const c = await env.DB.prepare('SELECT * FROM cals WHERE id = ?1').bind(id).first();
  if (!c) throw new HttpError(404, 'This calendar does not exist (or was deleted).');
  return c;
}
async function whoAmI(env, request, calId) {
  const tok = request.headers.get('x-token');
  if (!tok || tok.length > 100) return null;
  return (await env.DB.prepare('SELECT * FROM members WHERE token_hash = ?1 AND cal_id = ?2').bind(await sha(tok), calId).first()) || null;
}
async function needMember(env, request, calId) {
  const m = await whoAmI(env, request, calId);
  if (!m) throw new HttpError(401, 'Join with your name first.');
  return m;
}
const bump = (env, id) => env.DB.prepare('UPDATE cals SET version = version + 1 WHERE id = ?1').bind(id);

function parseDay(cal, v) {
  const d = Number(v);
  if (!Number.isInteger(d) || d < 1 || d > cal.days) throw new HttpError(404, 'There is no such door.');
  return d;
}

async function nameTaken(env, calId, name) {
  const r = await env.DB.prepare('SELECT 1 FROM members WHERE cal_id = ?1 AND lower(name) = lower(?2)').bind(calId, name).first();
  return !!r;
}

// ---------- handlers ----------

async function createCal(env, request) {
  await limit(env, request, 'create', 20);
  const b = await readJson(request);
  const title = clean(b.title, LIM.title, 'a title', true);
  const name = clean(b.name, LIM.name, 'your name', true);
  const tz = validTz(b.tz) ? b.tz : 'UTC';
  const now = nowMs(env, request);
  const today = todayIn(tz, now);
  let dates;
  try {
    dates = resolveDates({ preset: b.preset, bigDay: b.bigDay, days: b.days }, today);
  } catch (e) {
    throw bad(e.message);
  }
  const id = rid(10);
  const tok = newToken();
  const mid = rid(10);
  const end = doorDate(dates.start, dates.days);
  const expires = Date.parse(end + 'T00:00:00Z') + KEEP_AFTER_END_DAYS * DAY;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO cals (id, title, start, days, tz, preset, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
      .bind(id, title, dates.start, dates.days, tz, ['advent', 'twelve'].includes(b.preset) ? b.preset : 'custom', now, expires),
    env.DB.prepare('INSERT INTO members (id, cal_id, name, token_hash, is_host, created_at) VALUES (?1, ?2, ?3, ?4, 1, ?5)')
      .bind(mid, id, name, await sha(tok), now),
  ]);
  await cleanup(env, now);
  return json({ id, token: tok }, 201);
}

// Delete calendars that ended more than KEEP_AFTER_END_DAYS ago (bounded per call).
async function cleanup(env, now) {
  const old = await env.DB.prepare('SELECT id FROM cals WHERE expires_at < ?1 LIMIT 10').bind(now).all();
  for (const { id } of old.results) await deleteCalRows(env, id);
  await env.DB.prepare('DELETE FROM rate WHERE reset_at < ?1').bind(now).run();
}
async function deleteCalRows(env, id) {
  await env.DB.batch(
    ['photos', 'reactions', 'doors', 'members'].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE cal_id = ?1`).bind(id))
      .concat([env.DB.prepare('DELETE FROM cals WHERE id = ?1').bind(id)])
  );
}

async function readCal(env, request, id) {
  const cal = await getCal(env, id);
  const url = new URL(request.url);
  const me = await whoAmI(env, request, id);
  const v = url.searchParams.get('v');
  if (v && Number(v) === cal.version && url.searchParams.get('me') === (me ? me.id : '')) {
    // Cheap poll: nothing changed. The day may still have rolled over, so include today.
    return json({ same: true, today: todayIn(cal.tz, nowMs(env, request)) });
  }
  const today = todayIn(cal.tz, nowMs(env, request));
  const [members, doors, reacts] = await env.DB.batch([
    env.DB.prepare('SELECT id, name, is_host FROM members WHERE cal_id = ?1 ORDER BY created_at, rowid').bind(id),
    env.DB.prepare('SELECT day, member_id, kind, body, link, has_photo, filled_at FROM doors WHERE cal_id = ?1').bind(id),
    env.DB.prepare('SELECT day, member_id, emoji FROM reactions WHERE cal_id = ?1').bind(id),
  ]);
  const names = new Map(members.results.map((m) => [m.id, m.name]));
  const byDay = new Map(doors.results.map((d) => [d.day, d]));
  const out = [];
  let filled = 0;
  let claimed = 0;
  for (let day = 1; day <= cal.days; day++) {
    const d = byDay.get(day);
    const open = isOpen(cal.start, day, today);
    const isFilled = !!(d && d.filled_at);
    if (d) claimed++;
    if (isFilled) filled++;
    const door = { day, date: doorDate(cal.start, day), open, taken: !!d, mine: !!(d && me && d.member_id === me.id) };
    if (door.mine && !open) Object.assign(door, { filled: isFilled, kind: d.kind, body: d.body, link: d.link, photo: !!d.has_photo });
    if (open) {
      if (isFilled) Object.assign(door, { filled: true, from: names.get(d.member_id) || 'Someone who left', kind: d.kind, body: d.body, link: d.link, photo: !!d.has_photo });
      else Object.assign(door, { filled: false, fallback: fallbackFor(cal.id, day) });
      const counts = {};
      let mine = null;
      for (const r of reacts.results) {
        if (r.day !== day) continue;
        counts[r.emoji] = (counts[r.emoji] || 0) + 1;
        if (me && r.member_id === me.id) mine = r.emoji;
      }
      door.reactions = counts;
      door.myReaction = mine;
    }
    out.push(door);
  }
  return json({
    cal: {
      id: cal.id, title: cal.title, start: cal.start, days: cal.days, tz: cal.tz, preset: cal.preset, version: cal.version,
      end: doorDate(cal.start, cal.days), today, opened: openCount(cal.start, cal.days, today), filled, claimed,
    },
    me: me ? { id: me.id, name: me.name, isHost: !!me.is_host } : null,
    members: members.results.map((m) => ({ id: m.id, name: m.name, isHost: !!m.is_host })),
    doors: out,
    order: doorOrder(cal.id, cal.days),
  });
}

async function join(env, request, id) {
  await limit(env, request, 'join', 60);
  const cal = await getCal(env, id);
  const b = await readJson(request);
  const name = clean(b.name, LIM.name, 'your name', true);
  const n = await env.DB.prepare('SELECT COUNT(*) AS c FROM members WHERE cal_id = ?1').bind(id).first();
  if (n.c >= LIM.members) throw new HttpError(409, 'This calendar is full.');
  if (await nameTaken(env, id, name)) {
    throw new HttpError(409, `Someone called ${name} already joined. If that is you, open your personal link from the device you used, or add an initial.`);
  }
  const tok = newToken();
  const mid = rid(10);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO members (id, cal_id, name, token_hash, is_host, created_at) VALUES (?1, ?2, ?3, ?4, 0, ?5)')
      .bind(mid, id, name, await sha(tok), Date.now()),
    bump(env, cal.id),
  ]);
  return json({ token: tok, me: { id: mid, name } }, 201);
}

async function claim(env, request, id, dayStr) {
  await limit(env, request, 'write', 600);
  const cal = await getCal(env, id);
  const me = await needMember(env, request, id);
  const day = parseDay(cal, dayStr);
  const today = todayIn(cal.tz, nowMs(env, request));
  if (isOpen(cal.start, day, today)) throw new HttpError(409, `Door ${day} is already open, so it can’t be filled any more. Pick a later door.`);
  const res = await env.DB.prepare('INSERT INTO doors (cal_id, day, member_id, claimed_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT DO NOTHING')
    .bind(id, day, me.id, Date.now()).run();
  if (!res.meta.changes) {
    const d = await env.DB.prepare('SELECT member_id FROM doors WHERE cal_id = ?1 AND day = ?2').bind(id, day).first();
    if (d && d.member_id === me.id) return json({ ok: true });
    throw new HttpError(409, `Someone just took door ${day}. Pick another one.`);
  }
  await bump(env, id).run();
  return json({ ok: true }, 201);
}

async function ownDoor(env, request, id, dayStr, { allowHost = false } = {}) {
  const cal = await getCal(env, id);
  const me = await needMember(env, request, id);
  const day = parseDay(cal, dayStr);
  const d = await env.DB.prepare('SELECT * FROM doors WHERE cal_id = ?1 AND day = ?2').bind(id, day).first();
  if (!d || (d.member_id !== me.id && !(allowHost && me.is_host))) throw new HttpError(403, `Door ${day} is not yours.`);
  const today = todayIn(cal.tz, nowMs(env, request));
  if (isOpen(cal.start, day, today)) throw new HttpError(409, `Door ${day} is already open, so it can’t be changed.`);
  return { cal, me, day, door: d };
}

async function fill(env, request, id, dayStr) {
  await limit(env, request, 'write', 600);
  const { day, door } = await ownDoor(env, request, id, dayStr);
  const b = await readJson(request);
  const kind = Object.hasOwn(KINDS, b.kind) ? b.kind : 'message';
  const body = cleanText(b.body, LIM.text);
  const link = cleanLink(b.link);
  if (!body && !link && !door.has_photo) throw bad('Write something, add a link or a photo.');
  await env.DB.batch([
    env.DB.prepare('UPDATE doors SET kind = ?3, body = ?4, link = ?5, filled_at = ?6 WHERE cal_id = ?1 AND day = ?2')
      .bind(id, day, kind, body, link, Date.now()),
    bump(env, id),
  ]);
  return json({ ok: true });
}

async function release(env, request, id, dayStr) {
  await limit(env, request, 'write', 600);
  const { day } = await ownDoor(env, request, id, dayStr, { allowHost: true });
  await env.DB.batch([
    env.DB.prepare('DELETE FROM doors WHERE cal_id = ?1 AND day = ?2').bind(id, day),
    env.DB.prepare('DELETE FROM photos WHERE cal_id = ?1 AND day = ?2').bind(id, day),
    bump(env, id),
  ]);
  return json({ ok: true });
}

// Photo upload: raw JPEG/WebP/PNG body, already resized in the browser. Kept small so the calendar stays in free limits.
async function putPhoto(env, request, id, dayStr) {
  await limit(env, request, 'photo', 60);
  const { day } = await ownDoor(env, request, id, dayStr);
  const len = Number(request.headers.get('content-length') || 0);
  if (len > LIM.photoBytes) throw bad('That photo is too large.');
  const buf = await request.arrayBuffer();
  if (buf.byteLength > LIM.photoBytes || buf.byteLength < 100) throw bad('That photo is too large or empty.');
  const h = new Uint8Array(buf.slice(0, 12));
  const jpeg = h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff;
  const webp = h[8] === 0x57 && h[9] === 0x45 && h[10] === 0x42 && h[11] === 0x50;
  if (!jpeg && !webp) throw bad('Please pick a photo (JPEG).');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO photos (cal_id, day, data) VALUES (?1, ?2, ?3) ON CONFLICT(cal_id, day) DO UPDATE SET data = excluded.data').bind(id, day, buf),
    env.DB.prepare('UPDATE doors SET has_photo = 1, filled_at = COALESCE(filled_at, ?3) WHERE cal_id = ?1 AND day = ?2').bind(id, day, Date.now()),
    bump(env, id),
  ]);
  return json({ ok: true });
}
async function delPhoto(env, request, id, dayStr) {
  await limit(env, request, 'write', 600);
  const { day, door } = await ownDoor(env, request, id, dayStr);
  const empty = !door.body && !door.link;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM photos WHERE cal_id = ?1 AND day = ?2').bind(id, day),
    env.DB.prepare(`UPDATE doors SET has_photo = 0${empty ? ', filled_at = NULL' : ''} WHERE cal_id = ?1 AND day = ?2`).bind(id, day),
    bump(env, id),
  ]);
  return json({ ok: true });
}
async function getPhoto(env, request, id, dayStr) {
  const cal = await getCal(env, id);
  const day = parseDay(cal, dayStr);
  const open = isOpen(cal.start, day, todayIn(cal.tz, nowMs(env, request)));
  if (!open) {
    const me = await whoAmI(env, request, id);
    const d = me && (await env.DB.prepare('SELECT member_id FROM doors WHERE cal_id = ?1 AND day = ?2').bind(id, day).first());
    if (!d || d.member_id !== me.id) throw new HttpError(403, 'This door is still closed.');
  }
  const p = await env.DB.prepare('SELECT data FROM photos WHERE cal_id = ?1 AND day = ?2').bind(id, day).first();
  if (!p) throw new HttpError(404, 'No photo.');
  const data = new Uint8Array(p.data);
  const type = data[0] === 0xff ? 'image/jpeg' : 'image/webp';
  return new Response(data, { headers: { 'content-type': type, 'cache-control': open ? 'private, max-age=86400' : 'no-store' } });
}

async function react(env, request, id, dayStr) {
  await limit(env, request, 'write', 600);
  const cal = await getCal(env, id);
  const me = await needMember(env, request, id);
  const day = parseDay(cal, dayStr);
  if (!isOpen(cal.start, day, todayIn(cal.tz, nowMs(env, request)))) throw new HttpError(409, 'This door is still closed.');
  const b = await readJson(request);
  if (b.emoji === null) {
    await env.DB.batch([env.DB.prepare('DELETE FROM reactions WHERE cal_id = ?1 AND day = ?2 AND member_id = ?3').bind(id, day, me.id), bump(env, id)]);
    return json({ ok: true });
  }
  if (!REACTIONS.includes(b.emoji)) throw bad('Unknown reaction.');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO reactions (cal_id, day, member_id, emoji) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(cal_id, day, member_id) DO UPDATE SET emoji = excluded.emoji')
      .bind(id, day, me.id, b.emoji),
    bump(env, id),
  ]);
  return json({ ok: true });
}

async function editCal(env, request, id) {
  await limit(env, request, 'write', 600);
  await getCal(env, id);
  const me = await needMember(env, request, id);
  if (!me.is_host) throw new HttpError(403, 'Only the person who made this calendar can change it.');
  const b = await readJson(request);
  const title = clean(b.title, LIM.title, 'a title', true);
  await env.DB.batch([env.DB.prepare('UPDATE cals SET title = ?2 WHERE id = ?1').bind(id, title), bump(env, id)]);
  return json({ ok: true });
}
async function deleteCal(env, request, id) {
  await limit(env, request, 'write', 600);
  await getCal(env, id);
  const me = await needMember(env, request, id);
  if (!me.is_host) throw new HttpError(403, 'Only the person who made this calendar can delete it.');
  await deleteCalRows(env, id);
  return json({ ok: true });
}
async function leave(env, request, id) {
  await limit(env, request, 'write', 600);
  const cal = await getCal(env, id);
  const me = await needMember(env, request, id);
  if (me.is_host) throw new HttpError(409, 'You made this calendar, so you can’t leave it. You can delete it instead.');
  const today = todayIn(cal.tz, nowMs(env, request));
  // Unopened doors go back to the pool; opened doors keep their content, credited to "Someone who left".
  const fromDay = Math.max(1, openCount(cal.start, cal.days, today) + 1);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM photos WHERE cal_id = ?1 AND day >= ?2 AND day IN (SELECT day FROM doors WHERE cal_id = ?1 AND member_id = ?3)').bind(id, fromDay, me.id),
    env.DB.prepare('DELETE FROM doors WHERE cal_id = ?1 AND member_id = ?2 AND day >= ?3').bind(id, me.id, fromDay),
    env.DB.prepare('DELETE FROM reactions WHERE cal_id = ?1 AND member_id = ?2').bind(id, me.id),
    env.DB.prepare('DELETE FROM members WHERE id = ?1').bind(me.id),
    bump(env, id),
  ]);
  return json({ ok: true });
}

async function stats(env) {
  const [c, m, d] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS n FROM cals'),
    env.DB.prepare('SELECT COUNT(*) AS n, SUM(is_host) AS hosts FROM members'),
    env.DB.prepare('SELECT COUNT(*) AS n, COUNT(filled_at) AS filled FROM doors'),
  ]);
  return json({ calendars: c.results[0].n, members: m.results[0].n, joiners: m.results[0].n - (m.results[0].hosts || 0), doorsClaimed: d.results[0].n, doorsFilled: d.results[0].filled });
}

// Live state for the link preview (functions/c/[id].js).
export async function previewData(env, id, now = Date.now()) {
  if (!/^[A-Za-z0-9]{6,16}$/.test(id || '')) return null;
  const cal = await env.DB.prepare('SELECT id, title, start, days, tz FROM cals WHERE id = ?1').bind(id).first();
  if (!cal) return null;
  const [m, d] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS n FROM members WHERE cal_id = ?1').bind(id),
    env.DB.prepare('SELECT COUNT(*) AS n, COUNT(filled_at) AS filled FROM doors WHERE cal_id = ?1').bind(id),
  ]);
  const today = todayIn(cal.tz, now);
  return {
    title: cal.title,
    line: stateLine({ start: cal.start, days: cal.days, today, filled: d.results[0].filled, claimed: d.results[0].n, people: m.results[0].n }),
    opened: openCount(cal.start, cal.days, today),
    days: cal.days,
  };
}

export async function handleApi(request, env) {
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const M = request.method;
  try {
    if (parts[0] === 'stats' && M === 'GET' && parts.length === 1) return await stats(env);
    if (parts[0] !== 'c') throw new HttpError(404, 'Not found.');
    const [, id, sub, day, sub2] = parts;
    if (!id && M === 'POST') return await createCal(env, request);
    if (id && !sub) {
      if (M === 'GET') return await readCal(env, request, id);
      if (M === 'PATCH') return await editCal(env, request, id);
      if (M === 'DELETE') return await deleteCal(env, request, id);
    }
    if (sub === 'join' && M === 'POST' && !day) return await join(env, request, id);
    if (sub === 'leave' && M === 'POST' && !day) return await leave(env, request, id);
    if (sub === 'photo' && day && M === 'GET' && !sub2) return await getPhoto(env, request, id, day);
    if (sub === 'doors' && day) {
      if (!sub2 && M === 'PUT') return await fill(env, request, id, day);
      if (!sub2 && M === 'DELETE') return await release(env, request, id, day);
      if (sub2 === 'claim' && M === 'POST') return await claim(env, request, id, day);
      if (sub2 === 'photo' && M === 'PUT') return await putPhoto(env, request, id, day);
      if (sub2 === 'photo' && M === 'DELETE') return await delPhoto(env, request, id, day);
      if (sub2 === 'react' && M === 'POST') return await react(env, request, id, day);
    }
    throw new HttpError(404, 'Not found.');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
}

export { MIN_DAYS, MAX_DAYS, isYmd, addDays, diffDays };
