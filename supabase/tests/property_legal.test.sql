-- PRP-2: parcels, structures and certificates per property, several parcels each.
begin;
\ir _harness.psql

select plan(61);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select tests.user_id('member.a@test.esta.test') as member_a \gset
select tests.user_id('member.b@test.esta.test') as member_b \gset

select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Đất Bảo Lộc', 'BAOLOC', 'residential_land', 'held'),
  ('00000000-0000-4000-8000-0000000000a2', :'a', 'Nhà phố Q7', 'Q7', 'townhouse', 'rental'),
  ('00000000-0000-4000-8000-0000000000b1', :'b', 'Nhà B', 'B1', 'townhouse', 'rental');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000ba0a', :'a', 'organization', 'Ngân hàng Demo', array['bank']),
  ('00000000-0000-4000-8000-00000000ba0b', :'b', 'organization', 'Ngân hàng B', array['bank']);
select id as owner_a from public.parties where household_id = :'a' and full_name = 'Owner a' \gset
select id as owner_b from public.parties where household_id = :'b' and full_name = 'Owner b' \gset
insert into public.certificates (id, household_id, property_id, form, holder_party_ids) values
  ('00000000-0000-4000-8000-00000000c0b1', :'b', '00000000-0000-4000-8000-0000000000b1', 'gcn_2024', array[:'owner_b'::uuid]);
insert into public.parcels (household_id, property_id, area_m2) values (:'b', '00000000-0000-4000-8000-0000000000b1', 50);
insert into public.structures (household_id, property_id, kind) values (:'b', '00000000-0000-4000-8000-0000000000b1', 'Nhà ở');

create temporary view legal_audit as
  select * from public.audit_log where table_name in ('certificates', 'parcels', 'structures') order by id;
grant select on legal_audit to authenticated;

delete from public.test_clock;
insert into public.test_clock (frozen_now) values ('2026-10-07T09:00:00+07:00');
insert into private.local_stack default values on conflict do nothing;

select tests.act_as('member.a@test.esta.test');

select lives_ok(
  format($$ insert into public.certificates (id, household_id, property_id, form, holder_party_ids, status, mortgage)
            values ('00000000-0000-4000-8000-00000000c0a1', %L, '00000000-0000-4000-8000-0000000000a1', 'gcn_2009_2024',
                    array[%L::uuid], 'mortgaged',
                    '{"bank_party_id": "00000000-0000-4000-8000-00000000ba0a", "amount_vnd": 2000000000, "registered_on": "2024-03-12"}') $$,
         :'a', :'owner_a'),
  'a member records a mortgaged certificate with its own holder and bank');
select lives_ok(
  format($$ insert into public.parcels (id, household_id, property_id, certificate_id, parcel_no, area_m2, purposes)
            values ('00000000-0000-4000-8000-0000000d00a1', %L, '00000000-0000-4000-8000-0000000000a1',
                    '00000000-0000-4000-8000-00000000c0a1', '211', 150,
                    '[{"land_use_code": "ODT", "area_m2": 150, "term": "long_term"}, {"land_use_code": "XYZ"}]') $$, :'a'),
  'a member records a parcel on that certificate, with an unknown land use code');
select lives_ok(
  format($$ insert into public.structures (id, household_id, property_id, certificate_id, kind, floor_area_m2, floors)
            values ('00000000-0000-4000-8000-0000000e00a1', %L, '00000000-0000-4000-8000-0000000000a1',
                    '00000000-0000-4000-8000-00000000c0a1', 'Nhà ở riêng lẻ', 120.5, 2) $$, :'a'),
  'a member records a structure on that certificate');
select is((select created_by from public.parcels where id = '00000000-0000-4000-8000-0000000d00a1'), :'member_a'::uuid,
  'created_by is the inserting user');

select throws_ok(
  format($$ insert into public.parcels (household_id, property_id) values (%L, '00000000-0000-4000-8000-0000000000b1') $$, :'a'),
  '23503', null, 'a parcel on another household''s property is refused');
select throws_ok(
  format($$ insert into public.certificates (household_id, property_id, form) values (%L, '00000000-0000-4000-8000-0000000000b1', 'gcn_2024') $$, :'a'),
  '23503', null, 'a certificate on another household''s property is refused');
select throws_ok(
  format($$ insert into public.parcels (household_id, property_id, certificate_id)
            values (%L, '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000c0a1') $$, :'a'),
  '23503', null, 'a parcel linked to another property''s certificate is refused');
select throws_ok(
  format($$ insert into public.structures (household_id, property_id, certificate_id, kind)
            values (%L, '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000c0a1', 'Nhà') $$, :'a'),
  '23503', null, 'a structure linked to another property''s certificate is refused');
select throws_ok(
  format($$ insert into public.certificates (household_id, property_id, form, holder_party_ids)
            values (%L, '00000000-0000-4000-8000-0000000000a2', 'so_hong_pre2009', array[%L::uuid]) $$, :'a', :'owner_b'),
  '23503', null, 'a holder from another household is refused');
