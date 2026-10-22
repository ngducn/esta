begin;
\ir _harness.psql

select plan(71);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select tests.user_id('admin.a@test.esta.test') as admin_a \gset

select set_config('esta.actor', 'system:test', true);
insert into private.local_stack default values on conflict do nothing;
insert into public.test_clock (id, frozen_now) values (true, '2026-10-07T09:00:00+07:00')
  on conflict (id) do update set frozen_now = excluded.frozen_now;
update public.household_members set is_operator = true where user_id in (:'admin_a', tests.user_id('admin.b@test.esta.test'));
update public.household_members set display_name = 'Ryan Demo' where user_id = :'admin_a';

-- Dãy trọ Dĩ An has two rooms and a draft lease on the second; Nhà Bình Thạnh has only its whole unit.
insert into public.properties (id, household_id, nickname, code, kind, use_mode, notes, kind_details, location) values
  ('00000000-0000-4000-8000-0000000c4a01', :'a', 'Dãy trọ Demo Dĩ An', 'DIAN', 'rooming_house', 'rental', 'Demo', '{}',
   'SRID=4326;POINT(106.7 10.9)'),
  ('00000000-0000-4000-8000-0000000c4a02', :'a', 'Nhà Demo Bình Thạnh', 'BTH', 'townhouse', 'rental', null, '{}', null);
insert into public.units (id, household_id, property_id, label, kind, list_rent_vnd) values
  ('00000000-0000-4000-8000-0000000c4b01', :'a', '00000000-0000-4000-8000-0000000c4a01', 'Phòng 1', 'room', 3500000),
  ('00000000-0000-4000-8000-0000000c4b02', :'a', '00000000-0000-4000-8000-0000000c4a01', 'Phòng 2', 'room', 3500000);
update public.units set list_rent_vnd = 12000000 where id = private.whole_unit_id('00000000-0000-4000-8000-0000000c4a02');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-0000000c4c01', :'a', 'individual', 'Bùi Văn Hùng Demo', array['tenant']);
insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date, rent_vnd, deposit_vnd) values
  ('00000000-0000-4000-8000-0000000c4d02', :'a', '00000000-0000-4000-8000-0000000c4a01', '00000000-0000-4000-8000-0000000c4b02',
   '00000000-0000-4000-8000-0000000c4c01', '2026-03-01', 3500000, 7000000);

create function pg_temp.open_batch(p_id uuid, p_household uuid) returns void language plpgsql as $$
begin
  insert into public.change_batches (id, household_id, summary, plan, planned_at)
  values (p_id, p_household, 'Demo batch', '{"v": 1, "items": []}', '2026-10-07T01:55:00Z');
  update public.change_batches set status = 'applying', applied_at = '2026-10-07T02:00:00Z' where id = p_id;
  perform set_config('request.headers', jsonb_build_object('x-esta-via', 'claude', 'x-esta-batch', p_id)::text, true);
end;
$$;
create function pg_temp.close_batch(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.headers', '{}', true);
  update public.change_batches set status = 'applied', outcomes = '[]' where id = p_id;
end;
$$;
create function pg_temp.rental_batch(p_id uuid, p_room int) returns void language plpgsql as $$
declare
  v_household uuid := (select household_id from public.properties where id = '00000000-0000-4000-8000-0000000c4a01');
  v_unit uuid := ('00000000-0000-4000-8000-0000000c4b0' || p_room)::uuid;
  v_lease uuid := ('00000000-0000-4000-8000-0000000c4d0' || p_room)::uuid;
begin
  perform pg_temp.open_batch(p_id, v_household);
  insert into public.units (id, household_id, property_id, label, kind)
  values (v_unit, v_household, '00000000-0000-4000-8000-0000000c4a01', 'Phòng ' || p_room, 'room');
  insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date, rent_vnd, deposit_vnd)
  values (v_lease, v_household, '00000000-0000-4000-8000-0000000c4a01', v_unit, '00000000-0000-4000-8000-0000000c4c01', '2026-03-01', 9000000, 18000000);
  perform public.activate_lease(v_lease, '2026-09-30');
  perform pg_temp.close_batch(p_id);
