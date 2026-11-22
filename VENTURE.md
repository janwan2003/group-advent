---
slug: group-advent
stage: launched
priority: 5
url: https://pb-group-advent.pages.dev
repo: https://github.com/janwan2003/group-advent
updated: 2026-11-22
---

# group-advent

## Thesis

**Who:** Long-distance friend groups, families spread across cities, couples' friend circles,
office teams and school classes who want a small daily December ritual together.

**What:** A no-login shared advent calendar that the group fills itself. The creator picks the
dates (1–24 December by default, or any countdown: 12 days, a birthday, a trip, a wedding) and shares
the link. Members join with a nickname and claim doors. Each claimed door gets a little surprise
for everyone: a message, a joke, a song or video link, a recipe, a memory, a small photo. One door
unlocks each morning for the whole group, and you can only see a door's content on its day. The
calendar shows who filled each door after it opens, and reactions per door. Unclaimed doors get a
gentle nudge and a fallback from an original content pack, so the calendar never has a blank day.

**Needs others:** yes. The point is that the doors come from other people. Filling all 24 yourself
is a different (solo) product, and the claiming step is how the group is formed.

**Viral moment:** each morning's door ("Day 7 · from Grandma: the 1983 photo of Dad in the snow")
gets screenshotted back into the group chat. The link preview shows live state: "Day 7 opened · 18
of 24 doors filled". On 24 December, "Make one for another group" and "Start a countdown for
something else".

**How often:** daily for the length of the countdown (24 days of return visits). Starting a new one
is yearly for advent, but the same product serves any countdown (birthdays, trips, weddings, exams),
so a person has a reason several times a year.

**Why now:** people already do this by hand. Friend groups run physical advent calendar swaps
("Adfriendt") and share each day's opening in a group album. The digital options are one-creator,
paid, or whiteboards. Timing is tight: advent starts on 2026-12-01 (11 days from now). The fallback
is to launch for "12 days of Christmas" (from 14 December) and generic countdowns.

## Market evidence

Searches run 2026-11-20. Sources are search-result summaries, not opened pages.