select throws_ok(
  format($$ update public.certificates set mortgage = jsonb_set(mortgage, '{bank_party_id}', '"00000000-0000-4000-8000-00000000ba0b"')
            where id = '00000000-0000-4000-8000-00000000c0a1' $$),
  '23503', null, 'a bank from another household is refused');
select throws_ok(
  format($$ insert into public.certificates (household_id, property_id, form, status)
            values (%L, '00000000-0000-4000-8000-0000000000a2', 'gcn_2024', 'mortgaged') $$, :'a'),
  '23514', null, 'mortgaged without a mortgage is refused');
select throws_ok(
  format($$ insert into public.certificates (household_id, property_id, form, mortgage)
            values (%L, '00000000-0000-4000-8000-0000000000a2', 'gcn_2024',
                    '{"bank_party_id": "00000000-0000-4000-8000-00000000ba0a", "amount_vnd": 5}') $$, :'a'),
  '23514', null, 'an open mortgage on a certificate that is not mortgaged is refused');
select lives_ok(
  format($$ insert into public.certificates (household_id, property_id, form, mortgage)
            values (%L, '00000000-0000-4000-8000-0000000000a2', 'gcn_2024',
                    '{"bank_party_id": "00000000-0000-4000-8000-00000000ba0a", "amount_vnd": 5, "released_on": "2025-01-01"}') $$, :'a'),
  'a released mortgage stays on a valid certificate');
select throws_ok(
  format($$ insert into public.certificates (household_id, property_id, form, status, mortgage)
            values (%L, '00000000-0000-4000-8000-0000000000a2', 'gcn_2024', 'mortgaged',
                    '{"bank_party_id": "00000000-0000-4000-8000-00000000ba0a", "amount_vnd": 1.5}') $$, :'a'),
  '23514', null, 'a mortgage amount with a fraction is refused');
select throws_ok(
  format($$ insert into public.certificates (household_id, property_id, form, status, mortgage)
            values (%L, '00000000-0000-4000-8000-0000000000a2', 'gcn_2024', 'mortgaged',
                    '{"bank_party_id": "00000000-0000-4000-8000-00000000ba0a", "amount_vnd": "2000000000"}') $$, :'a'),
  '23514', null, 'a mortgage amount given as text is refused');
select throws_ok(
  format($$ insert into public.parcels (household_id, property_id, purposes)
            values (%L, '00000000-0000-4000-8000-0000000000a2', '[{"land_use_code": " ", "area_m2": 10}]') $$, :'a'),
  '23514', null, 'a purpose with a blank code is refused');
select throws_ok(
  format($$ insert into public.parcels (household_id, property_id, purposes)
            values (%L, '00000000-0000-4000-8000-0000000000a2', '[{"land_use_code": "ODT", "area_m2": 10.555}]') $$, :'a'),
  '23514', null, 'a purpose area with three decimals is refused');
select throws_ok(
  format($$ insert into public.parcels (household_id, property_id, area_m2) values (%L, '00000000-0000-4000-8000-0000000000a2', 0) $$, :'a'),
  '23514', null, 'a parcel area of 0 is refused');
select throws_ok(
  format($$ update public.certificates set annotations = '[{"text": "Thế chấp", "kind": "pledge"}]'
            where id = '00000000-0000-4000-8000-00000000c0a1' $$),
  '23514', null, 'an annotation kind outside the list is refused');

select tests.sees_household('public.certificates', :'a', true);
select tests.sees_household('public.certificates', :'b', false);
select tests.cannot_write('public.certificates', :'b',
  format($$ insert into public.certificates (household_id, property_id, form) values (%L, '00000000-0000-4000-8000-0000000000b1', 'gcn_2024') $$, :'b'));
select tests.sees_household('public.parcels', :'a', true);
select tests.sees_household('public.parcels', :'b', false);
select tests.cannot_write('public.parcels', :'b',
  format($$ insert into public.parcels (household_id, property_id) values (%L, '00000000-0000-4000-8000-0000000000b1') $$, :'b'));
select tests.sees_household('public.structures', :'a', true);
select tests.sees_household('public.structures', :'b', false);
select tests.cannot_write('public.structures', :'b',
  format($$ insert into public.structures (household_id, property_id, kind) values (%L, '00000000-0000-4000-8000-0000000000b1', 'Nhà') $$, :'b'));

select tests.act_as('viewer.a@test.esta.test');
select tests.sees_household('public.certificates', :'a', true);
select tests.sees_household('public.parcels', :'a', true);
select tests.sees_household('public.structures', :'a', true);
select tests.cannot_write('public.certificates', :'a',
  format($$ insert into public.certificates (household_id, property_id, form) values (%L, '00000000-0000-4000-8000-0000000000a2', 'gcn_2024') $$, :'a'));
select tests.cannot_write('public.parcels', :'a',
  format($$ insert into public.parcels (household_id, property_id) values (%L, '00000000-0000-4000-8000-0000000000a2') $$, :'a'));
select tests.cannot_write('public.structures', :'a',
  format($$ insert into public.structures (household_id, property_id, kind) values (%L, '00000000-0000-4000-8000-0000000000a2', 'Nhà') $$, :'a'));

