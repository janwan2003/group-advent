# Advent Together: a shared advent calendar your group fills together

Free at **https://pb-group-advent.pages.dev** · product/support page: https://janwan2003.github.io/group-advent/

One person makes a calendar (Christmas advent 1–24 Dec, a 12-day countdown 13–24 Dec, or a custom countdown of
3–31 doors ending on a big day) and shares the link. Friends join with a nickname, claim doors and hide a surprise
behind each one (message, joke, song, recipe, memory, challenge, a link and one photo). One door opens per day at
midnight in the calendar's time zone, for everyone, showing who filled it. Empty doors open with an original fallback
pack, so there is never a blank day. No accounts, no app, no ads.

- Content and filler stay server-side hidden until the door opens (only the filler sees their own door).
- Claims are first come (409 "Someone just took door 7"); reactions per opened door; host can rename, free a door, delete.
- Personal link (`#k=` token) for a second device; leave; live updates via a cheap version poll every 20 s.
- Link preview with live state: "Day 7 opened · 18 of 24 doors filled · 9 people".

## Stack
Cloudflare Pages (static `public/`, no build step) + Pages Functions (`functions/`) forwarding to one SQLite-backed
Durable Object in the Worker `pb-group-advent-db` (`worker/`, schema in `schema.sql`), because the account is at the free
plan's 10 D1 databases. `lib/api.js` is D1-style code running on a shim. `lib/advent.js` is the pure calendar engine.
Rate limits per hashed IP (create 20/h, join 60/h, writes 600/h, photos 60/h). Photos are resized in the browser
(≤170 KB JPEG). Calendars delete themselves 60 days after the last door.

## Develop
```
npx -y pnpm@9 install
echo TEST_HOOKS=1 > worker/.dev.vars          # enables the x-now clock header (local only)
(cd worker && npx wrangler dev --port 8891 --ip 127.0.0.1 --persist-to ../.wrangler/state) &
npx wrangler pages dev --port 8890 --ip 127.0.0.1 --persist-to .wrangler/state
npm run test:unit
BASE=http://127.0.0.1:8890 node tests/e2e/run.mjs   # real Chromium, 6 contexts, time travel, screenshots in shots/
node tools/render-images.mjs                         # og.png + icons
```

## Deploy
```
set -a; . ../../.env; set +a
(cd worker && npx wrangler deploy)        # only when worker/, lib/ or schema.sql changed
npx wrangler pages deploy --branch main
BASE=https://pb-group-advent.pages.dev node tests/e2e/run.mjs   # deletes its own calendar; skips time-travel steps
python3 scripts/gsc.py status             # Search Console
```