end;
$$;
create function pg_temp.household_rows(p_household uuid) returns setof jsonb language plpgsql as $$
declare
  v_table text;
begin
  for v_table in
    select c.relname from pg_catalog.pg_class c join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attname = 'household_id'
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname not in ('audit_log', 'change_batches')
  loop
    return query execute format('select to_jsonb(t) - ''updated_at'' || jsonb_build_object(''table'', %L) from public.%I t where household_id = $1', v_table, v_table)
      using p_household;
  end loop;
end;
$$;
grant execute on all functions in schema pg_temp to authenticated;

create temporary table before_rows as select * from pg_temp.household_rows(:'a') as r (row);

\set rental '''00000000-0000-4000-8000-0000000c4e01'''
select tests.act_as('admin.a@test.esta.test');
select pg_temp.open_batch(:rental, :'a');
insert into public.units (id, household_id, property_id, label, kind, list_rent_vnd) values
  ('00000000-0000-4000-8000-0000000c4b03', :'a', '00000000-0000-4000-8000-0000000c4a01', 'Phòng 3', 'room', 9000000);
insert into public.parties (id, household_id, kind, full_name, phone, tags) values
  ('00000000-0000-4000-8000-0000000c4c03', :'a', 'individual', 'Lan Demo', '+84901234567', array['tenant']);
insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date, rent_vnd, deposit_vnd) values
  ('00000000-0000-4000-8000-0000000c4d03', :'a', '00000000-0000-4000-8000-0000000c4a01', '00000000-0000-4000-8000-0000000c4b03',
   '00000000-0000-4000-8000-0000000c4c03', '2026-03-01', 9000000, 18000000);
select lives_ok($$ select public.activate_lease('00000000-0000-4000-8000-0000000c4d03', '2026-09-30') $$, 'the batch starts the lease paid through September');
select lives_ok($$ select public.record_deposit_entry('00000000-0000-4000-8000-0000000c4d03', 'received', 18000000, '2026-03-01', '00000000-0000-4000-8000-0000000c4f03') $$,
  'and records its deposit');
select pg_temp.close_batch(:rental);

select is(
  (select count(*)::int from public.audit_log where batch_id = :rental and via = 'claude'
     and table_name in ('units', 'parties', 'leases', 'invoices', 'invoice_lines', 'deposit_entries')),
  (select count(*)::int from public.audit_log where batch_id = :rental),
  'every write of the batch is filed under it as claude, and the batch record itself is not');
select ok((select count(distinct table_name) = 6 from public.audit_log where batch_id = :rental),
  'the room, the tenant, the lease, its first bill with its line and the deposit are filed under the batch');
select is((select count(*)::int from public.invoices where lease_id = '00000000-0000-4000-8000-0000000c4d03' and status = 'issued'), 1,
  'activation issued October inside the batch');

insert into public.parties (household_id, kind, full_name, tags) values (:'a', 'individual', 'Mẹ Demo nhập tay', array['tenant']);
select is((select row(via, batch_id)::text from public.audit_log where table_name = 'parties' order by id desc limit 1), '(,)',
  'a write from the screens carries no batch');

select is(public.undo_change_batch(:rental), '{"undone": true, "archived": []}', 'the operator undoes the Demo rental');
reset role;
select set_config('esta.actor', 'system:test', true);
delete from public.parties where full_name = 'Mẹ Demo nhập tay';
select is_empty(format(
  $$ (select row from pg_temp.household_rows(%1$L) as r (row) except all select row from before_rows)
     union all
     (select row from before_rows except all select row from pg_temp.household_rows(%1$L) as r (row)) $$, :'a'),
  'every row of the household is back as it was before the batch');