select tests.act_as('member.a@test.esta.test');
select lives_ok($$ delete from public.parcels where id = '00000000-0000-4000-8000-0000000d00a1' $$, 'a member deletes a parcel');
select results_eq(
  $$ select action, actor_kind, actor_id from legal_audit where row_id = '00000000-0000-4000-8000-0000000d00a1' and action = 'delete' $$,
  format($$ values ('delete', 'user', %L) $$, :'member_a'),
  'the delete writes one delete audit row naming the user');
select lives_ok($$ delete from public.certificates where id = '00000000-0000-4000-8000-00000000c0a1' $$, 'a member deletes a certificate');
select is((select certificate_id from public.structures where id = '00000000-0000-4000-8000-0000000e00a1'), null::uuid,
  'deleting the certificate unlinks its structure and keeps it');

select throws_ok(
  format($$ insert into public.certificates (household_id, property_id, form, holder_party_ids)
            values (%L, '00000000-0000-4000-8000-0000000000b1', 'gcn_2024', array[%L::uuid]) $$, :'b', :'owner_b'),
  '42501', null, 'a non-member naming a holder that exists in the other household gets the RLS refusal');
select throws_ok(
  format($$ insert into public.certificates (household_id, property_id, form, holder_party_ids)
            values (%L, '00000000-0000-4000-8000-0000000000b1', 'gcn_2024', array[gen_random_uuid()]) $$, :'b'),
  '42501', null, 'a non-member naming a random holder id gets the same refusal');
select throws_ok(
  format($$ insert into public.certificates (household_id, property_id, form, status, mortgage)
            values (%L, '00000000-0000-4000-8000-0000000000b1', 'gcn_2024', 'mortgaged',
                    '{"bank_party_id": "00000000-0000-4000-8000-00000000ba0b", "amount_vnd": 5}') $$, :'b'),
  '42501', null, 'a non-member naming a bank that exists in the other household gets the same refusal');

select lives_ok(
  format($$ insert into public.certificates (id, household_id, property_id, form, verified_by, verified_at)
            values ('00000000-0000-4000-8000-00000000c0a7', %L, '00000000-0000-4000-8000-0000000000a2', 'gcn_2024',
                    %L, '2001-01-01T00:00:00Z') $$, :'a', :'member_b'),
  'a member inserts a verified certificate with a forged verifier and time');
select results_eq(
  $$ select verified_by, verified_at from public.certificates where id = '00000000-0000-4000-8000-00000000c0a7' $$,
  format($$ values (%L::uuid, '2026-10-07T09:00:00+07:00'::timestamptz) $$, :'member_a'),
  'an insert marked verified is stamped with the inserting user and the clock');
select lives_ok(
  format($$ insert into public.certificates (id, household_id, property_id, form, verified_by)
            values ('00000000-0000-4000-8000-00000000c0a8', %L, '00000000-0000-4000-8000-0000000000a2', 'gcn_2024', %L) $$,
         :'a', :'member_b'),
  'a member inserts an unverified certificate with a forged verifier');
select results_eq(
  $$ select verified_by, verified_at from public.certificates where id = '00000000-0000-4000-8000-00000000c0a8' $$,
  $$ values (null::uuid, null::timestamptz) $$,
  'an unverified insert keeps no verifier');
update public.certificates set verified_at = '2001-01-01T00:00:00Z', verified_by = :'member_b'
  where id = '00000000-0000-4000-8000-00000000c0a8';
select results_eq(
  $$ select verified_by, verified_at from public.certificates where id = '00000000-0000-4000-8000-00000000c0a8' $$,
  format($$ values (%L::uuid, '2026-10-07T09:00:00+07:00'::timestamptz) $$, :'member_a'),
  'flipping to verified stamps the updating user and the clock, ignoring the client values');
update public.certificates set verified_at = '2001-01-01T00:00:00Z', verified_by = :'member_b'
  where id = '00000000-0000-4000-8000-00000000c0a7';
select results_eq(
  $$ select verified_by, verified_at from public.certificates where id = '00000000-0000-4000-8000-00000000c0a7' $$,
  format($$ values (%L::uuid, '2026-10-07T09:00:00+07:00'::timestamptz) $$, :'member_a'),
  'a verified certificate keeps its stamp against a forged verifier and time');
update public.certificates set verified_at = null where id = '00000000-0000-4000-8000-00000000c0a7';
select results_eq(
  $$ select verified_by, verified_at from public.certificates where id = '00000000-0000-4000-8000-00000000c0a7' $$,
  $$ values (null::uuid, null::timestamptz) $$,
  'flipping to unverified clears the verifier and the time');

select tests.act_as_service('{"x-esta-actor": "agent:extract"}');
update public.certificates set verified_by = :'member_b', verified_at = '2001-01-01T00:00:00Z'
  where id = '00000000-0000-4000-8000-00000000c0a7';
select results_eq(
  $$ select verified_by, verified_at from public.certificates where id = '00000000-0000-4000-8000-00000000c0a7' $$,
  format($$ values (%L::uuid, '2001-01-01T00:00:00Z'::timestamptz) $$, :'member_b'),
  'a service-role write sets the verifier and the time it names');

select * from finish();
rollback;
