// Prints supabase/migrations/0041_bar_and_yard.sql (v0.58): the bar and the Yard merged into one site (I-009 and 007,
// the street between them included), and the server working out the roaming enemies' walks itself. From the game's map.
// Run: npx vite-node scripts/turf-sql.ts > supabase/migrations/0041_bar_and_yard.sql
// (src/street/mapSql.test.ts checks the migration is exactly what this prints.)
declare const process: { env: Record<string, string | undefined>; stdout: { write(s: string): void } };
import { ENCLOSURES, GH, NODES, STATIONS, TURF_SITE, W, YARD, YARD_GATES, buildBlocked, gi, inRect } from '../src/street/map';
import { SHOT_WALLS, walkMasks } from '../src/street/sight';
import { ENEMIES, ENEMY_KINDS, RAT_MOVE_MS, RAT_WALK_MS, RAT_ZONES, ROAMS, THUG_MOVE_MS, THUG_PATCHES, THUG_TILES, THUG_WALK_MS, enemyAt } from '../src/game/enemies';

const arr = (xs: number[]) => `array[${xs.join(',')}]`;

/** The enemies' walk map as it's live: 0038's rows, with the rows 0040 updated. */
export function liveWalkRows(m0038: string, m0040: string): string[] {
  const out: string[] = [];
  for (let y = 0; y < GH; y++) {
    const upd = new RegExp(`set masks = '([0-9a-f]+)' where y = ${y};`).exec(m0040);
    const base = new RegExp(`\\n  \\(${y}, '([0-9a-f]+)'\\)`).exec(m0038);
    out.push(upd ? upd[1] : base![1]);
  }
  return out;
}

/** The game's walk map rows that aren't what's live. */
export function changedWalkRows(live: string[]): [number, string][] {
  const m = walkMasks();
  const out: [number, string][] = [];
  for (let y = 0; y < GH; y++) {
    const row = Array.from({ length: W }, (_, x) => m[gi(x, y)].toString(16).padStart(2, '0')).join('');
    if (row !== live[y]) out.push([y, row]);
  }
  return out;
}

/** Each roaming kind's schedule (enemies.ts): a new spot every moveMs, walkMs to get there, shifted by idx × shift. */
const SCHEDULES: Record<string, { n: number; moveMs: number; walkMs: number; shift: number }> = {
  thug: { n: 8, moveMs: THUG_MOVE_MS, walkMs: THUG_WALK_MS, shift: 4111 },
  rat: { n: 10, moveMs: RAT_MOVE_MS, walkMs: RAT_WALK_MS, shift: 3331 },
  ...Object.fromEntries(Object.entries(ROAMS).map(([k, r]) => [k, { n: ENEMIES.filter((e) => e.kind === k).length, moveMs: r.moveMs, walkMs: r.walkMs, shift: r.shift }])),
};

/** Moments when an enemy of each kind is walking round something (off the straight line), and where the game has it. */
export function detourSamples() {
  const out: { kind: string; idx: number; t: number; x: number; z: number }[] = [];
  for (const [kind, s] of Object.entries(SCHEDULES)) {
    let found = 0;
    for (let t = 1763000000000; found < 2 && t < 1763000000000 + 3_600_000; t += 97) {
      const idx = Math.floor(t / 97) % s.n;
      const into = (t + idx * s.shift) % s.moveMs;
      if (into >= s.walkMs) continue;
      const p0 = enemyAt(kind, idx, t - into);
      const p1 = enemyAt(kind, idx, t - into + s.walkMs);
      const p = enemyAt(kind, idx, t);
      const f = into / s.walkMs;
      if (Math.hypot(p.x - (p0.x + (p1.x - p0.x) * f), p.z - (p0.z + (p1.z - p0.z) * f)) < 0.4) continue;
      out.push({ kind, idx, t, x: p.x, z: p.z });
      found++;
    }
  }
  return out;
}

/** Every row of the game's walk map for enemies (y 0 up, x 0 to W), as the server holds them. */
function allRows() {
  const m = walkMasks();
  return Array.from({ length: GH }, (_, y) => Array.from({ length: W }, (_, x) => m[gi(x, y)].toString(16).padStart(2, '0')).join('')).join('');
}
declare const require: (m: string) => any;
const md5 = (t: string): string => require('node:crypto').createHash('md5').update(t).digest('hex');

