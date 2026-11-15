import { expect, it } from 'vitest';
import { NODES, NPCS, SPAWN, W, H, buildBlocked } from './map';
import { findPath, neighbors } from './pathfind';
it('every street spot is reachable from spawn', () => {
  const b = buildBlocked();
  expect(b[SPAWN[1] * W + SPAWN[0]]).toBe(0);
  const bad = NODES.filter((n) => findPath(b, W, H, SPAWN, neighbors(n.x, n.y)) === null).map((n) => n.id);
  expect(bad).toEqual([]);
  expect(NODES.filter((n) => !n.wanders).length).toBe(9);
  for (const npc of NPCS) expect(findPath(b, W, H, SPAWN, neighbors(npc.x, npc.y))).not.toBeNull();
  // Nobody stands on Eddy's spot.
  expect(NODES.some((n) => NPCS.some((p) => p.x === n.x && p.y === n.y))).toBe(false);
});
