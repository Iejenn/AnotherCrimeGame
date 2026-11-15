// A* on the tile grid, 8 directions, no cutting corners past walls.
export function findPath(
  blocked: Uint8Array,
  w: number,
  h: number,
  from: [number, number],
  goals: [number, number][],
): [number, number][] | null {
  const goalSet = new Set(goals.filter(([x, y]) => x >= 0 && y >= 0 && x < w && y < h && !blocked[y * w + x]).map(([x, y]) => y * w + x));
  if (!goalSet.size) return null;
  const start = from[1] * w + from[0];
  if (goalSet.has(start)) return [];
  const hScore = (i: number) => {
    const x = i % w;
    const y = (i / w) | 0;
    let best = Infinity;
    for (const g of goalSet) best = Math.min(best, Math.max(Math.abs((g % w) - x), Math.abs(((g / w) | 0) - y)));
    return best;
  };
  const gScore = new Float64Array(w * h).fill(Infinity);
  const came = new Int32Array(w * h).fill(-1);
  const closed = new Uint8Array(w * h);
  const open: number[] = [start];
  const f = new Float64Array(w * h).fill(Infinity);
  gScore[start] = 0;
  f[start] = hScore(start);
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (goalSet.has(cur)) {
      const path: [number, number][] = [];
      for (let c = cur; c !== start; c = came[c]) path.unshift([c % w, (c / w) | 0]);
      return path;
    }
    closed[cur] = 1;
    const cx = cur % w;
    const cy = (cur / w) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (blocked[ni] || closed[ni]) continue;
        if (dx && dy && (blocked[cy * w + nx] || blocked[ny * w + cx])) continue; // no corner cutting
        const g = gScore[cur] + (dx && dy ? 1.414 : 1);
        if (g < gScore[ni]) {
          came[ni] = cur;
          gScore[ni] = g;
          f[ni] = g + hScore(ni);
          if (!open.includes(ni)) open.push(ni);
        }
      }
  }
  return null;
}

export function neighbors(x: number, y: number): [number, number][] {
  const out: [number, number][] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) out.push([x + dx, y + dy]);
  // Prefer straight neighbours (stand in front, not at a corner).
  return out.sort((a, b) => Math.abs(a[0] - x) + Math.abs(a[1] - y) - (Math.abs(b[0] - x) + Math.abs(b[1] - y)));
}
