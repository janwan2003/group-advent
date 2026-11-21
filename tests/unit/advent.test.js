import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, diffDays, isYmd, todayIn, doorDate, isOpen, openCount, doorOrder, fallbackFor, resolveDates, stateLine, FALLBACK, validTz,
} from '../../lib/advent.js';

test('date arithmetic crosses months and years', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(diffDays('2026-12-01', '2026-12-24'), 23);
  assert.ok(isYmd('2028-02-29'));
  assert.ok(!isYmd('2026-02-30'));
  assert.ok(!isYmd('2026-2-3'));
});

test('today depends on the calendar time zone', () => {
  const t = Date.parse('2026-11-30T23:30:00Z'); // 00:30 on 1 Dec in Warsaw, still 30 Nov in New York
  assert.equal(todayIn('Europe/Warsaw', t), '2026-12-01');
  assert.equal(todayIn('America/New_York', t), '2026-11-30');
  assert.ok(isOpen('2026-12-01', 1, todayIn('Europe/Warsaw', t)));
  assert.ok(!isOpen('2026-12-01', 1, todayIn('America/New_York', t)));
  assert.ok(validTz('Asia/Kolkata'));
  assert.ok(!validTz('Mars/Olympus'));
});

test('doors stay locked before their day and open on it', () => {
  const s = '2026-12-01';
  assert.equal(doorDate(s, 24), '2026-12-24');
  assert.ok(!isOpen(s, 7, '2026-12-06'));
  assert.ok(isOpen(s, 7, '2026-12-07'));
  assert.equal(openCount(s, 24, '2026-11-21'), 0);
  assert.equal(openCount(s, 24, '2026-12-07'), 7);
  assert.equal(openCount(s, 24, '2027-01-03'), 24);
});

test('door order is a stable shuffle of every door', () => {
  const a = doorOrder('abc123XYZ', 24);
  assert.deepEqual(a, doorOrder('abc123XYZ', 24));
  assert.deepEqual([...a].sort((x, y) => x - y), Array.from({ length: 24 }, (_, i) => i + 1));
  assert.notDeepEqual(a, Array.from({ length: 24 }, (_, i) => i + 1));
  assert.notDeepEqual(a, doorOrder('otherCal99', 24));
});

test('fallback never repeats within a 31-door calendar', () => {
  assert.ok(FALLBACK.length >= 31);
  const seen = new Set();
  for (let d = 1; d <= 31; d++) seen.add(fallbackFor('cal123456', d).text);
  assert.equal(seen.size, 31);
  for (const f of FALLBACK) assert.ok(f.text.length > 10 && f.text.length < 200);
});

test('presets resolve to this December, or next once it is over', () => {
  assert.deepEqual(resolveDates({ preset: 'advent' }, '2026-11-21'), { start: '2026-12-01', days: 24 });
  assert.deepEqual(resolveDates({ preset: 'twelve' }, '2026-11-21'), { start: '2026-12-13', days: 12 });
  assert.deepEqual(resolveDates({ preset: 'advent' }, '2026-12-26'), { start: '2027-12-01', days: 24 });
  assert.deepEqual(resolveDates({ preset: 'advent' }, '2026-12-10'), { start: '2026-12-01', days: 24 }); // late starters join this year's
});

test('custom countdown ends on the big day', () => {
  assert.deepEqual(resolveDates({ preset: 'custom', bigDay: '2027-03-14', days: 10 }, '2026-11-21'), { start: '2027-03-05', days: 10 });
  assert.throws(() => resolveDates({ preset: 'custom', bigDay: '2026-11-01', days: 10 }, '2026-11-21'), /passed/);
  assert.throws(() => resolveDates({ preset: 'custom', bigDay: '2027-01-01', days: 2 }, '2026-11-21'), /between/);
  assert.throws(() => resolveDates({ preset: 'custom', bigDay: '2027-01-01', days: 40 }, '2026-11-21'), /between/);
  assert.throws(() => resolveDates({ preset: 'custom', bigDay: 'soon', days: 5 }, '2026-11-21'), /big day/);
  assert.throws(() => resolveDates({ preset: 'nope' }, '2026-11-21'), /type/);
});

test('state line for the link preview', () => {
  assert.equal(stateLine({ start: '2026-12-01', days: 24, today: '2026-11-21', filled: 2, claimed: 5, people: 3 }), 'Starts Tue 1 Dec · 5 of 24 doors claimed · 3 people');
  assert.equal(stateLine({ start: '2026-12-01', days: 24, today: '2026-12-07', filled: 18, claimed: 20, people: 9 }), 'Day 7 opened · 18 of 24 doors filled · 9 people');
  assert.equal(stateLine({ start: '2026-12-01', days: 24, today: '2026-12-30', filled: 18, claimed: 20, people: 1 }), 'All 24 doors open · 1 person');
});