select is_empty($$ select 1 from public.lease_schedule(array['00000000-0000-4000-8000-0000000c4d03']::uuid[], '2027-03-31') $$,
  'the undone lease leaves no rent periods');
select is_empty($$ select 1 from public.invoices i left join public.invoice_lines l on l.invoice_id = i.id
  where i.lease_id = '00000000-0000-4000-8000-0000000c4d03' $$, 'nor an invoice or an invoice line');
select is((select status || ':' || (undone_at is not null) from public.change_batches where id = :rental), 'undone:true',
  'the batch is undone with the time');
select ok((select bool_and(via = 'undo' and actor_id = :'admin_a') from public.audit_log where batch_id = :rental and id > (
  select max(id) from public.audit_log where batch_id = :rental and via = 'claude')),
  'the undo writes as the operator, filed under the batch as undo');

select tests.act_as('admin.a@test.esta.test');
select throws_ok(format('select public.undo_change_batch(%L)', :rental), '55000', 'ESTA_BATCH_NOT_UNDOABLE', 'a batch is undone once');

-- An edit, a move to the trash, and a new property: undo sets the edit back, takes the property out of the trash, and
-- moves the new property to the trash with its whole unit.
\set edit '''00000000-0000-4000-8000-0000000c4e02'''
create temporary table dian_before as select to_jsonb(p) - 'updated_at' as row from public.properties p where id = '00000000-0000-4000-8000-0000000c4a01';
select pg_temp.open_batch(:edit, :'a');
select lives_ok($$ select public.set_property_location('00000000-0000-4000-8000-0000000c4a01', 10.8, 106.8) $$, 'the batch moves the pin');
update public.properties set notes = 'Demo: Claude sửa', kind_details = '{"room_count": 8}', deleted_at = '2026-10-07T09:00:00+07:00'
  where id = '00000000-0000-4000-8000-0000000c4a01';
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000c4a03', :'a', 'Nhà phố Demo Q7', 'Q7', 'townhouse', 'rental');
select pg_temp.close_batch(:edit);
select is(public.undo_change_batch(:edit) -> 'archived',
  '[{"row_id": "00000000-0000-4000-8000-0000000c4a03", "table_name": "properties"}]', 'the undo reports the property it moved to the trash');
select is((select to_jsonb(p) - 'updated_at' from public.properties p where id = '00000000-0000-4000-8000-0000000c4a01'),
  (select row from dian_before), 'the edited property is back exactly, its place, details and trash state included');
select isnt((select deleted_at from public.properties where id = '00000000-0000-4000-8000-0000000c4a03'), null,
  'the property the batch created is in the trash, not deleted');
select results_eq($$ select id, kind from public.units where property_id = '00000000-0000-4000-8000-0000000c4a03' $$,
  $$ values (private.whole_unit_id('00000000-0000-4000-8000-0000000c4a03'), 'whole') $$, 'and keeps its whole unit, as a property archived by hand does');

-- The first room on a property with only its whole unit replaces that unit; undo brings the whole unit back as it was.
\set room '''00000000-0000-4000-8000-0000000c4e03'''
create temporary table whole_before as select to_jsonb(u) - 'updated_at' - 'created_by' as row from public.units u where id = private.whole_unit_id('00000000-0000-4000-8000-0000000c4a02');
select pg_temp.open_batch(:room, :'a');
insert into public.units (id, household_id, property_id, label, kind) values
  ('00000000-0000-4000-8000-0000000c4b04', :'a', '00000000-0000-4000-8000-0000000c4a02', 'Phòng 1', 'room');
select pg_temp.close_batch(:room);
select is((select count(*)::int from public.audit_log where batch_id = :room and action = 'delete'), 1, 'the room replaced the whole unit inside the batch');
select is(public.undo_change_batch(:room) ->> 'undone', 'true', 'the room is undone');
select is((select jsonb_agg(to_jsonb(u) - 'updated_at' - 'created_by') from public.units u where property_id = '00000000-0000-4000-8000-0000000c4a02'),
  (select jsonb_agg(row) from whole_before), 'the property has its whole unit back, with its rent and its first creation time');

