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
| Melee | Combat (§12, draft) |
| Defense | Combat (§12, draft) |
| Marksman | Combat (§12, draft) |
| Health | Combat (§12, draft). Gives +2 max HP per level today; the draft makes it +1. |

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
   Tap a bag. Success: $2–6. Failure: the nearest player yells **"Stop that!"** and throws the basketball at you;
   it hits you (−1 HP, stunned 2s) when it lands.
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

- **Health:** 10 max (+2 per Health level). Regenerates **1 HP per minute**, and stays that slow on purpose. Health is always a **whole number** (v0.48):
  +1 for each full minute; a hit or a meal keeps the part of a minute you'd already waited (server: `game.hp_now`,
  `game.hp_anchor`; client: `hpAt`, `hpAnchor`), so the number you see is exactly the server's.
  **No minimum health (decided, v0.24):** you can start a crime on any health. Low health is a risk, not a block:
  the next hit can kill you (and your stuff goes into your grave). Below 3 HP you get a "badly hurt" warning.
  A **health bar over your head** (OSRS-style) shows for 6 seconds after every hit, and stays (pulsing) while
  you're at 30% or less. Real healing comes from items (see §9, Healing).
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
- **Passing out and the hospital (v0.36):** at 0 HP the screen fades to black ("You passed out") and back in, and
  you wake up in the **hospital** (005-B + 005-D, facing the park), in the ward upstairs next to a bed
  (`WAKE` in `map.ts`; the server sets the same tile in `game.die`, migration 0017). New players still start in the
  park. The hospital is two storeys: a tall lobby with a wide glass entrance, a reception desk with a receptionist and
  two staircases up the side walls; the ward upstairs has three beds along each wall, two doctors walking around, and
  a glass railing over the lobby. **Floors:** the ward's tiles are the B tiles drawn one storey up (`floorY`), so the
  stairs are ordinary steps north (the server checks nothing new); downstairs you can't walk under the ward, only up
  the stairs (`canStep`), and nobody steps on or off a staircase sideways. **Tap the stairs** to go up or down.
- **Your position** on the Street is saved (every time you stop walking, and when you leave the Street), so
  switching tabs or reloading keeps you where you were.

## 6. Economy and items

- Money is **dollars ($)**. Always: never coins or gold.
- **Items must mean something.** Skills like Street Crimes **don't drop random loot** any more: crimes pay
  coins directly. The only items from Street Crimes are **food** from the two shoplifting crimes, and food heals.
- **Combat (future):** enemies have **loot tables**; killing an enemy grants a drop. That's where most items will come from.
- Eddy's General Store: sells nothing yet. With loot gone, his "Sell" only matters for items that exist (food).

## 7. The map

**The numbered map:** [docs/map.md](map.md) (blocks 001–018, I-001–I-018 and F-001–F-018, lots A–D, generated from
the game's map). Use those names when talking about places: "F-002-C" is block F-002, lot C (Eddy's).

**v0.54: the map grew south, and it's laid out by level.** A second row of districts (3×3 blocks each) under the first:
the island is 160 × 109 tiles (was 160 × 58). The middle column is for levels 1–10, the west column (the Industrial
zone and the blocks under it) for levels 10–20, the blocks under the Financial district for levels 21–30 (the Financial
district itself is for trading, later).
- **Central Park** is a big cross in the middle: the old park (008), 010, 011 and 012 across, 014 below, and the
  streets between them made park too (`PARK_AREA`). Its middle block is **the Plaza**: paved, a big two-tier fountain,
  benches facing it, trees in planters; **new players start there** (`SPAWN`) and it's where everyone meets. The lawn
  blocks have hedges along the outside, gravel paths in a # that run on through the joins, ponds, trees and flowers.
  **Six tourists** (one per lawn block, two on the Plaza) and **eight Pigeons**.
- **Moved:** Eddy's and Ray's to F-002 (C and D), the bar to I-009-C, the gas station and its parking lot (and the guard)
  to F-015. Their old lots are ordinary buildings now.
- **The sewer** is drawn below the island in the game's grid, so it moved down 51 tiles with it (nothing changes down
  there). The server's copy of the map is generated by `scripts/map-v054-sql.ts` (0037; a test checks it's up to date).
- **Keeping the old map the same:** random buildings, parked cars and street props are rolled for the old rows first, in
  their old order; the new rows and the vacated lots roll from their own random numbers (`OLD_ROWS`). Instanced things
  (trees, lamps, road paint) are drawn per 40-tile area, so what's off screen isn't drawn.

- An **island in the ocean**: a sandy beach with rocks around the city, then open sea.
- **The grid (v0.30, decided: layout B):** 3×3 **blocks** of 10×10 tiles, each block **4 lots** of 5×5 (2×2), with
  **7-tile streets** between the blocks: a sidewalk (1.5), a road for two cars (4, dashed centre line), a sidewalk
  (1.5). Zebra crossings at every crossing, traffic lights on the corners. The map is 58×58 tiles (was 44×37):
  about 1.4× as far to walk, which is fine (decided); bus stops can become fast travel when the city grows.
  A lot holds a few buildings in one of several layouts, a pocket park, or a special place; bigger places take
  more lots (the parking lot 3, the park a whole block), and later **bigger buildings** can take 2 or 4 lots.
  Everything is in `src/street/map.ts`; the server's copy (size, spawn, shop areas, guard route, pigeon tiles,
  spots) is generated from it by `scripts/map-sql.ts`.
- **Person scale (v0.30):** a person is about 1.2 tiles tall; a floor is 1.45, so buildings have 2–3 floors with
  person-sized windows and a front door (step + lamp) on their street side. Shops are one proper storey. Cars are
  about three people long and park along the curbs (you walk around them).
- **Street life (v0.30):** lamps with an arm over the road, trees in pits, hydrants, bins, mailboxes, newspaper
  boxes, benches, bike racks, dumpsters in the alleys, and a bus stop across from the candy store
  (`src/street/streetLife.ts`).
- **Shop fronts with character (v0.30):** Eddy's has fruit crates and a chalkboard outside; the candy store a giant
  lollipop on the roof, jars of sweets in the windows and a neon OPEN sign; Ray's a half-down roll-up shutter, bars
  on the window and a security camera.
- **Central Park** (built; v0.54: the top arm of the big cross, see above): a **whole block** (10×10 tiles). Lawns, hedges with gaps where the paths come in, gravel paths in a **#** shape, a **fountain** in
  the middle with benches, a **pond** with lily pads, trees, flowerbeds and four old lamps.
  **Three tourists** stroll around in it.
- **The basketball court** (built), on a corner lot of the west block, its open side on the street: painted court with lines, a chain-link fence on three sides
  (you get in at the two front corners), two hoops, a floodlight. Two players dribble, pass, shoot and chase
  rebounds. Their gym bags lie on the bench on the street side.
- **The candy store** (built), across the street from the park: walk in through the door like Eddy's. Dusty pink walls, a pink
  neon CANDY sign, four candy shelves on the back wall (tap one to steal; an emptied shelf shows bare and is
  restocked after 10s), a counter with candy jars and the register, a gumball machine, lollipops by the door.
  The **clerk** (yellow name) hangs around the register; on a failed attempt he yells "Hey!", walks over and
  shoves you. Shop icon on the minimap.
- **Rooms you can walk into** all work the same way: walls along the block edge, one door in the middle of the
  front wall, and the roof lifts while you're inside.
- **The bar** (built), next to the basketball court: walk in like a shop. Dark wood, a red neon BAR sign, a back bar of
  glowing bottles with a mirror, a jukebox, the counter with beer taps and pendant lamps, a small table with a candle.
  **Three drunks** sit on stools at the counter (tap one to pick his pocket: 3s, always works).
  The **bartender** works behind the counter on a **fixed schedule** (the same for every player, see §11): every
  8.5s he **watches the room for 3.5–5s**, then **turns his back** for the rest, polishing bottles at one of three
  spots. Turning round takes 0.6s before he sees anything. His label says "watching" (red) or "back turned" (green).
  If he sees the room at any moment of your attempt, he yells "Leave my guests alone!", comes round the counter
  and punches you (−2 HP, stunned 3s). Timings: `BAR_SLOT_MS`, `BAR_WATCH`, `BAR_TURN_MS` in `src/game/watchers.ts`.
