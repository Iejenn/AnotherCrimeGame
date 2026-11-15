import { expect, it } from 'vitest';
import { NODES, NPCS, SPAWN, W, H, buildBlocked } from './map';
import { findPath, neighbors } from './pathfind';
import { CRIMES } from '../game/data/crimes';

it('every street spot and NPC is reachable from spawn', () => {
  const b = buildBlocked();
  expect(b[SPAWN[1] * W + SPAWN[0]]).toBe(0);
  const bad = NODES.filter((n) => findPath(b, W, H, SPAWN, neighbors(n.x, n.y)) === null).map((n) => n.id);
  expect(bad).toEqual([]);
  for (const npc of NPCS) expect(findPath(b, W, H, SPAWN, neighbors(npc.x, npc.y))).not.toBeNull();
});

it('every crime has exactly one fixed spot, with a building behind it', () => {
  const b = buildBlocked();
  const fixed = NODES.filter((n) => !n.wanders);
  expect(fixed.map((n) => n.crimeId).sort()).toEqual(CRIMES.map((c) => c.id).sort());
  for (const n of fixed) expect(b[(n.y - 1) * W + n.x]).toBe(1);
  // Nobody stands on Eddy's spot.
  expect(NODES.some((n) => NPCS.some((p) => p.x === n.x && p.y === n.y))).toBe(false);
});