-- What blocks an undo: each refusal names the row, the reason and the flow, and changes nothing.
\set people '''00000000-0000-4000-8000-0000000c4e04'''
select pg_temp.open_batch(:people, :'a');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-0000000c4c04', :'a', 'individual', 'Khoa Demo', array['tenant']),
  ('00000000-0000-4000-8000-0000000c4c05', :'a', 'individual', 'Hoa Demo', array['tenant']);
select pg_temp.close_batch(:people);
select tests.act_as('member.a@test.esta.test');
update public.parties set phone = '+84987000111' where id = '00000000-0000-4000-8000-0000000c4c04';
insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date, rent_vnd, deposit_vnd) values
  ('00000000-0000-4000-8000-0000000c4d05', :'a', '00000000-0000-4000-8000-0000000c4a01', '00000000-0000-4000-8000-0000000c4b01',
   '00000000-0000-4000-8000-0000000c4c05', '2026-11-01', 3500000, 7000000);
select tests.act_as('admin.a@test.esta.test');
select is((select jsonb_agg(b order by b ->> 'reason') from jsonb_array_elements(public.undo_change_batch(:people) -> 'blockers') b), jsonb_build_array(
  jsonb_build_object('flow', 'edit', 'reason', 'edited_after', 'row_id', '00000000-0000-4000-8000-0000000c4c04', 'table_name', 'parties'),
  jsonb_build_object('flow', 'edit', 'reason', 'in_use', 'row_id', '00000000-0000-4000-8000-0000000c4d05', 'table_name', 'leases')),
  'a later edit by anyone and a lease entered by hand for a person Claude added both block the undo');
select is((select count(*)::int from public.parties where id in ('00000000-0000-4000-8000-0000000c4c04', '00000000-0000-4000-8000-0000000c4c05')), 2,
  'a refused undo removes nothing');
select is((select status from public.change_batches where id = :people), 'applied', 'and leaves the batch applied');

\set start '''00000000-0000-4000-8000-0000000c4e05'''
select pg_temp.open_batch(:start, :'a');
select lives_ok($$ select public.activate_lease('00000000-0000-4000-8000-0000000c4d02', null) $$, 'a batch starts a draft lease entered before it');
select pg_temp.close_batch(:start);
select is(public.undo_change_batch(:start) -> 'blockers' -> 0 ->> 'reason', 'lease_started',
  'starting a lease that existed before the batch cannot be undone, since a lease never goes back to draft');
select is(public.undo_change_batch(:start) -> 'blockers' -> 0 ->> 'flow', 'end_lease', 'and the flow is to end the lease');

-- Each rental batch adds a room and a lease on Dĩ An and starts it paid through September, so October is issued inside it.
\set billed '''00000000-0000-4000-8000-0000000c4e06'''
\set paid '''00000000-0000-4000-8000-0000000c4e08'''
\set held '''00000000-0000-4000-8000-0000000c4e09'''
select lives_ok(format('select pg_temp.rental_batch(%L, %L)', :billed, 6), 'a batch adds and starts the lease on Phòng 6');
select lives_ok(format('select pg_temp.rental_batch(%L, %L)', :paid, 7), 'another on Phòng 7');
select lives_ok(format('select pg_temp.rental_batch(%L, %L)', :held, 8), 'and another on Phòng 8');
reset role;
select tests.act_as_service('{"x-esta-actor": "system:cron"}');
select lives_ok(format($$ select public.run_invoicing(%L, '2026-11-01', '2026-11-01T00:30:00+07:00') $$, :'a'), 'the nightly run issues November');
select tests.act_as('admin.a@test.esta.test');
select is((select array_agg(distinct b ->> 'reason' || ':' || (b ->> 'flow')) from jsonb_array_elements(public.undo_change_batch(:billed) -> 'blockers') b),
  array['invoice_issued:void'], 'a bill the nightly run issued for the lease blocks the undo, and the flow is to void it');

