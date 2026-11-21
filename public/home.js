import { $, $$, h, api, setToken } from './common.js';

// Decorative demo board.
const demo = $('#demo');
const demoDoors = [7, 3, 12, 1, 9, 5, 11, 2, 8, 6, 4, 10];
const opened = { 1: '🎵', 2: '😂', 3: '📸', 4: '🍪' };
for (const n of demoDoors) {
  const cls = ['door'];
  if (opened[n]) cls.push('open');
  else if (n === 5) cls.push('today');
  else if ([6, 8, 9, 11].includes(n)) cls.push('taken');
  demo.append(h('div', { class: cls.join(' ') }, opened[n] ? [h('span', { class: 'icon', text: opened[n] }), h('span', { class: 'num', text: n })] : h('span', { class: 'num', text: n })));
}

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const xmasYear = today > `${now.getFullYear()}-12-24` ? now.getFullYear() + 1 : now.getFullYear();
if (xmasYear !== now.getFullYear()) {
  $('#adventDates').textContent = `24 doors, 1–24 December ${xmasYear}`;
  $('#twelveDates').textContent = `12 doors, 13–24 December ${xmasYear}`;
}

const sel = $('#days');
for (let i = 3; i <= 31; i++) sel.append(h('option', { value: i, selected: i === 10 }, `${i} doors`));
$('#bigDay').min = today;

const box = $('#customBox');
const title = $('#title');
const defaults = { advent: 'Our advent calendar', twelve: 'Our 12 days to Christmas', custom: 'Countdown to ' };
let lastDefault = title.value;
for (const r of $$('input[name=preset]')) {
  r.addEventListener('change', () => {
    if (!r.checked) return;
    box.classList.toggle('hidden', r.value !== 'custom');
    if (title.value === lastDefault || !title.value.trim()) {
      title.value = defaults[r.value];
      lastDefault = title.value;
    }
  });
}

$('#make').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#err');
  err.textContent = '';
  const preset = $('input[name=preset]:checked').value;
  const body = { title: title.value.trim(), name: $('#name').value.trim(), preset, tz };
  if (preset === 'custom') {
    body.bigDay = $('#bigDay').value;
    body.days = Number(sel.value);
    if (body.title === 'Countdown to') { err.textContent = 'What are you counting down to? Finish the name.'; title.focus(); return; }
    if (!body.bigDay) { err.textContent = 'Pick the big day.'; $('#bigDay').focus(); return; }
  }
  if (!body.title) { err.textContent = 'Give your calendar a name.'; title.focus(); return; }
  if (!body.name) { err.textContent = 'Please enter your name, so the group knows who made it.'; $('#name').focus(); return; }
  const btn = $('#go');
  btn.disabled = true;
  btn.textContent = 'Creating…';
  try {
    const r = await api('c', { method: 'POST', body });
    setToken(r.id, r.token);
    location.href = `/c/${r.id}?new=1`;
  } catch (ex) {
    err.textContent = ex.message;
    btn.disabled = false;
    btn.textContent = 'Create the calendar';
  }
});