- **Behaviour exists:** [Yahoo UK, "The 'Adfriendt' holiday tradition that keeps my group chat
  laughing"](https://uk.style.yahoo.com/adfriendt-holiday-tradition-keeps-group-130000840.html)
  (long-distance friends, each opens a door daily and shares a video in a group album, fourth year
  in 2024). [Apartment Therapy](https://www.apartmenttherapy.com/advent-calendar-exchange-holiday-tradition-37435927)
  on the same advent-swap tradition. [Tone Madison](https://tonemadison.com/articles/pleasure-practices-with-sami-schalk-countdown-calendars-and-daily-delights/)
  suggests homemade countdown calendar swaps.
- **Paid digital calendars sell:** Jacquie Lawson's 16th annual digital advent calendar costs
  £8 / $9.99 ([PR Newswire, 2025-10-28](https://www.prnewswire.com/news-releases/jacquie-lawson-announces-new-2025-animated-advent-calendar-302595633.html)),
  and American Greetings and Blue Mountain resell it ([American Greetings](https://www.americangreetings.com/digital-gifts/paris-advent-calendar)).
  These are one-way, publisher-made calendars.
- **Personal calendar makers are one-creator:** [Advent App (Pintumo)](https://apps.apple.com/app/id756869205)
  lets one person build a calendar with photos, videos and messages and send it. Reviews mention a
  charge per calendar sent. Nothing lets several people fill one calendar.
- **Collaborative fallback:** [Miro advent calendar template](https://miro.com/templates/advent-calendar-template/)
  is a whiteboard, not a door-a-day reveal, and needs Miro accounts.
- **Re-check 2026-11-21 (web search summaries, pages not opened):** [25Days](https://www.producthunt.com/p/25days)
  (Product Hunt) is a "social advent calendar" that sends the whole group one *publisher* prompt per day, so the
  group does not fill it. [PollUnit advent calendar](https://pollunit.com/advent-calendar) has one creator design the
  doors and participants enter; it needs registration. [Advent Calendar Creator (iOS)](https://apps.apple.com/us/app/id6444065990)
  and [25daysof](https://thenextweb.com/news/25daysof-lets-you-create-a-personalized-advent-calendar-using-gifs-videos-music-and-photos)
  are one-creator calendars shared by link. A hobby forum ([Eurobricks](https://www.eurobricks.com/forum/forums/topic/181312-merrymas-organising-a-botbs-advent-calendar))
  runs a members-claim-a-day calendar by hand. Conclusion: the group-filled, reveal-a-day shape is still unserved.
- **No volume data:** I did not measure search volume for "group advent calendar" or "online
  advent calendar".

## Our edge

- **Loop: needs others.**
- **K estimate ≈ 1.3** = 10 people invited per calendar × 65% who join (opening today's door is one
  tap. Filling a door is optional) × 20% of joiners who start one for another group (their family,
  their office, their partner's friends). Reason: people belong to several December groups, and
  door 24 ends with "make one for another group". Creation is seasonal, which caps the third factor.
- **Group-filled and reveal-a-day**, which no competitor found does.
- **Free and no account**, against £8/$9.99 one-way calendars and per-send charges.
- **Not only December:** the same engine runs any countdown, which fixes the yearly frequency.
- **Honest risk:** 11 days to advent is very tight, and a December miss means a weak first season.
  Photos need storage. v1 can be text, links and emoji, with photos as small compressed images in
  KV/D1 within free limits, or after R2 is set up (photo-drop is blocked on R2 billing).

## Status

**Launched 2026-11-21** as "Advent Together" at https://pb-group-advent.pages.dev (product/support page
https://janwan2003.github.io/group-advent/). Storage is one SQLite Durable Object in Worker `pb-group-advent-db`,
because the account's 10 D1 databases are used up.

What exists and works:
- Create: Christmas advent (1–24 Dec), 12-day countdown (13–24 Dec) or a custom countdown of 3–31 doors ending on
  a big day; creator's time zone; no account.
- Join with a nickname from the link (duplicate names refused); claim a door (first come, race returns 409); fill it with a
  kind (message/joke/song/recipe/memory/challenge/watch/other), text ≤700, a link and one photo (resized in browser,
  ≤170 KB); edit or give back until it opens.
- The server hides a door's content and filler until midnight of its day in the calendar's time zone; the photo
  endpoint returns 403 before then. Empty doors open with an original fallback pack (36 items, no repeats).
- Reveal sheet with who it's from, reactions (5 emoji), "Share this door"; today's door glows plus an "is open!" notice;
  a nudge for claimed-but-empty doors; a "N doors still free" nudge; an end-state "make one for another group".
- Host: rename, free a door, delete. Members: personal link for another device, leave.
- Live link preview: "Starts Tue 1 Dec · 3 of 24 doors claimed · 4 people" / "Day 7 opened · 18 of 24 doors filled".
- Rate limits per hashed IP; auto-delete 60 days after the last door; privacy page; OG image; icons; Search Console
  verified and sitemap submitted.

Verified 2026-11-21 (how):
- `node --test tests/unit/*.test.js`: 8/8 pass (time zones, locking, presets, shuffle, fallback uniqueness, state line).
- `tests/e2e/run.mjs` in real Chromium (Playwright), 6 browser contexts at 390 px (phone) and 1280 px (desktop):
  **passed locally** (wrangler dev, with time travel via the local-only `x-now` hook: reveal with photo, fallback door,
  reactions, opened door not editable, wrap-up state) and **passed against production** (time-travel steps skipped
  because the hook is off in prod; confirmed by curl that `x-now` is ignored live).
- Screenshots reviewed: home desktop/phone, calendar phone, editor phone, reveal phone, wrap desktop (`shots/`, not committed).
Quality pass 2026-11-22 (how):
- `tests/e2e/run.mjs` now also asserts: preview image < 300 KB, unknown URL returns 404, opened doors are not counted as
  "still free" (18 of 24 on 5 Dec), the finished-calendar wording, and keyboard open/Escape returning focus to the door.
  Passed locally (with time travel) and against production (commit 4af6dc1).
- New `tests/e2e/a11y.mjs`: axe-core WCAG 2.1 A/AA + best-practice rules on 27 page states (home, privacy, 404, editor,
  host/guest calendar, free/taken/opened/fallback sheets, mid-advent, after the last door; phone + desktop). It found 13
  violations: heading order and door buttons whose accessible names didn't include their visible text. All fixed; it now
  reports 0 locally and 0 on 15 states live.
- Screenshots reviewed (`shots/`, not committed): home, calendar, editor, reveal, fallback, mid-advent, wrap, 404 at
  390 px; home, calendar, wrap at 1280 px; GitHub Pages product page at both widths (all links 200, 0 console errors).
- Not runnable here: WebKit (Safari engine). Playwright needs system libraries that only `sudo apt-get` installs (inbox).
- Not covered: real iOS Safari or the WhatsApp/iMessage in-app browsers, a real WhatsApp preview fetch, HEIC photos
  from iPhones (the browser normally converts them; untested), load beyond a single Durable Object.

## Metrics

- 2026-11-21 (source: `GET https://pb-group-advent.pages.dev/api/stats`, after the e2e run deleted its own data):
  0 calendars, 0 creators, 0 joiners. Search Console: site added today, no data yet.
- 2026-11-22 ~14:40 UTC (`/api/stats`): 0 calendars, 0 members, 0 joiners, 0 doors claimed. Search Console
  (`scripts/gsc.py status`): sitemap still pending, 0 errors; search analytics 2026-10-25..11-22 has no rows.

## Next steps

1. **Seed before 1 Dec:** operator makes one real calendar for family or friends (inbox request filed). The loop needs a
   first group; advent starts 2026-12-01.
2. Check on a real phone inside WhatsApp's in-app browser: join, claim, photo upload from the iPhone camera roll, the
   preview text. Fix what breaks.
3. If the operator installs the WebKit libraries (inbox), run both e2e scripts in WebKit at 390 px with `CHROME` swapped for webkit.
4. Dynamic OG image per calendar (door grid with live state) for a stronger preview; "door of the day" share card image.
5. Remaining polish: a sticky save bar in the door editor on short phones, more locales for date strings.
6. Weekly metrics from `/api/stats` and Search Console (`python3 scripts/gsc.py status`).
7. After 24 Dec: reposition the home page for birthdays, trips and weddings (custom countdown), and New Year.

## Monetization plan

None until the operator enables it (charter rule 4). Later: premium themes and door designs,
printable keepsake book of the finished calendar. Never paywall joining, opening or filling doors.

## Log

- 2026-11-20 scout: created idea. Evidence from web searches (Yahoo UK and Apartment Therapy on
  advent swaps, Jacquie Lawson press release, Advent App listing, Miro template). No volume data.
  Timing risk: advent starts 2026-12-01.
- 2026-11-21 review: raised p3→p5. Advent starts 2026-12-01, 10 days from now: it must be live by ~25 Nov for groups to set it up, or the thesis waits a year. Build it next, as a one-session MVP.
- 2026-11-21 builder: re-checked evidence (25Days, PollUnit, Advent Calendar Creator are publisher- or one-creator calendars; gap holds). D1 limit hit, so used a Durable Object Worker. Built and **launched** Advent Together: engine + API + UI + OG + privacy + product page. Verified: unit 8/8, Playwright e2e passed locally (with time travel) and against https://pb-group-advent.pages.dev; Search Console verified, sitemap submitted. Fixed 2 bugs found by e2e (US date range "1–December 24"; link field blocked the save without https://).
- 2026-11-22 review: kept p5. URL 200, 0 console errors (headless Chromium, 390 px, 2026-11-22 ~03:40 UTC); Search Console 0 impressions 11-01→11-22; `/api/stats` 0 calendars, 0 joiners. Under 21 days live, so no traction verdict. Groups must set up before 1 Dec; drop to p3 after that.
- 2026-11-22 builder (quality): fixed 7 bugs: (1) preview image was 317 KiB, over WhatsApp's ~300 KB limit; now og.jpg 77 KiB. (2) Unknown URLs returned the home page with 200; now a real 404 page. (3) "N doors still free" counted already-opened doors, also in the invite text. (4) Finished calendars still said "Invite… who should get a door". (5) 13 axe violations. (6) Closing a door sheet lost keyboard focus. (7) Images squashed on the phone product page (missing `height:auto`). Also: the join form can no longer double-submit, and "doors 2 and 3" wording. Verified: unit 8/8; e2e passed local + production; a11y 0 violations on 27 states locally and 15 live; GitHub Pages build for 4af6dc1 succeeded; product page links all 200. Metrics: still 0 calendars.
