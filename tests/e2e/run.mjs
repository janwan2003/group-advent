// End-to-end test in real Chromium with separate browser contexts (one per person; host on desktop, guests on phones):
// create, claim + fill (text, link, photo), join from the link, duplicate name, no-peeking (UI and API), claim race,
// time travel to open doors (local only: x-now hook), reveal with photo, fallback door, reactions, personal link on a new
// device, leave, the end-of-calendar state, link preview text, and delete. Screenshots at phone and desktop width go to shots/.
// Usage: BASE=http://127.0.0.1:8890 node tests/e2e/run.mjs
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:8890';
const LOCAL = /127\.0\.0\.1|localhost/.test(BASE);
const SHOTS = process.env.SHOTS || 'shots';
fs.mkdirSync(SHOTS, { recursive: true });

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const root = path.join(os.homedir(), '.cache/ms-playwright');
  for (const d of fs.readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const p = path.join(root, d, 'chrome-linux64/chrome');
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

const TZ = 'Europe/Warsaw';
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: TZ };
const DESKTOP = { viewport: { width: 1280, height: 860 }, timezoneId: TZ };
const errors = [];
const browser = await chromium.launch({ executablePath: findChrome() });
const expected = []; // [label, regex] console errors that a step provokes on purpose

async function person(label, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (expected.some(([l, re]) => l === label && re.test(m.text()))) return;
    errors.push(`${label}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  return { label, ctx, page };
}
const step = (s) => console.log('·', s);
const shot = (p, name, full = true) => p.screenshot({ path: path.join(SHOTS, name), fullPage: full });
const door = (p, day) => p.locator(`#board [data-day="${day}"]`);
const sheet = (p) => p.locator('#sheet');
const travel = async (p, iso) => {
  await p.evaluate((ms) => localStorage.setItem('ga:now', String(ms)), Date.parse(iso));
  await p.reload();
  await p.locator('#view').waitFor();
};

let calId, samToken;
try {
  // ---------- host creates ----------
  const sam = await person('Sam', DESKTOP);
  step('home page');
  await sam.page.goto(BASE + '/');
  await sam.page.getByRole('heading', { name: /advent calendar your whole group fills together/i }).waitFor();
  await shot(sam.page, 'home-desktop.png');
  await sam.page.locator('#go').click();
  assert.match(await sam.page.locator('#err').textContent(), /your name/i, 'name required');
  await sam.page.locator('#name').fill('Sam');
  await sam.page.locator('#title').fill('Kowalski family advent');
  step('create');
  await sam.page.locator('#go').click();
  await sam.page.waitForURL(/\/c\/[A-Za-z0-9]+$/);
  calId = new URL(sam.page.url()).pathname.split('/')[2];
  samToken = await sam.page.evaluate((id) => localStorage.getItem('ga:tok:' + id), calId);
  await sam.page.getByText('Your calendar is ready').waitFor();
  assert.equal(await sam.page.locator('#board .door').count(), 24);
  assert.match(await sam.page.locator('#meta').textContent(), /24 doors · (1\s*–\s*24 December|December 1\s*–\s*24)/);
  const order = await sam.page.locator('#board .door').evaluateAll((els) => els.map((e) => Number(e.dataset.day)));
  assert.notDeepEqual(order, [...order].sort((a, b) => a - b), 'doors are shuffled');

  step('Sam claims door 2 and fills it');
  await door(sam.page, 2).click();
  await sheet(sam.page).getByRole('button', { name: 'Claim door 2' }).click();
  await sheet(sam.page).getByRole('button', { name: /Joke/ }).click();
  await sheet(sam.page).locator('#doorBody').fill('What do you call a sleeping reindeer? A bulldozer… no wait, that one is about dinosaurs.');
  await sheet(sam.page).getByRole('button', { name: 'Hide it behind the door' }).click();
  await sheet(sam.page).waitFor({ state: 'hidden' });
  assert.match(await door(sam.page, 2).textContent(), /yours ✓/);
  await shot(sam.page, 'calendar-host-desktop.png');

  // ---------- guests ----------
  const ana = await person('Ana', PHONE);
  step('Ana opens the link on a phone and claims door 5 with a photo');
  await ana.page.goto(`${BASE}/c/${calId}`);
  await ana.page.getByText(/You’re invited to “Kowalski family advent”/).waitFor();
  await shot(ana.page, 'invite-phone.png');
  await door(ana.page, 5).click();
  await sheet(ana.page).getByRole('heading', { name: 'Door 5 is free' }).waitFor();
  await sheet(ana.page).getByPlaceholder('Your name').fill('Ana');
  await sheet(ana.page).getByRole('button', { name: 'Join and claim door 5' }).click();
  await sheet(ana.page).getByRole('heading', { name: 'Door 5' }).waitFor();
  await sheet(ana.page).getByRole('button', { name: /Memory/ }).click();
  await sheet(ana.page).locator('#doorBody').fill('Dad in the snow, winter 1983. He still says the sledge was faulty.');
  await sheet(ana.page).locator('#doorLink').fill('example.com/snow');
  // A real JPEG made by the browser itself.
  const jpeg = await sam.page.screenshot({ type: 'jpeg', quality: 70, clip: { x: 0, y: 0, width: 600, height: 400 } });
  await sheet(ana.page).locator('#doorPhoto').setInputFiles({ name: 'snow.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await sheet(ana.page).locator('.photo-prev img').waitFor();
  await shot(ana.page, 'editor-phone.png', false);
  await sheet(ana.page).getByRole('button', { name: 'Hide it behind the door' }).click();
  await sheet(ana.page).waitFor({ state: 'hidden' });
  assert.match(await door(ana.page, 5).textContent(), /yours ✓/);
  await ana.page.getByText('Ana · you').waitFor();

  step('Ben joins; duplicate name is refused; door 5 is locked for him');
  const ben = await person('Ben', PHONE);
  expected.push(['Ben', /status of 409/]);
  await ben.page.goto(`${BASE}/c/${calId}`);
  await ben.page.locator('#joinName').fill('ana');
  await ben.page.getByRole('button', { name: 'Join', exact: true }).click();
  await ben.page.getByText(/Someone called ana already joined/).waitFor();
  await ben.page.locator('#joinName').fill('Ben');
  await ben.page.getByRole('button', { name: 'Join', exact: true }).click();
  await ben.page.getByText('Ben · you').waitFor();
  assert.match(await door(ben.page, 5).textContent(), /taken/);
  await door(ben.page, 5).click();
  await sheet(ben.page).getByRole('heading', { name: 'Taken: no peeking!' }).waitFor();
  assert.ok(!(await ben.page.content()).includes('sledge'), 'secret text not in page');
  const benToken = await ben.page.evaluate((id) => localStorage.getItem('ga:tok:' + id), calId);
  const apiView = await ben.page.request.get(`${BASE}/api/c/${calId}`, { headers: { 'x-token': benToken } });
  const apiText = await apiView.text();
  assert.ok(!apiText.includes('sledge'), 'secret text not in API');
  const d5 = JSON.parse(apiText).doors[4];
  assert.equal(d5.from, undefined, 'filler hidden before opening');
  assert.equal(d5.body, undefined, 'content hidden before opening');
  assert.equal((await ben.page.request.get(`${BASE}/api/c/${calId}/photo/5`, { headers: { 'x-token': benToken } })).status(), 403, 'photo locked');
  assert.equal((await ben.page.request.put(`${BASE}/api/c/${calId}/doors/5`, { headers: { 'x-token': benToken, 'content-type': 'application/json' }, data: { body: 'hijack' } })).status(), 403, 'cannot edit others');
  await sheet(ben.page).locator('#sheetX').click();

  step('claim race: Ben and Cy want door 7');
  const cy = await person('Cy', PHONE);
  await cy.page.goto(`${BASE}/c/${calId}`);
  await cy.page.locator('#joinName').fill('Cy');
  await cy.page.getByRole('button', { name: 'Join', exact: true }).click();
  await cy.page.getByText('Cy · you').waitFor();
  await door(ben.page, 7).click();
  await sheet(ben.page).getByRole('button', { name: 'Claim door 7' }).waitFor();
  await door(cy.page, 7).click();
  await sheet(cy.page).getByRole('button', { name: 'Claim door 7' }).click();
  await sheet(cy.page).getByRole('heading', { name: 'Door 7' }).waitFor();
  await sheet(ben.page).getByRole('button', { name: 'Claim door 7' }).click();
  await sheet(ben.page).getByText(/Someone just took door 7/).waitFor();
  await sheet(ben.page).locator('#sheetX').click();
  step('Cy leaves door 7 claimed but empty: nudge shows');
  await sheet(cy.page).locator('#sheetX').click();
  await cy.page.getByText(/You claimed door 7 but haven’t filled it yet/).waitFor();
  await shot(cy.page, 'calendar-phone.png');

  step('link preview shows live state');
  const html = await (await sam.page.request.get(`${BASE}/c/${calId}`)).text();
  assert.match(html, /<meta property="og:title" content="Kowalski family advent · Advent Together">/);
  assert.match(html, /og:description" content="Starts \w+ 1 Dec · 3 of 24 doors claimed · 4 people/);
  const ogImg = html.match(/og:image" content="([^"]+)"/)[1];
  const img = await sam.page.request.get(ogImg.replace(/^https?:\/\/[^/]+/, BASE));
  assert.equal(img.status(), 200, 'preview image loads');
  assert.ok((await img.body()).length < 300000, 'preview image under 300 KB (WhatsApp skips bigger ones)');
  assert.equal((await sam.page.request.get(`${BASE}/no-such-page`)).status(), 404, 'unknown pages are a real 404');

  if (LOCAL) {
    step('time travel to 5 Dec: today’s door opens for Ben');
    await travel(ben.page, '2026-12-05T08:00:00+01:00');
    await ben.page.getByRole('heading', { name: 'Door 5 is open!' }).waitFor();
    assert.match(await door(ben.page, 5).getAttribute('class'), /today/);
    assert.match(await door(ben.page, 6).textContent(), /free, opens/);
    assert.match(await ben.page.locator('#progTxt').textContent(), /18 doors still free/, 'opened doors are not counted as free');
    await ben.page.getByRole('button', { name: 'Open door 5' }).click();
    await sheet(ben.page).getByRole('heading', { name: 'From Ana' }).waitFor();
    await sheet(ben.page).getByText('A memory from Ana').waitFor();
    await sheet(ben.page).getByText(/sledge was faulty/).waitFor();
    await sheet(ben.page).getByRole('link', { name: /example\.com/ }).waitFor();
    await ben.page.waitForFunction(() => { const i = document.querySelector('#sheet .reveal img'); return i && i.complete && i.naturalWidth > 100; });
    await sheet(ben.page).getByRole('button', { name: /React ❤️/ }).click();
    await sheet(ben.page).locator('.reacts button[aria-pressed=true]').waitFor();
    assert.match(await sheet(ben.page).locator('.reacts').textContent(), /❤️1/);
    await shot(ben.page, 'reveal-phone.png', false);
    await sheet(ben.page).locator('#sheetX').click();
    assert.equal(await ben.page.getByRole('heading', { name: 'Door 5 is open!' }).count(), 0, 'today notice hides once seen');

    step('empty door 1 opens with a fallback (by keyboard); Sam’s door 2 shows his name');
    await door(ben.page, 1).focus();
    await ben.page.keyboard.press('Enter');
    await sheet(ben.page).getByRole('heading', { name: 'A surprise from us' }).waitFor();
    await sheet(ben.page).getByText(/from the Advent Together elves/).waitFor();
    await ben.page.keyboard.press('Escape');
    await ben.page.waitForFunction(() => document.activeElement && document.activeElement.dataset.day === '1');
    await door(ben.page, 2).click();
    await sheet(ben.page).getByRole('heading', { name: 'From Sam' }).waitFor();
    await sheet(ben.page).locator('#sheetX').click();
    assert.equal((await ben.page.request.post(`${BASE}/api/c/${calId}/doors/3/claim`, { headers: { 'x-token': benToken, 'x-now': String(Date.parse('2026-12-05T08:00:00+01:00')) } })).status(), 409, 'cannot claim an opened door');

    step('Ana sees her opened door with the reaction, and cannot edit it any more');
    await travel(ana.page, '2026-12-05T08:00:00+01:00');
    await door(ana.page, 5).click();
    await sheet(ana.page).getByRole('heading', { name: 'From Ana' }).waitFor();
    assert.equal(await sheet(ana.page).locator('#doorBody').count(), 0);
    await sheet(ana.page).locator('#sheetX').click();
  }

  step('Ana’s personal link works on a new device');
  const anaToken = await ana.page.evaluate((id) => localStorage.getItem('ga:tok:' + id), calId);
  const ana2 = await person('Ana-laptop', DESKTOP);
  await ana2.page.goto(`${BASE}/c/${calId}#k=${encodeURIComponent(anaToken)}`);
  await ana2.page.getByText('Ana · you').waitFor();
  assert.ok(!ana2.page.url().includes('#k='), 'token removed from the address bar');

  step('Ben leaves');
  ben.page.on('dialog', (d) => d.accept());
  if (LOCAL) await ben.page.evaluate(() => localStorage.removeItem('ga:now'));
  await ben.page.reload();
  await ben.page.getByRole('button', { name: 'Leave' }).click();
  await ben.page.getByText(/You’re invited to/).waitFor();
  assert.ok(!(await ben.page.locator('#people').textContent()).includes('Ben'));

  if (LOCAL) {
    step('after the last door: wrap-up and "make one for another group"');
    await travel(sam.page, '2026-12-26T10:00:00+01:00');
    await sam.page.getByText('That’s a wrap: every door is open').waitFor();
    assert.equal(await sam.page.locator('#board .door.open').count(), 24);
    assert.match(await sam.page.locator('#progTxt').textContent(), /^2 of 24 doors came from the group/);
    assert.equal(await sam.page.locator('#invite').textContent(), 'Share the calendar');
    assert.match(await sam.page.locator('#you').textContent(), /Your door 2 has opened for the group/);
    await shot(sam.page, 'wrap-desktop.png');
    await sam.page.evaluate(() => localStorage.removeItem('ga:now'));
  }

  step('desktop and phone screenshots of the home page');
  const phoneHome = await person('Visitor', PHONE);
  await phoneHome.page.goto(BASE + '/');
  await shot(phoneHome.page, 'home-phone.png');
  await phoneHome.page.goto(BASE + '/privacy');
  await phoneHome.page.getByRole('heading', { name: 'Privacy' }).waitFor();
  expected.push(['Visitor', /status of 404/]);
  await phoneHome.page.goto(BASE + '/c/doesnotexist1');
  await phoneHome.page.getByText('This calendar doesn’t exist').waitFor();

  step('Sam deletes the calendar');
  expected.push(['Cy', /status of 404/], ['Ana', /status of 404/], ['Ana-laptop', /status of 404/], ['Ben', /status of 404/]);
  sam.page.on('dialog', (d) => d.accept());
  await sam.page.reload();
  await sam.page.getByRole('button', { name: 'Delete calendar' }).click();
  await sam.page.getByText('This calendar doesn’t exist').waitFor();
  calId = null;
  assert.equal((await sam.page.request.get(`${BASE}/api/c/${new URL(sam.page.url()).pathname.split('/')[2]}`)).status(), 404);

  assert.deepEqual(errors, [], 'no unexpected console errors');
  console.log(`\nE2E PASSED (${LOCAL ? 'local, with time travel' : 'remote, no time travel'}) · screenshots in ${SHOTS}/`);
} catch (e) {
  console.error('\nE2E FAILED:', e);
  if (errors.length) console.error('console errors:', errors);
  process.exitCode = 1;
} finally {
  if (calId && samToken) await fetch(`${BASE}/api/c/${calId}`, { method: 'DELETE', headers: { 'x-token': samToken } }).catch(() => {});
  await browser.close();
}
