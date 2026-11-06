begin;
\ir _harness.psql

select plan(3);

-- The rows of fixtures/allocation_vectors.csv, which packages/core/src/allocation/vectors.test.ts replays through
-- allocatePayment; scripts/shared-vectors.test.ts fails when the two differ. A case with any chosen bill settles only
-- those; a credit of 'refused' means no payment is recorded.
create temporary table expected (
  name text, payment_vnd bigint, bill text, status text, kind text, due_date date, period_start date,
  total_vnd bigint, paid_vnd bigint, chosen text, allocated_vnd bigint, credit text
) on commit drop;
insert into expected values
    ('exact payment of the only bill', 3500000::bigint, 'a', 'issued', 'rent', '2026-10-05', '2026-10-01', 3500000::bigint, 0::bigint, 'no', 3500000::bigint, '0'),
    ('one dong short of the bill', 3499999::bigint, 'a', 'issued', 'rent', '2026-10-05', '2026-10-01', 3500000::bigint, 0::bigint, 'no', 3499999::bigint, '0'),
    ('one dong over the bill', 3500001::bigint, 'a', 'issued', 'rent', '2026-10-05', '2026-10-01', 3500000::bigint, 0::bigint, 'no', 3500000::bigint, '1'),
    ('partial payment', 1000000::bigint, 'a', 'issued', 'rent', '2026-10-05', '2026-10-01', 3500000::bigint, 0::bigint, 'no', 1000000::bigint, '0'),
    ('overpayment is credit', 10000000::bigint, 'a', 'issued', 'rent', '2026-10-05', '2026-10-01', 3500000::bigint, 0::bigint, 'no', 3500000::bigint, '6500000'),
    ('one dong pays one dong', 1::bigint, 'a', 'issued', 'rent', '2026-10-05', '2026-10-01', 3500000::bigint, 0::bigint, 'no', 1::bigint, '0'),
    ('zero payment is refused', 0::bigint, 'a', 'issued', 'rent', '2026-10-05', '2026-10-01', 3500000::bigint, 0::bigint, 'no', 0::bigint, 'refused'),
    ('oldest due first when listed out of order', 5000000::bigint, 'a', 'issued', 'rent', '2026-10-05', '2026-10-01', 3500000::bigint, 0::bigint, 'no', 0::bigint, '0'),
    ('oldest due first when listed out of order', 5000000::bigint, 'b', 'issued', 'rent', '2026-08-05', '2026-08-01', 3500000::bigint, 0::bigint, 'no', 3500000::bigint, '0'),
    ('oldest due first when listed out of order', 5000000::bigint, 'c', 'issued', 'rent', '2026-09-05', '2026-09-01', 3500000::bigint, 0::bigint, 'no', 1500000::bigint, '0'),
    ('two bills paid exactly', 7000000::bigint, 'a', 'issued', 'rent', '2026-10-05', '2026-10-01', 3500000::bigint, 0::bigint, 'no', 0::bigint, '0'),
    ('two bills paid exactly', 7000000::bigint, 'b', 'issued', 'rent', '2026-08-05', '2026-08-01', 3500000::bigint, 0::bigint, 'no', 3500000::bigint, '0'),
    ('two bills paid exactly', 7000000::bigint, 'c', 'issued', 'rent', '2026-09-05', '2026-09-01', 3500000::bigint, 0::bigint, 'no', 3500000::bigint, '0'),
    ('three bills paid with credit left', 12000000::bigint, 'a', 'issued', 'rent', '2026-10-05', '2026-10-01', 3500000::bigint, 0::bigint, 'no', 3500000::bigint, '1500000'),
    ('three bills paid with credit left', 12000000::bigint, 'b', 'issued', 'rent', '2026-08-05', '2026-08-01', 3500000::bigint, 0::bigint, 'no', 3500000::bigint, '1500000'),
    ('three bills paid with credit left', 12000000::bigint, 'c', 'issued', 'rent', '2026-09-05', '2026-09-01', 3500000::bigint, 0::bigint, 'no', 3500000::bigint, '1500000'),
    ('same due date ties go to the earlier period', 4000000::bigint, 'a', 'issued', 'rent', '2026-10-05', '2026-10-01', 2000000::bigint, 0::bigint, 'no', 1000000::bigint, '0'),
    ('same due date ties go to the earlier period', 4000000::bigint, 'b', 'issued', 'rent', '2026-10-05', '2026-09-01', 3000000::bigint, 0::bigint, 'no', 3000000::bigint, '0'),
    ('due date outranks period', 1000000::bigint, 'a', 'issued', 'rent', '2026-09-05', '2026-10-01', 2000000::bigint, 0::bigint, 'no', 1000000::bigint, '0'),
    ('due date outranks period', 1000000::bigint, 'b', 'issued', 'rent', '2026-09-20', '2026-08-01', 2000000::bigint, 0::bigint, 'no', 0::bigint, '0'),
    ('a voided bill is skipped', 3500000::bigint, 'a', 'void', 'rent', '2026-08-05', '2026-08-01', 3500000::bigint, 0::bigint, 'no', 0::bigint, '0'),
    ('a voided bill is skipped', 3500000::bigint, 'b', 'issued', 'rent', '2026-09-05', '2026-09-01', 3500000::bigint, 0::bigint, 'no', 3500000::bigint, '0'),
    ('a draft bill is skipped', 3500000::bigint, 'a', 'draft', 'rent', '2026-08-05', '2026-08-01', 3500000::bigint, 0::bigint, 'no', 0::bigint, '0'),
    ('a draft bill is skipped', 3500000::bigint, 'b', 'issued', 'rent', '2026-09-05', '2026-09-01', 3500000::bigint, 0::bigint, 'no', 3500000::bigint, '0'),
    ('a part-paid bill takes only what it still owes', 3000000::bigint, 'a', 'issued', 'rent', '2026-08-05', '2026-08-01', 3500000::bigint, 1500000::bigint, 'no', 2000000::bigint, '0'),
    ('a part-paid bill takes only what it still owes', 3000000::bigint, 'b', 'issued', 'rent', '2026-09-05', '2026-09-01', 3500000::bigint, 0::bigint, 'no', 1000000::bigint, '0'),
    ('a paid bill is skipped', 1000000::bigint, 'a', 'issued', 'rent', '2026-08-05', '2026-08-01', 3500000::bigint, 3500000::bigint, 'no', 0::bigint, '0'),
    ('a paid bill is skipped', 1000000::bigint, 'b', 'issued', 'rent', '2026-09-05', '2026-09-01', 3500000::bigint, 0::bigint, 'no', 1000000::bigint, '0'),
    ('an overpaid bill is skipped', 1000000::bigint, 'a', 'issued', 'rent', '2026-08-05', '2026-08-01', 3500000::bigint, 4000000::bigint, 'no', 0::bigint, '0'),
    ('an overpaid bill is skipped', 1000000::bigint, 'b', 'issued', 'rent', '2026-09-05', '2026-09-01', 3500000::bigint, 0::bigint, 'no', 1000000::bigint, '0'),
    ('one dong still owed', 1::bigint, 'a', 'issued', 'rent', '2026-08-05', '2026-08-01', 3500000::bigint, 3499999::bigint, 'no', 1::bigint, '0'),
    ('one dong still owed and one dong over', 2::bigint, 'a', 'issued', 'rent', '2026-08-05', '2026-08-01', 3500000::bigint, 3499999::bigint, 'no', 1::bigint, '1'),
    ('five bills of one million take 2.500.000 in order', 2500000::bigint, 'a', 'issued', 'rent', '2026-06-05', '2026-06-01', 1000000::bigint, 0::bigint, 'no', 1000000::bigint, '0'),
    ('five bills of one million take 2.500.000 in order', 2500000::bigint, 'b', 'issued', 'rent', '2026-07-05', '2026-07-01', 1000000::bigint, 0::bigint, 'no', 1000000::bigint, '0'),
    ('five bills of one million take 2.500.000 in order', 2500000::bigint, 'c', 'issued', 'rent', '2026-08-05', '2026-08-01', 1000000::bigint, 0::bigint, 'no', 500000::bigint, '0'),
    ('five bills of one million take 2.500.000 in order', 2500000::bigint, 'd', 'issued', 'rent', '2026-09-05', '2026-09-01', 1000000::bigint, 0::bigint, 'no', 0::bigint, '0'),
    ('five bills of one million take 2.500.000 in order', 2500000::bigint, 'e', 'issued', 'rent', '2026-10-05', '2026-10-01', 1000000::bigint, 0::bigint, 'no', 0::bigint, '0'),
    ('a chosen bill skips an older one', 3500000::bigint, 'a', 'issued', 'rent', '2026-08-05', '2026-08-01', 3500000::bigint, 0::bigint, 'no', 0::bigint, '0'),
    ('a chosen bill skips an older one', 3500000::bigint, 'b', 'issued', 'rent', '2026-09-05', '2026-09-01', 3500000::bigint, 0::bigint, 'yes', 3500000::bigint, '0'),
    ('a chosen bill skips an older one', 3500000::bigint, 'c', 'issued', 'rent', '2026-10-05', '2026-10-01', 3500000::bigint, 0::bigint, 'no', 0::bigint, '0'),
    ('two chosen bills settle oldest first', 5000000::bigint, 'a', 'issued', 'rent', '2026-08-05', '2026-08-01', 3500000::bigint, 0::bigint, 'no', 0::bigint, '0'),
    ('two chosen bills settle oldest first', 5000000::bigint, 'b', 'issued', 'rent', '2026-09-05', '2026-09-01', 3500000::bigint, 0::bigint, 'yes', 3500000::bigint, '0'),
    ('two chosen bills settle oldest first', 5000000::bigint, 'c', 'issued', 'rent', '2026-10-05', '2026-10-01', 3500000::bigint, 0::bigint, 'yes', 1500000::bigint, '0'),
    ('a chosen bill overpaid leaves credit', 4000000::bigint, 'a', 'issued', 'rent', '2026-08-05', '2026-08-01', 3500000::bigint, 0::bigint, 'no', 0::bigint, '500000'),
    ('a chosen bill overpaid leaves credit', 4000000::bigint, 'b', 'issued', 'rent', '2026-10-05', '2026-10-01', 3500000::bigint, 0::bigint, 'yes', 3500000::bigint, '500000'),
    ('a utility bill and a rent bill share a due date', 3200000::bigint, 'a', 'issued', 'rent', '2026-10-05', '2026-10-01', 3000000::bigint, 0::bigint, 'no', 2750000::bigint, '0'),
    ('a utility bill and a rent bill share a due date', 3200000::bigint, 'b', 'issued', 'electricity', '2026-10-05', '2026-09-01', 450000::bigint, 0::bigint, 'no', 450000::bigint, '0'),
    ('largest payment over one bill', 1000000000000::bigint, 'a', 'issued', 'rent', '2026-10-05', '2026-10-01', 2800000::bigint, 0::bigint, 'no', 2800000::bigint, '999997200000');

