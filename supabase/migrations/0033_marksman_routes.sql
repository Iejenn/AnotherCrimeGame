-- 0033_marksman_routes (v0.51): two follow-ups to 0032.
--
--   1. Ray's throwing knives come 10 to a pack (same price: $150 tin, $300 copper).
--   2. An enemy you throw at walks the real way round to you: only over floors and roads, round the sewage channel
--      (via a bridge), walls, fences and objects, through doors and gates, the same moves you can make. The route
--      (game.enemy_route, a breadth-first search over game.walk_map, printed from the map by
--      `npx vite-node scripts/marksman-sql.ts --walk`) is stored on the enemy (enemies.route) so the game animates
--      exactly it, and loot / landed knives drop where it really is along it. It stops on a tile it could step
--      onto yours from (not across a fence). If it has no way to reach you at all, you can't throw (no safespot).
--      And walls block a throw however close (the 2-tile exception is gone: it let you throw through a fence).
--
-- Replaces attack() (from 0032, only the walking-up part changes) and game.enemy_tile; adds one line to
-- game.enemies_json. No player data changes. One transaction: to try it first, replace "commit;" with "rollback;".
-- Every check should say "ok".

begin;

-- ---------- 1. Packs of 10 ----------
update public.shop_items set amount = 10 where shop = 'weapons' and item in ('tin_throwing_knife', 'copper_throwing_knife');

-- ---------- 2. Routes ----------
alter table public.enemies add column if not exists route jsonb;