- **The parking lot** (built): three lots of the east block, in an **L** around the gas station: dark asphalt with white bays, wheel stops and
  oil stains, a guard booth with a lit window and a barrier arm, two tall sodium lamps, a blue P sign.
  **Five parking meters** (tap one: 3s, always works if unseen, $15–30). An emptied meter's light turns red and
  it fills up again after 15s.
  The **guard** walks a **fixed patrol route** (the same for every player, see §11): across the north-east lot,
  down its side and along the south strip's lane, stopping at each corner for 2.5s to sweep his **flashlight** left and
  right. The beam is drawn on the ground (4.5 tiles long, ~86° wide) and turns red when you're working inside it.
  Seen = "I saw that!", he walks over and whacks you (−3 HP, stunned 4s), then goes back to his route. Route and
  numbers: `GUARD_ROUTE`, `GUARD_RANGE`, `GUARD_HALF`, `GUARD_SPEED`, `GUARD_STOP_MS` in `src/game/watchers.ts`.
- **Cars** (built): four parked cars nose-in at the lot's bays (Steal From Cars: 3s, 35%, $30–60). A failed
  attempt sets off the car alarm and brings the guard; he can also simply see you in his beam.
- **The gas station** (built), one lot of the east block, the parking lot around it: a pale concrete shop with a blue
  trim and a yellow GAS & GO sign, the top four rows of its lot. Inside: four shelves either side of a glowing drinks fridge
  (Shoplift Gas Station: sandwich or candy bar; shelves restock after 10s), and the counter with the **clerk**
  behind it. Out front: two pumps under a lit canopy (it fades when it hides you), and a price sign on the corner.
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

Tabs: Street · Inventory · Skills · Quests · Highscores. Top right: a **gear** menu (your account, Log out).
**Idle log-out:** after 5 minutes without any tap, swipe, scroll or key press, your attempt stops and you are logged out
(`IDLE_MS` in `src/net/OnlineGate.tsx`); the sign-in screen says why.

Street (default) · Inventory (30 slots, 5 × 6) · Quests (coming soon) · Skills (levels + guide + save codes).
The start screen shows your character file and what's new.

## 9. Open questions

- **Melee / Defense / Marksman:** combat with NPCs? Training dummies or gyms? Fights as a crime outcome?
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

**Chat (built, v0.23):** one global chat for everyone (for testing), in the box at the bottom of the Street together
with the game's messages, OSRS-style: filters All / Game / Chat, "Name: Press Enter to chat…", folds down to one
line. What someone says also shows over their head (yellow) for 5 seconds. Messages go in only through
`send_chat()`, which takes your name from the database (no faking), cleans the text, and allows at most 1 message
per second and 5 per 10 seconds (200 letters max). Kept for 7 days. No word filter or muting yet.

**Everyone on the same build (built, v0.24):** each build gets an id, baked into the game and published as
`version.json` next to it (`vite.config.ts`). The game checks it every minute and when you come back to the tab;
if a newer build is out it says "A new version of Underworld is out. Updating…" and reloads itself to `?v=<build>`
(which skips cached copies of the page; it won't loop if that still isn't the new one). `src/useUpdateCheck.ts`.

**Smooth movement (v0.25):** other players are drawn gliding towards where their route says they are (a bit faster
than walking, to catch up), instead of being placed there each frame; only a gap of more than 4 tiles (dying) snaps.
**v0.49:** you walk **2.5 tiles a second** (was 4: a walk, not a jog; fast travel can come later), and the walk cycle
keeps pace with it (`WALK_PACE`): a stride of about 0.7 tiles, the knee bending most mid-swing, arms opposite the legs,
the body rising and shifting its weight, shoulders turning against the hips. The server's cap stays 5 tiles a second.
Attacks have their own moves: a jab with the fists, a **stab** with a knife (the wrist turns the blade forward), the
bat's big swing; each lands as the hitsplat shows (`ATTACK_TIMING`). Preview: `scripts/preview/anim.html`.
The game clock moves gently towards each server answer instead of jumping to it. Before, a re-tap mid-walk (new
route from a tile's middle) and clock corrections made players hop. Measured after: biggest step 11 px per 100 ms
(normal walking speed) while the other player re-tapped every 1.2 s.

**One device at a time (built, v0.26):** each open game makes up a session id and sends it with every request
(header `x-game-session`). Opening the game claims the account (`claim_session`). If it's being played on another
device right now (heard from in the last 30s), you're asked: **Play here** (the other device is logged out) or
Log out. The server refuses game actions and chat from any other session (`session_replaced`); that device notices
within ~10 seconds, logs out (on that device only) and the sign-in screen says why. Logging out (gear menu, idle)
only logs out the device you're on.

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
- **Seeing what others do (v0.28):** `public.player_status` holds, per player, the spot they're working (and until
  when), when their stun ends, the enemy they're fighting, and their health. A trigger on `players` writes it
  whenever one of those changes (not for health regen), so nobody can fake it; Realtime sends it to everyone. Other
  players are shown working (facing the spot), stunned, or fighting (facing the enemy), with a hitsplat when they get
  hurt and their health bar while hurt or low, like your own.
