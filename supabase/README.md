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
