-- PRP-3: ownership shares with the named-on-certificate flag.
begin;
\ir _harness.psql

select plan(40);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select tests.user_id('member.a@test.esta.test') as member_a \gset

select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Căn hộ Thủ Đức', 'THUDUC', 'apartment', 'rental'),
  ('00000000-0000-4000-8000-0000000000a2', :'a', 'Kho Biên Hòa', 'BIENHOA', 'warehouse', 'rental'),
  ('00000000-0000-4000-8000-0000000000b1', :'b', 'Nhà B', 'B1', 'townhouse', 'rental');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000fa02', :'a', 'individual', 'Trần Minh Demo', array['owner']);
select id as owner_a from public.parties where household_id = :'a' and full_name = 'Owner a' \gset
select id as owner_b from public.parties where household_id = :'b' and full_name = 'Owner b' \gset
\set ryan_a '00000000-0000-4000-8000-00000000fa02'
insert into public.ownership_shares (household_id, property_id, party_id, share_bp) values
  (:'b', '00000000-0000-4000-8000-0000000000b1', :'owner_b', 10000);

create temporary view ownership_audit as select * from public.audit_log where table_name = 'ownership_shares' order by id;
grant select on ownership_audit to authenticated;

select tests.act_as('member.a@test.esta.test');

select lives_ok(
  format($$ insert into public.ownership_shares (id, household_id, property_id, party_id, share_bp, named_on_certificate, since)
            values ('00000000-0000-4000-8000-0000000005a1', %L, '00000000-0000-4000-8000-0000000000a2', %L, 10000, true, '2003-06-30') $$,
         :'a', :'owner_a'),
  'a member records a share');
select is((select created_by from public.ownership_shares where id = '00000000-0000-4000-8000-0000000005a1'), :'member_a'::uuid,
  'created_by is the inserting user');
select throws_ok(
  format($$ insert into public.ownership_shares (household_id, property_id, party_id, share_bp)
            values (%L, '00000000-0000-4000-8000-0000000000a1', %L, 5000) $$, :'a', :'owner_b'),
  '23503', null, 'a party of another household is refused');
select throws_ok(
  format($$ insert into public.ownership_shares (household_id, property_id, party_id, share_bp)
            values (%L, '00000000-0000-4000-8000-0000000000b1', %L, 5000) $$, :'a', :'owner_a'),
  '23503', null, 'a share in another household''s property is refused');
select throws_ok(
  format($$ insert into public.ownership_shares (household_id, property_id, party_id, share_bp)
            values (%L, '00000000-0000-4000-8000-0000000000a1', %L, 0) $$, :'a', :'owner_a'),
  '23514', null, 'share_bp 0 is refused');
select throws_ok(
  format($$ insert into public.ownership_shares (household_id, property_id, party_id, share_bp)
            values (%L, '00000000-0000-4000-8000-0000000000a1', %L, 10001) $$, :'a', :'owner_a'),
  '23514', null, 'share_bp 10001 is refused');
select throws_ok(
  format($$ insert into public.ownership_shares (household_id, property_id, party_id, share_bp)
            values (%L, '00000000-0000-4000-8000-0000000000a2', %L, 100) $$, :'a', :'owner_a'),
  '23505', null, 'a second share for the same party and property is refused');

select lives_ok(
  format($$ select public.set_ownership_shares('00000000-0000-4000-8000-0000000000a1', %L) $$,
         jsonb_build_array(
           jsonb_build_object('party_id', :'owner_a', 'share_bp', 5000, 'named_on_certificate', true, 'since', '2019-11-20'),
           jsonb_build_object('party_id', :'ryan_a', 'share_bp', 5000, 'named_on_certificate', true, 'since', null))),
  'set_ownership_shares saves a 50/50 split');
