begin;
\ir _harness.psql

select plan(36);

select tests.create_household('a') as a, tests.create_household('b') as b, tests.create_household('c') as c \gset

-- Household a holds the SPEC §9.3 shapes the nightly run meets on 02/11/2026: Thủ Đức's last day is 01/11 and its
-- one-day draft waits for that day, Q7 bills by quarter and has paid through 31/12, Dĩ An's Phòng 5 bills from the 25th
-- with owner-metered utilities, Phòng 7's lease ended with a draft still to issue, and Phòng 6 was terminated.
select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental'),
  ('00000000-0000-4000-8000-0000000000a2', :'a', 'Căn hộ Thủ Đức', 'THUDUC', 'apartment', 'rental'),
  ('00000000-0000-4000-8000-0000000000a3', :'a', 'Nhà phố Quận 7', 'Q7', 'townhouse', 'rental'),
  ('00000000-0000-4000-8000-0000000000b1', :'b', 'Nhà B', 'B1', 'townhouse', 'rental');
insert into public.units (id, household_id, property_id, label, kind) values
  ('00000000-0000-4000-8000-000000000a15', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 5', 'room'),
  ('00000000-0000-4000-8000-000000000a16', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 6', 'room'),
  ('00000000-0000-4000-8000-000000000a17', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 7', 'room');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000a0a1', :'a', 'individual', 'Phạm Thị Lan Demo', array['tenant']),
  ('00000000-0000-4000-8000-00000000b0b1', :'b', 'individual', 'Người thuê B', array['tenant']);
insert into public.leases (
  id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, billing_cycle_months, period_anchor,
  due_offset_days, utilities_mode, paid_through_date, status, terminated_on
) values
  ('00000000-0000-4000-8000-00000000e001', :'a', '00000000-0000-4000-8000-0000000000a2', private.whole_unit_id('00000000-0000-4000-8000-0000000000a2'),
   '00000000-0000-4000-8000-00000000a0a1', '2025-11-01', '2026-11-01', 9000000, 1, 'calendar_month', 0, 'tenant_direct', '2026-10-31', 'active', null),
  ('00000000-0000-4000-8000-00000000e002', :'a', '00000000-0000-4000-8000-0000000000a3', private.whole_unit_id('00000000-0000-4000-8000-0000000000a3'),
   '00000000-0000-4000-8000-00000000a0a1', '2025-01-01', '2027-12-31', 15000000, 3, 'calendar_month', 0, 'tenant_direct', '2026-09-30', 'active', null),
  ('00000000-0000-4000-8000-00000000e003', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a15',
   '00000000-0000-4000-8000-00000000a0a1', '2026-02-25', '2027-06-24', 2800000, 1, 'lease_start', 0, 'metered_by_owner', '2026-10-24', 'active', null),
  ('00000000-0000-4000-8000-00000000e004', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a17',
   '00000000-0000-4000-8000-00000000a0a1', '2025-10-25', '2026-10-31', 2800000, 1, 'lease_start', 7, 'metered_by_owner', '2026-10-24', 'ended', null),
  ('00000000-0000-4000-8000-00000000e005', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a16',
   '00000000-0000-4000-8000-00000000a0a1', '2025-06-25', '2026-10-20', 2800000, 1, 'lease_start', 0, 'metered_by_owner', '2026-10-24', 'terminated', '2026-10-20'),
  ('00000000-0000-4000-8000-00000000e0b1', :'b', '00000000-0000-4000-8000-0000000000b1', private.whole_unit_id('00000000-0000-4000-8000-0000000000b1'),
   '00000000-0000-4000-8000-00000000b0b1', '2026-01-01', null, 9000000, 1, 'calendar_month', 0, 'tenant_direct', '2026-10-31', 'active', null);
insert into public.invoices (id, household_id, lease_id, period_start, period_end, due_date, issue_on, status, issued_at) values
  ('00000000-0000-4000-8000-0000000f0001', :'a', '00000000-0000-4000-8000-00000000e001', '2026-11-01', '2026-11-01', '2026-11-01', '2026-11-01', 'draft', null),
  ('00000000-0000-4000-8000-0000000f0002', :'a', '00000000-0000-4000-8000-00000000e002', '2026-10-01', '2026-12-31', '2026-10-01', '2026-10-01', 'issued', '2026-10-01T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0003', :'a', '00000000-0000-4000-8000-00000000e003', '2026-10-25', '2026-11-24', '2026-10-25', '2026-10-03', 'issued', '2026-10-03T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0004', :'a', '00000000-0000-4000-8000-00000000e004', '2026-10-25', '2026-10-31', '2026-11-01', '2026-11-01', 'draft', null),
  ('00000000-0000-4000-8000-0000000f0005', :'a', '00000000-0000-4000-8000-00000000e005', '2026-10-25', '2026-11-24', '2026-10-25', '2026-10-25', 'draft', null);
insert into public.invoice_lines (household_id, invoice_id, kind, unit_price_vnd, amount_vnd) values
  (:'a', '00000000-0000-4000-8000-0000000f0001', 'rent', 290323, 290323),
  (:'a', '00000000-0000-4000-8000-0000000f0002', 'rent', 45000000, 45000000),
  (:'a', '00000000-0000-4000-8000-0000000f0003', 'rent', 2800000, 2800000),
  (:'a', '00000000-0000-4000-8000-0000000f0004', 'rent', 632258, 632258),
  (:'a', '00000000-0000-4000-8000-0000000f0005', 'rent', 2800000, 2800000);

-- Household c holds ended leases the run must not bill past their end. Phòng 1 C reaches its last day on 31/10 with a
-- 10-day due offset, so its last draft issues on 04/11, after the lease has ended; a stray draft starts after that last
-- day. A member set Phòng 2 C to ended with a direct write before its 24/06/2027 end date (round 1 found the run then
-- billed its later periods), and Phòng 3 C, which has no end date, the same way.
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000c1', :'c', 'Dãy trọ Demo C', 'DEMOC', 'rooming_house', 'rental');
insert into public.units (id, household_id, property_id, label, kind) values
  ('00000000-0000-4000-8000-000000000c11', :'c', '00000000-0000-4000-8000-0000000000c1', 'Phòng 1 C', 'room'),
  ('00000000-0000-4000-8000-000000000c12', :'c', '00000000-0000-4000-8000-0000000000c1', 'Phòng 2 C', 'room'),
  ('00000000-0000-4000-8000-000000000c13', :'c', '00000000-0000-4000-8000-0000000000c1', 'Phòng 3 C', 'room');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000c0c1', :'c', 'individual', 'Trần Văn Demo C', array['tenant']);
insert into public.leases (
  id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, billing_cycle_months, period_anchor,
  due_offset_days, utilities_mode, paid_through_date, status
) values
  ('00000000-0000-4000-8000-00000000ec01', :'c', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000c11',
   '00000000-0000-4000-8000-00000000c0c1', '2026-01-25', '2026-10-31', 3100000, 1, 'lease_start', 10, 'metered_by_owner', '2026-10-24', 'active'),
  ('00000000-0000-4000-8000-00000000ec02', :'c', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000c12',
   '00000000-0000-4000-8000-00000000c0c1', '2026-02-25', '2027-06-24', 2800000, 1, 'lease_start', 0, 'metered_by_owner', '2026-10-24', 'ended'),
  ('00000000-0000-4000-8000-00000000ec03', :'c', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000c13',
   '00000000-0000-4000-8000-00000000c0c1', '2026-01-01', null, 2500000, 1, 'calendar_month', 0, 'tenant_direct', '2026-10-31', 'ended');
insert into public.invoices (id, household_id, lease_id, period_start, period_end, due_date, issue_on, status, issued_at) values
  ('00000000-0000-4000-8000-0000000fc011', :'c', '00000000-0000-4000-8000-00000000ec01', '2026-10-25', '2026-10-31', '2026-11-04', '2026-11-04', 'draft', null),
  ('00000000-0000-4000-8000-0000000fc012', :'c', '00000000-0000-4000-8000-00000000ec01', '2026-11-01', '2026-11-24', '2026-11-01', '2026-11-01', 'draft', null),
  ('00000000-0000-4000-8000-0000000fc021', :'c', '00000000-0000-4000-8000-00000000ec02', '2026-10-25', '2026-11-24', '2026-10-25', '2026-10-25', 'draft', null),
  ('00000000-0000-4000-8000-0000000fc031', :'c', '00000000-0000-4000-8000-00000000ec03', '2026-11-01', '2026-11-30', '2026-11-01', '2026-11-01', 'draft', null);
insert into public.invoice_lines (household_id, invoice_id, kind, unit_price_vnd, amount_vnd) values
  (:'c', '00000000-0000-4000-8000-0000000fc011', 'rent', 700000, 700000),
  (:'c', '00000000-0000-4000-8000-0000000fc012', 'rent', 2400000, 2400000),
  (:'c', '00000000-0000-4000-8000-0000000fc021', 'rent', 2800000, 2800000),
  (:'c', '00000000-0000-4000-8000-0000000fc031', 'rent', 2500000, 2500000);

select ok(not has_function_privilege('anon', 'public.run_invoicing(uuid, date, timestamptz)', 'execute'), 'anon cannot run invoicing');
select ok(not has_function_privilege('authenticated', 'public.run_invoicing(uuid, date, timestamptz)', 'execute'), 'a member cannot run invoicing');
select ok(has_function_privilege('service_role', 'public.run_invoicing(uuid, date, timestamptz)', 'execute'), 'the cron''s service role runs invoicing');
select ok(not has_function_privilege('anon', 'public.end_expired_leases(date)', 'execute'), 'anon cannot end leases');
select ok(not has_function_privilege('authenticated', 'public.end_expired_leases(date)', 'execute'), 'a member cannot end leases in bulk');
select ok(has_function_privilege('service_role', 'public.end_expired_leases(date)', 'execute'), 'the cron''s service role ends leases');
select ok(not has_function_privilege('authenticated', 'private.issue_invoices(uuid, date, timestamptz)', 'execute'), 'a member cannot call issuance directly');
select is_empty(
  $$ select p.oid::regprocedure from pg_proc p
     where p.oid in ('public.run_invoicing(uuid, date, timestamptz)'::regprocedure, 'public.end_expired_leases(date)'::regprocedure,
                     'private.issue_invoices(uuid, date, timestamptz)'::regprocedure, 'private.plan_invoices(public.leases, date)'::regprocedure)
       and p.prosrc ~* '\m(now|current_date|current_timestamp|localtimestamp|clock_timestamp|statement_timestamp|transaction_timestamp)\M' $$,
  'the cron''s functions read no clock: every date comes from p_as_of and p_issued_at');

select coalesce(max(id), 0) as audit_before from public.audit_log \gset
select tests.act_as_service('{"x-esta-actor": "system:cron"}');

select throws_ok(
  $$ select * from public.run_invoicing(null, '2026-11-02', '2026-11-02T09:00:00+07:00') $$,
  '22004', 'ESTA_CRON_ARGUMENTS', 'a run without its household is refused');
select throws_ok($$ select public.end_expired_leases(null) $$, '22004', 'ESTA_CRON_ARGUMENTS', 'ending leases without a date is refused');

select results_eq(
  format($$ select drafted, issued from public.run_invoicing(%L, '2026-11-02', '2026-11-02T09:00:00+07:00') $$, :'a'),
  $$ values (1, 2) $$,
  'on 02/11/2026 the run drafts one period and issues the two drafts whose day has come');
select results_eq(
  $$ select i.period_end, i.due_date, i.issue_on, i.status, l.kind, l.amount_vnd
     from public.invoices i join public.invoice_lines l on l.invoice_id = i.id
     where i.lease_id = '00000000-0000-4000-8000-00000000e003' and i.period_start = '2026-11-25' $$,
  $$ values ('2026-12-24'::date, '2026-11-25'::date, '2026-11-25'::date, 'draft'::text, 'rent'::text, 2800000::bigint) $$,
  'Phòng 5''s period from 25/11 waits as a draft with its rent line, since it issues on its due date without readings');
select results_eq(
  $$ select id, status, issued_at from public.invoices where id in ('00000000-0000-4000-8000-0000000f0001', '00000000-0000-4000-8000-0000000f0004') order by id $$,
  $$ values ('00000000-0000-4000-8000-0000000f0001'::uuid, 'issued'::text, '2026-11-02T09:00:00+07:00'::timestamptz),
            ('00000000-0000-4000-8000-0000000f0004'::uuid, 'issued'::text, '2026-11-02T09:00:00+07:00'::timestamptz) $$,
  'Thủ Đức''s 01/11 draft and the ended lease''s last draft issue at the run''s instant');
select is((select status from public.invoices where id = '00000000-0000-4000-8000-0000000f0005'), 'draft',
  'a terminated lease never issues a draft that starts after its end');
select results_eq(
  $$ select id, issued_at from public.invoices where id in ('00000000-0000-4000-8000-0000000f0002', '00000000-0000-4000-8000-0000000f0003') order by id $$,
  $$ values ('00000000-0000-4000-8000-0000000f0002'::uuid, '2026-10-01T00:30:00+07:00'::timestamptz),
            ('00000000-0000-4000-8000-0000000f0003'::uuid, '2026-10-03T00:30:00+07:00'::timestamptz) $$,
  'issued invoices keep their issue time');
select is((select count(*)::integer from public.invoices where lease_id = '00000000-0000-4000-8000-00000000e002'), 1,
  'Q7, paid through 31/12, gets nothing new on 02/11');
select is_empty(format($$ select 1 from public.invoices where household_id = %L $$, :'b'), 'another household''s lease is not touched');
select results_eq(
  format($$ select distinct actor_kind, actor_id from public.audit_log where id > %s and table_name in ('invoices', 'invoice_lines') $$, :audit_before),
  $$ values ('system'::text, 'cron'::text) $$,
  'every invoice row the run wrote names system:cron in the audit log');

select count(*) as invoices_after_first from public.invoices \gset
select results_eq(
  format($$ select drafted, issued from public.run_invoicing(%L, '2026-11-02', '2026-11-02T10:00:00+07:00') $$, :'a'),
  $$ values (0, 0) $$,
  'a second run on 02/11 drafts and issues nothing (SPEC §7.4)');
select is((select count(*) from public.invoices), :'invoices_after_first'::bigint, 'and the invoice count is unchanged');
select is((select issued_at from public.invoices where id = '00000000-0000-4000-8000-0000000f0001'), '2026-11-02T09:00:00+07:00'::timestamptz,
  'and the invoice it issued keeps the first run''s time');

-- end_expired_leases covers every household, so the seeded ones on this stack count too.
select count(*) filter (where end_date < '2026-11-01') as expiring_nov1, count(*) filter (where end_date < '2026-11-02') as expiring_nov2
from public.leases where status = 'active' \gset
select is(public.end_expired_leases('2026-11-01'), :expiring_nov1, 'on 01/11 Thủ Đức''s last day has not passed');
select is(public.end_expired_leases('2026-11-02'), :expiring_nov2 - :expiring_nov1, 'on 02/11 Thủ Đức''s lease ends with every other lease past its last day');
select results_eq(
  format($$ select id, status from public.leases where household_id in (%L, %L) order by id $$, :'a', :'b'),
  $$ values ('00000000-0000-4000-8000-00000000e001'::uuid, 'ended'::text), ('00000000-0000-4000-8000-00000000e002'::uuid, 'active'::text),
            ('00000000-0000-4000-8000-00000000e003'::uuid, 'active'::text), ('00000000-0000-4000-8000-00000000e004'::uuid, 'ended'::text),
            ('00000000-0000-4000-8000-00000000e005'::uuid, 'terminated'::text), ('00000000-0000-4000-8000-00000000e0b1'::uuid, 'active'::text) $$,
  'only Thủ Đức changes: every other lease keeps its status');
select is(public.end_expired_leases('2026-11-02'), 0, 'a second call on 02/11 ends nothing');
select results_eq(
  format($$ select actor_kind, actor_id, diff -> 'status' from public.audit_log where id > %s and table_name = 'leases' and household_id = %L $$, :audit_before, :'a'),
  $$ values ('system'::text, 'cron'::text, '{"old": "active", "new": "ended"}'::jsonb) $$,
  'the audit log records the lease end as system:cron');

select is((select status from public.leases where id = '00000000-0000-4000-8000-00000000ec01'), 'ended',
  'Phòng 1 C''s lease ended on its own once 31/10 passed');
select results_eq(
  format($$ select drafted, issued from public.run_invoicing(%L, '2026-11-04', '2026-11-04T09:00:00+07:00') $$, :'c'),
  $$ values (0, 1) $$,
  'on 04/11 the run in household c issues one draft and drafts nothing for its ended leases');
select is((select issued_at from public.invoices where id = '00000000-0000-4000-8000-0000000fc011'), '2026-11-04T09:00:00+07:00'::timestamptz,
  'Phòng 1 C''s last period, due after the lease ended, issues on its due date');
select is((select status from public.invoices where id = '00000000-0000-4000-8000-0000000fc012'), 'draft',
  'a draft that starts after an ended lease''s last day never issues');
select results_eq(
  $$ select id, status from public.invoices where id in ('00000000-0000-4000-8000-0000000fc021', '00000000-0000-4000-8000-0000000fc031') order by id $$,
  $$ values ('00000000-0000-4000-8000-0000000fc021'::uuid, 'draft'::text), ('00000000-0000-4000-8000-0000000fc031'::uuid, 'draft'::text) $$,
  'a lease set to ended before its end date, or with none, issues nothing new');

select results_eq(
  format($$ select drafted, issued from public.run_invoicing(%L, '2026-12-31', '2026-12-31T09:00:00+07:00') $$, :'a'),
  $$ values (3, 2) $$,
  'on 31/12 the run drafts Q7''s next quarter and Phòng 5''s next two periods, and issues Phòng 5''s two whose day has come');
select results_eq(
  $$ select i.period_start, i.period_end, i.status, l.amount_vnd from public.invoices i join public.invoice_lines l on l.invoice_id = i.id
     where i.lease_id = '00000000-0000-4000-8000-00000000e002' and i.period_start > '2026-12-31' $$,
  $$ values ('2027-01-01'::date, '2027-03-31'::date, 'draft'::text, 45000000::bigint) $$,
  'Q7''s quarter from 01/01/2027 is a draft on 31/12/2026');
select is((select count(*)::integer from public.invoices where lease_id = '00000000-0000-4000-8000-00000000e002' and period_end <= '2026-12-31'), 1,
  'and no new Q7 invoice covers a period on or before 31/12/2026');
select results_eq(
  $$ select period_start, status from public.invoices where lease_id = '00000000-0000-4000-8000-00000000e003' order by period_start $$,
  $$ values ('2026-10-25'::date, 'issued'::text), ('2026-11-25'::date, 'issued'::text), ('2026-12-25'::date, 'issued'::text), ('2027-01-25'::date, 'draft'::text) $$,
  'Phòng 5''s drafts issue on their due dates and the period from 25/01 waits');
select is((select count(*)::integer from public.invoices where lease_id = '00000000-0000-4000-8000-00000000e001'), 1,
  'the ended Thủ Đức lease gets no new invoice');

select * from finish();
rollback;
