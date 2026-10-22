begin;
\ir _harness.psql

select plan(14);

select tests.create_household('a') as a, tests.create_household('b') as b \gset

select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental'),
  ('00000000-0000-4000-8000-0000000000a2', :'a', 'Nhà phố Q7', 'Q7', 'townhouse', 'rental'),
  ('00000000-0000-4000-8000-0000000000b1', :'b', 'Nhà B', 'B1', 'rooming_house', 'rental');
insert into public.units (id, household_id, property_id, label, kind) values
  ('00000000-0000-4000-8000-000000000a17', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 7', 'room'),
  ('00000000-0000-4000-8000-000000000a18', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 8', 'room'),
  ('00000000-0000-4000-8000-000000000b11', :'b', '00000000-0000-4000-8000-0000000000b1', 'Phòng 1', 'room');
insert into public.documents (id, household_id, property_id, category, title, storage_path, mime, size_bytes, sha256, sensitivity) values
  ('00000000-0000-4000-8000-00000000d0a8', :'a', '00000000-0000-4000-8000-0000000000a1', 'lease_contract', 'Hợp đồng Phòng 8',
   :'a' || '/00000000-0000-4000-8000-00000000d0a8/hop-dong.jpg', 'image/jpeg', 1000, repeat('8', 64), 'normal'),
  ('00000000-0000-4000-8000-00000000d0a7', :'a', '00000000-0000-4000-8000-0000000000a2', 'lease_contract', 'Hợp đồng Q7',
   :'a' || '/00000000-0000-4000-8000-00000000d0a7/hop-dong.jpg', 'image/jpeg', 1000, repeat('7', 64), 'normal'),
  ('00000000-0000-4000-8000-00000000d0a9', :'a', '00000000-0000-4000-8000-0000000000a1', 'insurance', 'Bảo hiểm Dĩ An',
   :'a' || '/00000000-0000-4000-8000-00000000d0a9/bao-hiem.pdf', 'application/pdf', 1000, repeat('9', 64), 'normal'),
  ('00000000-0000-4000-8000-00000000d0b1', :'b', '00000000-0000-4000-8000-0000000000b1', 'lease_contract', 'Hợp đồng B',
   :'b' || '/00000000-0000-4000-8000-00000000d0b1/hop-dong.jpg', 'image/jpeg', 1000, repeat('b', 64), 'normal');

select tests.act_as('member.a@test.esta.test');

select is(
  public.enqueue_extract_document('00000000-0000-4000-8000-00000000d0a8', '2026-10-07T09:00:00+07:00') is not null,
  true, 'a lease contract upload queues an extraction');
select is(
  (select schema_name from public.document_extractions where document_id = '00000000-0000-4000-8000-00000000d0a8'),
  'lease_v1', 'it is read with lease_v1');

\set draft '{"property_id": "00000000-0000-4000-8000-0000000000a1", "unit_id": "00000000-0000-4000-8000-000000000a18", "tenant_party_id": null, "start_date": "2026-10-15", "end_date": "2027-10-14", "rent_vnd": 3500000, "billing_cycle_months": 1, "period_anchor": "calendar_month", "first_period_proration": "by_days", "deposit_vnd": 3500000, "escalation": {"kind": "none"}, "utilities_mode": "metered_by_owner", "tax_payer": "owner", "notice_days": 30}'

select throws_ok(
  format($$ select public.create_lease(%L, '00000000-0000-4000-8000-00000000e0a1', %L, '00000000-0000-4000-8000-00000000d0a7') $$, :'a', :'draft'),
  '23514', 'ESTA_LEASE_DOCUMENT', 'a contract filed on another property is refused');
select throws_ok(
  format($$ select public.create_lease(%L, '00000000-0000-4000-8000-00000000e0a1', %L, '00000000-0000-4000-8000-00000000d0a9') $$, :'a', :'draft'),
  '23514', 'ESTA_LEASE_DOCUMENT', 'a document that is not a lease contract is refused');
select throws_ok(
  format($$ select public.create_lease(%L, '00000000-0000-4000-8000-00000000e0a1', %L, '00000000-0000-4000-8000-00000000d0b1') $$, :'a', :'draft'),
  '23514', 'ESTA_LEASE_DOCUMENT', 'another household''s contract is refused');
select is((select count(*)::int from public.leases where id = '00000000-0000-4000-8000-00000000e0a1'), 0, 'a refused link leaves no lease behind');

select lives_ok(
  format($$ select public.create_lease(%L, '00000000-0000-4000-8000-00000000e0a1', %L, '00000000-0000-4000-8000-00000000d0a8') $$, :'a', :'draft'),
  'a member creates the Phòng 8 draft from its contract');
select results_eq(
  $$ select status, unit_id, start_date, end_date, rent_vnd, deposit_vnd, due_offset_days, paid_through_date, utilities_mode
     from public.leases where id = '00000000-0000-4000-8000-00000000e0a1' $$,
  $$ values ('draft', '00000000-0000-4000-8000-000000000a18'::uuid, date '2026-10-15', date '2027-10-14', 3500000::bigint, 3500000::bigint,
             0::smallint, null::date, 'metered_by_owner') $$,
  'the draft holds the terms as given');
select is(
  (select lease_id from public.documents where id = '00000000-0000-4000-8000-00000000d0a8'),
  '00000000-0000-4000-8000-00000000e0a1'::uuid, 'the contract now belongs to the lease');
select is(
  (select created_by from public.leases where id = '00000000-0000-4000-8000-00000000e0a1'),
  tests.user_id('member.a@test.esta.test'), 'the lease is stamped with the member who created it');

select throws_ok(
  format($$ select public.create_lease(%L, '00000000-0000-4000-8000-00000000e0a2', %L, '00000000-0000-4000-8000-00000000d0a8') $$,
         :'a', jsonb_set(:'draft'::jsonb, '{unit_id}', '"00000000-0000-4000-8000-000000000a17"')),
  '23514', 'ESTA_LEASE_DOCUMENT', 'a contract that already belongs to a lease is refused for a second one');
select lives_ok(
  format($$ select public.create_lease(%L, '00000000-0000-4000-8000-00000000e0a3', %L) $$, :'a', jsonb_set(:'draft'::jsonb, '{unit_id}', '"00000000-0000-4000-8000-000000000a17"')),
  'without a document it saves a plain draft');

select tests.act_as('viewer.a@test.esta.test');
select throws_ok(
  format($$ select public.create_lease(%L, '00000000-0000-4000-8000-00000000e0a4', %L) $$, :'a', jsonb_set(:'draft'::jsonb, '{unit_id}', '"00000000-0000-4000-8000-000000000a17"')),
  '42501', null, 'a viewer cannot create a lease through it');

select tests.act_as('member.b@test.esta.test');
select throws_ok(
  format($$ select public.create_lease(%L, '00000000-0000-4000-8000-00000000e0b2', %L) $$, :'a', jsonb_set(:'draft'::jsonb, '{unit_id}', '"00000000-0000-4000-8000-000000000a17"')),
  '42501', null, 'a member of another household cannot create a lease in household a');

select * from finish();
rollback;
