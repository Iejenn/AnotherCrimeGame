// Running and stamina (v0.60, docs/design.md §19). Running is twice as fast as walking and uses stamina; Fitness
// (trained by walking and running) makes it last longer. The server has the same numbers (game.move_check in 0044):
// it charges the stamina for every move that was faster than walking, so you can't run without it.

/** Running speed: twice walking. */
export const RUN_MULT = 2;
/** How far a full bar runs at Fitness 1 (tiles). */
export const RUN_TILES = 60;
/** Seconds to refill an empty bar while walking; standing still (or working) it's twice as fast. */
export const REGEN_WALK_S = 360;
export const REGEN_STAND_S = 180;
/** Fitness XP: 1 for every TILES_PER_XP tiles walked or run. */
export const TILES_PER_XP = 75;

/** How much further a full bar runs at a Fitness level: +1% a level, 200% at level 100. */
export const runRange = (level: number) => 1 + (Math.max(1, level) - 1) / 99;
/** Stamina used per tile run (of 100). */
export const drainPerTile = (level: number) => 100 / (RUN_TILES * runRange(level));
/** Stamina regained per second, walking or standing. */
export const regenPerSecond = (standing: boolean) => 100 / (standing ? REGEN_STAND_S : REGEN_WALK_S);
