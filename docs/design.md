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

Something new unlocks **every 5 levels**.

| Lv | Crime | Spot on the map | Ticks (time) | Odds at unlock | XP | XP/h if all succeed | Gold |
|---|---|---|---|---|---|---|---|
| 1 | Lift a Wallet | Tourist (they wander) | 4 (2s) | 65% | 3 | 5,400 | 1–3 |
| 5 | Shoplift | Corner shop | 5 (2.5s) | 65% | 5 | 7,200 | 2–5 |
| 10 | Strip a Parked Car | Parked car | 6 (3s) | 65% | 8 | 9,600 | 4–9 |
| 15 | Run a Shell Game | Card table | 7 (3.5s) | 65% | 12 | 12,343 | 6–14 |
| 20 | Burgle a House | Family house | 8 (4s) | 65% | 17 | 15,300 | 10–22 |
| 25 | Rob a Corner Store | Corner store | 10 (5s) | 65% | 28 | 20,160 | 18–36 |
| 30 | Mug a Banker | Banker | 12 (6s) | 65% | 43 | 25,800 | 30–60 |

Minutes per level with the best crime you have (tapping again right away, real odds):
1→2 0.7 · 4→5 0.9 · **5→6 0.8** · 9→10 1.2 · **10→11 1.0** · 14→15 1.6 · **15→16 1.4** · 19→20 2.3 ·
**20→21 2.1** · 24→25 3.3 · **25→26 2.9** · 29→30 4.5. Real play (walking, resting for health) is slower.

**Per attempt:**
- **Success:** gold and XP. 5% chance of a **Big Score** (double gold and XP).
- **Failure:** **no XP**, **−1 HP**, a screen shake and a **2-second stun**. Some failures turn into a **bust** (jail) instead.
- **Odds:** every crime starts at **65%** at the level you unlock it, and rises **0.5% per Street Crimes level** above that
  (a pickpocket at level 30: 79.5%). Heat lowers it.
- **Loot** drops about 0.4 times per minute of work; longer crimes drop more per attempt.

## 5. Health, heat and jail

- **Health:** 10 max (+2 per Health level). Regenerates **1 HP per minute**, and stays that slow on purpose.
  Below 3 HP you can't start a job; at 0 the job stops. Real healing comes from items (see §9, Healing).
  **Decided:** failures keep costing 1 HP and regen stays slow. Tapping a pickpocket every 2 seconds fails
  about 4 times a minute, so 10 HP lasts roughly 2½ minutes of work. That is intended: health is a real limit
  from day one, and **food is a core system**, the main way to keep going. It matters even more once
  combat arrives. Food is the next thing to scope.
- **Heat:** 0–100. Working adds heat per minute (more for bigger crimes); it cools by 2 per minute.
  High heat lowers odds and raises bust risk. A bust drops heat by 25.
- **Jail:** a bust locks you up for 10–60 seconds. Bail costs 1 gold per 5 seconds left.

## 6. Economy

Currency is **gold**. Earned from crimes and from selling loot to Eddy. Nothing to buy yet.
Planned: Eddy's stock (bandages first), then other shops.

## 7. The map

- An island city with a river all the way round.
- 6×5 grid of blocks with 2-tile roads between them. **Buildings vary in size and height**:
  a block can hold one large building or several smaller ones, with some parks.
- Street Crimes spots sit around the start, with higher levels further out.
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
- **Healing / food (top priority, to scope):** a **Shoplifting** skill with a ladder of shops to steal from, each giving
  food that heals when eaten. For example: a candy store at level 1 (candy, +1 HP) and a gas station at the
  edge of town (gas station snacks, +3 HP), with better shops and food further up. Needs: a level ladder
  (every 5 levels like Street Crimes?), eating from the inventory, whether food stacks, and how it relates
  to the existing "Shoplift" Street Crime (likely rename or move that one).
- Quests: who gives them, and what do they unlock?
- Multiplayer: server-side rules (Supabase) before any leaderboard.

## 10. How we work

- Change this doc first, then build one playable slice per PR, with a "What's new" entry.
- Tuning numbers live in data tables: `src/game/data/crimes.ts`, `src/game/xp.ts`, `src/game/data/world.ts`.
