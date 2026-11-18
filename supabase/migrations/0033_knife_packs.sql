-- 0033_knife_packs (v0.51): Ray's throwing knives come 10 to a pack instead of 5, same price ($150 tin, $300 copper).
-- Only changes the shop's price list (two rows); no player data. One transaction: to try it first, replace "commit;"
-- with "rollback;". The check should say "ok".

begin;

update public.shop_items set amount = 10 where shop = 'weapons' and item in ('tin_throwing_knife', 'copper_throwing_knife');

-- Check: this should say "ok".
select case when (select count(*) from public.shop_items where item in ('tin_throwing_knife', 'copper_throwing_knife') and amount = 10 and price in (150, 300)) = 2
  then 'ok' else 'NOT APPLIED' end as knife_packs;

commit;