- **Highscores (built, v0.20):** a Highscores tab with a table per skill (top 50, rank, name, level, XP; your
  own row highlighted, and your rank if you're further down).
- Tested end to end with two test accounts in two browsers (both saw each other; crimes decided by the server).

**Order:** (1) accounts + server-side actions (replaces save codes, cross-device) → (2) seeing each other,
shared spots → (3) chat, trading, fights (Melee/Defense/Marksman), leaderboards.

## 12. Combat

> **Status: v1 built (v0.27).** The Pigeon, fists and brass knuckles, Ray's weapon store. No drops yet. Based on the
> designer's sheet. Decisions are listed at the end; numbers live in `src/game/combat.ts`, `src/game/enemies.ts`,
> `src/game/data/items.ts` and the same tables on the server (`supabase/migrations/0010_combat.sql`).

### The enemy ladder (v0.43)

Every enemy is made for one stage of the ladder: a player at that stage, in that tier's gear, **wins about 9 in 10 and
loses about half their HP per kill** (simulated: 20,000 fights each, no food). Health is the bottleneck at these levels
(13–20 HP), so new enemies get small max hits.

| Lvl | Enemy | Where | # | HP | Att/Def | Hits every | Max hit | Respawn | Made for | Drops |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Pigeon | Central Park | 8 | 3 | 1/0 | 2 s | 1 | 25 s | brand new | raw bird meat |
| 3 | Rat | the sewer | 10 | 6 | 3/2 | 1.5 s | 1 | 20 s | levels 1–5 | raw rat meat |
| 5 | Thug | the Yard | 3 | 10 | 5/5 | 1 s | 2 | 30 s | levels 5–10, tin | $5–10 (1/5), tin knife (1/20) |
| 8 | Guard dog | the Junkyard (I-007) | 4 | 14 | 8/8 | 1.5 s | 2 | 30 s | end of tin → copper | copper salvage (1/4), $5–15 (1/5) |
| 12 | Giant rat | the Rat Nest (quest gate) | 3 | 16 | 11/10 | 1.5 s | 3 | 40 s | copper 13–15 | raw giant rat meat (always), 2–3 copper salvage (1/8) |
| 15 | Biker (aggressive) | Iron Saints MC (I-002) | 3 | 22 | 14/13 | 2 s | 4 | 45 s | end of copper (20) | $20–50 (1/3), copper knuckles (1/25), copper knife (1/40) |

- A max-tin player (level 10, full tin) against a thug: wins 90–97%, loses half their HP. In copper at 11 the thug is easy
  (98%, a third of HP), which is where the dogs and giant rats take over.
- **Aggression** (bikers only): standing inside the club with no fight, a free biker comes at you (`jump_me`, which the
  game asks every 2.5 s while you're in there). One at a time; walking out the door ends the fight (they don't follow).
- Drops never beat their skill: copper from drops gives no Scrapping XP, the copper weapons are rare.
- Aluminium (level 21+) needs its own enemies in the 20s, by the same rule.
- In practice the bat does a little worse than knuckles against these small HP pools (its big hits overkill): a later
  weapon balance pass.

### Built: the Thrift Store and tin salvage (v0.40)

The Thrift Store on **009-C** (a brick shop with a big sign, facing the south street; you don't go in) and its yard on
**009-D**: cracked concrete, a chain-link fence with barbed wire and one gate on the street side, and **5 rusty
dumpsters**. Tap one: you dig (2 s, a bar over your head like cooking); **50%** (+0.5% a level) to find **1 Tin
Salvage** (+4 Scrapping XP); finding nothing costs nothing and you **keep digging automatically**. When you find some,
the lid shuts and that dumpster is empty for **15 s** ("It's empty."). It runs on the street-crime machinery with a skill
per crime (`crimes.skill`, `players.scrapping_xp`; migration 0022, generated by `scripts/scrapping-sql.ts`). About
3,600 XP an hour, like pickpocketing. The Warehouse (copper) is skipped for now.

### The loop

Tap an enemy → you walk up and **fight until one of you drops, or you walk away**. (Combat is the one place where
one tap is not one attempt: you keep swinging, like OSRS.) You and the enemy each attack on your own **attack speed**.
Each swing is **hit or miss**; a hit does **1 to max hit** damage. When the enemy dies: **XP and loot**, and it
**respawns** after a while. When you drop to 0 HP you die as usual (your grave, §5). Food is how you keep going.

### Ticks and speed

- Game tick = 0.5 s (§2). **Attack speed = ticks between swings.** Unarmed: **3 ticks (1.5 s)**. Weapons set their own.

### Will it hit? (accuracy vs defence)

The same well-tested roll as OSRS, so it scales cleanly to level 100 and gear:

```
attack roll   A = (attacker's level + 8) × (accuracy bonus + 64)
defence roll  D = (defender's Defense level + 8) × (defence bonus + 64)
hit chance    = A > D ? 1 − (D + 2) / (2 × (A + 1))   :   A / (2 × (D + 1))
```

- "attacker's level" = **Melee** (no weapon or a melee weapon) or **Marksman** (a ranged weapon). Enemies have one attack level.
  (v0.51: the skill was called Gunfire; renamed so it starts with a low tier: throwing knives, guns later.)
- Level 1 unarmed vs a level-1 enemy with 0 defence: **≈ 50–55%**. Ten levels or a good weapon above it: **≈ 75%**.

### How much damage?

```
max hit = weapon damage + floor((your Melee or Marksman level − 1) / 8)
damage on a hit = random whole number from 1 to max hit
```

- Unarmed: weapon damage **1** → max hit **1** at level 1, **2** at 9, **3** at 17, **4** at 25–30.
- No separate Strength skill: your attack skill drives both accuracy and damage.

### XP (from the sheet)

| Skill | Trains when | XP |
|---|---|---|
| Melee | you hit with no weapon or a melee weapon | **1 per damage** |
| Marksman | you hit with a ranged weapon (throwing knives) | **1 per damage** |
| Defense | damage you deal **and** damage you take; an enemy's miss (v0.52) | **0.5 per damage each way; 0.5 per miss** |
| Health | you lose health **in combat**; an enemy's miss (v0.52) | **1 per HP lost; 0.5 per miss** |

(v0.52: blocked hits train Health and Defense, so Health doesn't stall once your Defense is high and enemies mostly
miss. Health XP is stored with one decimal, like Defense.)

**Pace (decided):** 1 XP per damage, so combat levels slower than skilling on purpose (~22 minutes to Melee 10 on
Pigeons; Street Crimes ~7). One number: `COMBAT_XP` in combat.ts.

### Health

- **Max HP = Health level.** Health **starts at level 10** (10 HP), so level 100 = 100 HP. Regen stays 1 HP/min.
- Health XP comes from combat only. (Existing characters were moved up to Health 10.)

### Combat level (shown over players and enemies, like OSRS)

```
combat level = floor( (Defense + Health) / 4  +  max(Melee, Marksman) / 2 )
```
A new character (Health 10, the rest 1) is **3**. All 30 → **30**. Shown next to player names: "Iejen (level 3)".

### Gear

- **Slots:** weapon, head, body, legs, feet *(more later: gloves, off-hand)*.
- **Every item:** slot, level needed (Melee / Marksman / Defense), and bonuses: **accuracy**, **damage** (weapons),
  **attack speed** (weapons, in ticks), **defence** (armour). Guns: **range** (tiles) and maybe **ammo**.
- **Equip** from the bag (tap → Wield / Wear). The Inventory tab gets an **equipment panel** (OSRS "worn equipment")
  with the slots and your total bonuses.
- **It shows on your character:** the weapon in your hand, hats and helmets on your head, jackets and vests over your
  top, trousers and shoes recoloured. Other players see your gear too (it comes from the database, like names).

Starter ladders *(examples, to tune)*:

| Lv | Melee (damage / speed) | Marksman (damage / speed / range) | Armour (defence) |
|---|---|---|---|
| 1 | Fists 1 / 3 · Brass knuckles 2 / 3 | Slingshot 1 / 3 / 4 | Hoodie 2 |
| 5 | Baseball bat 3 / 4 | BB gun 2 / 3 / 5 | Leather jacket 5 |
| 10 | Crowbar 4 / 4 | Revolver 4 / 5 / 6 | Biker helmet 4 |
| 15 | Knife 3 / 2 (fast) | Pistol 4 / 3 / 6 | Padded vest 9 |
| 20 | Machete 6 / 4 | SMG 3 / 2 / 5 | Steel-toe boots 3 |
| 25 | Sledgehammer 9 / 6 (slow) | Shotgun 8 / 5 / 3 | Riot helmet 8 |
| 30 | Katana 8 / 3 | Rifle 7 / 4 / 9 | Kevlar vest 15 |

Where gear comes from: **shops** (a place to spend dollars) and later **enemy loot tables** (§6).

**v0.32 (decided):** Ray also sells a **baseball bat** for **$250**: needs **Melee 3**, damage 5 (+4 over fists), a
swing every **6 ticks (3 s)**, and its own big swing animation (weapons name their animation: `gear.anim`).
**Selling:** every item has a value; shops buy it back for **25%** of that, rounded down (`SELL_SHARE`). **Ray buys
weapons, Eddy everything else.** **Nothing stacks in the bag except cash**: every item takes a slot of its own.

**v1:** only the weapon slot. **Ray's Arms** (top row, 5th block) — Ray sells **brass knuckles for $50**: damage 2
(+1 over fists), no accuracy or defence bonus, same speed as fists (3 ticks). **Weapons never wear out.** Equip from
the Inventory tab (Wield); the Equipment panel there shows your weapon, max hit, speed and combat level. Knuckles
show on your character's hand, for everyone.

### Enemies

Each enemy type: level, HP, attack level, defence level and bonus, attack speed, max hit, style (melee/ranged),
**aggressive or not**, where it lives (and how many), respawn time, XP, **loot table** (weighted rolls).

| Enemy | Lv | Where | HP | Def | Speed | Max hit | Respawn | Notes |
|---|---|---|---|---|---|---|---|---|
| **Pigeon** (sheet) | 1 | The park (3) | 3 | 0 | 4 ticks (2 s) *(proposal)* | 1 | 25 s | not aggressive; pecks back when attacked |

| **Thug** (v0.34) | 5 | The Yard, 007 (3) | 10 | 5 | 2 ticks (1 s) | 2 | 30 s | not aggressive (for now); hooded, with a knife; loot: 1/5 $5–10, 1/20 a **knife** |

**Enemy guide (v0.35):** under Melee and Marksman in the Skills tab, every enemy by level; tap one for its card (stats,
where it lives, its drops and their chances). It reads ENEMY_KINDS (with each
kind's `where` and `loot`, a copy of `public.loot`), so new enemies appear on their own.

**The Yard (007-C/D, v0.34):** a courtyard between two side buildings, open to the street through two gates in a
chain-link fence; graffiti, an old couch, a burning barrel. The thugs stroll between its open tiles on a fixed schedule
(a new spot every 12 s, 3 s to walk there; `thugAt` / `game.thug_at`, generated by `scripts/thugs-sql.ts`).
**Walking round things (v0.54):** every roaming enemy (thugs, rats, dogs, giant rats, bikers) walks round what's in
the way between two spots, over its own place's open tiles (the same moves as a player), straightened so it bends only
where needed (`src/game/roamPaths.ts`). The server has the same detours in `game.roam_paths` (printed by
`scripts/roam-paths-sql.ts`; a test checks the migration matches) and walks them with `game.walk_point`. The schedule
is unchanged: a detour is walked in the same time.
**The knife** (only from thugs): Melee 5, damage 2 (+1), a stab every **2 ticks (1 s)**, worth $250 (Ray pays $62).
Each enemy kind has its own model, schedule and loot table, so the next one is mostly data.

Proposed ladder, one every 5 levels like the crimes: **Rat** (5, alleys/dumpsters), **Stray dog** (10), **Junkie** (15),
**Thug** (20), **Gang member with a pistol** (25, ranged), **Bouncer** (30, at the bar).

A Pigeon fight at level 1: it hits you ~50% of the time for 1, every 2 s, so you lose **~2 HP per Pigeon**. With 10 HP
that's ~4 Pigeons before you need to eat: food matters (§5).

### Shared enemies (online)

- Enemies are **shared**: everyone sees the same Pigeons in the same places (they walk a fixed schedule, like the
  guard, §11). **One player fights an enemy at a time** *(proposal)*; others see it's busy.
- An enemy nobody hits for 10 s heals back to full. Walking away ends the fight.
- **The server runs every fight:** `attack(enemy, standing tile)` starts it; the app asks the server to "catch up the
  fight" about every second, and the server rolls every swing that's due (hit/miss, damage, XP, loot, death) and
  sends them back to animate. Nothing about a fight is decided by the phone.
- Load: about 1 call per second per fighting player (crimes are ~0.4).

### On the Street

Tap a Pigeon → you walk up (following it if it flutters off) and fight. Hitsplats like OSRS: **red with the damage**,
**blue 0 for a miss**. The enemy shows "Pigeon (level 1)" and a health bar once hurt. A killed Pigeon drops dead and
comes back after 25 s. Tapping anywhere else walks you away and ends the fight. The Pigeon then follows you for 5 s and walks back to its spot (5 s);
it can't be attacked meanwhile. A killed Pigeon falls where it was hit. Others see who's fighting what: a
Pigeon in a fight stands still where it was attacked.

**The sewer and its rats (v0.38):** a pothole (an open manhole with cones) in the crossing east of the candy shop
(tile 37, 37; a dungeon icon on the world map). Tap it: you walk next to it and climb down (the screen dips to black).
The sewer is 24×12 tiles: a walkway each side of a channel of sewage, two grate bridges, crates and rubbish bags,
lanterns, the ladder back up on the north wall. **Ten rats**, five per walkway, each scurrying around its own patch
(`ratAt`, the same schedule as `game.rat_at`): level 3, 6 HP, attack 3, defence 2, max hit 1, a bite every 1.5 s,
back after 20 s, not aggressive, and they always drop **raw rat meat** (cook it at the barbecue: +1 HP, like bird
meat). Between the Pigeons and the thugs: a level-1 player with knuckles kills one in about 13 s and takes about
5 damage. **How it's built:** like the hospital's ward, the sewer is ordinary tiles: rows below the island's grid
(`SEWER`, y ≥ 64), drawn `SEWER_DEPTH` under the ground, with the camera following you down (dim light, dark around).
Climbing is a server function (`climb`, migration 0019): it checks you stand next to the pothole or the ladder and
moves you; `walk`/`can_reach` accept the island or the sewer (`game.on_map`). While you're down there the map button shows the sewer's map
(ladder, fire barrel, rats: `SEWER_AREAS`) instead of the island's.

**Eating (v0.37):** a round **quick-eat button** sits bottom-right on the Street, above the chat, always there when
you carry food (dimmed at full health, pulsing red at 30% or less). **Tap** eats the best fit (`pickFood`): the
biggest heal that doesn't go over your max; if every food would go over, the smallest (1/10 with a +2 and a +1 → the
+2; 9/10 → the +1). **Hold** pops up a row of your foods to pick one. **In a fight eating takes 3 ticks (1.5 s):** no
swing until it's done, but a swing that was due later anyway isn't delayed, so eating right after a slow swing is
free; the enemy keeps swinging. A ring sweeps round the button while you eat. Server: `eat_item` (migration 0018).
Outside fights eating still takes half a second.

### Build order

1. ✅ Combat core: the Pigeon, fists, hit/miss/damage, XP, death, enemy health bars, combat level.
2. ✅ Equipment panel + equipping (weapon slot) + Ray's weapon store with brass knuckles; gear visible on characters.
3. Loot dropped on the ground to pick up.
4. The next enemies and the gear ladders, one level band at a time (like Street Crimes v2). Guns with ammo.

### Decisions

1. **XP pace:** 1 XP per damage (skilling is faster than combat).
2. **Defense XP:** 0.5 per damage dealt and 0.5 per damage taken.
3. **Health XP:** combat only.
4. **Loot:** dropped on the ground (later).
5. **The Pigeon:** 4 ticks, max hit 1, no drops yet.
6. **Shared enemies:** yes, one player per enemy at a time.
7. **Guns:** ammo, later.
8. **PvP:** undecided.

## 10. How we work

- Change this doc first, then build one playable slice per PR, with a "What's new" entry.
- Tuning numbers live in data tables: `src/game/data/crimes.ts`, `src/game/xp.ts`, `src/game/data/world.ts`.

## 13. Loot, ground items and Cooking (v0.33)

- **Loot tables** (`public.loot`): per enemy kind, rows of item (or `cash` = dollars), chance and amount. Rolled by the
  server when you kill it. Pigeons: **raw bird meat, 100%**. (Thugs, coming: 1/5 $5–10, 1/20 a knife.)
- **Loot lands on the ground** where the enemy died (`public.ground_items`), RuneScape-style: only the killer sees it
  for **60 s**, then everyone; it disappears after **3 minutes**. Tap it to walk over and pick it up (`pick_up`: you
  must stand on it or next to it, and have room in your bag; cash goes straight to your cash). Orange name labels.
- **Nothing stacks except cash** (v0.32): so a bag holds at most 27 pieces of meat.
- **The barbecue** (`public.stations`, `STATIONS` in map.ts) in the pocket park on **003-B** (fire icon on the map).
  Tap it: you walk next to it and your bag opens; tap something raw to **cook all of it**, one item every **2 ticks
  (1 s)**, until it runs out or you walk away (28 s for a full bag). The server times and rolls every one
  (`start_cook`, `cook_step`, `stop_cook`). While you cook, a small bar over your head fills up (dark brown to clay) for the piece
  on the grill.
- **Fire barrel (v0.39):** a burning oil drum on the sewer's north wall (`barrel_0`, migration 0020) is a cooking
  station of the same kind as the barbecue, so rat meat can be cooked down there. Stations are data (`STATIONS` and
  `public.stations`); `look: 'barrel'` only changes how it's drawn.
- **Recipes** (`public.recipes`, `src/game/data/recipes.ts`): raw bird meat → cooked bird meat, Cooking level 1,
  **5 XP**, burn chance **50% at level 1, falling to 0% at level 15**. Burnt food is lost and gives no XP. Cooked
  bird meat heals **1 HP**.
- **Cooking** is the sixth skill (after Street Crimes), on the Skills and Highscores tabs, and counts towards your
  total level.
- Everything is data: a new drop is a row in `loot`, a new recipe a row in `recipes` (+ the item), a new cooking spot a
  row in `stations` (+ `STATIONS`).

### Ranged fights: Marksman and throwing knives (v0.51)

- **Throwing knives** are every metal's ranged weapon: tin (Marksman 1), copper (Marksman 11). Damage = the knife's
  (tin 1, copper 2), a throw every 1.5 s, **range 6 tiles** (later weapons get their own: a pistol further).
- **Ammo is the knife itself.** They **stack**, up to 1,000 in a bag slot. Readying them moves the whole stack into
  the **Marksman slot** (next to the melee weapon slot, with its count). The **Melee / Marksman toggle** on the Street
  (`players.fight_style`, `set_fight_style`) picks which one you fight with; readying knives switches to Marksman,
  wielding a melee weapon to Melee. Every throw (hit or miss) uses one on the server, and **1 in 3 lands** under the
  target (one pile per tile, yours for 60 s like loot): recovery stretches a sheet to about 7.5 throws, never forever.
  The last knife thrown switches you to melee (your weapon, or fists). They sell for nothing (five $1 knives would
  otherwise sell for more than their $5 sheet).
- **Where they come from:** 5 from a sheet at a workbench (Tinkering 1 for tin, 11 for copper; 3 / 6 XP), or Ray's
  Arms in packs of 10 at one sheet's price ($150 tin, $300 copper: $15 / $30 a knife), deliberately expensive: an
  expensive way to fight, paid for by the range.
- **Line of sight:** a throw needs a straight line with nothing in the way: no building, no wall or fence of an
  enclosure (you only throw at things on your side of it), no tile off the map (the sewer's walls). Benches, cars and
  the sewage channel don't block. However close: no throwing through a fence from next to it. `src/street/sight.ts` and `game.clear_shot` take the
  exact same whole-number steps; the server's walls and enclosures are printed from the map (`scripts/marksman-sql.ts`).
- **The enemy walks up to you** (2.5 tiles/s) the real way round, like you'd walk: only floors and roads, round the
  sewage channel (over a bridge), walls, fences and objects, through doors and gates (`enemyRoute` in sight.ts and
  `game.enemy_route` take the same steps over the same walk map). It stops on a tile it could step onto yours from
  and only starts swinging once there: the free throws meanwhile are what ranged buys you. If it has no way to reach
  you at all, you can still throw (v0.52, decided): it stays put and never swings; the knives are the cost. Measured over every spot you can throw from: the longest walk is 16
  tiles (a sewer rat going round via a bridge), most are under 8. A melee weapon can't hit it before it arrives (no
  swapping to a bat mid-approach). Killed on the way, it drops its loot where it fell.
- The game walks you to the nearest tile you can throw from (in range, clear line), not up to the enemy.

## 14. Metals, Scrapping, Tinkering and gear (the long-term plan, agreed 2026-11-17)

The master plan for gear, so every tier slots in as **data** later and nothing early has to be rebuilt. Not built yet:
this section is the reference for building it. Numbers marked *(tunable)* can change; the structure shouldn't.

### The ladder: 10 metal tiers, one every 10 levels

The XP curve is built for levels 1–100 (§3). One tier level gates everything for that metal: the **Scrapping** level to
gather it, the **Tinkering** level to press its sheets, the **Melee** level to wield its weapons and the **Defense**
level to wear its armour (like OSRS rune = 40 everything). Tiers start at **1, 11, 21, 31…** so every tier has the same
10 levels, with two free at the end.

**Members:** at release the game goes to level **30** for everyone. Everything above 30 (skill levels, and every
recipe, weapon and armour that needs more than 30) is for **members** (later). So free players get tin, copper and
aluminium complete; brass and up are members-only, brass sheets included.

| Tier | Metal | Starts at | | Scrap it from *(ideas; each tier is a new place on the map)* |
|---|---|---|---|---|
| 1 | Tin | 1 | free | cans in bins and dumpsters, all over the city |
| 2 | Copper | 11 | free | AC units and wiring: the **Warehouse** (block 009, 5 crates) |
| 3 | Aluminium | 21 | free | **built (v0.56):** the **Superstore** (F-013, a supermarket; store #1217, a nod to the TV show), five dumpsters of crushed cans in its yard: Scrapping 21, 35%, 20 XP. Next to it a little parking spot with one car and one meter (unguarded, slow on purpose). |
| 4 | Brass | 31 | members | old plumbing, taps: the sewer, old apartments |
| 5 | Bronze | 41 | members | statues, plaques: a monument square |
| 6 | Iron | 51 | members | railings, grates, pipes: the docks |
| 7 | Steel | 61 | members | car wrecks, beams: a construction site |
| 8 | Hardened steel | 71 | members | machinery: the Factory's back halls |
| 9 | Titanium | 81 | members | bike frames, aircraft parts: an airfield or hangar |
| 10 | Tungsten | 91 | members | drill bits: a quarry or mine |

**Decided:**
- **We salvage, we don't smelt.** No alloys and no furnaces: every metal is scrapped as it is (bronze and brass too).
- **No tools yet.** Only your level gates scrapping. Tools (pliers → bolt cutters → angle grinder, faster scrapping)
  can come later as an extra.
- **Selling:** gear and materials sell only to Ray (weapons/armour) and Eddy (the rest), at 25% of their value, as
  now. **Player trading comes later** and will make Tinkering worth more.
- **Buying (v0.49):** Ray's Arms sells every metal's weapons, sorted by kind then metal (tin knuckles, copper
  knuckles, tin bat, copper bat, tin knife, copper knife), at **30 × the metal in them** (a sheet's value × its sheets:
  `shopPrice`): tin knuckles $150, bat $300, knife $150; copper twice that. Buying costs minutes of crime (tin knuckles
  ≈ 5 min of pickpocketing at level 1, a copper bat ≈ 12 min at level 11); making them yourself under a minute of
  salvaging, so Scrapping and Tinkering are the way to gear up. The shelf has the bank's small slots, price underneath.

### The loop

1. **Scrapping** (gathering skill): tap a scrap spot, work it a few ticks, get **scrap** of that metal + XP. The spot
   is empty for a while, then refills (the same machinery as the street-crime spots, see "Systems" below). The
   Warehouse's copper crates (Scrapping 11): **4 ticks** of work, then empty for **10 s**; 5 crates to rotate between.
2. **Tinkering** (making skill), in the **Factory** (a new industrial area east of the city, see "Map"):
   - the **press** flattens scrap into **sheets**: 1 scrap → 1 sheet, a little Tinkering XP, "press all" like cooking;
   - the **workbench** turns sheets into gear: you pick the item; it costs sheets of that metal.
3. **Combat:** the gear makes Melee and Defense pay off. Extras are sold to Ray.

### Every tier makes the same items, unlocked one per level

Three weapons and three pieces of armour per metal (10 tiers = 60 items). Names: "Tin Knuckles", "Copper Knife",
"Steel Bat", "Iron Helmet"… Within a tier, the Tinkering recipes unlock one level at a time, always in this order:

| Tinkering level | Recipe | Costs | Slot, speed | Tin | Copper | Aluminium | Brass *(members)* |
|---|---|---|---|---|---|---|---|
| start | Sheet (press) | 1 salvage | | 1 | 11 | 21 | 31 |
| +1 | Knuckles (regular) | 1 sheet | weapon, every 3 ticks (1.5 s) | 2 | 12 | 22 | 32 |
| +2 | Bat (slow) | 2 sheets | weapon, every 6 ticks (3 s) | 3 | 13 | 23 | 33 |
| +3 | Knife (fast) | 1 sheet | weapon, every 2 ticks (1 s) | 4 | 14 | 24 | 34 |
| +4 | *Bullet casings (later, with Marksman)* | | | 5 | 15 | 25 | 35 |
| +5 | Helmet | 1 sheet | head | 6 | 16 | 26 | 36 |
| +6 | Leg guards | 2 sheets | legs | 7 | 17 | 27 | 37 |
| +7 | Plate vest | 3 sheets | body | 8 | 18 | 28 | 38 |
| +8, +9 | *free, for later* | | | 9, 10 | 19, 20 | 29, 30 | 39, 40 |

A full set (three weapons, three armour pieces) is 10 sheets = 10 salvage. **XP follows the sheets** (a bat, 2 sheets,
gives twice the XP of knuckles), so no recipe is the only one worth making; pressing a sheet gives a little XP. The XP
numbers per tier are worked out against the curve (§3) when the tier is built.

**Stats come from one formula per item type** *(tunable)*, so balancing the ladder means changing a few numbers, not
60 items. With B = tier + 1 (tin 2 … tungsten 11):
- **Knuckles:** max hit B.
- **Bat:** max hit 2B + 1 (it swings half as often; on average the same damage per second as knuckles).
- **Knife:** max hit round(2(B + 1)/3 − 1), at least 1 (it swings 1.5× as often; the same damage per second).
- **Armour defence bonus:** helmet 2 × tier, leg guards 3 × tier, vest 4 × tier (a full set: 9 × tier; tin +9,
  tungsten +90). It counts in the defence roll: (Defense level + 8) × (64 + bonus) (§12; today the bonus is fixed at 0).

| Tier | Knuckles | Knife | Bat | Full armour |
|---|---|---|---|---|
| Tin | 2 | 1 | 5 | +9 |
| Copper | 3 | 2 | 7 | +18 |
| Aluminium | 4 | 2 | 9 | +27 |
| Brass | 5 | 3 | 11 | +36 |
| Bronze | 6 | 4 | 13 | +45 |
| Iron | 7 | 4 | 15 | +54 |
| Steel | 8 | 5 | 17 | +63 |
| Hardened steel | 9 | 6 | 19 | +72 |
| Titanium | 10 | 6 | 21 | +81 |
| Tungsten | 11 | 7 | 23 | +90 |

(Melee still adds +1 max hit per 8 levels on top, §12.)

### Values and prices

- **Value follows the sheets:** a salvage, a sheet and every 1-sheet item are worth the same; a 2-sheet item twice
  that, the vest three times. Pressing and crafting add XP, never money (so nobody can farm cash by processing).
- **Per sheet:** tin **$5**, doubling every tier: copper $10, aluminium $20, brass $40 (… tungsten $2,560). Checked
  against the crimes: scrapping and selling earns about what the crimes at the same level do (tin ≈ pickpocketing,
  about $2,300/h; brass ≈ stealing from cars, about $19,000/h). ($50 per tin salvage would have made level-1 scrapping
  out-earn every crime in the game.)

| Tier | Salvage, sheet, knuckles, knife, helmet | Bat, leg guards | Plate vest |
|---|---|---|---|
| Tin | $5 | $10 | $15 |
| Copper | $10 | $20 | $30 |
| Aluminium | $20 | $40 | $60 |
| Brass | $40 | $80 | $120 |

- **Selling** pays 25% of the value, **rounded down, but never less than $1** (whole dollars only). So a tin sheet
  sells for $1, a tin vest for $3. This also applies to the items there are today (raw meat now sells for $1, not $0).
- **Ray's shop** sells the tin weapons for more than they're worth (the starter kit costs real money; making it
  yourself is the cheap way): **Tin Knuckles $50, Tin Bat $100, Tin Knife $150**.

### The existing weapons become the tin tier

Ray's brass knuckles, the baseball bat and the thugs' knife are converted to **Tin Knuckles**, **Tin Bat** and **Tin
Knife** (one migration renames them in everyone's bag, equipment, grave and on the ground; nobody loses anything).
Ray sells all three tin weapons as the starter kit; thugs still drop the tin knife. **Every higher tier is
player-made** (scrapped and tinkered), which gives Tinkering its market.
Changes for owners: all tin gear is wearable at level 1 (the bat needed Melee 3, the knife Melee 5); the knife's max
hit becomes 1 (was 2), in line with the other two; and they're worth less when sold (the bat $250 → $10, the knife
$250 → $5, the knuckles $50 → $5).

### Map: the Industrial zone

- A new part of the map, the **Industrial zone**: its own 3×3 grid of blocks, like the city (its blocks numbered
  001–009 within the zone), west of the city.
- **The Factory** takes **003 and 006 merged** (no street between them): a large abandoned factory building (corrugated
  roof with broken skylights, brick walls, big rusty roll-up doors) with an **empty parking lot** beside it (cracked
  asphalt, faded lines, no cars or meters, a chain-link fence with one opening for cars). It's large on purpose: the
  place where players meet to work. Inside: **3 plate presses** and **3 workbenches** (if they fit).
- The rest of the zone: industrial buildings for now, for later tiers.
- **Tin comes first** (the Thrift Store, built in v0.40); the copper Warehouse is skipped for now.

### Built: the Industrial zone, the Factory, Tinkering and the tin tier (v0.41)

- **The map** is 6 blocks wide now (109 tiles): the Industrial zone (I-001–I-009) on the **west**, corrugated-metal sheds
  and workshops, no trees, parked cars or street furniture; the city (001–009) east of it. The city's own layout didn't
  change, but in tile coordinates it moved 51 tiles east (`CITY_X`): migration 0026 moved everything the server keeps
  (positions, spots, stations, the pothole, the spawn, the hospital, the shops' areas, the guard, Pigeons and thugs).
- **The Factory** on I-003 + I-006 (merged: one sidewalk all round, the street between them is part of the site): a brick hall with a sawtooth roof and a
  2-tile roll-up door, 3 plate presses (west wall) and 3 workbenches (east wall); its parking lot is fenced with one
  opening on the west side. Inside it's a room (walls fade, roof lifts).
- **Tinkering** (8th skill): `CRAFTS` in `metals.ts` = `public.crafts`. Press: 1 salvage → 1 sheet, 2 ticks, 1 XP (tin).
  Workbench: the six pieces, 4 ticks each, 3 XP per sheet. Tap a recipe: you make as many as your materials allow
  (`start_make` / `make_step` / `stop_make`, like cooking); walking away stops it. Cooking still runs on its own
  `recipes` table for now (it has burning); it can move into crafts later.
- **Armour:** head, body and legs slots next to the weapon; `game.armour_bonus` adds up their defence in every enemy
  swing (the defence roll's bonus was always 0). Drawn on your character in the metal's colour.
- **Tin conversion** (0024, one transaction): brass knuckles / baseball bat / knife → tin knuckles / tin bat / tin knife
  everywhere (bags, wielded, graves, ground, the thugs' loot, Ray's shop); the old items are gone.
- **Selling** pays at least $1 (rounded down otherwise).
- Server: 0023 (zone, items, stations, armour, selling), 0024 (conversion), 0025 (Tinkering), generated by
  `scripts/tin-sql.ts` from the game's data.

### Systems to build once (so each tier after is just data)

1. **One recipe system** for everything you make: inputs (any items × count) → output, at a station kind, for a
   skill, with a level and XP. Cooking moves into it; the press and the workbench are rows in it.
2. **One gathering system:** spots get a **skill** (street crimes and scrapping use the same spots, timers, emptying
   and refilling; `finish_attempt` gives the spot's skill its XP).
3. **Items generated from one source:** a script writes the server's items table from `items.ts` (with the tier
   formulas), so the game and the server never disagree. Needed with 60+ items.
4. **Equipment slots:** weapon, **head, body, legs**. The storage (a JSON object) takes more slots later (gloves,
   boots, off-hand) without a rebuild. Armour shows on your character.
5. **Combat:** the armour's defence bonus counts in the enemy's hit roll; weapon damage and speed as now.
6. **New skills:** Scrapping and Tinkering, after Cooking on the Skills and Highscores tabs, each with its own XP.

### Build order

1. **Foundations + tin:** the recipe and gathering systems, items generated from data, armour slots and defence in
   fights, the tin conversion, Ray's tin kit. Tin scrap from bins around the city; a first press and workbench.
2. **East side + the Factory + the Warehouse:** the map grows; Tinkering moves to the Factory; copper crates.
3. **Aluminium** (the last free tier): a new scrap place, and its items and recipes as data.
4. **Members** (later): levels above 30, and brass to tungsten, one tier at a time.

### Built: copper (v0.43)

- **Hotline Plumbing & Heating** fills I-008: the store (A + C) faces **west**; its yard (B + D) has a half-high brick wall
  with one opening on the east and **5 dumpsters**: copper salvage, Scrapping 11, 40% (+0.5% a level), 10 XP, empty 15 s
  after a find (like the candy store: 40%, 10 XP). One block down from the Factory on purpose (not next to the presses).
- The copper row in `METALS` gives the items and recipes by the formulas: sheet 11 … vest 18, 2 XP a sheet pressed and
  6 XP per sheet made; knuckles 3, knife 2, bat 7, armour +4/+6/+8; values $10 a sheet.
- New lots in the zone (the Junkyard I-007, Hotline I-008, the Biker Club I-002 A+B) still take their old random numbers,
  so every other building came out the same.

## 15. The Bank (v0.42)

- **The Financial district:** a third 3 × 3 grid east of the city (F-001–F-009; the map is 9 blocks, 160 tiles wide). It
  was added on the east, so nothing else moved. Its blocks have ordinary buildings for now, except:
- **The Bank** on F-005: a stone building with columns, a pediment with "BANK", steps up to two big open doors. Inside
  (a room: walls fade, roof lifts): a marble floor, a long counter with a glass screen, **three bankers** behind it, the
  vault door in the back wall, a guard by the door. Tap a banker: you walk to the counter and your bank opens.
- **Your bank:** **50 slots** (cash counts as one), things **stack** (a bag of 29 tin salvage is one slot with "29"),
  in the order you first put them in. Small slots (10 × 5) with the count in the corner; your bag below.
  - Tap something in your bag to put it in, a bank slot to take it out; a toggle says how many: **×1, ×5, ×10, All**.
    Cash always moves all at once. **Deposit all** empties your bag (pocket cash too) into the bank; worn gear stays on.
  - Taking things out takes as many as fit in your bag (every item still takes a bag slot).
  - **Safe:** dying puts your bag and pocket cash in your grave; the bank isn't touched.
- **Server** (0027, generated by `scripts/bank-sql.ts`): `players.bank` (an ordered list) and `bank_cash`;
  `bank_deposit`, `bank_withdraw`, `bank_deposit_all` check you stand in the bank, the counts and the 50 slots.

## 16. Quests (v0.43)

A quest is data (`src/game/data/quests.ts`): its steps, the quest-log line for each, and what its people say. The server
keeps your step (`players.quests`, e.g. `{"sewer_problems": 2}`) and decides every step (`quest_talk`); it answers with
the id of the line to show. The **Quests tab** lists every quest: not started / in progress / complete, and the current
log line.

### Sewer Problems (the first quest)

| Step | What happens | Quest log |
|---|---|---|
| 0 | **Splinter** sits against the sewer's north wall, by the tunnel. Bitten, can't feel his legs. *Help him / Not now* (not now: nothing changes) | — |
| 1 | You accepted. | Maybe someone in the hospital can help. |
| 2 | In the ward: **JD** is too busy ("…needs to see Turk soon"); **Elliot** listens and gives you a **Rat Antidote**. Use it on **Cooked Rat Meat** → **Cooked Rat Antidote** (`use_item`, `combos`). | Drip it over cooked rat meat / Bring it to Splinter |
| 3 | Give it to Splinter: he gives you the **Sewer Key**. **+50 Cooking XP.** | Where might it fit? (Complete) |

- **The gate:** in the tunnel from the sewer to the Rat Nest. Tap it with the key in your bag: the key is used up and the
  gate is open **for you only** (`players.unlocked`). Everyone else still sees it locked. The server checks it: `walk`
  won't take you behind it and `attack` won't let you fight a giant rat without it. So the quest is required for the
  giant rats.
- **Quest items** (antidote, cooked antidote, key: `items.quest`) can't be dropped or sold (and won't be tradeable), and
  **stay in your bag when you die** (they don't go into the grave). They can go in the bank.
- **Lost something?** If you still have it (bag or bank), Elliot / Splinter say "I already gave it to you". If it's gone
  everywhere, they give you a new one (Elliot: a new antidote while the quest is at step 1–2; Splinter: a new key after
  the quest, until you've opened the gate). A full bag: they say so, try again.
- **Giant rat meat:** the giant rats always drop it; cook it (Cooking 10, 15 XP, never burns from 30): heals 3 HP.


## 17. The screen (v0.44)

The street fills the screen, in portrait too. No header or tab bar any more (no name, no ranks: your name shows when you
log in and in chat).
- **Health:** a red heart with your HP on the left of the minimap (it pulses when you're low).
- **The icon bar** along the bottom: 💬 chat, 🎒 bag, 📈 skills swap the **bottom panel** (tap the open one again to hide
  it); 👕 worn gear (your character in 3D wearing it, and what each piece does), ❓ quests, 🏆 highscores, ⚙ settings
  open a **popup** over the street, like the world map. A skill in the skills panel opens its guide as a popup too.
- **The log strip:** whenever the full chat isn't open, the last two lines of the log stay over the bottom of the street.
- **The bag** uses bank-sized slots, 10 across; tap an item and its buttons (Wield, Eat, Use, Drop) show in one line.
- The normal arrow cursor everywhere (no hand).

## 18. The look: rules for every 3D model (the art red line)

Every model in the game follows these rules, whoever makes it: built in code, made in Blender (by script or by hand),
or taken from an asset pack (then adapted). Goal: an old-school RuneScape feel. Chunky, faceted, readable from the
game's camera, in our gritty dusk colours. Nothing smooth or detailed next to something blocky.

### Shape
- **Low-poly.** Props, buildings and creatures are flat-shaded: you see the facets. **People** are smooth-shaded with
  hard edges only where the shape turns sharply (creased normals, ~50°): soft light across a chest or an arm, crisp at
  the fists, shoes and jaw, like old-school RuneScape.
- **Round things stay angular.** Circles and cylinders get **6–12 sides** (8 for most things), and spheres are
  **icosahedrons, at most 1 subdivision**. (v0.46: the city's own pieces follow this too: `lam()` in city.ts is
  flat-shaded by default, and the fountain, pond, bank vault and columns, sewer arch, manholes and wheels were cut to
  at most 12 sides.) No subdivision surfaces, no sculpted detail, no bevels finer than a facet.
- **Chunky proportions** (RuneScape): slightly big heads, hands and feet on people, thick limbs. A clear silhouette
  matters more than detail; detail you can't see from the game's camera (about 15 tiles away, looking down) isn't made.
- **Scale:** 1 unit = 1 tile. A person is about 1.2 tall, a rat about 0.6 long (without its tail), a car 2.5 long.
  Models stand on the floor at their origin.

### The floor kit (v0.55, `src/street/floor.ts`; preview `scripts/preview/floor.html`)
The ground, drawn from a grid of surfaces (asphalt, sidewalk, grass, gravel, paving, dirt, concrete, sand, water): each
at its own height with a side where it stands above its neighbour (curbs, lawn edges, the beach's drop), corners rounded
where two surfaces meet (outside corners rounded off, inside corners filled round; per surface: round, cut straight, or
square), a small colour difference per tile, merged into one mesh per surface per 40-tile area. Walking stays on the
tile grid; the shapes only follow it. Not used in the city yet: next are the coastline, the park and the streets.

### Ground textures (v0.56, `src/street/textures.ts`)
The ground (the floor kit's surfaces, the streets' asphalt, the sidewalks, fountain water) carries a little texture, so it
isn't flat colour: Kenney's Retro Urban Kit ground pictures (CC0, `public/textures/ground/`, 64 × 64: asphalt, concrete,
dirt, grass, tiles, rock), used only as **grey detail** multiplied with our own colours (the palette stays ours), crisp
texels up close. Water has its own drawn ripples, drifting slowly. Buildings and props stay flat-shaded colour.

### Triangle budgets (the maximum; less is better)
| Kind | Examples | Max triangles |
|---|---|---|
| Small item | food, loot, bottles, cans, a key | 200 |
| Prop / furniture | pallet, stool, table, dumpster, barrier, TV | 300 |
| Small creature | rat, pigeon | 400 |
| Medium creature | guard dog, giant rat | 600 |
| Person | you, NPCs, thugs, bikers: the asset you look at most. Spend it on detail and structure (joints, a face, hands, clothes), not smooth curves; human shaped, not blocky | 2,300 (+ up to 500 for worn gear) |
| Vehicle | car, truck, motorbike | 800 |
| Building | one building, all its parts | 1,500 |

Measured on 2026-11-17 (`scripts/preview/models.html` counts them): the Kenney food is 44–176 and its furniture 60–280;
the urban kit's props are 4–124 (trucks 48: they use a texture). Our code-built pigeon is 304, rat 632, dog 460.
The first Blender rat (718) was over: that's why this section exists. **v0.45:** the creatures are rebuilt from rings
(`src/street/loft.ts`: `loft` for bodies, `limb` for legs, `spikes` for fur, claws, ears and teeth) after the OSRS rat
and seagull: rat 393 (the giant rat is the same rat at 2.2×), pigeon 365, guard dog 449; people are faceted (6-sided
limbs, a torso wider at the shoulders, a faceted head, blocky hands): 338 (was 1,906), about 930 in full armour.
**People are the most important asset** (you see them all the time). The human base model (v0.45, `character.ts`):
learned from old-school RuneScape, not copied.
- **Proportions:** the model is about 1.32 tall (`BODY` in character.ts holds every joint's height), drawn at 90%
  (`PERSON_SCALE`), so on screen a person is about 1.19 tall and fits the shops and doors. The head is about 1/6 of the
  height, the legs about half, broad shoulders taper to the waist, the arms are long (the fists at mid-thigh).
- **Joints:** hips, knees, shoulders, elbows, the head, and a point in the right fist where weapons go
  (`userData.rig`: legL/R, kneeL/R, armL/R, elbowL/R, head, hand, body). Walking bends the knees, sitting bends them 90°,
  `sitFloor` sits on the ground, punches and swings bend the elbows.
- **Detail is shape:** a strong chest and shoulders (the chest is 8 flat planes with hard edges, not a round barrel), a T-shirt with short sleeves over bare forearms, a belt with a
  buckle, slightly baggy trousers, shoes with a sole, fists with a thumb, a simple strong face (eye slits, brows, a
  nose, a mouth line, ears), hair with a hairline. Hair is built on the head's own rings, a little bigger all round, so
  the head never pokes through (no loose domes). No buttons, laces or separate fingers: you can't see them from the
  game's camera.
- **Job clothes** (`Outfit` in character.ts), fitted to the same body: shopkeepers and the bartender wear an apron (a bib
  on a neck strap, a skirt to the thighs); bankers a suit (jacket, white shirt, tie); guards a uniform (badge, shoulder
  straps); doctors a long coat over scrubs; thugs a hoodie (the hood up, a front pocket); bikers an open leather vest;
  Splinter an old army jacket. Jackets, coats, hoodies, suits and uniforms have long sleeves.
- About 1,800 triangles, 2,300 in full armour. Each person's parts are merged into **one mesh per joint** when they're
  built (their colours painted on as vertex colours, one shared material): 11 meshes a person (v0.46; was 25), so the
  detail costs few draw calls.

### Bag icons match the ground (v0.49)
Food is pictured in the bag from the very model it is on the ground: `scripts/render-icons.cjs` renders each one
(`scripts/preview/icon.html`, the same tone) into `public/icons/items/<id>.png`. A new food item is added to its list
and to `MODEL_ICONS` in ItemIcon.tsx, then the script is run once.

### Loot on the ground (v0.46)
Everything you can drop has a look (`buildGroundItem` in streetLife.ts): food from the Kenney Food Kit, cash as a few
bills, and the rest built in code (`buildLoot` in props.ts), lying flat, about a third of a tile across, in the metal's
colour: salvage is a small scrap heap (a bent pipe, a strip, a coil, a lump), a sheet two plates askew, and the gear the
same shapes you wear and wield (knuckles, bat, knife, helmet, plate vest, leg guards). Quest items: the antidote is a
green vial with a cork, the cooked antidote the ribs with green drops, the sewer key a big old iron key. All 36–188
triangles (`scripts/preview/loot.html` shows them all with their counts). A new item gets its look here; without one
it shows as a small brown bundle.

### The building kit (v0.47, `src/street/kit.ts`)
Buildings are described from parts, not placed box by box, so every building follows these rules and the same part
looks the same everywhere. **A new building uses the kit**; a part it needs and the kit lacks is added to the kit.
- **Faces:** a part is placed on one side of a rectangle seen from outside (`face(rect, 'n'|'s'|'e'|'w')`): `u` runs
  along it from the viewer's left, `y` up, `out` away from the wall. `uOf(face, x or z)` turns a map coordinate into `u`.
- **Walls:** `walls(rect, height, thickness, material, openings)`: four walls with doorways cut out (per side, from `u0`
  to `u1`, the wall going on above `top`). Each building keeps its own wall material so it can fade on its own.
- **Windows:** `window(face, u, y, {style, w, h, lit, frame, behind, sill})`, `windowRow(face, from, to, y, step, …)`.
  Styles: plain (a cross of glazing bars), office (a transom), shop (big panes with bars), barred, broken, boarded,
  blacked-out. A frame standing proud of the wall, the glass, a sill; lit ones glow warm; boxes or a curtain behind.
  Ordinary buildings put one on every floor of every tile of wall that faces open air (not one pressed against a
  neighbour, unless it rises above the neighbour's roof).
- **Doors:** `door(face, u, {style, w, h, color, frame, step, light})`: plain, glass, office, double, shutter (a ribbed
  roll-up door), shutterOpen (rolled up over a real opening), open (a dark doorway), frame (just the frame round a
  doorway you walk through). A step, a lamp, a bare bulb or a coloured light.
- **Roofs:** `roof`, `parapet`, and roof clutter: `acUnit`, `tank`, `antenna`, `vent`.
- **On the wall:** `sign` (text or any texture, on a board), `awning` (striped, with a valance), `drainpipe`,
  `wallLight`, `meterBox`.
- **Fences:** `fence(x0, z0, x1, z1, style, {skip})`, one panel per tile, `skip` for gates: chain-link (with or without
  barbed wire), corrugated sheets (some rusty), a half-high brick wall with a coping, iron railings, wooden planks;
  `chainPanel` for a gate leaf.
- **Preview:** `scripts/preview/kit.html` shows every part. **Tests:** `src/street/kit.test.ts`.

### Merging the static city (v0.47)
Every piece the city adds is static, so at the end of `buildCity` they're merged (`mergeStatic` in kit.ts): plain
colours into one mesh per 12×12-tile area (their colour painted on as vertex colours, one shared material per glow),
textured and see-through pieces per material. A building's walls and its props merge on their own and replace the
originals in its fade lists, so walls still fade and props still hide. Tap targets (stairs, the manhole, the ladder,
the Rat Nest gate) are separate groups and never merged; the flames are kept as they are (they flicker). So build
freely, piece by piece: a window costs triangles, not draw calls.

### The whole scene (measured 2026-11-17)
With `scripts/preview/game.html` (dev builds expose the renderer as `window.__street`):

| Spot | Draw calls v0.46 | v0.47 | Triangles a frame v0.47 |
|---|---|---|---|
| Shopping street (Eddy's, Ray's) | 407 | 233 | 74,000 |
| Park | 213 | 126 | 61,000 |
| Bank | 154 | 113 | 57,000 |
| Iron Saints MC | 147 | 110 | 52,000 |
| Junkyard | 154 | 57 | 51,000 |

The whole city is about 306,000 triangles (175,000 before the real windows), of which a phone draws a sixth to a
quarter at a time; fine. Each other player adds ~22 draw calls (11 meshes and their shadows); a creature ~20–45 (its
parts aren't merged, so they can move).
- Vehicles and trees, against a 1.2-tall person: a car 332 triangles, 2.8 long and 1.15 tall; the ambulance 440; a
  street tree 144 and about 2.7 tall, a park tree about 2.2. All within budget; no change needed.

### Colour and material
- **Solid colours,** one per part (material or vertex colour). **No image textures**, with one exception: the Kenney
  packs' small palette or colormap textures, and the Retro Urban Kit's textures, which are dimmed (`tone: 'grimy'`).
- **Matte:** roughness 1, metalness 0. Nothing shiny.
- **Our palette:** the dusk colours in `city.ts` (`C`): brick, grimy concrete, soot, muted trims. Bright pack colours
  are toned down when they load (`models.ts`: `dull`, `dark`, `grimy`). Strong colour is kept for what must catch
  the eye: neon signs, lamps, eyes, hazard stripes, the metals of gear.
- **Glow** (emissive) only for lights, screens, neon and creatures' eyes.

### Files and parts
- **.glb**, at most **100 KB** each, in `public/models/<pack or kind>/`. Only models the game uses are copied in.
- **Parts that move are separate objects**, pivoted where they bend, named like the code-built ones: `body`, `head`,
  `leg_0`…`leg_3`, `tail`, `wing_l`/`wing_r`, so the game's animations work on them. People keep the rig names in
  `character.ts` (arms, legs, body), so gear attaches.
- **Sources:** Kenney (CC0) packs, adapted to these rules; our own models from Blender scripts in `scripts/blender/`
  (Blender's Python package, `bpy`), which can be opened and tweaked by hand. Paid packs only after checking their
  licence (Synty: not in a public repo, and not with AI-generated models; §17 history).
- **Check before it goes in:** its triangle count and size (`scripts/preview/models.html`), and a screenshot next to
  the models around it.
