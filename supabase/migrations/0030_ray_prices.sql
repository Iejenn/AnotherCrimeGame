-- 0030_ray_prices (v0.49): Ray's Arms sells every metal's weapons, at one rule: 30 × the metal in them (a sheet's
-- value × the sheets it takes; tin sheet $5, copper $10). Same as SHOPS / shopPrice in src/game/data (tested there).
--
--   tin knuckles $150 · copper knuckles $300 · tin bat $300 · copper bat $600 · tin knife $150 · copper knife $300
--
-- Changes only the shop's price list (no player data): the three tin prices go up (50/100/150 → 150/300/150) and the
-- three copper weapons are added. buy_item already reads its prices from this table. Selling back stays at 25% of an
-- item's value ($1–$5), so buying to resell never pays.
--
-- One transaction. To try it first, replace the last line "commit;" with "rollback;": the check should say "ok".

begin;

insert into public.shop_items (shop, item, price) values
  ('weapons', 'tin_knuckles', 150), ('weapons', 'copper_knuckles', 300),
  ('weapons', 'tin_bat', 300), ('weapons', 'copper_bat', 600),
  ('weapons', 'tin_knife', 150), ('weapons', 'copper_knife', 300)
on conflict (shop, item) do update set price = excluded.price;

-- Check: this should say "ok".
select case when (select count(*) from public.shop_items where shop = 'weapons') = 6
  and (select price from public.shop_items where shop = 'weapons' and item = 'copper_bat') = 600
  and (select price from public.shop_items where shop = 'weapons' and item = 'tin_knuckles') = 150
  then 'ok' else 'NOT APPLIED' end as ray_prices;

commit;
