# Underworld — Design

This file is the source of truth. When the plan changes, change this file first, then the code.
Numbers marked *(tunable)* live in data tables in `src/game/` and can change without new code.

## 1. What the game is

A point-and-click crime RPG in the browser, played mostly on phones. You walk an island city
RuneScape-style: tap the street to walk, tap a person, car or door to try a crime.
**One tap = one attempt.** Nothing repeats on its own: you tap again for the next attempt.
Skills level up from doing things. "Numbers go up" is the core reward.

**Only active play is rewarded.** Nothing happens while the app is closed or in the background.
When you come back, your character is standing idle.

## 2. Ticks and timing

- The game runs on **ticks of 0.5 seconds**.
- Every crime takes a fixed number of ticks per attempt. A pickpocket is **4 ticks (2 seconds)**.
- **One tap = one attempt.** When it finishes you stand there; tap the spot again for the next one.
  Tapping somewhere else mid-attempt cancels it.
- **Failing** shakes the screen briefly and **stuns you for 2 seconds** (you can't start another attempt).
- If the app is hidden or closed, or more than 5 seconds pass without the game running (phone asleep),
  the current attempt is cancelled and nothing in between counts.

## 3. Skills

All skills start at level 1. Max level is **30** for now *(tunable)*.

| Skill | Status |
|---|---|
| Street Crimes | Designed (below) |
| Melee | **To scope** |
| Defense | **To scope** |
| Gunfire | **To scope** |
| Health | **To scope.** Already gives +2 max HP per level. |

### XP curve (all skills)

**One curve for every skill**, built for levels 1–100 (the cap is 30 for now).
XP to go from level L to L+1 = `29.13 × 1.13^(L−1)`, rounded *(tunable)*: **each level needs 13% more XP** than the last.

| Reach level | Total XP |
|---|---|
| 2 | 29 |
| 5 | 141 |
| 10 | 449 |
| 15 | 1,017 |
| 20 | 2,062 |
| 25 | 3,987 |
| 30 | 7,533 |

### How the pace works (the "thin line")

- Each training method has its own **XP per hour**. Pickpocketing a tourist: **5,400 XP/h if every attempt succeeds**.
- Every new method (every 5 levels) earns **about 30% more XP per hour** than the one before.
- The curve rises 13% per level, which is faster than your XP per hour rises on average. So **every level takes a
  little longer**, right after an unlock the next level is a bit quicker, then it climbs again (a sawtooth).
- Targets with option 1 (chosen): **150 successful pickpockets to level 10**, ~1 hour to 30, ~140 hours to 100
  (once more methods exist). Lvl 1→2 ~1 min, 29→30 ~5 min, 99→100 ~10 h.

## 4. Street Crimes (levels 1–30)

> **Status: v2 built (v0.13–v0.17).** Source: `docs/street-crimes-v1.xlsx` (the designer's sheet).
> All seven crimes have their place on the map and their NPCs. **XP is still the designer's first proposal and
> needs a tuning pass** now that the NPCs exist (see "XP tuning" below).

Something new unlocks **every 5 levels**. Each crime has its **own place on the map** and, from level 10 on,
**NPCs that react to you**. Skills don't drop random loot any more (see §6): you get **dollars** directly, and the two
shoplifting crimes give **food**, which heals.

| Lv | Crime | Where | Odds at unlock | Reward | On fail | Time | XP (proposal) |
|---|---|---|---|---|---|---|---|
| 1 | **Pickpocket Tourists** | 2 tourists wander a park | 65% | $1–3 | −1 HP | 2s | 3 |
| 5 | **Raid Gym Bags** | 2 guys play basketball; bags on the bench | 55% | $2–6 | −1 HP | 2s | 5 |
| 10 | **Shoplift Candy Store** | candy store; clerk + shelves | 40% | 1 candy bar | −1 HP, the clerk catches you | 2s | 10 |
| 15 | **Pickpocket Drunks** | bar; bartender + guests | **100%** (risk = being seen) | $10–20 | −2 HP, stunned 3s | 3s | 8 |
| 20 | **Pry Open Parking Meters** | parking lot at the edge of town; 4–5 meters; a guard | **100%** (risk = being seen) | $15–30 | −3 HP, stunned 4s | 3s | 7 |
| 25 | **Shoplift Gas Station** | gas station next to the parking lot; clerk + shelves | 40% | 1 sandwich or 1 candy bar | −2 HP, the clerk catches you | 2s | 21 |
| 30 | **Steal From Cars** | 3–4 cars on the same parking lot; the same guard | 35% | $30–60 | −3 HP, stunned 4s | 3s | 56 |

**XP proposal:** pickpocketing earns ~5,400 XP/h if every attempt succeeds (~2,600 XP/h with real odds and stuns).
Each next crime earns ~30% more **real** XP per hour, taking its odds, time, stun and (for Drunks and Meters)
the time you spend waiting for the bartender or guard into account. To be tuned once those NPCs exist.

### XP tuning (to do)

Rough real XP per hour with today's numbers, counting odds, catches and waiting (estimates, not measured):

| Crime | XP | Rough XP/h | Note |
|---|---|---|---|
| Pickpocket Tourists | 3 | ~2,600 | 65%, a fail costs a 2s stun |
| Raid Gym Bags | 5 | ~3,400 | 55% |
| Shoplift Candy Store | 10 | ~3,500 | 40%; a fail costs the clerk's walk (1.6s) + 2s stun |
| Pickpocket Drunks | 8 | ~3,400 | one attempt per "back turned" window (~8.5s cycle) |
| Pry Open Parking Meters | 7 | ~4,000–6,000 | depends on dodging the guard; meters refill in 15s |
| Shoplift Gas Station | 21 | ~7,300 | 40%, like the candy store |
| Steal From Cars | 56 | ~11,000 | 35% plus the guard |

The target was "each next crime ~30% more real XP/h". Drunks don't beat the candy store yet, and the gas station
and cars jump a lot. Suggestion: measure real play first, then tune the XP column (and maybe the bartender's
timing) in `src/game/data/crimes.ts`.

### How each crime works

1. **Pickpocket Tourists (1).** Two tourists stroll around the park. Tap one to try. Success: $1–3.
2. **Raid Gym Bags (5).** Two NPCs play basketball on a court; their gym bags sit on a bench at the side.
   Tap a bag. Success: $2–6.
3. **Shoplift Candy Store (10).** An enterable shop (like Eddy's) with a **clerk** wandering around the register
   and some **shelves**. Tap a shelf. Success: **1 candy bar** (food, +1 HP when eaten). A shelf you stole from is
   **empty for 10 seconds**. Failure: the clerk yells **"Hey!"**, comes over and hits you (−1 HP).
4. **Pickpocket Drunks (15).** A bar inside a building, with a **bartender** and bar guests. Every few seconds the
   bartender **turns his back** for a few seconds. A pickpocket here **always works**; the risk is being seen.
   If he sees you mid-attempt, he yells **"Leave my guests alone!"**, walks over and hits you (−2 HP, stunned 3s),
   and the attempt is lost.
5. **Pry Open Parking Meters (20).** A parking lot at the edge of town with 4–5 meters. Prying one open **always works**
   if nobody sees you. An emptied meter needs **15 seconds** to fill up again. A **guard** patrols the lot; if he spots
   you at a meter he yells **"I saw that!"**, walks over and hits you (−3 HP, stunned 4s), then goes back to patrolling.
6. **Shoplift Gas Station (25).** An enterable gas station next to the parking lot, same system as the candy store
   (shelves empty for 10 seconds). Success: **1 sandwich** (+2 HP) or **1 candy bar** (+1 HP).
   Failure: the clerk yells **"Hey!"**, comes over and hits you (−2 HP).
7. **Steal From Cars (30).** 3–4 cars on the same parking lot, with the same guard as the meters (35% odds on top).
   Success: $30–60.

### Getting caught (NPCs that react)

- **How it works in the game:** when someone catches you, he yells right away and walks over; his hit lands
  **1.6 seconds** later (`CATCH_SECONDS`). Until then you can't act. Then: HP loss and the crime's stun.
- Pickpocket Tourists and Raid Gym Bags have nobody to catch you: a failure hurts right away (the tourist shoves you,
  a ball hits you).

- **Shop clerks** (candy store, gas station): on a failed shoplift the clerk yells **"Hey!"**, walks over and hits you.
- **The bartender and the guard** watch with a view cone. If they see you working a crime, they catch you: they yell
  their line, walk to you, hit you (HP loss + stun), then go back to what they were doing.
- **No heat, no jail, no bail.** Getting caught (HP loss and a stun) is the only punishment.

### Food

- Food **stacks** in one inventory slot.
- **Eating takes 1 tick (0.5 seconds)**: tap the food to eat one. Candy bar +1 HP, sandwich +2 HP.

### Decided (answers to the open questions)

- Drunks and Parking Meters: 100% success; the risk is being seen. Steal From Cars keeps 35% plus the guard.
- Gas station: reward 1 sandwich or candy bar, on fail −2 HP, 2 seconds; the clerk catches you.
- Shelves refill in 10 seconds, parking meters in 15.
- Heat, jail and bail are removed.
- Clerks catch you on a failed shoplift.
- Food stacks; eating is 1 tick.
- **Money is always dollars ($)**: no coins or gold.

## 5. Health

- **Health:** 10 max (+2 per Health level). Regenerates **1 HP per minute**, and stays that slow on purpose.
  Below 3 HP you can't start a job; at 0 the job stops. Real healing comes from items (see §9, Healing).
  **Decided:** failures keep costing 1 HP and regen stays slow. Tapping a pickpocket every 2 seconds fails
  about 4 times a minute, so 10 HP lasts roughly 2½ minutes of work. That is intended: health is a real limit
  from day one, and **food is a core system**, the main way to keep going. It matters even more once
  combat arrives. Food is the next thing to scope.
- **Heat and jail:** removed. Getting caught by an NPC (HP loss + stun) is the punishment (§4).
- **Dying (built, v0.18):** at 0 HP you die. **All your cash and items drop into a grave** on the tile where you
  died, and you wake up at the start with **half your max health** (not full, so dying isn't a free heal).
  Walk back and tap the grave to get everything back (items that don't fit stay in it). The grave lasts
  **5 minutes** (real time), then it crumbles and the stuff is gone. Dying again while you have a grave
  replaces it (the old one's contents are lost). Tuning: `GRAVE_MINUTES`, `RESPAWN_HP` in `engine.ts`.
- **Your position** on the Street is saved (every time you stop walking, and when you leave the Street), so
  switching tabs or reloading keeps you where you were.

## 6. Economy and items

- Money is **dollars ($)**. Always: never coins or gold.
- **Items must mean something.** Skills like Street Crimes **don't drop random loot** any more: crimes pay
  coins directly. The only items from Street Crimes are **food** from the two shoplifting crimes, and food heals.
- **Combat (future):** enemies have **loot tables**; killing an enemy grants a drop. That's where most items will come from.
- Eddy's General Store: sells nothing yet. With loot gone, his "Sell" only matters for items that exist (food).

## 7. The map

- An **island in the ocean**: a sandy beach with rocks around the city, then open sea.
- 6×5 grid of blocks with 2-tile roads between them. **Buildings vary in size and height**:
  a block can hold one large building or several smaller ones, with some parks.
- **Central Park** (built): right below where you start, **2×2 blocks** plus the roads and crossing between them
  (12×12 tiles). Lawns, hedges with gaps where the paths come in, gravel paths in a **#** shape, a **fountain** in
  the middle with benches, a **pond** with lily pads, trees, flowerbeds and four old lamps.
  **Three tourists** stroll around in it.
- **The basketball court** (built), left of the park: painted court with lines, a chain-link fence on three sides
  (you get in at the two front corners), two hoops, a floodlight. Two players dribble, pass, shoot and chase
  rebounds. Their gym bags lie on the bench on the street side.
- **The candy store** (built), north of the park: walk in through the door like Eddy's. Dusty pink walls, a pink
  neon CANDY sign, four candy shelves on the back wall (tap one to steal; an emptied shelf shows bare and is
  restocked after 10s), a counter with candy jars and the register, a gumball machine, lollipops by the door.
  The **clerk** (yellow name) hangs around the register; on a failed attempt he yells "Hey!", walks over and
  shoves you. Shop icon on the minimap.
- **Rooms you can walk into** all work the same way: walls along the block edge, one door in the middle of the
  front wall, and the roof lifts while you're inside.
- **The bar** (built), above the basketball court: walk in like a shop. Dark wood, a red neon BAR sign, a back bar of
  glowing bottles with a mirror, a jukebox, the counter with beer taps and pendant lamps, a small table with a candle.
  **Three drunks** sit on stools at the counter (tap one to pick his pocket: 3s, always works).
  The **bartender** works behind the counter on a **fixed schedule** (the same for every player, see §11): every
  8.5s he **watches the room for 3.5–5s**, then **turns his back** for the rest, polishing bottles at one of three
  spots. Turning round takes 0.6s before he sees anything. His label says "watching" (red) or "back turned" (green).
  If he sees the room at any moment of your attempt, he yells "Leave my guests alone!", comes round the counter
  and punches you (−2 HP, stunned 3s). Timings: `BAR_SLOT_MS`, `BAR_WATCH`, `BAR_TURN_MS` in `src/game/watchers.ts`.
- **The parking lot** (built), at the east edge of town by the beach, south of the gas station: dark asphalt with white bays, wheel stops and
  oil stains, a guard booth with a lit window and a barrier arm, two tall sodium lamps, a blue P sign.
  **Five parking meters** (tap one: 3s, always works if unseen, $15–30). An emptied meter's light turns red and
  it fills up again after 15s.
  The **guard** walks a **fixed patrol route** (the same for every player, see §11): along the driveway, the
  roads around the lot and its middle lane, stopping at each corner for 2.5s to sweep his **flashlight** left and
  right. The beam is drawn on the ground (4.5 tiles long, ~86° wide) and turns red when you're working inside it.
  Seen = "I saw that!", he walks over and whacks you (−3 HP, stunned 4s), then goes back to his route. Route and
  numbers: `GUARD_ROUTE`, `GUARD_RANGE`, `GUARD_HALF`, `GUARD_SPEED`, `GUARD_STOP_MS` in `src/game/watchers.ts`.
- **Cars** (built): four parked cars nose-in at the lot's bays (Steal From Cars: 3s, 35%, $30–60). A failed
  attempt sets off the car alarm and brings the guard; he can also simply see you in his beam.
- **The gas station** (built), at the north end of the parking lot (the road between them is gone: gas station, driveway and lot form one big rectangle): a pale concrete shop with a blue trim and a yellow
  GAS & GO sign, the top four rows of the block. Inside: four shelves either side of a glowing drinks fridge
  (Shoplift Gas Station: sandwich or candy bar; shelves restock after 10s), and the counter with the **clerk**
  behind it. Out front: two pumps under a lit canopy (it fades when it hides you), a car filling up, a price sign.
  Shop icon on the minimap.
- **Eddy's General Store** (Eddy = NPC, yellow name): sells nothing yet, buys loot. **You can walk in**
  through the door in the middle of the front wall; inside, the walls fade and the roof lifts so you see the shop:
  shelves with goods, a drinks fridge, a counter with a register. Eddy wanders around inside.
  The store has a **shopping-bag icon** on the minimap.
- **Minimap** (top-right of the Street): **round, centred on you, and turned with the camera** (what's ahead of you
  is up; an N on the rim marks north), RuneScape-style, so it keeps working as the map grows. Shows crime spots
  (greyed out until you have the level), tourists, shops (bag icon), named NPCs, your grave, and you. Tap it to walk.
- **World map**: the map button at the bottom of the minimap opens the whole island with an **icon per place**.
  Tap one for its details (what it is, its crimes with level, odds and take, who's there) and "Walk there".
  New places only need an entry in `AREAS` (map.ts).

## 7b. Visual direction

**Style:** chunky **low-poly** shapes like a tabletop model town (the reference image): buildings with window grids,
parapets and rooftop props, shop awnings, lane lines and zebra crossings, round faceted trees, cartoon cars,
rounded characters with walk and action animations.

**Mood: dark and gritty.** It's a crime game, so the model-town shapes sit in a dusk/evening city:
- **Light:** dark blue-grey evening sky with fog in the distance; a low orange sun with long shadows.
- **Palette:** brick, grimy concrete and soot instead of fresh cream; muted trims (oxblood, teal, mustard, navy);
  dark asphalt with worn paint; dark green parks; a dark river.
- **Lights in the dark:** some windows glow warm yellow (different per building); street lamps are sodium-orange
  and throw a pool of light on the pavement; the store sign stands out.
- **Grime:** dumpsters and trash bags on the pavements.
- **Readability:** your character is never hidden: a building between the camera and you fades out.
  Floating text and labels have dark outlines so they read on any background.

## 8. Screens

Street (default) · Inventory (28 slots) · Quests (coming soon) · Skills (levels + guide + save codes).
The start screen shows your character file and what's new.

## 9. Open questions

- **Melee / Defense / Gunfire:** combat with NPCs? Training dummies or gyms? Fights as a crime outcome?
  Weapons and armour from shops?
- **Health:** trained by taking damage, eating, or a gym?
- **Healing / food:** now part of Street Crimes v2 (candy store and gas station shoplifting, §4). Eating rules: §4 question 6.
- Quests: who gives them, and what do they unlock?
- Multiplayer: see §11.

## 11. Multiplayer (MMO) plan

**Goal:** one shared island where players see each other, with all rules on the server so nobody can cheat.
**Stack:** Supabase, in its own organization (separate from Soccer RPG): Auth (accounts), Postgres (all game
state, changed only by SECURITY DEFINER functions; RLS blocks direct writes), Realtime (seeing each other).

**How a crime works online (the same model as Soccer RPG's `play_match`):**
1. `start_attempt(spot_id, pos)`: the server checks level, health, stun, that the spot isn't empty, and that
   `pos` is next to the spot and reachable from your last position at walking speed (no teleporting). It stores
   the attempt with the server's start time.
2. `finish_attempt()`: called when the time is up. The server checks the time, checks the watchers' schedules
   (below), rolls the dice itself, pays out, and returns the new values for the client to show.
3. Shelves and meters you empty are stored per spot, **shared by everyone**.

**Watchers on fixed schedules (built, v0.19):** the bartender's routine and the guard's patrol are worked out
from the game clock (`src/game/watchers.ts`), not random per phone. Everyone sees the same NPC, and the game rules
decide "were you seen?" on their own, every tick of an attempt (`firstSeen`); the 3D view only draws it. The
server will run the same functions (ported to SQL, or shared TypeScript) to check each attempt.

**Foundation already in the code (v0.19):**
- **One actions layer** (`src/game/api.ts`): every player action (start/stop an attempt, eat, sell, drop,
  collect your grave, save your position) goes through `GameApi`. Today `localApi` runs the rules in the
  browser; a `supabaseApi` will call the RPCs above with the same method names, so the screens don't change.
- **One game clock** (`src/game/clock.ts`): everything reads time from `gameNow()`; `syncClock()` will line it
  up with the server, so changing your phone's clock does nothing.
- **Watchers on fixed schedules**, as above.
- **Your position** is part of the game state (needed for the guard, graves, and later for others to see you).

**Seeing each other (later):** Realtime Broadcast per area; a player sends their **route when they tap to walk**
(not every step), other phones animate it. Presence shows who is online. This keeps message counts (the main
Realtime cost) low.

**Load to expect:** about 2 RPCs per attempt (one every ~2.5s per active player): ~80 calls/s at 100 players
working at once. Small, indexed queries, but plan for the Pro plan at that size.

**Bringing offline characters along (decided):** the first testers can move their offline character into their
new account once (`import_local_character`), when they sign in for the first time on the device they played on.
Because a browser save can be edited, the server caps everything (XP 20,000 per skill, $250,000, 500 of each
food, unknown items dropped), and importing **closes on 1 March 2027**. After that, new players start fresh.

**One world:** everyone plays on the same server and the same island (one Supabase project). Seeing each other
needs step 2 below.

**Progress on step 1:**
- Database (migration `0001_players`, see `supabase/`): players, graves, shared spot state, the crimes table;
  `create_character` and `get_my_player`. Tested in a rolled-back transaction.
- **Sign-in: email + password** (decided). Sign in / create account / forgot password / new password, then make
  your character on the server (or bring your old offline one along).
- **Online only (decided, v0.22):** the normal link is the online game. There is no offline play any more. The
  game rules still exist in the browser (`src/game/engine.ts`, tested), as the reference for the server's SQL and
  to read old offline saves for "bring your character along".
- **Online play (built, v0.20):** the whole game runs on the server (migration `0003_online_play`): every crime,
  the watchers' schedules (the SQL gives exactly the same answers as `watchers.ts`), getting hit, dying and graves,
  eating, selling (only inside Eddy's store), a walking-speed check against teleporting. The app (`useOnlineGame`)
  sends what you do and shows the server's answers. Shelves and meters emptied by anyone are empty for everyone.
- **Random encounters and boosts: removed (v0.21, decided).** No more old-timer's tricks, lucky streaks, etc.
- **Seeing each other (built v0.20, made tamper-proof v0.21):** everything about other players comes from the
  database. Who's online (heard from in the last 30s) with their **name and look** comes from the server
  (`game_state` → "world"). Your route goes through `walk()`, which knows who you are and checks the route
  (could you have got to its start, neighbouring tiles only, on the map); other phones hear it through Realtime
  changes on the `walks` table, whose rows say whose route it is. So nobody can show up as someone else.
  Other players show with a white name and as white dots on the minimap.
- **Highscores (built, v0.20):** a Highscores tab with a table per skill (top 50, rank, name, level, XP; your
  own row highlighted, and your rank if you're further down).
- Tested end to end with two test accounts in two browsers (both saw each other; crimes decided by the server).

**Order:** (1) accounts + server-side actions (replaces save codes, cross-device) → (2) seeing each other,
shared spots → (3) chat, trading, fights (Melee/Defense/Gunfire), leaderboards.

## 10. How we work

- Change this doc first, then build one playable slice per PR, with a "What's new" entry.
- Tuning numbers live in data tables: `src/game/data/crimes.ts`, `src/game/xp.ts`, `src/game/data/world.ts`.