select is((select count(distinct name)::integer from expected), 25, 'every vector case is here');

select tests.create_household('a') as a \gset
select set_config('esta.actor', 'system:test', true);
insert into private.local_stack default values on conflict do nothing;
insert into public.test_clock (id, frozen_now) values (true, '2026-10-07T09:00:00+07:00')
  on conflict (id) do update set frozen_now = excluded.frozen_now;

insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000a0a5', :'a', 'individual', 'Hoàng Văn Em Demo', array['tenant']);

-- One lease on its own room per case, and one invoice per vector row, with the payment that already part-paid it.
create temporary table rows_in on commit drop as
select e.*,
  format('00000000-0000-4000-8001-%s', lpad(c.n::text, 12, '0'))::uuid as unit_id,
  format('00000000-0000-4000-8002-%s', lpad(c.n::text, 12, '0'))::uuid as lease_id,
  format('00000000-0000-4000-8003-%s', lpad(row_number() over (order by e.name, e.bill)::text, 12, '0'))::uuid as invoice_id,
  format('00000000-0000-4000-8004-%s', lpad(row_number() over (order by e.name, e.bill)::text, 12, '0'))::uuid as prior_id,
  row_number() over (order by e.name, e.bill) as rn
from expected e
join (select name, row_number() over (order by name) as n from (select distinct name from expected) named) c using (name);
grant select on rows_in to authenticated;