reset role;
select set_config('esta.actor', 'system:test', true);
insert into public.payments (id, household_id, payer_party_id, amount_vnd, received_on, method) values
  ('00000000-0000-4000-8000-0000000c4907', :'a', '00000000-0000-4000-8000-0000000c4c01', 9000000, '2026-10-05', 'cash');
insert into public.payment_allocations (household_id, payment_id, invoice_id, amount_vnd)
  select :'a', '00000000-0000-4000-8000-0000000c4907', id, 9000000 from public.invoices
  where lease_id = '00000000-0000-4000-8000-0000000c4d07' and period_start = '2026-10-01';
select tests.act_as('admin.a@test.esta.test');
select ok((select array_agg(distinct b ->> 'reason' || ':' || (b ->> 'flow')) @> array['payment_recorded:end_lease'] from jsonb_array_elements(public.undo_change_batch(:paid) -> 'blockers') b),
  'a payment allocated to the bill the batch issued blocks the undo, and the flow is to end the lease');

select lives_ok($$ select public.record_deposit_entry('00000000-0000-4000-8000-0000000c4d08', 'received', 18000000, '2026-03-01', '00000000-0000-4000-8000-0000000c4f08') $$,
  'a member records the deposit by hand');
select ok((select array_agg(distinct b ->> 'reason' || ':' || (b ->> 'flow')) @> array['deposit_recorded:end_lease'] from jsonb_array_elements(public.undo_change_batch(:held) -> 'blockers') b),
  'a deposit entered by hand on the lease blocks the undo');

-- A batch's deposit or payment on a lease or bill that existed before it: a later entry that someone else made may rest
-- on it, so undo refuses rather than take it out from under them.
\set receipt '''00000000-0000-4000-8000-0000000c4e0a'''
select pg_temp.open_batch(:receipt, :'a');
select lives_ok($$ select public.record_deposit_entry('00000000-0000-4000-8000-0000000c4d02', 'received', 7000000, '2026-03-01', '00000000-0000-4000-8000-0000000c4f02') $$,
  'a batch records the deposit of a lease entered before it');
select pg_temp.close_batch(:receipt);
select lives_ok($$ select public.record_deposit_entry('00000000-0000-4000-8000-0000000c4d02', 'refunded', 7000000, '2026-10-06', '00000000-0000-4000-8000-0000000c4f0a') $$,
  'later the deposit is refunded by hand, against what the batch recorded');
select is((select jsonb_agg(b - 'row_id') from jsonb_array_elements(public.undo_change_batch(:receipt) -> 'blockers') b),
  '[{"flow": "deposit", "reason": "deposit_later", "table_name": "deposit_entries"}]',
  'the later refund blocks undoing the receipt, and the flow is the lease''s deposit ledger');
select is((select held_vnd from public.lease_deposits where lease_id = '00000000-0000-4000-8000-0000000c4d02'), 0::bigint,
  'and the lease holds nothing, not less than nothing');
reset role;
create temporary table ledger_rules as select * from private.undo_rules where kind = 'ledger';
delete from private.undo_rules where kind = 'ledger';
select tests.act_as('admin.a@test.esta.test');
select throws_ok(format('select public.undo_change_batch(%L)', :receipt), '23514', 'ESTA_DEPOSIT_EXCEEDS_HELD',
  'without the ledger rule, the deposit guard still refuses an undo that would hold less than nothing');
reset role;
insert into private.undo_rules select * from ledger_rules;

select id as bill from public.invoices where lease_id = '00000000-0000-4000-8000-0000000c4d02' and status = 'issued' order by period_start limit 1 \gset
\set payment '''00000000-0000-4000-8000-0000000c4e0b'''
select tests.act_as('admin.a@test.esta.test');
select pg_temp.open_batch(:payment, :'a');
reset role;
select set_config('esta.via', 'claude', true), set_config('esta.batch', :payment, true);
insert into public.payments (id, household_id, payer_party_id, amount_vnd, received_on, method) values
  ('00000000-0000-4000-8000-0000000c490b', :'a', '00000000-0000-4000-8000-0000000c4c01', 1000000, '2026-10-05', 'cash');