select results_eq(
  $$ select party_id, share_bp, named_on_certificate, since from public.ownership_shares
     where property_id = '00000000-0000-4000-8000-0000000000a1' order by share_bp, party_id $$,
  format($$ values (%L::uuid, 5000, true, '2019-11-20'::date), (%L::uuid, 5000, true, null::date) order by 1 $$, :'owner_a', :'ryan_a'),
  'the property holds exactly the two shares');

create temporary table before_second_call as
  select id, ctid as tuple, share_bp, named_on_certificate, since, updated_at from public.ownership_shares
  where property_id = '00000000-0000-4000-8000-0000000000a1';
select count(*) as audit_before from ownership_audit \gset
select lives_ok(
  format($$ select public.set_ownership_shares('00000000-0000-4000-8000-0000000000a1', %L) $$,
         jsonb_build_array(
           jsonb_build_object('party_id', :'ryan_a', 'share_bp', 5000, 'named_on_certificate', true),
           jsonb_build_object('party_id', :'owner_a', 'share_bp', 5000, 'named_on_certificate', true, 'since', '2019-11-20'))),
  'a second call with the same shares succeeds');
select set_eq(
  $$ select id, ctid as tuple, share_bp, named_on_certificate, since, updated_at from public.ownership_shares
     where property_id = '00000000-0000-4000-8000-0000000000a1' $$,
  $$ select * from before_second_call $$,
  'the second call rewrites no row, so the same tuples stay under the same ids');
select is((select count(*) from ownership_audit), :'audit_before'::bigint, 'the second call writes no audit row');

select is(
  (select owner_party_ids from public.property_list_rows where id = '00000000-0000-4000-8000-0000000000a1'),
  (select array_agg(id order by id) from public.parties where id in (:'owner_a', :'ryan_a')),
  'property_list_rows lists both owners of the 50/50 property');
select is(
  (select count(*) from public.property_list_rows p, unnest(p.owner_party_ids) as o (party_id)
   where o.party_id not in (select id from public.parties where household_id = :'a')),
  0::bigint, 'no owner in the list belongs to another household');
select is((select count(*) from public.property_list_rows where household_id = :'b'), 0::bigint,
  'the list shows no row of another household');

select lives_ok(
  format($$ select public.set_ownership_shares('00000000-0000-4000-8000-0000000000a2', %L) $$,
         jsonb_build_array(
           jsonb_build_object('party_id', :'owner_a', 'share_bp', 6000, 'named_on_certificate', true, 'since', '2003-06-30'),
           jsonb_build_object('party_id', :'ryan_a', 'share_bp', 3000, 'named_on_certificate', false))),
  'a 9000 bp set saves');
select is((select sum(share_bp) from public.ownership_shares where property_id = '00000000-0000-4000-8000-0000000000a2'), 9000::bigint,
  'the incomplete set is stored as given');
select is((select id from public.ownership_shares where property_id = '00000000-0000-4000-8000-0000000000a2' and party_id = :'owner_a'),
  '00000000-0000-4000-8000-0000000005a1'::uuid, 'an existing share is updated in place');
select results_eq(
  $$ select action, actor_kind, actor_id from ownership_audit
     where row_id = '00000000-0000-4000-8000-0000000005a1' and action = 'update' $$,
  format($$ values ('update', 'user', %L) $$, :'member_a'),
  'the change writes one update audit row naming the user');

select lives_ok(
  format($$ select public.set_ownership_shares('00000000-0000-4000-8000-0000000000a2', %L) $$,
         jsonb_build_array(jsonb_build_object('party_id', :'owner_a', 'share_bp', 10000, 'named_on_certificate', true))),
  'a set without Trần Minh Demo saves');
select is(
  (select array_agg(party_id) from public.ownership_shares where property_id = '00000000-0000-4000-8000-0000000000a2'),
  array[:'owner_a'::uuid], 'the absent party''s share is deleted');