export function turfSql(m0038: string, m0040: string): string {
  const S = TURF_SITE;
  const walk = changedWalkRows(liveWalkRows(m0038, m0040));
  const walls = SHOT_WALLS.filter((r) => inRect(S, r.x0, r.y0));
  const starts = (lists: unknown[][]) => {
    const out: number[] = [];
    let at = 1;
    for (const l of lists) out.push(at), (at += l.length);
    return out;
  };
  const ratTiles = RAT_ZONES.flat();
  const thugIds = ENEMIES.filter((e) => e.kind === 'thug');
  const drunks = NODES.filter((n) => n.crimeId === 'pick_drunk');
  const barrel = STATIONS.find((s) => s.id === 'barrel_1')!;
  const barEncl = ENCLOSURES.find((e) => e.id === 'bar')!;
  const samples = detourSamples();
  // The site's solid tiles, row by row ('1' = solid), x from S.x0: anyone left standing on one is moved out.
  const b = buildBlocked();
  const solidRows: [number, string][] = [];
  for (let y = S.y0; y <= S.y1; y++) solidRows.push([y, Array.from({ length: S.x1 - S.x0 + 1 }, (_, i) => (b[gi(S.x0 + i, y)] ? '1' : '0')).join('')]);
  // (Written out in each statement: a temp table didn't work in Supabase's SQL editor.)
  const solidValues = `(values ${solidRows.map(([y, r]) => `(${y}, '${r}')`).join(', ')}) s(y, bits)`;
  const out: [number, number] = [YARD_GATES[1][0], YARD_GATES[1][1] + 1];
  const stuck = (t: string, xc: string, yc: string) => `update ${t} t set ${xc} = ${out[0]}, ${yc} = ${out[1]}
from ${solidValues}
where t.${yc} = s.y and t.${xc} between ${S.x0} and ${S.x1} and substr(s.bits, t.${xc} - ${S.x0 - 1}, 1) = '1';`;

  return `-- 0041_bar_and_yard (v0.58). GENERATED by scripts/turf-sql.ts from the game's map.
-- 1. The roaming enemies' walks round things: the server works them out itself now, the same way the game does
--    (src/game/roamPaths.ts), from the walk map it already has: a straight line if it's clear, else the shortest walk
--    over the enemy's own tiles, straightened. So a map change no longer ships a table of walks. (game.roam_paths and
--    game.walk_point stay, unused.)
-- 2. The bar and the Yard are one site: I-009 and 007 merged, the street between them included (x ${S.x0}–${S.x1}, y ${S.y0}–${S.y1}).
--    The bar is twice as big (${drunks.length} drunks, was 3). The Yard is a gang's hangout: ${THUG_TILES.length} open tiles (was 21), ${thugIds.length} thugs
--    (was 3), each pair in its own quarter (game.thug_at). The burning barrel (cooking spot) moved.
--    Rebuilt for the site: its walls (line of sight), ${walk.length} rows of the enemies' walk map.
--    Anyone (or anything on the ground, or a grave) on a tile that's solid now is moved out to the street by the middle gate.
-- Nothing is deleted except the old buildings' walls on the site. One transaction: to try it first, replace "commit;"
-- with "rollback;". The check should say "ok" in every column.

begin;

-- ---------- 1. walks round things, worked out on the server ----------
-- Is (x, y) one of the place's tiles? (inset: the place's bounding box, row by row.)
create or replace function game.roam_in(inset boolean[], x0 integer, y0 integer, w integer, h integer, x integer, y integer)
 returns boolean
 language sql
 immutable
 set search_path to 'pg_catalog'
as $$ select x >= x0 and x < x0 + w and y >= y0 and y < y0 + h and coalesce(inset[(y - y0) * w + (x - x0) + 1], false) $$;
revoke execute on function game.roam_in(boolean[], integer, integer, integer, integer, integer, integer) from public, anon, authenticated;

-- Can an enemy walk straight from a to b over its place's tiles? Every tile the line touches (and both tiles beside a
-- corner it passes) is one of them, and every step along it is a legal move (mk: the walk map's masks over the box).
create or replace function game.roam_straight(inset boolean[], mk integer[], x0 integer, y0 integer, w integer, h integer, ax integer, ay integer, bx integer, by integer)
 returns boolean
 language plpgsql
 immutable
 set search_path to 'pg_catalog', 'game'
as $$
declare
  nx int := abs(bx - ax);
  ny int := abs(by - ay);
  sx int := sign(bx - ax)::int;
  sy int := sign(by - ay)::int;
  px int := ax;
  py int := ay;
  qx int := ax;
  qy int := ay;
  ix int := 0;
  iy int := 0;
  d int;
begin
  while ix < nx or iy < ny loop
    d := (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if d = 0 then
      if not game.roam_in(inset, x0, y0, w, h, px + sx, py) or not game.roam_in(inset, x0, y0, w, h, px, py + sy) then return false; end if;
      px := px + sx; py := py + sy; ix := ix + 1; iy := iy + 1;
    elsif d < 0 then
      px := px + sx; ix := ix + 1;
    else
      py := py + sy; iy := iy + 1;
    end if;
    if not game.roam_in(inset, x0, y0, w, h, px, py) then return false; end if;
    if (mk[(qy - y0) * w + (qx - x0) + 1] & (1 << game.walk_bit(px - qx, py - qy))) = 0 then return false; end if;
    qx := px; qy := py;
  end loop;
  return true;
end $$;
revoke execute on function game.roam_straight(boolean[], integer[], integer, integer, integer, integer, integer, integer, integer, integer) from public, anon, authenticated;

-- The bends of an enemy's walk from (fx, fy) to (tx, ty) over its place's tiles (px/py from s, n of them); null when
-- the straight line is clear. Breadth-first over the 8 moves (in the game's order), then straightened.
create or replace function game.roam_bends(px integer[], py integer[], s integer, n integer, fx integer, fy integer, tx integer, ty integer, out xs integer[], out ys integer[])
 returns record
 language plpgsql
 stable
 set search_path to 'pg_catalog', 'game'
as $$
declare
  x0 int; x1 int; y0 int; y1 int; w int; h int;
  inset boolean[];
  mk int[];
  rws text[];
  i int; j int; c int; cx int; cy int; nx int; ny int; nn int; m int;
  head int := 1;
  start int; goal int;
  came int[]; q int[];
  wx int[]; wy int[];
  dxs constant int[] := array[-1, 0, 1, -1, 1, -1, 0, 1];
  dys constant int[] := array[-1, -1, -1, 0, 0, 1, 1, 1];
begin
  if fx = tx and fy = ty then return; end if;
  select min(px[g.v]), max(px[g.v]), min(py[g.v]), max(py[g.v]) into x0, x1, y0, y1 from generate_series(s, s + n - 1) as g(v);
  w := x1 - x0 + 1; h := y1 - y0 + 1;
  inset := array_fill(false, array[w * h]);
  mk := array_fill(0, array[w * h]);
  rws := array(select r.masks from game.walk_map r where r.y between y0 and y1 order by r.y);
  for i in s .. s + n - 1 loop
    j := (py[i] - y0) * w + (px[i] - x0) + 1;
    inset[j] := true;
    mk[j] := ('x' || substr(rws[py[i] - y0 + 1], px[i] * 2 + 1, 2))::bit(8)::int;
  end loop;
  if game.roam_straight(inset, mk, x0, y0, w, h, fx, fy, tx, ty) then return; end if;
  start := (fy - y0) * w + (fx - x0);
  goal := (ty - y0) * w + (tx - x0);
  came := array_fill(-1, array[w * h]);
  came[start + 1] := start;
  q := array[start];
  while head <= cardinality(q) loop
    c := q[head];
    head := head + 1;
    exit when c = goal;
    cx := c % w + x0; cy := c / w + y0;
    m := mk[c + 1];
    for i in 1..8 loop
      nx := cx + dxs[i]; ny := cy + dys[i];
      continue when not game.roam_in(inset, x0, y0, w, h, nx, ny);
      nn := (ny - y0) * w + (nx - x0);
      continue when came[nn + 1] >= 0 or (m & (1 << (i - 1))) = 0;
      came[nn + 1] := c;
      q := array_append(q, nn);
    end loop;
  end loop;
  if came[goal + 1] < 0 then return; end if;
  -- The walk tile by tile (from where it starts), then straightened: from each bend, head for the furthest tile of the
  -- walk it can reach in a straight line.
  c := goal;
  wx := '{}'; wy := '{}';
  while c <> start loop
    wx := (c % w + x0) || wx; wy := (c / w + y0) || wy;
    c := came[c + 1];
  end loop;
  wx := fx || wx; wy := fy || wy;
  xs := '{}'; ys := '{}';
  i := 1;
  while i < cardinality(wx) loop
    j := cardinality(wx);
    while j > i + 1 and not game.roam_straight(inset, mk, x0, y0, w, h, wx[i], wy[i], wx[j], wy[j]) loop j := j - 1; end loop;
    xs := xs || wx[j]; ys := ys || wy[j];
    i := j;
  end loop;
  if cardinality(xs) = 1 then xs := null; ys := null; end if;
end $$;
revoke execute on function game.roam_bends(integer[], integer[], integer, integer, integer, integer, integer, integer) from public, anon, authenticated;

-- Where an enemy is (tile units, middle of a tile = +0.5) f (0–1) of the way through its walk: along the bends (by
-- distance), else on the straight line.
create or replace function game.roam_point(px integer[], py integer[], s integer, n integer, fx integer, fy integer, tx integer, ty integer, f double precision, out x double precision, out z double precision)
 returns record
 language plpgsql
 stable
 set search_path to 'pg_catalog', 'game'
as $$
declare
  bx int[];
  by_ int[];
  i int;
  qx int;
  qy int;
  seg double precision;
  total double precision := 0;
  left_ double precision;
  k double precision;
begin
  select r.xs, r.ys into bx, by_ from game.roam_bends(px, py, s, n, fx, fy, tx, ty) r;
  if bx is null then
    x := fx + 0.5 + (tx - fx) * f;
    z := fy + 0.5 + (ty - fy) * f;
    return;
  end if;
  qx := fx; qy := fy;
  for i in 1..cardinality(bx) loop
    total := total + sqrt((bx[i] - qx)::double precision ^ 2 + (by_[i] - qy)::double precision ^ 2);
    qx := bx[i]; qy := by_[i];
  end loop;
  left_ := f * total;
  qx := fx; qy := fy;
  for i in 1..cardinality(bx) loop
    seg := sqrt((bx[i] - qx)::double precision ^ 2 + (by_[i] - qy)::double precision ^ 2);
    if left_ <= seg or i = cardinality(bx) then
      k := case when seg > 0 then least(1, left_ / seg) else 1 end;
      x := qx + 0.5 + (bx[i] - qx) * k;
      z := qy + 0.5 + (by_[i] - qy) * k;
      return;
    end if;
    left_ := left_ - seg;
    qx := bx[i]; qy := by_[i];
  end loop;
end $$;
revoke execute on function game.roam_point(integer[], integer[], integer, integer, integer, integer, integer, integer, double precision) from public, anon, authenticated;

-- The rats (their patches unchanged) and the dogs, giant rats and bikers (game.roam_at) walk with it too.
create or replace function game.rat_at(idx integer, t bigint, out x double precision, out z double precision, out flying boolean)
 returns record
 language plpgsql
 stable
 set search_path to 'pg_catalog', 'game'
as $$
declare
  px int[] := ${arr(ratTiles.map((p) => p[0]))};
  py int[] := ${arr(ratTiles.map((p) => p[1]))};
  zs int[] := ${arr(starts(RAT_ZONES))};
  zn int[] := ${arr(RAT_ZONES.map((z) => z.length))};
  shifted bigint := t + idx * 3331;
  k bigint := shifted / ${RAT_MOVE_MS};
  into_move bigint := shifted - k * ${RAT_MOVE_MS};
  a int;
  b int;
begin
  flying := false;
  a := zs[idx + 1] + (game.minstd(((k * 3 + idx) % 2147483647) + 1) % zn[idx + 1])::int;
  if into_move >= ${RAT_WALK_MS} then
    x := px[a] + 0.5; z := py[a] + 0.5;
    return;
  end if;
  b := zs[idx + 1] + (game.minstd((((k - 1) * 3 + idx) % 2147483647) + 1) % zn[idx + 1])::int;
  select w.x, w.z into x, z from game.roam_point(px, py, zs[idx + 1], zn[idx + 1], px[b], py[b], px[a], py[a], into_move / ${RAT_WALK_MS}.0) w;
end $$;
revoke execute on function game.rat_at(integer, bigint) from public, anon, authenticated;

create or replace function game.roam_at(px integer[], py integer[], idx integer, t bigint, move_ms integer, walk_ms integer, shift integer, out x double precision, out z double precision, out flying boolean)
 returns record
 language plpgsql
 stable
 set search_path to 'pg_catalog', 'game'
as $$
declare
  n int := array_length(px, 1);
  shifted bigint := t + idx * shift;
  k bigint := shifted / move_ms;
  into_move bigint := shifted - k * move_ms;
  a int;
  b int;
begin
  flying := false;
  a := 1 + (game.minstd(((k * 3 + idx) % 2147483647) + 1) % n)::int;
  if into_move >= walk_ms then
    x := px[a] + 0.5; z := py[a] + 0.5;
    return;
  end if;
  b := 1 + (game.minstd((((k - 1) * 3 + idx) % 2147483647) + 1) % n)::int;
  select w.x, w.z into x, z from game.roam_point(px, py, 1, n, px[b], py[b], px[a], py[a], into_move::double precision / walk_ms) w;
end $$;
revoke execute on function game.roam_at(integer[], integer[], integer, bigint, integer, integer, integer) from public, anon, authenticated;

-- ---------- 2. the thugs: ${thugIds.length}, each pair in its own quarter of the Yard ----------
create or replace function game.thug_at(idx integer, t bigint, out x double precision, out z double precision, out flying boolean)
 returns record
 language plpgsql
 stable
 set search_path to 'pg_catalog', 'game'
as $$
declare
  px int[] := ${arr(THUG_TILES.map((p) => p[0]))};
  py int[] := ${arr(THUG_TILES.map((p) => p[1]))};
  zs int[] := ${arr(starts(THUG_PATCHES))};
  zn int[] := ${arr(THUG_PATCHES.map((p) => p.length))};
  q int := idx % ${THUG_PATCHES.length};
  shifted bigint := t + idx * 4111;
  k bigint := shifted / ${THUG_MOVE_MS};
  into_move bigint := shifted - k * ${THUG_MOVE_MS};
  a int;
  b int;
begin
  flying := false;
  a := zs[q + 1] + (game.minstd(((k * 3 + idx) % 2147483647) + 1) % zn[q + 1])::int;
  if into_move >= ${THUG_WALK_MS} then
    x := px[a] + 0.5; z := py[a] + 0.5;
    return;
  end if;
  b := zs[q + 1] + (game.minstd((((k - 1) * 3 + idx) % 2147483647) + 1) % zn[q + 1])::int;
  select w.x, w.z into x, z from game.roam_point(px, py, zs[q + 1], zn[q + 1], px[b], py[b], px[a], py[a], into_move / ${THUG_WALK_MS}.0) w;
end $$;
revoke execute on function game.thug_at(integer, bigint) from public, anon, authenticated;

insert into public.enemies (id, kind, idx, hp) values
${thugIds.map((e) => `  ('${e.id}', 'thug', ${e.index}, ${ENEMY_KINDS.thug.hp})`).join(',\n')}
on conflict (id) do nothing;

-- The bar's drunks, the barrel.
insert into public.spots (id, crime_id, x, y, area_x0, area_y0, area_x1, area_y1) values
${drunks.map((n) => `  ('${n.id}', '${n.crimeId}', ${n.x}, ${n.y}, null, null, null, null)`).join(',\n')}
on conflict (id) do update set crime_id = excluded.crime_id, x = excluded.x, y = excluded.y;
update public.stations set x = ${barrel.x}, y = ${barrel.y} where id = '${barrel.id}';

-- The site's walls, the bar's room, the walk map.
delete from game.shot_walls where x0 between ${S.x0} and ${S.x1} and y0 between ${S.y0} and ${S.y1};
insert into game.shot_walls (x0, y0, x1, y1) values
${walls.map((r) => `  (${r.x0}, ${r.y0}, ${r.x1}, ${r.y1})`).join(',\n')};
update game.shot_enclosures set x0 = ${barEncl.rect.x0}, y0 = ${barEncl.rect.y0}, x1 = ${barEncl.rect.x1}, y1 = ${barEncl.rect.y1} where id = 'bar';
${walk.map(([y, r]) => `update game.walk_map set masks = '${r}' where y = ${y};`).join('\n')}

-- Nobody (and nothing) left inside a wall (the site's solid tiles: a row of 0/1 per y, x from ${S.x0}).
${stuck('public.players', 'pos_x', 'pos_y')}
${stuck('public.ground_items', 'x', 'y')}
${stuck('public.graves', 'x', 'y')}

-- ---------- check: should say "ok" in every column (walks: enemies caught mid-walk round something, where the game has them) ----------
select case when ${samples
    .map((p) => `(select abs(w.x - ${p.x.toFixed(6)}) < 0.001 and abs(w.z - ${p.z.toFixed(6)}) < 0.001 from game.enemy_at('${p.kind}', ${p.idx}, ${p.t}) w)`)
    .join('\n    and ')} then 'ok' else 'WALKS DIFFER' end as walks,
  case when (select count(*) from public.enemies where kind = 'thug') = ${thugIds.length} then 'ok' else 'BAD THUGS' end as thugs,
  case when (select count(*) from public.spots where crime_id = 'pick_drunk') = ${drunks.length}
    and (select y from public.stations where id = '${barrel.id}') = ${barrel.y} then 'ok' else 'BAD ROWS' end as rows,
  case when (select count(*) from game.shot_walls) = ${SHOT_WALLS.length}
    and (select y1 - y0 from game.shot_enclosures where id = 'bar') = ${barEncl.rect.y1 - barEncl.rect.y0} then 'ok' else 'BAD TABLES' end as tables,
  case when (select count(*) from public.players t join ${solidValues} on t.pos_y = s.y and t.pos_x between ${S.x0} and ${S.x1}
    and substr(s.bits, t.pos_x - ${S.x0 - 1}, 1) = '1') = 0 then 'ok' else 'SOMEONE STUCK' end as players;

-- Guard: if the walk map, the site's walls, the spots or the walks aren't exactly the game's, stop here (nothing is kept).
do $$
begin
  if (select md5(string_agg(masks, '' order by y)) from game.walk_map) <> '${md5(allRows())}' then raise exception '0041: the walk map is not the game''s'; end if;
  if (select md5(string_agg(concat_ws(',', x0, y0, x1, y1), ';' order by x0, y0)) from game.shot_walls where x0 between ${S.x0} and ${S.x1} and y0 between ${S.y0} and ${S.y1}) <> '${md5([...walls].sort((p, q) => p.x0 - q.x0 || p.y0 - q.y0).map((r) => [r.x0, r.y0, r.x1, r.y1].join(',')).join(';'))}' then raise exception '0041: the walls are not the game''s'; end if;
  if (select md5(string_agg(concat_ws(',', id, x, y), ';' order by id)) from public.spots where crime_id = 'pick_drunk') <> '${md5([...drunks].sort((p, q) => (p.id < q.id ? -1 : 1)).map((n) => [n.id, n.x, n.y].join(',')).join(';'))}' then raise exception '0041: the drunks are not the game''s'; end if;
  if (select count(*) from public.enemies where kind = 'thug') <> ${thugIds.length} or (select y from public.stations where id = '${barrel.id}') <> ${barrel.y} then raise exception '0041: thugs or barrel wrong'; end if;
  if not (${samples.map((p) => `(select abs(w.x - ${p.x.toFixed(6)}) < 0.001 and abs(w.z - ${p.z.toFixed(6)}) < 0.001 from game.enemy_at('${p.kind}', ${p.idx}, ${p.t}) w)`).join('\n    and ')}) then raise exception '0041: the walks are not the game''s'; end if;
end $$;

commit;
`;
}
void YARD;
if (!process.env.VITEST) {
  const fs = require('node:fs');
  process.stdout.write(turfSql(fs.readFileSync('supabase/migrations/0038_aluminium.sql', 'utf8'), fs.readFileSync('supabase/migrations/0040_beach.sql', 'utf8')));
}
