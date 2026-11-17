// Combat maths (docs/design.md §12). The server runs every fight (supabase/migrations/0010_combat.sql) with these
// exact formulas; the game uses them to show your odds and max hit. Numbers to tune are at the top.
import type { GameState } from './types';
import { levelFromXp } from './xp';
import { ITEM_BY_ID } from './data/items';

/** XP per point of damage (decided: skilling levels faster than combat, so 1, not OSRS's 4). */
export const COMBAT_XP = {
  /** Melee or Gunfire, for damage you deal. */
  attack: 1,
  /** Defense, for damage you deal AND for damage you take (0.5 each). */
  defense: 0.5,
  /** Health, for damage you take in combat. */
  health: 1,
};

/** Fighting with nothing in your hands. */
export const UNARMED = { damage: 1, accuracy: 0, speed: 3 };

/** Your weapon's stats (fists if you hold nothing). */
export function weaponStats(s: GameState) {
  const id = s.equipment?.weapon;
  const w = id ? ITEM_BY_ID[id] : undefined;
  return w?.gear ? { damage: w.gear.damage ?? 0, accuracy: w.gear.accuracy ?? 0, speed: w.gear.speed ?? UNARMED.speed } : UNARMED;
}

/** The armour you wear: its defence bonuses added up (helmet + plate vest + leg guards; docs/design.md §14). The
 *  server adds them up the same way (game.armour_bonus) for every swing an enemy takes at you. */
export function armourBonus(s: GameState) {
  return (['head', 'body', 'legs'] as const).reduce((sum, slot) => {
    const id = s.equipment?.[slot];
    return sum + ((id && ITEM_BY_ID[id]?.gear?.defence) || 0);
  }, 0);
}

/** Attack roll = (attack level + 8) × (accuracy bonus + 64). */
export const attackRoll = (level: number, accuracy: number) => (level + 8) * (accuracy + 64);
/** Defence roll = (Defense level + 8) × (defence bonus + 64). */
export const defenceRoll = (level: number, defence: number) => (level + 8) * (defence + 64);

/** Chance that an attack roll A beats a defence roll D (the OSRS formula). */
export function hitChance(a: number, d: number) {
  return a > d ? 1 - (d + 2) / (2 * (a + 1)) : a / (2 * (d + 1));
}

/** Max hit = weapon damage + 1 for every 8 levels above level 1. A hit does 1 to max hit. */
export const maxHit = (weaponDamage: number, level: number) => weaponDamage + Math.floor((level - 1) / 8);

/** Combat level = (Defense + Health) / 4 + the better of Melee and Gunfire / 2, rounded down. A new character is 3. */
export function combatLevel(levels: { melee: number; gunfire: number; defense: number; health: number }) {
  return Math.floor((levels.defense + levels.health) / 4 + Math.max(levels.melee, levels.gunfire) / 2);
}

export function myCombatLevel(s: GameState) {
  const l = (id: keyof GameState['skills']) => levelFromXp(s.skills[id].xp);
  return combatLevel({ melee: l('melee'), gunfire: l('gunfire'), defense: l('defense'), health: l('health') });
}