insert into public.units (id, household_id, property_id, label, kind)
select distinct unit_id, :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng ' || right(unit_id::text, 3), 'room' from rows_in;
insert into public.leases (id, household_id, property_id, unit_id, tenant_party_id, start_date, rent_vnd, status)
select distinct lease_id, :'a', '00000000-0000-4000-8000-0000000000a1', unit_id, '00000000-0000-4000-8000-00000000a0a5', '2026-01-01', 3500000, 'active'
from rows_in;
insert into public.invoices (id, household_id, lease_id, period_start, period_end, due_date, issue_on, number, status, issued_at, voided_reason)
select invoice_id, :'a', lease_id, period_start, (period_start + interval '1 month' - interval '1 day')::date, due_date, period_start,
  'Q09-' || to_char(period_start, 'YYYYMM') || '-' || lpad(rn::text, 3, '0'), status,
  case when status = 'draft' then null else period_start::timestamptz end,
  case when status = 'void' then 'Demo' end
from rows_in;
insert into public.invoice_lines (household_id, invoice_id, kind, unit_price_vnd, amount_vnd)
select :'a', invoice_id, kind, total_vnd, total_vnd from rows_in;
insert into public.payments (id, household_id, payer_party_id, amount_vnd, received_on, method)
select prior_id, :'a', '00000000-0000-4000-8000-00000000a0a5', paid_vnd, '2026-09-01', 'cash' from rows_in where paid_vnd > 0;
insert into public.payment_allocations (household_id, payment_id, invoice_id, amount_vnd)
select :'a', prior_id, invoice_id, paid_vnd from rows_in where paid_vnd > 0;