insert into public.payment_allocations (household_id, payment_id, invoice_id, amount_vnd) values (:'a', '00000000-0000-4000-8000-0000000c490b', :'bill', 1000000);
select set_config('esta.via', '', true), set_config('esta.batch', '', true);
insert into public.payments (id, household_id, payer_party_id, amount_vnd, received_on, method) values
  ('00000000-0000-4000-8000-0000000c491b', :'a', '00000000-0000-4000-8000-0000000c4c01', 1000000, '2026-10-06', 'cash');
insert into public.payment_allocations (household_id, payment_id, invoice_id, amount_vnd) values (:'a', '00000000-0000-4000-8000-0000000c491b', :'bill', 1000000);
select tests.act_as('admin.a@test.esta.test');
select pg_temp.close_batch(:payment);
select is((select jsonb_agg(b - 'row_id' order by b ->> 'table_name') from jsonb_array_elements(public.undo_change_batch(:payment) -> 'blockers') b),
  '[{"flow": "payment", "reason": "payment_later", "table_name": "payment_allocations"}, {"flow": "payment", "reason": "payment_later", "table_name": "payments"}]',
  'a later payment from the same tenant on the same bill blocks undoing the batch''s payment and its allocation');

-- A bill the batch issued goes with the batch, unless something uses it: here a bank statement line suggests it.
\set matched '''00000000-0000-4000-8000-0000000c4e0c'''
select lives_ok(format('select pg_temp.rental_batch(%L, %L)', :matched, 9), 'a batch adds and starts the lease on Phòng 9');
select is((select issued_bills from public.change_batch_history(:'a') where id = :matched),
  (select jsonb_agg(jsonb_build_object('number', number, 'period_start', period_start)) from public.invoices where lease_id = '00000000-0000-4000-8000-0000000c4d09'),
  'the history names the October bill the batch issued, which an undo removes');
reset role;
insert into public.bank_accounts (id, household_id, bank_bin, account_no, account_name) values
  ('00000000-0000-4000-8000-0000000c4a0c', :'a', (select bin from public.bank_bins order by bin limit 1), '0123456789', 'DEMO');
insert into public.statement_imports (id, household_id, bank_account_id, file_name, column_mapping) values
  ('00000000-0000-4000-8000-0000000c4a0d', :'a', '00000000-0000-4000-8000-0000000c4a0c', 'demo.csv', '{}');
insert into public.statement_rows (household_id, import_id, row_index, posted_on, amount_vnd, description, fingerprint, status, candidate_invoice_ids)
  select :'a', '00000000-0000-4000-8000-0000000c4a0d', 0, '2026-10-05', 9000000, 'Demo chuyen tien', repeat('c', 64), 'unmatched', array_agg(id)
  from public.invoices where lease_id = '00000000-0000-4000-8000-0000000c4d09';
select tests.act_as('admin.a@test.esta.test');
select is((select jsonb_agg(b - 'row_id') from jsonb_array_elements(public.undo_change_batch(:matched) -> 'blockers') b),
  '[{"flow": "void", "reason": "statement_matched", "table_name": "statement_rows"}]',
  'a statement line that suggests the bill blocks the undo, though it names the bill in a list and not by key');

