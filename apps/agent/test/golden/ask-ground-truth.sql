/* The figures each AGENT.md §7.4 answer must state on the full seed at 2026-10-07, read straight from the tables, so a
   tool that reads or counts wrong fails the golden. Like the screens, it counts live properties only and no draft lease,
   and an empty unit is empty from the day after its last lease ended, as its `Trống từ` pill says. Tax revenue follows FIN-3: each period's year share and accrued part
   split by days with the largest remainder, ties to the earlier part, then the owners' shares (whole or halves on this
   seed, ordered by id). */
with demo as (select id from public.households where name = 'Gia đình Demo'),
prop as (select id, code, nickname from public.properties where household_id = (select id from demo) and deleted_at is null),
overdue as (
  select u.label, '2026-10-07'::date - b.due_date as days, b.outstanding_vnd, t.full_name as tenant, b.due_date
  from public.invoice_balances b join public.leases l on l.id = b.lease_id join public.units u on u.id = l.unit_id join public.parties t on t.id = l.tenant_party_id
  where b.household_id = (select id from demo) and l.property_id = (select id from prop where code = 'DIAN')
    and b.status = 'issued' and b.outstanding_vnd > 0 and b.due_date < '2026-10-07'),
ending as (
  select p.nickname, l.end_date, l.end_date - '2026-10-07'::date as days
  from public.leases l join prop p on p.id = l.property_id
  where l.status = 'active' and l.end_date between '2026-10-07' and '2026-12-06'),
leases_ as (select l.* from public.leases l where l.household_id = (select id from demo) and l.status <> 'draft' and l.start_date <= '2026-12-31'),
periods as (select l.id as lease_id, l.status, s.period_start as ps, s.period_end as pe, s.rent_vnd as a from leases_ l cross join lateral private.lease_periods(l, '2026-12-31') s),
in_year as (
  select lease_id, status, greatest(ps, '2026-01-01'::date) as ys, least(pe, '2026-12-31'::date) as ye,
    case
      when ps < '2026-01-01' then a - (a * (('2025-12-31'::date - ps) + 1) / ((pe - ps) + 1)
        + case when a - a * (('2025-12-31'::date - ps) + 1) / ((pe - ps) + 1) - a * ((pe - '2026-01-01'::date) + 1) / ((pe - ps) + 1) = 1
          and a * (('2025-12-31'::date - ps) + 1) % ((pe - ps) + 1) >= a * ((pe - '2026-01-01'::date) + 1) % ((pe - ps) + 1) then 1 else 0 end)
      when pe > '2026-12-31' then a * (('2026-12-31'::date - ps) + 1) / ((pe - ps) + 1)
        + case when a - a * (('2026-12-31'::date - ps) + 1) / ((pe - ps) + 1) - a * ((pe - '2027-01-01'::date) + 1) / ((pe - ps) + 1) = 1
          and a * (('2026-12-31'::date - ps) + 1) % ((pe - ps) + 1) >= a * ((pe - '2027-01-01'::date) + 1) % ((pe - ps) + 1) then 1 else 0 end
      else a end as share
  from periods where pe >= '2026-01-01' and ps <= '2026-12-31'),
accrual as (
  select lease_id, status, share,
    case when ye <= '2026-10-07' then share when ys > '2026-10-07' then 0
      else share * (('2026-10-07'::date - ys) + 1) / ((ye - ys) + 1)
        + case when share - share * (('2026-10-07'::date - ys) + 1) / ((ye - ys) + 1) - share * ((ye - '2026-10-08'::date) + 1) / ((ye - ys) + 1) = 1
          and share * (('2026-10-07'::date - ys) + 1) % ((ye - ys) + 1) >= share * ((ye - '2026-10-08'::date) + 1) % ((ye - ys) + 1) then 1 else 0 end end as accrued
  from in_year),
per_lease as (
  select l.property_id, sum(a.accrued)::bigint as acc, sum(case when a.status = 'active' then a.share - a.accrued else 0 end)::bigint as rem
  from accrual a join leases_ l on l.id = a.lease_id group by l.id, l.property_id),
shares as (select s.*, row_number() over (partition by property_id order by id) as idx from public.ownership_shares s where household_id = (select id from demo)),
owner_parts as (
  select s.party_id,
    div(p.acc * s.share_bp, 10000) + case when s.idx <= p.acc - (select sum(div(p.acc * o.share_bp, 10000)) from shares o where o.property_id = s.property_id) then 1 else 0 end as acc,
    div(p.rem * s.share_bp, 10000) + case when s.idx <= p.rem - (select sum(div(p.rem * o.share_bp, 10000)) from shares o where o.property_id = s.property_id) then 1 else 0 end as rem
  from per_lease p join shares s on s.property_id = p.property_id),
me as (select sum(o.acc) as accrued, sum(o.acc + o.rem) as projected from owner_parts o join public.parties t on t.id = o.party_id where t.full_name = 'Nguyễn Thị Demo'),
paid as (
  select t.full_name, b.due_date,
    (select min(x.received_on) from (select f.received_on, sum(f.amount_vnd) over (order by f.received_on, f.payment_id) as covered from public.allocation_facts f where f.invoice_id = b.id) x where x.covered >= b.total_vnd) as paid_on
  from public.invoice_balances b join public.leases l on l.id = b.lease_id join public.parties t on t.id = l.tenant_party_id
  where b.household_id = (select id from demo) and b.status = 'issued' and b.total_vnd > 0 and b.due_date between '2026-01-01' and '2026-10-07'),