-- Records the case's payment the way the sheet does: the payer's choice if any bill is chosen, else the oldest open bill
-- as the row, owing what the open bills owe, and returns what each bill took and what was left.
create function pg_temp.run_case(p_name text) returns table (bill text, allocated_vnd bigint, credit text)
language plpgsql as $$
declare
  v_payment bigint;
  v_key uuid := md5(p_name)::uuid;
  v_choice boolean;
  v_anchor uuid;
  v_owed bigint;
  v_ids uuid[];
begin
  select r.payment_vnd, bool_or(r.chosen = 'yes') into v_payment, v_choice from rows_in r where r.name = p_name group by r.payment_vnd;
  select (array_agg(r.invoice_id order by r.due_date desc, r.period_start desc, r.invoice_id desc))[1],
    sum(greatest(r.total_vnd - r.paid_vnd, 0)),
    case when v_choice then array_agg(r.invoice_id) end
  into v_anchor, v_owed, v_ids
  from rows_in r
  where r.name = p_name and r.status = 'issued' and r.total_vnd > r.paid_vnd and (not v_choice or r.chosen = 'yes');
  begin
    perform * from public.record_payment(v_anchor, v_owed, v_payment, 'cash', '2026-10-07', v_key, v_ids);
  exception when check_violation then
    return query select r.bill, 0::bigint, 'refused' from rows_in r where r.name = p_name;
    return;
  end;
  return query
    select r.bill,
      coalesce((select sum(a.amount_vnd) from public.payment_allocations a join public.payments p on p.id = a.payment_id
        where p.idempotency_key = v_key and a.invoice_id = r.invoice_id), 0)::bigint,
      (v_payment - coalesce((select sum(a.amount_vnd) from public.payment_allocations a join public.payments p on p.id = a.payment_id
        where p.idempotency_key = v_key), 0))::text
    from rows_in r where r.name = p_name;
end;
$$;

select tests.act_as('member.a@test.esta.test');

create temporary view got as
select c.name, r.bill, r.allocated_vnd, r.credit
from (select distinct name from expected) c cross join lateral pg_temp.run_case(c.name) r;
grant select on got to authenticated;

select is_empty(
  $$ select name, bill, allocated_vnd, credit from got except select name, bill, allocated_vnd, credit from expected $$,
  'record_payment settles no bill differently from the vectors allocatePayment passes');
select is_empty(
  $$ select name, bill, allocated_vnd, credit from expected except select name, bill, allocated_vnd, credit from got $$,
  'and every vector row is answered');

select * from finish();
rollback;
