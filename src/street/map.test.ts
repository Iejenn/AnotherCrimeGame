import { expect, it } from 'vitest';
import { NODES, SPAWN, W, H, buildBlocked } from './map';
import { findPath, neighbors } from './pathfind';
it('every street spot is reachable from spawn', () => {
  const b = buildBlocked();
  expect(b[SPAWN[1] * W + SPAWN[0]]).toBe(0);
  const bad = NODES.filter((n) => findPath(b, W, H, SPAWN, neighbors(n.x, n.y)) === null).map((n) => n.id);
  expect(bad).toEqual([]);
  expect(NODES.filter((n) => !n.wanders).length).toBe(56);
});