create table if not exists game.walk_map (y int primary key, masks text not null);
alter table game.walk_map enable row level security;
revoke all on game.walk_map from public, anon, authenticated;
truncate game.walk_map;
-- walk map: 160 x 78
insert into game.walk_map (y, masks) values
  (0, 'd0f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f8f868'),
  (1, 'd6ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6b'),
  (2, 'd6ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6b'),
  (3, 'd6ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f1f1f1fdfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6b'),
  (4, 'd6ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6b000000d6ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6b'),
  (5, 'd6ffffffffffffffffffffffffffffffffffffffffffffff7f1f1fdfffff7f1f1fdffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffbf8f8f8feffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6b'),
  (6, 'd6ffffffffff7f1f1f5f1f1f1f1f1f1f1fdfffffffffff7f2b0000165f5f0b000096dfffffffffff7f3f1f1f1f1f1f1f1f1f9fdfffffffffff7f1f1f1f1f1f1f1f1f1f1fdfffffffffff7f1f1f5f1f1f1f1f1f1f1fdfffffffffff7f1f1f1f1f1fdfffffffffffffffffffff7f1f1f1f1f1f1f1f1f1f1fdfffffffffff7f1f1f5f1f1f1f1f1f1f1fdfffffffffff7f1f1f5f1f1f1f1f1f1f1fdfffffffffff6b'),
  (7, 'd6ffffffffff6b00004200000000000000d6ffffffffff6fd0f8f8f8fafaf8f8f868d7ffffffffff6fd0680000d0680000d068d7ffffffffff6b00000000000000000000d6ffffffffff6b00004200000000000000d6ffffffffff6b0000000000d6ffffffffffffffffffff6b00000000000000000000d6ffffffffff6b00004200000000000000d6ffffffffff6b00004200000000000000d6ffffffffff6b'),
  (8, 'd6ffffffffff6b00004200000000000000d6ffffffffff6b561f1fdfffffff7f1f4bd6ffffffffff6b16dbf8f8fefbf8f87e0bd6ffffffffff6b00000000000000000000d6ffffffffff6b00004200000000000000d6ffffffffff6b0000000000d67f1fdfffffffffffffff6b00000000000000000000d6ffffffffff6b00004200000000000000d6ffffffffff6b00004200000000000000d6ffffffffff6b'),
  (9, 'd6ffffffffff6b00004200000000000000d6ffffffffff6b420000d6ffffff6b0042d6ffffffffff6b00d6ffffffffffff6b00d6ffffffffff6b00000000000000000000d6ffffffffff6b00004200000000000000d6ffffffffff7b1818181818de6b00d6ffffffffffffff6b00000000000000000000d6ffffffffff6b00004200000000000000d6ffffffffff6b00004200000000000000d6ffffffffff6b'),
  (10, 'd6ffffffffff6b00004200000000400000d6ffffffffff6b1218181e1fdf7f1b580ad6ffffffffff6bd0fefffffffffffffb68d6ffff7f1fdf6b00000000000000000000d6ffffffffff6b00004200000000400000d6ffffffffff6b0000000000d6fbf8feffffffffffffff6b00000000000000000000d6ffffffffff6b00004200000000400000d6ffffffffff6b00004200000000000000d6ffffffffff6b'),
  (11, 'd6ffffffffff6b00000200000000020000d6ffffffffff6b0000000000160b000200d6ffffffffff6b16dfffffffffffff7f0bd6ffff6b00d66b00000000000000000000d6ffffffffff6b00000200000000020000d6ffffffffff6b0000000000161f1f1f1fdfffffffffff6b00000000000000000000d6ffffffffff6b00000200000000020000d6ffffffffff6b00000200000000000000d6ffffffffff6b'),
  (12, 'd6ffffffffff6b00000000000000000000d6ffffffffff6b00004000000000400000d6ffffffffff6b00d6ffffffffffff6b00d6ffff6b00d66b00004000000000000000d6ffffffffff6b00004000000000400000d6ffffffffff6b00000000000000000000d6ffffffffff6b00000000000000400000d6ffffffffff6b00000000000000000000d6ffffffffff6b00000000000000000000d6ffffffffff6b'),
  (13, 'd6ffffffffff6b00000000000000000000d6ffffffffff6b00004200000000420000d6ffffffffff6bd0fefffffffffffffb68d6ffff6b00d66b00004200000000000000d6ffffffffff6b1018da78081018daf868d6ffffffffff6b00000000000000000000d6ffffffffff6b00000000000000420000d6ffffffffff6b00000000000000000000d6ffffffffff6b00000000000000000000d6ffffffffff6b'),
  (14, 'd6ffffffffff6b00000000000000000000d6ffffffffff6b00004200000000420000d6ffffffffff6b16dfffffffffffff7f0bd6fffffbf8fe6b00004200000000000000d6ffffffffff6b0000d66b000000d6ff6bd6ffffffffff7b18181818080000000000d6ffffffffff7b18181818080000420000d6ffffffffff6b00000000000000000000d6ffffffffff6b00000000000000000000d6ffffffffff6b'),
  (15, 'd6ffffffffff6b00000000000000000000d6ffffffffff6b00004200000000420000d6ffffffffff6b00d6ffffffffffff6b00d6ffffffffff6b00004200000000000000d6ffffffffff6bd0f8fe6b00d0f8feff6bd6ffffffffff6b00000000000000000000d6ffffffffff6b00000000000000420000d6ffffffffff6b00000000000000400000d6ffffffffff6b00000000000000000000d6ffffffffff6b'),
  (16, 'd6ffffffffff6b00000000000000000000d6ffffffffff6b00004200000000420000d6ffffffffff6bd0fefffffffffffffb68d6ffffffffff6b00004200000000000000d6ffffffffffeb161f5f1b08161f5f1f0bf6ffffffffff6b00000000000000000000d6ffffffffff6b00000000000000420000d6ffffffffff6b00000000000000420000d6ffffffffff6b00000000000000000000d6ffffffffff6b'),
  (17, 'd6fffffffffffbf8f8f8f8f8f8f8f8f8f8fefffffffffffbf8f8faf8f8f8f8faf8f8feffffffffff6bd6ffffffffffffffff6bd6fffffffffffbf8f8faf8f8f8f8f8f8f8fefffffffffffbf9f8faf8f8f8f8faf8fcfefffffffffffbf8f8f8f8f8f8f8f8f8f8fefffffffffffbf8f8f8f8f8f8f8faf8f8fefffffffffffbf8f8f8f8f8f8f8faf8f8fefffffffffffbf8f8f8f8f8f8f8f8f8f8feffffffffff6b'),
  (18, 'd6ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6bd6ffffffffffffffff6bd6ffffffffffffffffff7f1f1f1fdfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6b'),
  (19, 'd6ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6b161f1f1f5f5f1f1f1f0bd6ffffffffffffffffff6b000000d6ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6b'),
  (20, 'd6ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6bd0f8f8f8fafaf8f8f868d6fffffffffffffffffffbf8f8f8feffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6b'),
  (21, 'd6ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6bd6ffffffffff7f1f1f4bd6ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6b'),
  (22, 'd6ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6bd6ffffffffff6b000042d6ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6b'),
  (23, 'd6ffffffffff7f1f1f1f1f1f1f1f1f1f1fdfffffffffff7f1f1f5f1f1f1f1f1f1f1fdfffffffffff6bd6fffffffffffbf8f86ad6ffffffffff7f1f1f1f1f1f5f1f1f1fdfdfffffffffff7f1f1f1f1f1f1f1f1f1f1fdfffffffffff7f1f1f1f1f1f1f5f1f5f1fdfffffffffff7f1f1f1f1f1f1f1f1f1f1fdfffffffffff7f3f1f1f1f1f1f1f1f1f9fdfffffffffff7f1f1f1f1f1f1f1f1f1f1fdfffffffffff6b'),
  (24, 'd6ffffffffff6b00000000000000000000d6ffffffffff6b00004200000000000000d6ffffffffff6bd6ffffffffffffffff6bd6ffffffffff6b00000000004200000042d7ffffffffff6b000000000000d0f86800d6ffffffffff6b00000000000002000200d6ffffffffff6b00000000000000000000d6ffffffffff6fd0f8680000d0f8f8f868d7ffffffffff6b00000000000000000000d6ffffffffff6b'),
  (25, 'd6ffffffffff6b00000000000000000000d6ffffffffff6b00004200000000000000d6ffffffffff6bd6ffffffffffffffff6bd6ffffffffff6b0000000000d2f8f8f86ad6ffffffffff6b000000000000d6ff6b00d6ffffffffff6bd0f878180840004000d0feffffffffff6b00000000000000000000d6ffffffffff6b561f1b18181e1f1f1f4bd6ffffffffff6b00000000000000000000d6ffffffffff6b'),
  (26, 'd6ffffffffff6b00000000000000000000d6ffffffffff6b00004200001018181818deffffffffff7bdeffffffffffffffff7bdeffffffffff6b0000000000d6ffffff6bd6ffffffffff6b000000000000d6ff6b00d67f1fdfffff6bd6ff6b0000d2f8faf8feffffffffffff6b00000000000000000000d6ffffffffff6b42000000000000000042d6ffffffffff7b18181818080000000000d6ffffffffff6b'),
  (27, 'd6ffffffffff6b00000000000000000000d6ffffffffff6b00004200000000000000d6ffffffffff7bdeffffffffffffffff7bdeffff7f1fdf6b0000400000d6ffffff6bd6ffffffffff6b0000000000d0fefffb68d66b00d6ffffeb161f5b1808f6ffffffffffffffffffff6b00000000000000400000d6ffffffffff6bd2f8f8f8f8f8f8f8f86ad6ffffffffff6b00000000000000000000d6ffffffffff6b'),
  (28, 'd6ffffffffff6b00000000000000000000d6ffffffffff6b00000200000000000000d6ffffffffff6bd6ffffffffffffffff6bd6ffff6b00d66b0000020000161f1f1f0bd6ffffffffff6b0000000000561f1f1f4bd66b00d6fffffb69004200d4feffffffffffffffffffff6b00000000000000020000d6ffffffffff6bd6ffffffffffffffff6bd6ffffffffff6b00000000000000000000d6ffffffffff6b'),
  (29, 'd6ffffffffff6b00004000000000000000d6ffffffffff6b00000000000000000000d6ffffffffff6bd6ffffffffffffffff6bd6ffff6b00d66b00000000000000000000d6ffffffffff6b000040000042d0f86842d66b00d6fffffffbf8faf8feffffffffffffffffffffff6b00000000000000000000d6ffffffffff6bd6ffffffffffffffff6bd6ffffffffff6b00004000000000000000d6ffffffffff6b'),
  (30, 'd6ffffffffff6b00004200000000000000d6ffffffffff6b00000000000000000000d6ffffffffff6bd6ffffffffffffffff6bd6ffff6b00d66b101818d8680000000000d6ffffffffff6b1018daf86842161fcb42d6fbf8feffffffffffffffffffffffffffffffffffffff6b00000000000000000000d6ffffffffff6bd6ffffffffffffffff6bd6ffffffffff6b00004200000000000000d6ffffffffff6b'),
  (31, 'd6ffffffffff6b00004200001018181818deffffffffff6b00000000000000000000d6ffffffffff6bd6ffffffffffffffff6bd6fffffbf8fe6b000000560b0000000000d6ffffffffff6b0000d6ff6b420000d26bd6ffffffffffffffff7f1fdfff7f1fdfffffffffffffff6b00000000000000000000d6ffffffffff6bd6ffffffffffffffff6bd6ffffffffff6b00004200001018181818deffffffffff6b'),
  (32, 'd6ffffffffff6b00004200000000000000d6ffffffffff6b00000000000000400000d6ffffffffff6b161fdfffffffffffff6bd6ffffffffff6b00000042000000000000d6ffffffffff6bd0f8feff6bd2f8f8fe6bd6ffffffffff7f1f5f0b00d67f0b00d6ffffffffffffff6b00000000000000000000d6ffffffffffeb161f1f1f5f5f1f1f1f0bf6ffffffffff6b00004200000000000000d6ffffffffff6b'),
  (33, 'd6ffffffffff6b00004200000000000000d6ffffffffff6b00000000000000420000d6ffffffffff6b0000161f1f1f1f1f1f0bf6ffffffffffeb1018581a080000000000d6ffffffffffeb161f5f1f0b165f5f5f0bf6ffffffffff6b004200d0fe6b00d0feffffffffffffff6b00000000000000000000d6fffffffffffbf9680000d26a0000d0fcfeffffffffff6b00004200000000000000d6ffffffffff6b'),
  (34, 'd6fffffffffffbf8f8faf8f8f8f8f8f8f8fefffffffffffbf8f8f8f8f8f8f8faf8f8fefffffffffffbf8f8f8f8f8f8f8f8f8fcfefffffffffffbf9f8faf8f8f8f8f8f8f8fefffffffffffbf9f8faf8f8f8fafafafcfefffffffffffbf8faf8fefffbf8fefffffffffffffffffbf8f8f8f8f8f8f8f8f8f8fefffffffffffffffbf8f8fefbf8f8fefffffffffffffffbf8f8faf8f8f8f8f8f8f8feffffffffff6b'),
  (35, 'd6ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f1f1f1fdfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6b'),
  (36, 'd6ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f1fdfffffffffff6b000000d6ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6b'),
  (37, 'd6ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f1f1f1fdfffffffffffffffffffffffffffffffffffffffffffff6b00d6fffffffffffbf8f8f8feffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6b'),
  (38, 'd6ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6b000000d6fffffffffffffffffffffffffffffffffffffffffffffbf8feffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6b'),
  (39, 'd6fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffbf8f8f8feffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6b'),
  (40, 'd6ffffffffff7f1f1f1f1f1f1f1f1f1f1fdfffffffffff7f1f1f1f1f1f1f1f1f1f9fdfffffffffff7f1f1f1f1f1f1f1f1f1f1fdfffffffffff7f1f1f1f1f1f1f1f1f1f1fdfffffffffff7f1f1f5f1f1f1f1f5f1f1fdfffffffffff7f1f1f1f1f1f1f1f1f1f1fdfffffffffff7f1f1f1f1f1f1f1f5f1f1fdfffffffffff7f1f1f1f1f1f1f1f1f1f1fdfffffffffff7f1f1f5f1f1f1f1f1f1f1fdfffffffffff6b'),
  (41, 'd6ffffffffff6b00400000d06800004000d6ffffffffff6b00000000000000400040d7ffffffffff6b00000000000000000000d6ffffffffff6b00000000000000000000d6ffffffffff6b00004200000000420000d6ffffffffff6b00000000000000000000d6ffffffffff6b00000000000000420000d6ffffffffff6b00000000000000000000d6ffffffffff6b00004200000000000000d6ffffffffff6b'),
  (42, 'd6ffffffffff6b10daf8f8fe6b00005208d6ffffffffff6b0000000000d0f8fa780ad6ffffffffff6b00000000000000000000d6ffffffffff6b00000000000000000000d6ffffffffff6b00d0fa6800d0f86a0000d6ffffffffff6b00000000000000000000d6ffffffffff6b00000000000000420000d6ffffffffff6b00000000000000000000d6ffffffffff6b00004200000000000000d6ffffffffff6b'),
  (43, 'd6ffffffffff6b00d67f1fdffbf8f86a00d6ffffffffff6b0000000000d6ffff6b00d6ffffffffff6b00000000000000000000d6ffffffffff7b18181818080000000000d6ffffffffff7b18deff7b181edffb7818deffffffffff6b00000000000000000000d6ffffffffff6b00000000000000420000d6ffffffffff7b18181818181818181818deffffffffff6b00004200000000000000d6ffffffffff6b'),
  (44, 'd6ffffffffff6b00d66b00d6fffffffb68d6ffffffffff6b0000000000d6fffffb68d6ffffffffff6b00004000000000000000d6ffffffffff6b00000000000000000000d6ffffffffff6b0016df6b0000d67f0b00d6ffff7f1fdf6b00000000000000400000d6ffffffffff6b00000000000000420000d6ffffffffff6b00000000000000000000d6ffffffffff6b00004200000000000000d6ffffffffff6b'),
  (45, 'd6ffffffffff6bd0fefbf8feffffffff7bdeffffffffff6b0000000000d6ffffff7bdeffffffffff6b00000200000000000000d6ffffffffff6b00000000000000000000d6ffffffffff6b0000d66b0000d66b0000d6ffff6b00d66b00000000000000020000d6ffffffffff6b00000000000000020000d6ffffffffff6b00000000000000000000d6ffffffffff6b00000200000000000000d6ffffffffff6b'),
  (46, 'd6ffffffffff6bd6ffffff7f1f1fdfff7bdeffffffffff6b0000000000d6ffffff7bdeffffffffff6b00000000000000000000d6ffffffffff6b0000501818d8f8680000d6ffffffffff6b00d0fe6b0000d66b0000d6ffff6b00d66b0000000000d06800d068d6ffffffffff6b00000000000000000000d6ffffffffff6b00000000000000400000d6ffffffffff6b00000000000000000000d6ffffffffff6b'),
  (47, 'd6ffffffffff6bd6ffffff6b0000d6ff6bd6ffffffffff6b0000000000d6ffff7f0bd6ffffffffff6b00000000000000000000d6ffffffffff6b000042000016df6b0000d6ffffffffff6b00d6ff6b0000d6fb6800d6ffff6b00d66b000000000016dbf87e0bd6ffffffffff6b00000000000000000000d6ffffffffff6b00000000000000420000d6ffffffffff6b00000000000000000000d6ffffffffff6b'),
  (48, 'd6ffffffffff6b16dffffffbf8f8feff6bd6ffffffffff6b0000000000d6ffff6b00d6ffffffffff6b00000000000000000000d6ffffffffff6b0000d2f86800d66b0000d6ffffffffff7b181edf7b18d8fe7f1b18defffffbf8fe6b000000000000d6ff6b00d6ffffffffff6b00000000001018181818deffffffffff6b00000000000000420000d6ffffffffff6b00000000001018181818deffffffffff6b'),
  (49, 'd6ffffffffff6b0016df7f1fdf7f1f1f4bd6ffffffffff6b0000000000165f1fdb68d6ffffffffff6b00004000000000000000d6ffffffffff6b0000165f1b185e0b0000d6ffffffffff6b0000560b00161f4b0000d6ffffffffff6b000000000010deff7b08d6ffffffffff6b00000000000000000000d6ffffffffff6b00000000000000420000d6ffffffffff6b00000000000000000000d6ffffffffff6b'),
  (50, 'd6ffffffffff6b0000160b00160b000002f6ffffffffff6b0000000000000200160bf6ffffffffff6b00004200000000000000d6ffffffffff6b00000042000042000000d6ffffffffff6b00004200000000420000d6ffffffffff6b000000000000165f0b00d6ffffffffff6b00000000000000000000d6ffffffffff6b00000000000000420000d6ffffffffff6b00000000000000000000d6ffffffffff6b'),
  (51, 'd6fffffffffffbf8f8f8f8f8f8f8f8f8fcfefffffffffffbf8f8f8f8f8f8f8f8f8fcfefffffffffffbf8f8faf8f8f8f8f8f8f8fefffffffffffbf8f8f8faf8f8faf8f8f8fefffffffffffbf8f8faf8f8f8f8faf8f8fefffffffffffbf8f8f8f8f8f8f8faf8f8fefffffffffffbf8f8f8f8f8f8f8f8f8f8fefffffffffffbf8f8f8f8f8f8f8faf8f8fefffffffffffbf8f8f8f8f8f8f8f8f8f8feffffffffff6b'),
  (52, 'd6ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f1f1f1fdfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6b'),
  (53, 'd6ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6b000000d6ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6b'),
  (54, 'd6fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffbf8f8f8feffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f1f1f1fdfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6b'),
  (55, 'd6ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6b000000d6ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6b'),
  (56, 'd6fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffbf8f8f8feffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff6b'),
  (57, '161f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f0b'),
  (58, '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'),
  (59, '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'),
  (60, '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'),
  (61, '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'),
  (62, '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'),
  (63, '0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000d0f8f8f8f8f8f868000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'),
  (64, '000000000000000000000000000000000000d06800d06800d0f8f8f8680000d0f8f8f8f8f8680000004000000000d0fefffffffffffffb680000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'),
  (65, '000000000000000000000000000000000000d6fbf8fefbf8fefffffffbf8f8fefffffffffffbf8f8f87a18181818deffff7f1f1fdfffff6b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'),
  (66, '000000000000000000000000000000000000d6ffffffffffffffffffffffffffffffffffffffffffff6b00000000d6ffff6b0000d6ffff6b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'),
  (67, '000000000000000000000000000000000000161f1f1f1f1fdf7f1f1f1f1f1f1f1f1fdf7f1f1f1f1f1f0b00000000d6ffff6b0000d6ffff6b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'),
  (68, '000000000000000000000000000000000000000000000000d66b0000000000000000d66b00000000000000000000d6fffffbf8f8feffff6b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'),
  (69, '000000000000000000000000000000000000000000000000d66b0000000000000000d66b00000000000000000000d67f1fdfffffffff7f0b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'),
  (70, '000000000000000000000000000000000000000000000000d66b0000000000000000d66b00000000000000000000160b00161f1f1f1f0b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'),
  (71, '000000000000000000000000000000000000000000000000d66b0000000000000000d66b00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'),
  (72, '000000000000000000000000000000000000d0f8f8f8f8f8fefbf8f8f8f8f8f8f8f8fefbf8f8f8f8f86800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'),
  (73, '000000000000000000000000000000000000d6ffffffffffffffffffffffffffffffffffffffffffff6b00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'),
  (74, '000000000000000000000000000000000000d6ff7f1fdfffffff7f1f1fdfffff7f1fdfffffff7f1fdf6b00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'),
  (75, '000000000000000000000000000000000000161f0b00161f1f1f0b0000161f1f0b00161f1f1f0b00160b00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'),
  (76, '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'),
  (77, '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000');

