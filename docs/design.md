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

XP to go from level L to L+1 *(tunable)*:
- levels 1–9: `1000 × 1.285^(L−1)` (each level needs 28.5% more), so **150 successful pickpockets take you from 1 to 10**;
- level 10 and up: steeper, each level needs 32.5% more than the last, so level 30 takes about 16 hours.

| Reach level | Total XP |
|---|---|
| 2 | 1,000 |
| 5 | 6,058 |
| 10 | 30,010 |
| 15 | 123,477 |
| 20 | 505,195 |
| 25 | 2,064,110 |
| 30 | 8,430,624 |

## 4. Street Crimes (levels 1–30)

Something new unlocks **every 5 levels**. Target: **about 16 hours of active play to reach 30**.
**Each new crime earns 25% more XP per hour than the one before**, so moving up always pays off.

| Lv | Crime | Spot on the map | Ticks (time) | Odds at unlock | XP | Gold |
|---|---|---|---|---|---|---|
| 1 | Lift a Wallet | Tourist (they wander) | 4 (2s) | 65% | 201 | 1–3 |
| 5 | Shoplift | Corner shop | 5 (2.5s) | 65% | 312 | 2–5 |
| 10 | Strip a Parked Car | Parked car | 6 (3s) | 65% | 451 | 4–9 |
| 15 | Run a Shell Game | Card table | 7 (3.5s) | 65% | 641 | 6–14 |
| 20 | Burgle a House | Family house | 8 (4s) | 65% | 897 | 10–22 |
| 25 | Rob a Corner Store | Corner store | 10 (5s) | 65% | 1,361 | 18–36 |
| 30 | Mug a Banker | Banker | 12 (6s) | 65% | 2,001 | 30–60 |

Rough time per band, always using the best crime you have and tapping again right away:
1→5 ~2 min, 5→10 ~6 min, 10→15 ~20 min, 15→20 ~1 h, 20→25 ~3½ h, 25→30 ~11 h.
(Pickpocketing only, 1→10 is ~10 minutes: 150 successes.) Real play (walking, resting for health) is slower.

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
