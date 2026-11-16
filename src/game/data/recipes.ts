// Cooking (docs/design.md §13). Recipes are data: a new one is a row here and the same row in public.recipes on
// the server, which runs every cook (one item every COOK_TICKS ticks) and rolls the burns.
import { levelFromXp } from '../xp';
import type { GameState } from '../types';

export interface Recipe {
  /** What you cook, and what it becomes. */
  from: string;
  to: string;
  /** Where you can cook it. */
  station: 'bbq';
  /** The Cooking level you need, and the XP for each one that comes out right (burnt ones give nothing). */
  level: number;
  xp: number;
  /** From this level on you never burn it. Below: 50% at the recipe's level, less with every level. */
  stopBurn: number;
}

export const RECIPES: Recipe[] = [{ from: 'raw_bird_meat', to: 'cooked_bird_meat', station: 'bbq', level: 1, xp: 5, stopBurn: 15 }];
export const RECIPE_BY_ITEM: Record<string, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.from, r]));

/** Each item takes this many ticks (½ s each) on the fire. */
export const COOK_TICKS = 2;

/** Chance to burn it at your level (the same formula as game.cook_step on the server). */
export function burnChance(r: Recipe, level: number) {
  if (level >= r.stopBurn) return 0;
  return Math.max(0, (0.5 * (r.stopBurn - level)) / (r.stopBurn - r.level));
}
export const myBurnChance = (s: GameState, r: Recipe) => burnChance(r, levelFromXp(s.skills.cooking?.xp ?? 0));
