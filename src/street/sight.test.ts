import { describe, expect, it } from 'vitest';
import { clearShot, enemyRoute, routeMs, shotLine, SHOT_WALLS, walkMasks } from './sight';
import { JUNKYARD, PARK, SEWER } from './map';

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

  it('enemies walk round: open ground is a straight walk, the sewage channel goes via a bridge', () => {
    const masks = walkMasks();
    // The park: 4 tiles straight, it stops next to you.
    const r = enemyRoute(masks, [PARK.x0 + 1, PARK.y0 + 1], [PARK.x0 + 6, PARK.y0 + 1])!;
    expect(r.length).toBe(4);
    const [lx, ly] = r[r.length - 1];
    expect(Math.max(Math.abs(lx - (PARK.x0 + 6)), Math.abs(ly - (PARK.y0 + 1)))).toBe(1);
    // A rat on the north walkway, you right across the channel: much further than the 6 tiles across.
    // (Relative to the sewer: it moved down with the bigger map in v0.54.)
    const a: [number, number] = [SEWER.x0, SEWER.y0 + 2];
    const across = enemyRoute(masks, a, [SEWER.x0, SEWER.y0 + 8])!;
    expect(across.length).toBeGreaterThan(8);
    expect(routeMs(a, across)).toBeGreaterThan(3000);
  });
});
