# Supabase (Underworld project)

The database for the multiplayer version (docs/design.md §11). Project ref: `bcvlhtfufkjprczxhlny`.

- `migrations/` holds every change applied to the database, in order. Read them to see exactly what exists.
- Rule: tables have RLS on and **no insert/update/delete policies**; the app changes data only through
  SECURITY DEFINER functions that check everything (anti-cheat). The Supabase linter's
  "Signed-In Users Can Execute SECURITY DEFINER Function" warning on those functions is expected: they are
  the game's API.
- Never put the `service_role` key in the app or this repo. The app only uses the project URL and the
  publishable (anon) key.

| Migration | What |
|---|---|
| 0001_players | crimes (rules data), players, graves, spot_state (shared); `create_character`, `get_my_player` |
| 0002_import_local_character | `import_local_character`: bring an offline (browser) character into a new account, with every number capped; open until 2027-03-01 |
| 0004_world_channel | the private Realtime channel `world` (who's online, where they walk): signed-in players only |
| 0005_world_from_database | names, looks and routes of other players from the database: `walks` table (Realtime), `walk()`, `last_seen`, "world" in `game_state`; the 0004 Presence policies removed |
| 0003_online_play | the whole game on the server: `spots`, watcher schedules (`game.bartender_sees`, `game.guard_sees`, identical to src/game/watchers.ts), `game_state`, `save_position` (walking-speed check), `start_attempt`, `finish_attempt`, `stop_attempt`, `eat_item`, `sell_item` (only in Eddy's store), `drop_item`, `collect_grave`, `get_highscores` (public) |

Keeping the server and the game in sync: `npx vite-node scripts/spots-sql.ts` prints the spots and XP table from the map and
the XP curve; `npx vite-node scripts/watch-check.ts` lists when the watchers see you at 400 test moments, to compare with the
same query on the server (they matched exactly when 0003 was applied).
