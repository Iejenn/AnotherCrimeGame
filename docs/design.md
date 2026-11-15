# Underworld Idle — Design

This file is the source of truth. When the plan changes, change this file first, then the code.
Numbers marked *(tunable)* live in data tables in `src/game/` and can change without new code.

## 1. What the game is

A point-and-click crime RPG in the browser, played mostly on phones. You walk an island city
RuneScape-style: tap the street to walk, tap a person, car or door to start working it.
Your character keeps doing that action until you tap somewhere else. Skills level up from
doing things. "Numbers go up" is the core reward.

**Only active play is rewarded.** Nothing happens while the app is closed or in the background.
When you come back, your character is standing idle.

## 2. Actions and timing

- The game runs on **actions of 0.5 seconds**.
- Every crime takes a fixed number of actions per attempt. A petty crime is **2 actions (1 second)**.
- After an attempt, the next one starts straight away until you walk away, get busted, or run out of health.
- If the app is hidden or closed, or more than 5 seconds pass without the game running (phone asleep),
  the current job stops and nothing in between counts.

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

XP to go from level L to L+1 = `1000 × 1.2^(L−1)`, rounded *(tunable)*. Each level needs 20% more than the last.

| Reach level | Total XP |
|---|---|
| 5 | 5,368 |
| 10 | 20,799 |
| 15 | 59,196 |
| 20 | 154,739 |
| 25 | 392,483 |
| 30 | 984,067 |

## 4. Street Crimes (levels 1–30)

Something new unlocks **every 5 levels**. Target: **about 16 hours of active play to reach 30**.
Each band of 5 levels takes about twice as long as the one before. Each new crime pays more XP
and gold per hour than the previous one, so moving up always feels like progress.

| Lv | Crime | Spot on the map | Actions (time) | Base odds | XP | Gold | Band time |
|---|---|---|---|---|---|---|---|
| 1 | Lift a Wallet | Tourist (they wander) | 2 (1s) | 85% | 8 | 1–3 | 1→5: ~12 min |
| 5 | Shoplift | Corner shop | 3 (1.5s) | 82% | 15 | 2–5 | 5→10: ~30 min |
| 10 | Strip a Parked Car | Parked car | 4 (2s) | 80% | 25 | 4–9 | 10→15: ~1 h |
| 15 | Run a Shell Game | Card table | 5 (2.5s) | 78% | 40 | 6–14 | 15→20: ~2 h |
| 20 | Burgle a House | Family house | 6 (3s) | 76% | 60 | 10–22 | 20→25: ~4 h |
| 25 | Rob a Corner Store | Corner store | 8 (4s) | 74% | 100 | 18–36 | 25→30: ~8 h |
| 30 | Mug a Banker | Banker | 10 (5s) | 72% | 160 | 30–60 | — (cap) |

XP per success is worked out from the band times: XP per hour needed ÷ attempts per hour ÷ odds.

**Per attempt:**
- **Success:** gold and XP. 5% chance of a **Big Score** (double gold and XP).
- **Failure:** a quarter of the XP and **−1 HP**. Some failures turn into a **bust** (jail).
- **Odds** rise 2% per level above the crime's requirement (max +12%) and drop as heat rises.
- **Loot** drops about 0.4 times per minute of work; longer crimes drop more per attempt.

## 5. Health, heat and jail

- **Health:** 10 max (+2 per Health level). Regenerates **1 HP every 6 seconds**. Below 3 HP you can't start a job;
  at 0 the job stops. Petty crime roughly breaks even; harder crimes make you stop and rest now and then.
  Bandages from Eddy are planned.
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
- **Eddy's General Store** (Eddy = NPC, yellow name): sells nothing yet, buys loot.
- **Minimap** in the top-right corner of the Street: roads, buildings, river, you, Eddy, and crime spots
  (greyed out until you have the level).

## 8. Screens

Street (default) · Inventory (28 slots) · Quests (coming soon) · Skills (levels + guide + save codes).
The start screen shows your character file and what's new.

## 9. Open questions

- **Melee / Defense / Gunfire:** combat with NPCs? Training dummies or gyms? Fights as a crime outcome?
  Weapons and armour from shops?
- **Health:** trained by taking damage, eating, or a gym?
- Quests: who gives them, and what do they unlock?
- Multiplayer: server-side rules (Supabase) before any leaderboard.

## 10. How we work

- Change this doc first, then build one playable slice per PR, with a "What's new" entry.
- Tuning numbers live in data tables: `src/game/data/crimes.ts`, `src/game/xp.ts`, `src/game/data/world.ts`.
