begin;
\ir _harness.psql

select plan(16);

select tests.create_household('a') as a \gset

select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental'),
  ('00000000-0000-4000-8000-0000000000a2', :'a', 'Nhà trong thùng rác', 'TRASH', 'townhouse', 'rental');
insert into public.units (id, household_id, property_id, label, kind) values
  ('00000000-0000-4000-8000-000000000a11', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 1', 'room'),
  ('00000000-0000-4000-8000-000000000a12', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 2', 'room'),
  ('00000000-0000-4000-8000-000000000a21', :'a', '00000000-0000-4000-8000-0000000000a2', 'Phòng T', 'room');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000a0a1', :'a', 'individual', 'Lê Văn Demo', array['tenant']);
insert into private.local_stack default values on conflict do nothing;
insert into public.test_clock (id, frozen_now) values (true, '2026-10-07T09:00:00+07:00')
  on conflict (id) do update set frozen_now = excluded.frozen_now;

insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, status) values
  ('00000000-0000-4000-8000-00000000e001', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a11',
   '00000000-0000-4000-8000-00000000a0a1', '2026-01-01', '2026-06-30', 3000000, 'active');

select tests.act_as_service('{"x-esta-actor": "system:test"}');

select throws_ok(
  format($$ insert into public.leases (household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, status)
            values (%L, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a11',
                    '00000000-0000-4000-8000-00000000a0a1', '2026-06-30', '2026-12-31', 3000000, 'active') $$, :'a'),
  '23P01', 'conflicting key value violates exclusion constraint "leases_room_one_holder"', 'the service role cannot write a second active lease that shares a day on the room');
select throws_ok(
  format($$ insert into public.leases (household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, status, terminated_on)
            values (%L, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a11',
                    '00000000-0000-4000-8000-00000000a0a1', '2026-03-01', '2026-03-31', 3000000, 'terminated', '2026-03-31') $$, :'a'),
  '23P01', 'conflicting key value violates exclusion constraint "leases_room_one_holder"', 'a terminated lease inside an active one overlaps it');
select lives_ok(
  format($$ insert into public.leases (household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, status)
            values (%L, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a11',
                    '00000000-0000-4000-8000-00000000a0a1', '2026-07-01', null, 3000000, 'active') $$, :'a'),
  'the next lease may start the day after the last one ends');
select lives_ok(
  format($$ insert into public.leases (household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, status)
            values (%L, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a11',
                    '00000000-0000-4000-8000-00000000a0a1', '2026-02-01', '2026-02-28', 3000000, 'draft') $$, :'a'),
  'drafts hold no room, so a draft may overlap');
select lives_ok(
  format($$ insert into public.leases (household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, status)
            values (%L, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a11',
                    '00000000-0000-4000-8000-00000000a0a1', '2025-01-01', '2025-12-31', 3000000, 'ended') $$, :'a'),
  'an ended lease on the room does not block');

reset role;
select tests.clear_request();
insert into public.invoices (id, household_id, lease_id, period_start, period_end, due_date, issue_on) values
  ('00000000-0000-4000-8000-0000000f0001', :'a', '00000000-0000-4000-8000-00000000e001', '2026-01-01', '2026-03-31', '2026-01-01', '2026-01-01');
select throws_ok(
  format($$ insert into public.invoices (household_id, lease_id, period_start, period_end, due_date, issue_on)
            values (%L, '00000000-0000-4000-8000-00000000e001', '2026-03-01', '2026-03-31', '2026-03-01', '2026-03-01') $$, :'a'),
  '23P01', 'conflicting key value violates exclusion constraint "invoices_lease_one_bill_per_day"', 'a bill that starts inside another bill of the lease is refused by the database');
select lives_ok(
  format($$ insert into public.invoices (household_id, lease_id, period_start, period_end, due_date, issue_on)
            values (%L, '00000000-0000-4000-8000-00000000e001', '2026-04-01', '2026-04-30', '2026-04-01', '2026-04-01') $$, :'a'),
  'the next stretch is accepted');
select throws_ok(
  format($$ insert into public.invoices (household_id, lease_id, period_start, period_end, due_date, issue_on)
            values (%L, '00000000-0000-4000-8000-00000000e001', '2025-12-15', '2026-01-15', '2025-12-15', '2025-12-15') $$, :'a'),
  '23P01', 'conflicting key value violates exclusion constraint "invoices_lease_one_bill_per_day"', 'a bill that reaches into the first one from before is refused');

update public.invoices set status = 'issued', issued_at = '2026-01-01T00:30:00+07:00' where id = '00000000-0000-4000-8000-0000000f0001';
update public.invoices set status = 'void', voided_reason = 'Nhập nhầm' where id = '00000000-0000-4000-8000-0000000f0001';
select throws_ok(
  format($$ insert into public.invoices (household_id, lease_id, period_start, period_end, due_date, issue_on)
            values (%L, '00000000-0000-4000-8000-00000000e001', '2026-02-01', '2026-02-28', '2026-02-01', '2026-02-01') $$, :'a'),
  '23P01', 'conflicting key value violates exclusion constraint "invoices_lease_one_bill_per_day"', 'a void bill still holds its stretch, so the nightly job never bills it again');
select is(
  (select drafted from private.issue_invoices('00000000-0000-4000-8000-00000000e001', '2026-02-15', '2026-02-15T00:00:00Z')),
  0, 'issue_invoices skips February and March, which the void bill holds, and April, which is already billed');
select is((select count(*)::int from public.invoices where lease_id = '00000000-0000-4000-8000-00000000e001'), 2, 'and writes no bill');
select is(
  (select drafted from private.issue_invoices('00000000-0000-4000-8000-00000000e001', '2026-05-10', '2026-05-10T00:00:00Z')),
  2, 'a later night drafts May and June');

-- Activation checks the bills Ryan was shown, and refuses a lease whose property is in the trash.
insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, status) values
  ('00000000-0000-4000-8000-00000000e002', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a12',
   '00000000-0000-4000-8000-00000000a0a1', '2026-10-01', '2027-09-30', 3000000, 'draft'),
  ('00000000-0000-4000-8000-00000000e003', :'a', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000a21',
   '00000000-0000-4000-8000-00000000a0a1', '2026-10-01', '2027-09-30', 3000000, 'draft');
