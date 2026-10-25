begin;
\ir _harness.psql

select plan(28);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select tests.user_id('member.a@test.esta.test') as member_a \gset

-- Dĩ An's Phòng 2, 3 and 5 by calendar month at 2.500.000 ₫, and Căn hộ Thủ Đức whole at 9.000.000 ₫ to 31/10/2026,
-- collected to its end, on the database clock's 2026-10-07. Phòng 2 is issued through November, so a rent change from
-- 01/11 is billed and one from 01/12 applies.
select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental'),
  ('00000000-0000-4000-8000-0000000000a2', :'a', 'Căn hộ Thủ Đức', 'TDUC', 'apartment', 'rental');
insert into public.units (id, household_id, property_id, label, kind) values
  ('00000000-0000-4000-8000-000000000a12', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 2', 'room'),
  ('00000000-0000-4000-8000-000000000a13', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 3', 'room'),
  ('00000000-0000-4000-8000-000000000a15', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 5', 'room');
select id as whole_unit from public.units where property_id = '00000000-0000-4000-8000-0000000000a2' and kind = 'whole' \gset
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000a0a1', :'a', 'individual', 'Trần Thị Bình Demo', array['tenant']);
insert into public.leases (
  id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, billing_cycle_months, period_anchor,
  paid_through_date, deposit_vnd, status
) values
  ('00000000-0000-4000-8000-00000000e021', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a12',
   '00000000-0000-4000-8000-00000000a0a1', '2026-01-01', '2027-06-30', 2500000, 1, 'calendar_month', '2026-09-30', 2500000, 'active'),
  ('00000000-0000-4000-8000-00000000e031', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a13',
   '00000000-0000-4000-8000-00000000a0a1', '2026-01-01', '2027-06-30', 2500000, 1, 'calendar_month', '2026-09-30', 2500000, 'active'),
  ('00000000-0000-4000-8000-00000000e051', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a15',
   '00000000-0000-4000-8000-00000000a0a1', '2026-01-01', '2027-06-30', 2500000, 1, 'calendar_month', '2026-09-30', 2500000, 'active'),
  ('00000000-0000-4000-8000-00000000e211', :'a', '00000000-0000-4000-8000-0000000000a2', :'whole_unit',
   '00000000-0000-4000-8000-00000000a0a1', '2025-11-01', '2026-10-31', 9000000, 1, 'calendar_month', '2026-10-31', 9000000, 'active');

insert into private.local_stack default values on conflict do nothing;
insert into public.test_clock (id, frozen_now) values (true, '2026-10-07T09:00:00+07:00')
  on conflict (id) do update set frozen_now = excluded.frozen_now;
select private.issue_invoices(l.id, '2026-10-07', now()) from public.leases l where l.household_id = :'a' and l.status = 'active';
-- Phòng 2's November bill went out early, as Dĩ An's meter entry issues it in SPEC §9.3.
select private.issue_invoice(i.id, '2026-10-07', now()) from public.invoices i
where i.lease_id = '00000000-0000-4000-8000-00000000e021' and i.period_start = '2026-11-01' and i.status = 'draft';

-- The worker's proposals, through create_proposal's service role.
select tests.act_as_service('{"x-esta-actor": "agent:test-worker"}');
insert into public.agent_items (id, household_id, kind, severity, title, dedupe_key, proposal)
select id::uuid, :'a', 'proposal', 'info', title, 'proposal:' || id, jsonb_build_object('type', type, 'params', params || jsonb_build_object('title', title))
from (values
  ('00000000-0000-4000-8000-0000000002a1', 'flag_data_issue', 'Sổ đỏ Dĩ An thiếu số thửa',
   jsonb_build_object('property_id', '00000000-0000-4000-8000-0000000000a1', 'lease_id', null)),
  ('00000000-0000-4000-8000-0000000002a2', 'suggest_rent_change', 'Tăng tiền thuê phòng',
   jsonb_build_object('lease_id', '00000000-0000-4000-8000-00000000e021', 'effective_period_start', '2026-12-01', 'rent_vnd', 3800000)),
  ('00000000-0000-4000-8000-0000000002a3', 'suggest_rent_change', 'Tăng tiền từ tháng này',
   jsonb_build_object('lease_id', '00000000-0000-4000-8000-00000000e021', 'effective_period_start', '2026-11-01', 'rent_vnd', 3800000)),
  ('00000000-0000-4000-8000-0000000002a4', 'suggest_rent_change', 'Tăng tiền phòng đã chấm dứt',
   jsonb_build_object('lease_id', '00000000-0000-4000-8000-00000000e031', 'effective_period_start', '2026-12-01', 'rent_vnd', 3800000)),
  ('00000000-0000-4000-8000-0000000002a5', 'suggest_lease_renewal', 'Gia hạn Thủ Đức',
   jsonb_build_object('lease_id', '00000000-0000-4000-8000-00000000e211', 'increase_bps', 500, 'end_date', '2027-10-31')),
  ('00000000-0000-4000-8000-0000000002a6', 'draft_reminder', 'Nhắc tiền phòng',
   jsonb_build_object('lease_id', '00000000-0000-4000-8000-00000000e051')),
  ('00000000-0000-4000-8000-0000000002a7', 'draft_reminder', 'Nhắc tiền Thủ Đức',
   jsonb_build_object('lease_id', '00000000-0000-4000-8000-00000000e211')),
  ('00000000-0000-4000-8000-0000000002a8', 'create_task', 'Gọi người thuê',
   jsonb_build_object('due_on', null, 'property_id', '00000000-0000-4000-8000-0000000000a2', 'lease_id', '00000000-0000-4000-8000-00000000e051')),
  ('00000000-0000-4000-8000-0000000002a9', 'suggest_rent_change', 'Tăng tiền giữa kỳ',
   jsonb_build_object('lease_id', '00000000-0000-4000-8000-00000000e021', 'effective_period_start', '2026-12-15', 'rent_vnd', 3800000))
) as proposal (id, type, title, params);

-- What create_proposal asks before it stores a proposal.
select is(public.proposal_refusal(:'a', proposal), refusal, note)
from (values
  ((select proposal from public.agent_items where id = '00000000-0000-4000-8000-0000000002a2'), null, 'a rent change from 01/12 applies'),
  ((select proposal from public.agent_items where id = '00000000-0000-4000-8000-0000000002a3'), 'ESTA_AMENDMENT_ALREADY_BILLED', 'one from the issued November period is billed'),
  ((select proposal from public.agent_items where id = '00000000-0000-4000-8000-0000000002a9'), 'ESTA_AMENDMENT_NOT_A_PERIOD_START', 'one from 15/12 starts no period'),
  ((select proposal from public.agent_items where id = '00000000-0000-4000-8000-0000000002a8'), 'ESTA_PROPOSAL_SUBJECT', 'a lease of another property is not that property''s'),
  ((select proposal from public.agent_items where id = '00000000-0000-4000-8000-0000000002a7'), 'ESTA_REMINDER_NOTHING_OWED', 'a lease collected to its end has nothing to remind'),
  (jsonb_build_object('type', 'suggest_rent_change', 'params', jsonb_build_object('title', 'x', 'lease_id', '00000000-0000-4000-8000-00000000e021',
     'effective_period_start', '2026-12-01', 'rent_vnd', '3800000')), 'ESTA_PROPOSAL_PARAMS', 'a rent typed as text is out of shape'),
  (jsonb_build_object('type', 'suggest_lease_renewal', 'params', jsonb_build_object('title', 'x', 'lease_id', '00000000-0000-4000-8000-00000000e211',
     'increase_bps', 500, 'end_date', '2026-10-30')), 'ESTA_RENEWAL_END', 'a renewal ending before the lease does is refused')
) as checks (proposal, refusal, note);
select is(public.proposal_refusal(:'b', (select proposal from public.agent_items where id = '00000000-0000-4000-8000-0000000002a2')),
  'ESTA_PROPOSAL_SUBJECT', 'the same lease asked for another household is not its record');
select tests.clear_request();
reset role;
select is(has_function_privilege('authenticated', 'public.proposal_refusal(uuid, jsonb)', 'execute'), false, 'only the worker asks it directly');

-- Phòng 3 is terminated after its proposal was made.
select set_config('esta.actor', 'system:test', true);
update public.leases set status = 'terminated', terminated_on = '2026-10-31', end_date = '2026-10-31' where id = '00000000-0000-4000-8000-00000000e031';

select tests.act_as('viewer.a@test.esta.test');
select throws_ok($$ select public.approve_proposal('00000000-0000-4000-8000-0000000002a2') $$,
  'P0002', 'ESTA_PROPOSAL_NOT_FOUND', 'a viewer cannot approve a rent change, even calling the function herself');

select tests.act_as('member.a@test.esta.test');
select is(public.approve_proposal(id), status, note)
from (values
  ('00000000-0000-4000-8000-0000000002a1'::uuid, 'approved', 'flag_data_issue is approved'),
  ('00000000-0000-4000-8000-0000000002a2'::uuid, 'approved', 'the rent change from 01/12 is approved'),
  ('00000000-0000-4000-8000-0000000002a3'::uuid, 'failed', 'the rent change from the issued period fails'),
  ('00000000-0000-4000-8000-0000000002a4'::uuid, 'failed', 'the rent change on the terminated lease fails'),
  ('00000000-0000-4000-8000-0000000002a5'::uuid, 'approved', 'the renewal is approved'),
  ('00000000-0000-4000-8000-0000000002a6'::uuid, 'approved', 'the reminder is approved'),
  ('00000000-0000-4000-8000-0000000002a7'::uuid, 'failed', 'the reminder with nothing owed fails'),
  ('00000000-0000-4000-8000-0000000002a8'::uuid, 'failed', 'the task naming a lease of another property fails')
) as decisions (id, status, note);

select results_eq(
  $$ select title, property_id, due_on, source from public.tasks where agent_item_id = '00000000-0000-4000-8000-0000000002a1' $$,
  $$ values ('Sổ đỏ Dĩ An thiếu số thửa'::text, '00000000-0000-4000-8000-0000000000a1'::uuid, null::date, 'agent_proposal'::text) $$,
  'flag_data_issue left a task from the assistant');
select results_eq(
  $$ select lease_id, effective_period_start, changes from public.lease_amendments where agent_item_id = '00000000-0000-4000-8000-0000000002a2' $$,
  $$ values ('00000000-0000-4000-8000-00000000e021'::uuid, date '2026-12-01', '{"rent_vnd": 3800000}'::jsonb) $$,
  'the rent change is an amendment from 01/12 that names its proposal');
select results_eq(
  $$ select period_start, (select sum(l.amount_vnd) from public.invoice_lines l where l.invoice_id = i.id) from public.invoices i
     where i.lease_id = '00000000-0000-4000-8000-00000000e021' and i.status = 'issued' order by period_start $$,
  $$ values (date '2026-10-01', 2500000::numeric), (date '2026-11-01', 2500000::numeric) $$,
  'the issued October and November invoices are unchanged');
select is((select count(*)::int from public.lease_amendments where lease_id in ('00000000-0000-4000-8000-00000000e021', '00000000-0000-4000-8000-00000000e031')), 1,
  'the failed rent changes wrote no amendment');
select results_eq(
  $$ select status, start_date, end_date, rent_vnd, renewal_of_lease_id from public.leases where agent_item_id = '00000000-0000-4000-8000-0000000002a5' $$,
  $$ values ('draft'::text, date '2026-11-01', date '2027-10-31', 9500000::bigint, '00000000-0000-4000-8000-00000000e211'::uuid) $$,
  'the renewal is a draft from 01/11 at 9.000.000 ₫ plus 5%, rounded half up to 100.000 ₫, linked to the old lease');
select is(
  (select count(*)::int from public.tasks where agent_item_id = '00000000-0000-4000-8000-0000000002a6')
    + (select count(*)::int from public.leases where agent_item_id = '00000000-0000-4000-8000-0000000002a6')
    + (select count(*)::int from public.lease_amendments where agent_item_id = '00000000-0000-4000-8000-0000000002a6'),
  0, 'the reminder wrote no business row');
select results_eq(
  $$ select table_name, action, actor_kind, actor_id from public.audit_log
     where row_id = (select id from public.lease_amendments where agent_item_id = '00000000-0000-4000-8000-0000000002a2') order by id $$,
  format($$ values ('lease_amendments', 'insert', 'user', %L), ('lease_amendments', 'update', 'user', %L) $$, :'member_a', :'member_a'),
  'the amendment was written as her');
select is(public.approve_proposal('00000000-0000-4000-8000-0000000002a2'), 'approved', 'a second approval of the rent change answers approved');
select is((select count(*)::int from public.lease_amendments where agent_item_id = '00000000-0000-4000-8000-0000000002a2'), 1, 'and writes no second amendment');
select throws_ok(format($$
  insert into public.leases (household_id, property_id, unit_id, start_date, rent_vnd, agent_item_id)
  values (%L, '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a12', '2027-07-01', 2500000, '00000000-0000-4000-8000-0000000002a3') $$, :'a'),
  '42501', 'ESTA_AGENT_ITEM_LINK', 'a member cannot tie a lease she writes to a proposal');

select * from finish();
rollback;