lateness as (
  select full_name, count(*) as bills, count(*) filter (where paid_on > due_date) as late, avg(paid_on - due_date) filter (where paid_on > due_date) as days
  from paid group by full_name order by late desc, count(*) filter (where paid_on > due_date)::numeric / count(*) desc, days desc nulls last limit 1),
yield as (
  select round(s.monthly_rent_vnd * 12 * 10000.0 / (select v.value_vnd from public.valuations v where v.property_id = l.property_id and v.as_of <= '2026-10-07' order by v.as_of desc limit 1)) as bp
  from public.leases l cross join lateral private.lease_periods(l, '2026-10-07') s
  where l.property_id = (select id from prop where code = 'Q1') and l.status = 'active' and '2026-10-07' between s.period_start and s.period_end)
select question, figure, value from (
  select 'q1' as question, 'di-an income received in October 2026' as figure,
    (select coalesce(sum(a.amount_vnd), 0) from public.allocation_facts a where a.property_id = (select id from prop where code = 'DIAN') and a.received_on between '2026-10-01' and '2026-10-31')::text as value
  union all select 'q1', 'di-an income received in August 2026', (select coalesce(sum(a.amount_vnd), 0) from public.allocation_facts a where a.property_id = (select id from prop where code = 'DIAN') and a.received_on between '2026-08-01' and '2026-08-31')::text
  union all select 'q1', 'di-an income received in September 2026', (select coalesce(sum(a.amount_vnd), 0) from public.allocation_facts a where a.property_id = (select id from prop where code = 'DIAN') and a.received_on between '2026-09-01' and '2026-09-30')::text
  union all select 'q2', 'di-an units overdue', (select string_agg(label, ', ' order by label) from overdue)
  union all select 'q2', 'di-an days overdue', (select string_agg(days::text, ', ' order by label) from overdue)
  union all select 'q2', 'di-an amount overdue', (select sum(outstanding_vnd)::text from overdue)
  union all select 't1', 'di-an overdue tenant', (select string_agg(tenant, ', ' order by label) from overdue)
  union all select 't1', 'di-an overdue due date', (select string_agg(due_date::text, ', ' order by label) from overdue)
  union all select 'q3', 'leases ending within 60 days', (select string_agg(nickname, ', ' order by end_date) from ending)
  union all select 'q3', 'their end dates', (select string_agg(end_date::text, ', ' order by end_date) from ending)
  union all select 'q3', 'their days left', (select string_agg(days::text, ', ' order by end_date) from ending)
  union all select 'q4', 'deposits held', (select sum(case d.kind when 'received' then d.amount_vnd else -d.amount_vnd end)::text from public.deposit_entries d join public.leases l on l.id = d.lease_id join prop p on p.id = l.property_id where l.status <> 'draft')
  union all select 'q5', 'Nguyễn Thị Demo accrued 2026', (select accrued::text from me)
  union all select 'q5', 'Nguyễn Thị Demo projected 2026', (select projected::text from me)
  union all select 'q5', 'remaining to the 500 million threshold', (select (500000000 - projected - coalesce((select other_business_revenue_vnd from public.owner_tax_inputs i join public.parties t on t.id = i.party_id where i.household_id = (select id from demo) and t.full_name = 'Nguyễn Thị Demo' and i.year = 2026), 0))::text from me)
  union all select 'q6', 'bien-hoa days empty', (select ('2026-10-07'::date - max(l.end_date))::text from public.leases l where l.property_id = (select id from prop where code = 'BIENHOA'))
  union all select 'q6', 'bien-hoa empty since', (select (max(coalesce(l.terminated_on, l.end_date)) + 1)::text from public.leases l where l.property_id = (select id from prop where code = 'BIENHOA') and l.status in ('ended', 'terminated'))
  union all select 'q7', 'q7 repairs paid in 2026', (select sum(amount_vnd)::text from public.expenses where property_id = (select id from prop where code = 'Q7') and category = 'repair' and deleted_at is null and paid_on between '2026-01-01' and '2026-12-31')
  union all select 'q8', 'bao-loc mortgage bank', (select t.full_name from public.certificates c join public.parties t on t.id = (c.mortgage ->> 'bank_party_id')::uuid where c.property_id = (select id from prop where code = 'BAOLOC') and c.status = 'mortgaged')
  union all select 'q8', 'bao-loc mortgage amount', (select c.mortgage ->> 'amount_vnd' from public.certificates c where c.property_id = (select id from prop where code = 'BAOLOC') and c.status = 'mortgaged')
  union all select 'q9', 'q1 gross yield bp', (select bp::text from yield)
  union all select 'q10', 'tenant who paid late most often', (select full_name from lateness)
  union all select 'q10', 'their bills paid late', (select late::text from lateness)
  union all select 'q10', 'their bills', (select bills::text from lateness)
  union all select 'q10', 'their average days late', (select round(days)::text from lateness)
) truth
order by question, figure;
