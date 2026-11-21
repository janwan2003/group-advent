// Advent Together: the calendar engine as pure functions (no I/O), shared by the API and the unit tests.
// A calendar has a start date (YYYY-MM-DD), a number of doors (days) and the creator's time zone.
// Door d opens at local midnight of start + (d - 1) days in that time zone, for everyone in the group.

export const MIN_DAYS = 3;
export const MAX_DAYS = 31;

export const KINDS = {
  message: { icon: '💌', label: 'A message' },
  joke: { icon: '😂', label: 'A joke' },
  song: { icon: '🎵', label: 'A song' },
  recipe: { icon: '🍪', label: 'A recipe' },
  memory: { icon: '📸', label: 'A memory' },
  challenge: { icon: '🎯', label: 'A challenge' },
  watch: { icon: '🎬', label: 'Something to watch' },
  other: { icon: '🎁', label: 'A surprise' },
};
export const REACTIONS = ['❤️', '😂', '🥹', '🎄', '👏'];

// Original fallback pack: shown behind any door nobody filled, so the calendar never has a blank day.
// 36 entries, so a calendar of up to 31 doors never repeats one.
export const FALLBACK = [
  { kind: 'challenge', text: 'Send the group a photo of the view from your window right now. No tidying first.' },
  { kind: 'joke', text: 'Why did the gingerbread man go to the doctor? He was feeling crummy.' },
  { kind: 'memory', text: 'Tell the group about the best present you ever got as a kid, and who gave it to you.' },
  { kind: 'challenge', text: 'Hum the first line of a holiday song into a voice note. Everyone else has to guess it.' },
  { kind: 'joke', text: 'What do snowmen eat for breakfast? Frosted flakes.' },
  { kind: 'message', text: 'Today’s door is a nudge: message one person in this group you have not talked to in a while.' },
  { kind: 'recipe', text: 'Hot chocolate upgrade: warm the milk with a strip of orange peel and a pinch of salt, then stir in dark chocolate.' },
  { kind: 'challenge', text: 'Share the oldest photo on your phone. Explanations are optional but encouraged.' },
  { kind: 'joke', text: 'What do you call a reindeer with bad manners? Rude-olph.' },
  { kind: 'memory', text: 'What is one tradition from your family that other people find strange?' },
  { kind: 'challenge', text: 'Everyone names their top three holiday films. Most-shared pick gets watched this weekend.' },
  { kind: 'message', text: 'Write one sentence about the best thing that happened to you this year and post it in the chat.' },
  { kind: 'joke', text: 'Why are Christmas trees bad at knitting? They keep dropping their needles.' },
  { kind: 'challenge', text: 'Swap song recommendations: everyone posts one song they had on repeat this year.' },
  { kind: 'recipe', text: 'Three-ingredient cookies: 1 cup peanut butter, 1 cup sugar, 1 egg. 180°C for 10 minutes.' },
  { kind: 'memory', text: 'Share the worst gift you ever received. Be kind, be honest.' },
  { kind: 'joke', text: 'What did one snowflake say to the other? You’re one of a kind.' },
  { kind: 'challenge', text: 'Draw a reindeer with your eyes closed and post it. Voting is mandatory.' },
  { kind: 'message', text: 'Name one small thing you are looking forward to this month. Small counts.' },
  { kind: 'challenge', text: 'Post a photo of the last thing you cooked or baked, however it turned out.' },
  { kind: 'joke', text: 'How does a snowman get around? On an icicle.' },
  { kind: 'memory', text: 'Where were you this time last year, and what were you worried about?' },
  { kind: 'challenge', text: 'Go outside for ten minutes today and send one photo of something that made you look twice.' },
  { kind: 'recipe', text: 'Spiced nuts: toss nuts with maple syrup, cinnamon, chilli and salt. Roast 12 minutes at 170°C.' },
  { kind: 'joke', text: 'Why did the ornament go to school? To get a little brighter.' },
  { kind: 'challenge', text: 'Everyone shares the emoji they used most this year. Scroll your keyboard to check.' },
  { kind: 'message', text: 'Thank someone in this group for something they did this year. Be specific.' },
  { kind: 'memory', text: 'What is the first holiday you remember? Tell it in three sentences.' },
  { kind: 'joke', text: 'What do you get if you cross a bell with a skunk? Jingle smells.' },
  { kind: 'challenge', text: 'Plan the group’s next meet-up: everyone suggests a date, the first one with three yeses wins.' },
  { kind: 'watch', text: 'Tonight, everyone watches the same short film or episode and reports back tomorrow. Group picks.' },
  { kind: 'message', text: 'Share one thing you learned this year that you wish you had known sooner.' },
  { kind: 'joke', text: 'What do elves learn at school? The elf-abet.' },
  { kind: 'challenge', text: 'Light a candle, put on one song, and do nothing else for its whole length. Report back.' },
  { kind: 'memory', text: 'Which song instantly takes you back to a winter years ago? Share it.' },
  { kind: 'message', text: 'Today’s door is for you: pick one thing to stop worrying about until January.' },
];