-- Who may undo.
reset role;
select tests.act_as('admin.b@test.esta.test');
select throws_ok(format('select public.undo_change_batch(%L)', :people), 'P0002', 'ESTA_BATCH_NOT_FOUND', 'another household''s operator cannot undo the batch');
select tests.act_as('member.a@test.esta.test');
select throws_ok(format('select public.undo_change_batch(%L)', :people), 'P0002', 'ESTA_BATCH_NOT_FOUND', 'a member who is not the operator cannot undo it');
reset role;
update public.household_members set is_operator = false where user_id = :'admin_a';
select tests.act_as('admin.a@test.esta.test');
select throws_ok(format('select public.undo_change_batch(%L)', :people), 'P0002', 'ESTA_BATCH_NOT_FOUND', 'nor can an admin who is no longer the operator');
reset role;
update public.household_members set is_operator = true where user_id = :'admin_a';

-- The tags: only the batch's own applier, while it applies, files writes under it.
select tests.act_as('admin.a@test.esta.test');
\set planned '''00000000-0000-4000-8000-0000000c4e07'''
insert into public.change_batches (id, household_id, summary, plan, planned_at) values (:planned, :'a', 'Demo', '{}', '2026-10-07T01:55:00Z');
select set_config('request.headers', jsonb_build_object('x-esta-via', 'claude', 'x-esta-batch', :planned)::text, true);
select throws_ok(format($$ insert into public.parties (household_id, kind, full_name) values (%L, 'individual', 'X Demo') $$, :'a'),
  '42501', 'ESTA_BATCH_TAG', 'a write cannot be filed under a batch that is not applying');
select set_config('request.headers', jsonb_build_object('x-esta-via', 'claude', 'x-esta-batch', :rental)::text, true);
select throws_ok(format($$ insert into public.parties (household_id, kind, full_name) values (%L, 'individual', 'X Demo') $$, :'a'),
  '42501', 'ESTA_BATCH_TAG', 'nor under a finished one');
select set_config('request.headers', '{"x-esta-via": "undo", "x-esta-batch": "00000000-0000-4000-8000-0000000c4e01"}', true);
select throws_ok(format($$ insert into public.parties (household_id, kind, full_name) values (%L, 'individual', 'X Demo') $$, :'a'),
  '42501', 'ESTA_BATCH_TAG', 'a request cannot say it is an undo');
select set_config('request.headers', '{"x-esta-via": "claude"}', true);
select throws_ok(format($$ insert into public.parties (household_id, kind, full_name) values (%L, 'individual', 'X Demo') $$, :'a'),
  '42501', 'ESTA_BATCH_TAG', 'nor be from Claude without its batch');
select set_config('request.headers', '{}', true);
update public.change_batches set status = 'applying', applied_at = '2026-10-07T02:00:00Z' where id = :planned;
select tests.act_as('member.a@test.esta.test');
select set_config('request.headers', jsonb_build_object('x-esta-via', 'claude', 'x-esta-batch', :planned)::text, true);
select throws_ok(format($$ insert into public.parties (household_id, kind, full_name) values (%L, 'individual', 'X Demo') $$, :'a'),
  '42501', 'ESTA_BATCH_TAG', 'another member cannot file a write under the operator''s batch');
select tests.act_as('admin.b@test.esta.test');
select set_config('request.headers', jsonb_build_object('x-esta-via', 'claude', 'x-esta-batch', :planned)::text, true);
select throws_ok(format($$ insert into public.parties (household_id, kind, full_name) values (%L, 'individual', 'X Demo') $$, :'b'),
  '42501', 'ESTA_BATCH_TAG', 'nor can another household');
select tests.act_as('admin.a@test.esta.test');
select throws_ok(format('select public.undo_change_batch(%L)', :planned), '55000', 'ESTA_BATCH_NOT_UNDOABLE', 'a batch still applying has nothing to undo');
select throws_ok($$ insert into public.audit_log (household_id, table_name, row_id, action, actor_kind, actor_id, diff) values
  (gen_random_uuid(), 'x', gen_random_uuid(), 'insert', 'user', 'x', '{}') $$, '42501', null, 'nobody writes the audit log directly');