-- The bit for a move (dx, dy) in a walk mask (the order of WALK_DIRS in src/street/sight.ts).
create or replace function game.walk_bit(dx integer, dy integer)
 returns integer
 language sql
 immutable
 set search_path to 'pg_catalog'
as $$ select case when (dy + 1) * 3 + (dx + 1) > 4 then (dy + 1) * 3 + (dx + 1) - 1 else (dy + 1) * 3 + (dx + 1) end $$;

-- The route an enemy at (fx, fy) walks to reach you at (tx, ty): the fewest steps, moves tried in the same order as
-- enemyRoute in src/street/sight.ts, to a tile next to you that it could step onto yours from. The tiles after
-- (fx, fy) as [[x, y], ...] (empty if it's already there), or null if it can't reach you.
create or replace function game.enemy_route(fx integer, fy integer, tx integer, ty integer)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'pg_catalog', 'game'
as $function$
declare
  w constant int := 160;
  rows text[] := (select array_agg(masks order by y) from game.walk_map);
  came int[];
  q int[];
  head int := 1;
  dxs constant int[] := array[-1, 0, 1, -1, 1, -1, 0, 1];
  dys constant int[] := array[-1, -1, -1, 0, 0, 1, 1, 1];
  start int := fy * w + fx;
  c int; cx int; cy int; m int; i int; n int; nx int; ny int; k int;
  route jsonb := '[]'::jsonb;
begin
  if rows is null or fy < 0 or fy >= cardinality(rows) or fx < 0 or fx >= w then return null; end if;
  -- Already next to you (and able to step onto your tile).
  if greatest(abs(fx - tx), abs(fy - ty)) = 1
     and (('x' || substr(rows[fy + 1], fx * 2 + 1, 2))::bit(8)::int & (1 << game.walk_bit(tx - fx, ty - fy))) <> 0 then
    return route;
  end if;
  came := array_fill(-1, array[w * cardinality(rows)]);
  came[start + 1] := start;
  q := array[start];
  while head <= cardinality(q) loop
    c := q[head];
    head := head + 1;
    cx := c % w;
    cy := c / w;
    m := ('x' || substr(rows[cy + 1], cx * 2 + 1, 2))::bit(8)::int;
    for i in 1..8 loop
      continue when (m & (1 << (i - 1))) = 0;
      nx := cx + dxs[i];
      ny := cy + dys[i];
      n := ny * w + nx;
      continue when came[n + 1] >= 0;
      came[n + 1] := c;
      if greatest(abs(nx - tx), abs(ny - ty)) = 1
         and (('x' || substr(rows[ny + 1], nx * 2 + 1, 2))::bit(8)::int & (1 << game.walk_bit(tx - nx, ty - ny))) <> 0 then
        k := n;
        while k <> start loop
          route := jsonb_build_array(jsonb_build_array(k % w, k / w)) || route;
          k := came[k + 1];
        end loop;
        return route;
      end if;
      q := array_append(q, n);
    end loop;
  end loop;
  return null;
end $function$;

-- How long a route is, in tiles (diagonal steps are longer).
create or replace function game.route_len(fx integer, fy integer, route jsonb)
 returns double precision
 language sql
 immutable
 set search_path to 'pg_catalog'
as $$
  select coalesce(sum(case when x <> px and y <> py then sqrt(2) else 1 end), 0)
  from (
    select (r.v ->> 0)::int as x, (r.v ->> 1)::int as y,
      coalesce((lag(r.v) over (order by r.i) ->> 0)::int, fx) as px, coalesce((lag(r.v) over (order by r.i) ->> 1)::int, fy) as py
    from jsonb_array_elements(coalesce(route, '[]'::jsonb)) with ordinality as r(v, i)
  ) steps
$$;

-- Where an enemy in a fight is at time t: part-way along its route while it walks up (by distance), or at its spot.
create or replace function game.enemy_tile(e public.enemies, t timestamptz, out x integer, out y integer)
 language plpgsql
 stable
 set search_path to 'pg_catalog', 'game'
as $function$
declare
  total double precision;
  walked double precision;
  px int; py int; sx int; sy int;
  step double precision;
  r jsonb;
begin
  x := e.fight_x; y := e.fight_y;
  if e.arrive_at is null or t >= e.arrive_at or e.from_x is null or coalesce(jsonb_array_length(e.route), 0) = 0 then return; end if;
  total := game.route_len(e.from_x, e.from_y, e.route);
  walked := greatest(0, total - extract(epoch from (e.arrive_at - t)) * 2.5);
  px := e.from_x; py := e.from_y;
  x := px; y := py;
  for r in select v from jsonb_array_elements(e.route) as a(v) loop
    sx := (r ->> 0)::int; sy := (r ->> 1)::int;
    step := case when sx <> px and sy <> py then sqrt(2) else 1 end;
    -- Past the middle of a step: it's on the next tile.
    if walked < step / 2 then return; end if;
    x := sx; y := sy;
    walked := walked - step;
    px := sx; py := sy;
  end loop;
end $function$;

revoke execute on function game.walk_bit(integer, integer) from public, anon, authenticated;
revoke execute on function game.enemy_route(integer, integer, integer, integer) from public, anon, authenticated;
revoke execute on function game.route_len(integer, integer, jsonb) from public, anon, authenticated;
revoke execute on function game.enemy_tile(public.enemies, timestamptz) from public, anon, authenticated;

create or replace function public.attack(p_enemy text, p_x integer, p_y integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'game'
as $function$
declare
  p public.players := game.me();
  rep jsonb := game.empty_report();
  logs jsonb := '[]'::jsonb;
  r record;
  e public.enemies;
  k public.enemy_kinds;
  w public.items;
  pos record;
  ex double precision;
  ez double precision;
  dist double precision;
  reach double precision;
  ranged boolean;
  v_route jsonb;
  v_last jsonb;
begin
  if p.id is null then return jsonb_build_object('ok', false, 'reason', 'no_character'); end if;
  select * into r from game.settle(p, rep, logs);
  p := r.p; rep := r.rep; logs := r.logs;
  perform game.save(p);
  select * into e from public.enemies where id = p_enemy for update;
  if e.id is null then return game.respond(p.id, false, 'unknown_enemy', rep, logs); end if;
  select * into k from public.enemy_kinds where id = e.kind;
  if e.kind = 'giant_rat' and not coalesce(p.unlocked ? 'rat_nest', false) then return game.respond(p.id, false, 'locked', rep, logs); end if;
  if p.caught_crime is not null then return game.respond(p.id, false, 'caught', rep, logs); end if;
  if p.stunned_until > now() then return game.respond(p.id, false, 'stunned', rep, logs); end if;
  if e.dead_until > now() then return game.respond(p.id, false, 'enemy_dead', rep, logs); end if;
  if e.left_at > now() - interval '10 seconds' then return game.respond(p.id, false, 'enemy_returning', rep, logs); end if;
  if e.fighter is not null and e.fighter <> p.id and e.fight_seen > now() - interval '5 seconds' then
    return game.respond(p.id, false, 'enemy_busy', rep, logs);
  end if;
  if not game.can_reach(p, p_x, p_y) then return game.respond(p.id, false, 'too_fast', rep, logs); end if;
  -- v0.51: you throw when your style is Marksman and the Marksman slot has knives left; otherwise it's melee.
  select * into w from public.items where id = p.equipment ->> 'marksman';
  ranged := p.fight_style = 'marksman' and w.range is not null and p.marksman_count > 0;
  if e.fighter = p.id and e.fight_seen > now() - interval '5 seconds' then
    ex := e.fight_x + 0.5; ez := e.fight_y + 0.5;
  else
    select * into pos from game.enemy_at(e.kind, e.idx, game.ms(now()));
    ex := pos.x; ez := pos.z;
  end if;
  dist := sqrt((p_x + 0.5 - ex) ^ 2 + (p_y + 0.5 - ez) ^ 2);
  -- Melee: next to it (2 tiles, as before). Ranged: up to its range + 1/2 tile, and nothing in the way.
  reach := case when ranged then w.range + 0.5 else 2.0 end;
  if dist > reach then return game.respond(p.id, false, 'too_far', rep, logs); end if;
  -- Walls and fences block a throw however close (0033: no point-blank exception, so no throwing through a fence).
  if ranged and not game.clear_shot(p_x, p_y, floor(ex)::int, floor(ez)::int) then
    return game.respond(p.id, false, 'no_line_of_sight', rep, logs);
  end if;
  if e.fighter is distinct from p.id or e.fight_seen <= now() - interval '5 seconds' then
    if e.dead_until is not null or coalesce(e.last_hit_at, 'epoch') < now() - interval '10 seconds' then e.hp := k.hp; end if;
    e.dead_until := null;
    e.fighter := p.id;
    e.fight_x := floor(ex)::int;
    e.fight_y := floor(ez)::int;
    e.from_x := e.fight_x;
    e.from_y := e.fight_y;
    e.arrive_at := now();
    e.route := '[]'::jsonb;
    -- Hit from a distance (0033): it walks the real way round to you (floors and roads only: round water, walls,
    -- fences and objects, through doors and gates; game.enemy_route) at 2.5 tiles/s, and only swings once it's next
    -- to you. No way to reach you at all: no throw (no safespot).
    if ranged then
      v_route := game.enemy_route(e.from_x, e.from_y, p_x, p_y);
      if v_route is null then return game.respond(p.id, false, 'no_route', rep, logs); end if;
      if jsonb_array_length(v_route) > 0 then
        v_last := v_route -> -1;
        e.fight_x := (v_last ->> 0)::int;
        e.fight_y := (v_last ->> 1)::int;
        e.route := v_route;
        e.arrive_at := now() + make_interval(secs => game.route_len(e.from_x, e.from_y, v_route) / 2.5);
      end if;
    end if;
    e.next_swing := e.arrive_at + make_interval(secs => k.speed * 0.5);
    p.fight_next := now();
    logs := logs || to_jsonb(format('You attack the %s.', lower(k.name)));
  end if;
  e.fight_seen := now();
  update public.enemies set fighter = null where fighter = p.id and id <> e.id;
  update public.enemies set hp = e.hp, dead_until = e.dead_until, fighter = e.fighter, fight_x = e.fight_x, fight_y = e.fight_y,
    next_swing = e.next_swing, fight_seen = e.fight_seen, arrive_at = e.arrive_at, from_x = e.from_x, from_y = e.from_y, route = e.route where id = e.id;
  p.fight_enemy := e.id;
  p.job_crime := null; p.job_spot := null; p.job_started_at := null; p.job_ends_at := null;
  p.pos_x := p_x; p.pos_y := p_y; p.pos_at := now();
  perform game.save(p);
  return game.respond(p.id, true, null, rep, logs) || jsonb_build_object('events', '[]'::jsonb);
end $function$;

-- The enemies as the game sees them: the route too, while one walks up to its fighter.
do $do$
declare
  def text := pg_get_functiondef('game.enemies_json()'::regprocedure);
  anchor text := $t$jsonb_build_object('from', jsonb_build_array(e.from_x, e.from_y), 'arriveAt', game.ms(e.arrive_at))$t$;
begin
  if position(anchor in def) = 0 then raise exception 'enemies_json: anchor not found'; end if;
  execute replace(def, anchor, $t$jsonb_build_object('from', jsonb_build_array(e.from_x, e.from_y), 'arriveAt', game.ms(e.arrive_at), 'route', e.route)$t$);
end $do$;

-- ---------- Checks: each should say "ok" ----------
select
  case when (select count(*) from public.shop_items where item in ('tin_throwing_knife', 'copper_throwing_knife') and amount = 10) = 2 then 'ok' else 'NOT APPLIED' end as packs,
  case when (select count(*) from game.walk_map) = 78 then 'ok' else 'NO WALK MAP' end as walk_map,
  -- A rat on the sewer's north walkway, you right across the channel: 16 steps round via the bridge (the same as
  -- the game's enemyRoute), ending next to you.
  case when jsonb_array_length(game.enemy_route(18, 66, 18, 72)) = 16 and game.enemy_route(18, 66, 18, 72) -> -1 = '[19, 72]'::jsonb
   and jsonb_array_length(game.enemy_route(76, 42, 81, 42)) = 4 then 'ok' else 'BAD ROUTE' end as routes,
  case when not game.clear_shot(18, 43, 16, 43) then 'ok' else 'FENCE' end as no_point_blank_through_fences;

commit;
