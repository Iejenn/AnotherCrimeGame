# Underworld

A text-based **idle crime RPG** for people who are busy. Every crime family is its own skill to level up.
Plan a shift, close the tab, come back to a "While you were away" report.

## The game
**The full design lives in [`docs/design.md`](docs/design.md). Change that first, then the code.**

In short: a point-and-click crime RPG. Make a character, walk an island city by tapping, tap people,
cars and doors to commit crimes. Only active play counts. Street Crimes goes to level 30 with a new
crime every 5 levels; Melee, Defense, Gunfire and Health are still to be designed.

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
- `src/net/` — online play: sign-in, the Supabase connection, `useOnlineGame` (mirrors your character from the server), `world.ts` (other players).
- `supabase/` — the database: every migration, in order (see `supabase/README.md`).
- `src/components/` — UI.
- `src/street/` — the 3D Street view (three.js): city map, pathfinding, the scene, NPC dialog and the character model.

### Saves & cheating
The game is **online only**: every rule runs on the server (Supabase SECURITY DEFINER functions; tables have RLS
and no direct writes), and the app only shows the server's answers. See `docs/design.md` §11.
