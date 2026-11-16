# Underworld Idle — Design

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

> **Status: v2 being built, one place per step.** Source: `docs/street-crimes-v1.xlsx` (the designer's sheet).
> Built: **1 Pickpocket Tourists** (big park), **5 Raid Gym Bags** (basketball court),
> **10 Shoplift Candy Store** (candy store with a clerk). The rest show
> "coming soon" in the Skills tab until their place exists. The rules for all seven (odds, rewards, getting caught,
> shelves and meters that empty) are already in the game engine and tested.

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
- **The big park** (built): the old small park below where you start, doubled in size over the road next to it.
  Lawns, hedges with gaps where the paths come in, gravel paths in a cross, a **fountain** in the middle with
  benches, trees, flowerbeds and two old lamps. Two tourists stroll around in it.
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
- Still to come (see §4): a **bar** (enterable), a **parking lot at the edge of town** with meters, cars and a
  guard, and a **gas station** next to it (enterable, shop icon).
- **Eddy's General Store** (Eddy = NPC, yellow name): sells nothing yet, buys loot. **You can walk in**
  through the door in the middle of the front wall; inside, the walls fade and the roof lifts so you see the shop:
  shelves with goods, a drinks fridge, a counter with a register. Eddy wanders around inside.
  The store has a **shopping-bag icon** on the minimap.
- **Minimap** in the top-right corner of the Street: roads, buildings, river, you, Eddy, and crime spots
  (greyed out until you have the level).

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
- Multiplayer: server-side rules (Supabase) before any leaderboard.

## 10. How we work

- Change this doc first, then build one playable slice per PR, with a "What's new" entry.
- Tuning numbers live in data tables: `src/game/data/crimes.ts`, `src/game/xp.ts`, `src/game/data/world.ts`.
