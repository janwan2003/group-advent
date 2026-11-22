// Accessibility audit with axe-core (WCAG 2 A/AA rules) in real Chromium at phone and desktop width:
// home, privacy, 404, and a calendar as host, as invited guest, with each door sheet open (free, editor, taken,
// opened door, fallback door) and after the last door. Creates its own calendar and deletes it.
// Usage: BASE=http://127.0.0.1:8890 node tests/e2e/a11y.mjs   (time-travel pages need a local server)
import { chromium } from 'playwright-core';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { createRequire } from 'node:module';

const BASE = process.env.BASE || 'http://127.0.0.1:8890';
const LOCAL = /127\.0\.0\.1|localhost/.test(BASE);
const axeSrc = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const root = path.join(os.homedir(), '.cache/ms-playwright');
const exe = path.join(root, fs.readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()[0], 'chrome-linux64/chrome');
const browser = await chromium.launch({ executablePath: exe });
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'Europe/Warsaw' };
const DESKTOP = { viewport: { width: 1280, height: 860 }, timezoneId: 'Europe/Warsaw' };
const problems = [];
let checked = 0;

async function audit(page, label) {
  await page.evaluate(axeSrc);
  const r = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } }));
  checked++;
  for (const v of r.violations) problems.push(`${label}: [${v.impact}] ${v.id}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

let id, token;
try {
  for (const [w, opts] of [['phone', PHONE], ['desktop', DESKTOP]]) {
    const ctx = await browser.newContext(opts);
    const p = await ctx.newPage();
    for (const u of ['/', '/privacy', '/no-such-page']) { await p.goto(BASE + u); await audit(p, `${w} ${u}`); }
    if (!id) {
      await p.goto(BASE + '/');
      await p.fill('#name', 'Sam');
      await p.click('#go');
      await p.waitForURL(/\/c\/\w+$/);
      id = new URL(p.url()).pathname.split('/')[2];
      token = await p.evaluate((i) => localStorage.getItem('ga:tok:' + i), id);
      await p.locator('#board [data-day="2"]').click();
      await p.getByRole('button', { name: 'Claim door 2' }).click();
      await p.locator('#doorBody').waitFor();
      await audit(p, `${w} editor sheet`);
      await p.locator('#doorBody').fill('A joke for everyone');
      await p.getByRole('button', { name: 'Hide it behind the door' }).click();
      await p.locator('#sheet').waitFor({ state: 'hidden' });
    } else {
      await p.goto(`${BASE}/c/${id}#k=${encodeURIComponent(token)}`);
    }
    await p.locator('#view').waitFor();
    await audit(p, `${w} calendar (host)`);
    const g = await (await browser.newContext(opts)).newPage();
    await g.goto(`${BASE}/c/${id}`);
    await g.locator('#view').waitFor();
    await audit(g, `${w} calendar (invited guest)`);
    await g.locator('#board [data-day="5"]').click();
    await g.locator('#sheet[open]').waitFor();
    await audit(g, `${w} free door sheet (guest)`);
    await g.keyboard.press('Escape');
    await g.locator('#board [data-day="2"]').click();
    await g.getByRole('heading', { name: 'Taken: no peeking!' }).waitFor();
    await audit(g, `${w} taken door sheet`);
    if (LOCAL) {
      for (const [when, name] of [['2026-12-03T09:00:00+01:00', 'mid-advent'], ['2026-12-26T09:00:00+01:00', 'after the last door']]) {
        await p.evaluate((ms) => localStorage.setItem('ga:now', String(ms)), Date.parse(when));
        await p.reload();
        await p.locator('#view').waitFor();
        await audit(p, `${w} calendar ${name}`);
        await p.locator('#board [data-day="2"]').click();
        await p.locator('#sheet .reveal').waitFor();
        await audit(p, `${w} opened door sheet ${name}`);
        await p.keyboard.press('Escape');
        await p.locator('#board [data-day="1"]').click();
        await p.locator('#sheet .reveal').waitFor();
        await audit(p, `${w} fallback door sheet ${name}`);
        await p.keyboard.press('Escape');
      }
      await p.evaluate(() => localStorage.removeItem('ga:now'));
    }
  }
} finally {
  if (id) await fetch(`${BASE}/api/c/${id}`, { method: 'DELETE', headers: { 'x-token': token } }).catch(() => {});
  await browser.close();
}
const uniq = [...new Set(problems)];
console.log(uniq.join('\n') || 'no violations');
console.log(`\n${checked} page states audited · ${uniq.length} violations`);
process.exitCode = uniq.length ? 1 : 0;