const pad = (n) => String(n).padStart(2, '0');

export function isYmd(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

export function addDays(ymd, n) {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Whole days from a to b (b - a).
export function diffDays(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

export function validTz(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// The calendar date (YYYY-MM-DD) at instant nowMs in time zone tz.
export function todayIn(tz, nowMs) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(nowMs));
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export const doorDate = (start, day) => addDays(start, day - 1);
export const isOpen = (start, day, today) => doorDate(start, day) <= today;

// How many doors are open on `today` (0 before the start, `days` after the end).
export function openCount(start, days, today) {
  return Math.max(0, Math.min(days, diffDays(start, today) + 1));
}

// Small deterministic PRNG seeded by a string, so a calendar's layout and fallback picks stay stable.
function seedOf(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(n, seedStr) {
  const r = rng(seedOf(seedStr));
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Display order of doors: shuffled like a real advent calendar, stable per calendar.
export const doorOrder = (id, days) => shuffled(days, 'order:' + id).map((i) => i + 1);

// Fallback content for an empty door: a per-calendar permutation of the pack, so no repeats.
export function fallbackFor(id, day) {
  const perm = shuffled(FALLBACK.length, 'fb:' + id);
  return FALLBACK[perm[(day - 1) % FALLBACK.length]];
}

// Resolve a creation request into start date + number of doors.
//   preset 'advent': 1 Dec .. 24 Dec;  'twelve': 13 Dec .. 24 Dec (the last 12 days before Christmas);
//   'custom': `bigDay` is the last door, `days` doors lead up to it.
// Advent presets pick this year's December unless it is already over (after 24 Dec), then next year's.
export function resolveDates({ preset, bigDay, days }, today) {
  const year = Number(today.slice(0, 4));
  const xmasYear = today > `${year}-12-24` ? year + 1 : year;
  if (preset === 'advent') return { start: `${xmasYear}-12-01`, days: 24 };
  if (preset === 'twelve') return { start: `${xmasYear}-12-13`, days: 12 };
  if (preset !== 'custom') throw new Error('Pick a calendar type.');
  const n = Number(days);
  if (!Number.isInteger(n) || n < MIN_DAYS || n > MAX_DAYS) throw new Error(`Pick between ${MIN_DAYS} and ${MAX_DAYS} doors.`);
  if (!isYmd(bigDay)) throw new Error('Pick the big day.');
  const start = addDays(bigDay, -(n - 1));
  if (diffDays(today, bigDay) < 0) throw new Error('The big day has already passed.');
  if (diffDays(today, bigDay) > 400) throw new Error('The big day is too far away (pick one within a year).');
  return { start, days: n };
}

export function fmtDay(ymd, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
}

// One line describing the calendar's live state, used in the link preview.
export function stateLine({ start, days, today, filled, claimed, people }) {
  const open = openCount(start, days, today);
  const bits = [];
  if (open === 0) bits.push(`Starts ${fmtDay(start)}`, `${claimed} of ${days} doors claimed`);
  else if (open >= days) bits.push(`All ${days} doors open`);
  else bits.push(`Day ${open} opened`, `${filled} of ${days} doors filled`);
  bits.push(`${people} ${people === 1 ? 'person' : 'people'}`);
  return bits.join(' · ');
}

export { pad };
