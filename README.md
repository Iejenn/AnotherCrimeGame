# Underworld Idle

A text-based **idle crime RPG** for people who are busy. Every crime family is its own skill to level up.
Plan a shift, close the tab, come back to a "While you were away" report.

## The game (v0.7)
A point-and-click crime RPG. Make a character (name + look), then walk an island city by tapping.

- **Skills** (levels 1–10 for now): Street Crimes, Melee, Defense, Gunfire, Health.
  Only Street Crimes can be trained so far: 9 crimes (levels 1–9) around the starting point.
  Health adds 2 max HP per level.
- **Street**: tap to walk, tap a person/car/door to work that crime. It repeats until you walk away
  and keeps going while the app is closed. Drag to rotate, pinch to zoom.
- **Health**: failed crimes cost HP; it comes back at 1 per minute. **Heat** raises bust risk; busts mean jail.
- **Eddy's General Store** (yellow name = NPC): sell loot one item at a time. His shop is empty for now.
- **Inventory**: 28 slots (gold + loot). **Quests**: coming soon.

Tuning lives in `src/game/data/crimes.ts` (one row per crime), `src/game/xp.ts` (XP table)
and `src/game/data/world.ts` (loot, ranks).

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
- `src/street/` — the 3D Street view (three.js): city map, pathfinding, the scene, NPC dialog and the character model.

### Saves & cheating
v0.1 is **single-player and client-side**: saves go to `localStorage` (export/import from Profile).
That makes it trivially editable. Before adding leaderboards or any multiplayer, the engine (`catchUp`,
`startJob`, …) should move server-side (e.g. Supabase SECURITY DEFINER RPCs), with the client only rendering.
The engine is written as pure functions on a state object to make that port straightforward.
