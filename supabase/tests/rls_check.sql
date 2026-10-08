-- Row level security check: user 2 must not see, change or forge user 1 rows. Run by scripts/test-rls.sh.
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into campaigns (id, name, query, location) values ('33333333-3333-3333-3333-333333333333', 'Lyon dentists', 'dentist', 'Lyon, France');
insert into leads (campaign_id, place_key, name) select id, 'p1', 'Cabinet A' from campaigns;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select 'user2 sees campaigns', count(*) from campaigns;
select 'user2 sees leads', count(*) from leads;
with u as (update leads set status = 'won' returning id) select 'user2 updated', count(*) from u;
do $$ begin
  insert into leads (owner_id, campaign_id, place_key, name) select '11111111-1111-1111-1111-111111111111', id, 'p2', 'Spoof' from public.campaigns;
  insert into campaigns (owner_id, name, query, location) values ('11111111-1111-1111-1111-111111111111', 'Spoof', 'x', 'y');
  raise exception 'SPOOF INSERT SUCCEEDED';
exception when insufficient_privilege then raise notice 'spoofed owner_id refused by RLS';
end $$;
do $$ begin
  insert into leads (campaign_id, place_key, name) values ('33333333-3333-3333-3333-333333333333', 'p3', 'Into another user campaign');
  raise exception 'CROSS-CAMPAIGN INSERT SUCCEEDED';
exception when insufficient_privilege then raise notice 'lead in another user campaign refused by RLS';
end $$;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'user1 sees campaigns', count(*) from campaigns;
select 'user1 sees leads', count(*) from leads;
reset role;
select relname, relrowsecurity from pg_class where relname in ('campaigns','leads','step_runs') order by 1;
