# Underworld Idle

A text-based **idle crime RPG** for people who are busy. Every crime family is its own skill to level up.
Plan a shift, close the tab, come back to a "While you were away" report.

## Core loop
- **8 crime skills**, each leveled 1–99 with its own XP: Petty Theft → Car Theft / Enforcement / Burglary →
  Fraud & Cyber / Smuggling → Armed Robbery → Heists. Heavier families unlock as you level the lighter ones.
- **7 crimes per skill** (56 in total), with timers from 10 seconds to 8 hours. Higher tiers pay more cash and XP.
- **Shifts**: queue up to 2h (upgradeable to 24h) of repeat jobs per crew member. Progress is calculated from
  timestamps, so everything finished while you were offline is resolved when you come back.
- **Crew**: hire up to 4 extra crew, each with a random trait, to run jobs in parallel.

## RPG layers (numbers go up)
- **Perks**: at levels 10/25/40/60/80 of each skill, pick 1 of 2 perks (speed, cash, XP, bust-proof, crits).
- **Mastery**: every crime has 8 mastery stars from repeat completions (faster, safer, luckier).
- **Gear**: 3 tiers per skill. **Upgrades**: shift length, lawyer, safehouse, garage, fence.
- **Fronts**: passive-income businesses (store up to 12h of income).
- **Ranks** by total level: Nobody → Corner Boy → … → Godfather → Legend.

## Variety (something different on every visit)
- Every result line is built from templates + random marks/places, so the log reads differently each time.
- **Big Scores** (×3 cash, ×2 XP), clean escapes, busts with jail time, loot drops in 4 rarities + a collection log.
- **Random encounters** grant temporary boosts, cash, loot or heat.
- **Street Intel** rotates every 3 hours (conventions, crackdowns, blackouts…) and buffs or nerfs certain skills.
- **Daily contracts** with rewards that scale with your level.
- **Heat** builds up as you work and raises bust risk. Let it cool, buy a safehouse, or pay off the cops.
- Car Theft fills a **garage**. Your best car boosts Smuggling payouts.

## Dev
```bash
npm install
npm run dev      # local dev server
npm test         # engine unit tests (vitest)
npm run build    # typecheck + production build to dist/
```
`netlify.toml` is included, so Netlify Deploy Previews work as-is.

### GitHub Pages
`.github/workflows/deploy-pages.yml` runs the tests, builds, and publishes to GitHub Pages on every push to `main`
(or manually via Actions → "Deploy to GitHub Pages" → Run workflow).
One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
The site will be at `https://iejenn.github.io/AnotherCrimeGame/`.
`vite.config.ts` uses `base: './'` so the same build works on Pages (sub-folder) and Netlify (root).

### Layout
- `src/game/` — pure TypeScript game rules, no React (engine, XP curves, Intel/contracts, data tables).
  Balancing lives in `xp.ts` and `data/*.ts`.
- `src/useGame.ts` — state, 1-second tick, offline catch-up, autosave.
- `src/components/` — UI.

### Saves & cheating
v0.1 is **single-player and client-side**: saves go to `localStorage` (export/import from Profile).
That makes it trivially editable. Before adding leaderboards or any multiplayer, the engine (`catchUp`,
`startJob`, …) should move server-side (e.g. Supabase SECURITY DEFINER RPCs), with the client only rendering.
The engine is written as pure functions on a state object to make that port straightforward.
