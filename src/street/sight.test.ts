import { describe, expect, it } from 'vitest';
import { clearShot, enemyChase, routeMs, shotLine, SHOT_WALLS, walkMasks } from './sight';
import { JUNKYARD, PARK, SEWER, gi } from './map';

describe('line of sight (v0.51)', () => {
  it('walks every tile a line touches, corners included', () => {
    expect(shotLine(0, 0, 3, 0).tiles).toEqual([[1, 0], [2, 0], [3, 0]]);
    expect(shotLine(0, 0, 2, 2)).toEqual({ tiles: [[1, 1], [2, 2]], corners: [[1, 0], [0, 1], [2, 1], [1, 2]] });
    expect(shotLine(5, 5, 5, 5).tiles).toEqual([]);
  });

  it('open park: clear; through a building: blocked', () => {
    expect(clearShot(PARK.x0 + 1, PARK.y0 + 1, PARK.x0 + 6, PARK.y0 + 4)).toBe(true);
    const b = SHOT_WALLS.find((r) => r.x1 - r.x0 >= 1 && r.y1 - r.y0 >= 1)!;
    // From the tile left of a building to the tile right of it, straight through.
    expect(clearShot(b.x0 - 1, b.y0, b.x1 + 1, b.y0)).toBe(false);
  });

  it("a fence blocks: you can't throw into the Junkyard from the street", () => {
    const inside: [number, number] = [JUNKYARD.x1 - 1, JUNKYARD.y0 + 2];
    expect(clearShot(JUNKYARD.x1 + 2, JUNKYARD.y0 + 2, ...inside)).toBe(false);
    expect(clearShot(JUNKYARD.x1 - 4, JUNKYARD.y0 + 2, ...inside)).toBe(true);
    // However close: 2 tiles away through the fence is blocked too.
    expect(clearShot(JUNKYARD.x1 + 1, JUNKYARD.y0 + 2, JUNKYARD.x1 - 1, JUNKYARD.y0 + 2)).toBe(false);
  });

  it('enemies chase the simple way (v0.60): straight at you, stuck behind the sewage channel or a bench', async () => {
    const { FIXTURES } = await import('./map');
    const masks = walkMasks();
    // The Plaza (paved, open): 4 tiles straight, it stops next to you.
    const { PLAZA } = await import('./map');
    const r = enemyChase(masks, [PLAZA.x0 + 1, PLAZA.y0 + 1], [PLAZA.x0 + 1, PLAZA.y0 + 6]);
    expect(r.reached).toBe(true);
    expect(r.route.length).toBe(4);
    // A rat on the north walkway, you right across the channel: it walks to the water's edge and is stuck there.
    const across = enemyChase(masks, [SEWER.x0, SEWER.y0 + 2], [SEWER.x0, SEWER.y0 + 8]);
    expect(across.reached).toBe(false);
    expect(across.route.length).toBeGreaterThan(0);
    // You stand right behind a bench (a fixture that blocks walking, not throws), it comes straight at you: stuck.
    const bench = FIXTURES.find((f) => f.kind === 'bench' && [-3, -2, -1, 1].every((d) => masks[gi(f.x, f.y + d)]))!;
    const behind = enemyChase(masks, [bench.x, bench.y - 3], [bench.x, bench.y + 1]);
    expect(behind.reached).toBe(false);
    expect(behind.route[behind.route.length - 1]).toEqual([bench.x, bench.y - 1]);
    expect(routeMs([bench.x, bench.y - 3], behind.route)).toBeGreaterThan(0);
  });
});
