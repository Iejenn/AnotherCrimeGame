import { describe, expect, it } from 'vitest';
import { clearShot, firstStep, shotLine, SHOT_WALLS } from './sight';
import { JUNKYARD, PARK } from './map';

describe('line of sight (v0.51)', () => {
  it('walks every tile a line touches, corners included', () => {
    expect(shotLine(0, 0, 3, 0).tiles).toEqual([[1, 0], [2, 0], [3, 0]]);
    expect(shotLine(0, 0, 2, 2)).toEqual({ tiles: [[1, 1], [2, 2]], corners: [[1, 0], [0, 1], [2, 1], [1, 2]] });
    expect(shotLine(5, 5, 5, 5).tiles).toEqual([]);
    expect(firstStep(10, 10, 4, 12)).toEqual([9, 10]);
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
  });
});