-- A batch starts planned and ends undone only through undo_change_batch (#223).
select throws_ok(format($$ insert into public.change_batches (household_id, summary, plan, planned_at, status, applied_at, outcomes)
  values (%L, 'Demo', '{}', '2026-10-07T01:55:00Z', 'applied', '2026-10-07T02:00:00Z', '[]') $$, :'a'), '23514', 'ESTA_BATCH_TRANSITION',
  'a batch cannot be stored as already applied');
select throws_ok(format($$ insert into public.change_batches (household_id, summary, plan, planned_at, status, applied_at)
  values (%L, 'Demo', '{}', '2026-10-07T01:55:00Z', 'applying', '2026-10-07T02:00:00Z') $$, :'a'), '23514', 'ESTA_BATCH_TRANSITION',
  'nor as already claimed');
select throws_ok(format($$ update public.change_batches set status = 'undone', undone_at = '2026-10-07T03:00:00Z' where id = %L $$, :people),
  '42501', 'ESTA_BATCH_UNDO_THROUGH_FUNCTION', 'the operator cannot mark a batch undone without undoing it');
reset role;
select tests.act_as_service('{"x-esta-actor": "system:test"}');
select throws_ok(format($$ update public.change_batches set status = 'undone', undone_at = '2026-10-07T03:00:00Z' where id = %L $$, :people),
  '42501', 'ESTA_BATCH_UNDO_THROUGH_FUNCTION', 'nor can the service role');
reset role;

-- History, newest first, for the household's members only.
update public.change_batches b set created_at = '2026-10-07T02:00:00Z'::timestamptz + make_interval(secs => o.n)
  from (select id, row_number() over (order by id) as n from public.change_batches where household_id = :'a') o where b.id = o.id;
select tests.act_as('viewer.a@test.esta.test');
select is((select count(*)::int from public.change_batch_history(:'a')), 11, 'a member reads every applied, partial or undone batch, not planned or applying ones');
select is(array(select id from public.change_batch_history(:'a')),
  array(select id from public.change_batches where household_id = :'a' and status <> 'applying' order by created_at desc),
  'batches planned at the same time read newest first');
select is((select archived_properties from public.change_batch_history(:'a') where id = :edit), 1, 'the history counts the property an undo moved to the trash');
select is((select status from public.change_batch_history(:'a') where id = :rental), 'undone', 'and shows the undone batch as undone');
select is((select planner_name from public.change_batch_history(:'a') where id = :rental), 'Ryan Demo', 'with who applied it');
select tests.act_as('admin.b@test.esta.test');
select is_empty(format('select 1 from public.change_batch_history(%L)', :'a'), 'another household reads none of it');
select is_empty(format($$ select 1 from public.audit_log where batch_id = %L $$, :rental), 'nor the audit rows of its batches');
reset role;

-- Every household table is audited, so undo sees every row a batch writes, or is bookkeeping undo leaves alone.
select is_empty($$
  select c.relname from pg_catalog.pg_class c
  join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attname = 'household_id' and not a.attisdropped
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname <> 'audit_log'
    and not exists (select from pg_catalog.pg_trigger t where t.tgrelid = c.oid and t.tgname = 'audit_row')
    and c.relname not in (select table_name from private.undo_rules where kind = 'bookkeeping')
$$, 'every household table has the audit trigger or is bookkeeping in the undo rules');
select is_empty($$ select table_name from private.undo_rules except
  select relname from pg_catalog.pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' $$,
  'every undo rule names a table that exists');
select ok((select bool_and(x.reason = any (array['edited_after', 'lease_started', 'invoice_issued', 'payment_recorded', 'deposit_recorded', 'in_use',
    'deposit_later', 'payment_later', 'statement_matched']))
  from private.undo_rules x where x.kind <> 'bookkeeping'), 'every reason is one the screens explain');

select is(has_function_privilege('anon', 'public.undo_change_batch(uuid)', 'execute'), false, 'an anonymous caller cannot undo');
select is(has_table_privilege('authenticated', 'private.undo_rules', 'select'), false, 'the undo rules are not readable through the API');

select * from finish();
rollback;