select throws_ok(
  format($$ select public.set_ownership_shares('00000000-0000-4000-8000-0000000000a2', %L) $$,
         jsonb_build_array(
           jsonb_build_object('party_id', :'owner_a', 'share_bp', 5000, 'named_on_certificate', true),
           jsonb_build_object('party_id', upper(:'owner_a'), 'share_bp', 5000, 'named_on_certificate', true))),
  '22023', null, 'the same party twice is refused');
select throws_ok(
  $$ select public.set_ownership_shares('00000000-0000-4000-8000-0000000000a2', null) $$,
  '22023', null, 'null shares are refused rather than read as none');
select throws_ok(
  format($$ select public.set_ownership_shares('00000000-0000-4000-8000-0000000000a2', %L) $$,
         jsonb_build_array(jsonb_build_object('party_id', :'owner_a', 'share_bp', 33.33, 'named_on_certificate', true))),
  '22023', null, 'a fractional share_bp is refused');
select throws_ok(
  format($$ select public.set_ownership_shares('00000000-0000-4000-8000-0000000000a2', %L) $$,
         jsonb_build_array(jsonb_build_object('party_id', :'owner_a', 'share_bp', 0, 'named_on_certificate', true))),
  '23514', null, 'share_bp 0 through the function is refused');
select throws_ok(
  format($$ select public.set_ownership_shares('00000000-0000-4000-8000-0000000000a2', %L) $$,
         jsonb_build_array(jsonb_build_object('party_id', :'owner_b', 'share_bp', 10000, 'named_on_certificate', true))),
  '23503', null, 'a party of another household through the function is refused');
select throws_ok(
  $$ select public.set_ownership_shares('00000000-0000-4000-8000-0000000000b1', '[]') $$,
  'P0002', 'property not found', 'another household''s property is not found');
select throws_ok(
  $$ select public.set_ownership_shares('00000000-0000-4000-8000-0000000000ff', '[]') $$,
  'P0002', 'property not found', 'a property that does not exist fails the same way');
select is((select count(*) from public.ownership_shares where household_id = :'b'), 0::bigint,
  'a member sees no share of another household');

update public.properties set deleted_at = now() where id = '00000000-0000-4000-8000-0000000000a2';
select throws_ok(
  format($$ select public.set_ownership_shares('00000000-0000-4000-8000-0000000000a2', %L) $$,
         jsonb_build_array(jsonb_build_object('party_id', :'ryan_a', 'share_bp', 10000, 'named_on_certificate', true))),
  'P0002', 'property not found', 'an archived property is not found');
select is(
  (select array_agg(party_id) from public.ownership_shares where property_id = '00000000-0000-4000-8000-0000000000a2'),
  array[:'owner_a'::uuid], 'the archived property keeps the shares it had');

select tests.sees_household('public.ownership_shares', :'a', true);
select tests.cannot_write('public.ownership_shares', :'b',
  format($$ insert into public.ownership_shares (household_id, property_id, party_id, share_bp)
            values (%L, '00000000-0000-4000-8000-0000000000b1', %L, 100) $$, :'b', :'owner_b'));

select tests.act_as('viewer.a@test.esta.test');
select tests.sees_household('public.ownership_shares', :'a', true);
select throws_ok(
  $$ select public.set_ownership_shares('00000000-0000-4000-8000-0000000000a1', '[]') $$,
  '42501', null, 'a viewer cannot set shares');

reset role;
select tests.clear_request();
select ok(not has_function_privilege('anon', 'public.set_ownership_shares(uuid, jsonb)', 'execute'), 'anon cannot run set_ownership_shares');
select ok(has_function_privilege('authenticated', 'public.set_ownership_shares(uuid, jsonb)', 'execute'), 'a signed-in user can');
select is((select prosecdef from pg_proc where oid = 'public.set_ownership_shares(uuid, jsonb)'::regprocedure), false,
  'set_ownership_shares runs as the caller, so RLS answers first');

select * from finish();
rollback;