update public.properties set deleted_at = '2026-10-06T00:00:00Z' where id = '00000000-0000-4000-8000-0000000000a2';
select tests.act_as('member.a@test.esta.test');
select throws_ok(
  $$ select * from public.activate_lease('00000000-0000-4000-8000-00000000e002', null,
       '[{"period_start": "2026-10-01", "period_end": "2026-10-31", "due_date": "2026-10-01", "rent_vnd": 2500000, "issues_now": true}]'::jsonb) $$,
  '40001', 'ESTA_ACTIVATION_BILLS_CHANGED', 'bills that differ from the ones shown stop the activation');
select is((select status from public.leases where id = '00000000-0000-4000-8000-00000000e002'), 'draft', 'and the lease stays a draft');
select throws_ok(
  $$ select * from public.activate_lease('00000000-0000-4000-8000-00000000e003', null) $$,
  'P0002', 'ESTA_PROPERTY_NOT_FOUND', 'a lease whose property is in the trash cannot start');
select lives_ok(
  $$ select * from public.activate_lease('00000000-0000-4000-8000-00000000e002', null,
       (select coalesce(jsonb_agg(jsonb_build_object('period_start', p.period_start, 'period_end', p.period_end, 'due_date', p.due_date,
          'rent_vnd', p.rent_vnd, 'issues_now', p.issues_now) order by p.period_start), '[]')
        from public.preview_activation('00000000-0000-4000-8000-00000000e002', null) p)) $$,
  'the bills as shown start the lease');

select * from finish();
rollback;
