-- Ground truth for the Ask golden questions (AGENT.md §7.4) on the `full` seed as of 2026-10-07 07:00 +07:00, for
-- the household `Gia đình Demo`. One row per answer figure: the question, the figure, its value. `pnpm seed:facts`
-- checks these rows against ask-ground-truth.json, which the replay golden test compares each answer with.
with demo as (select id from public.households where name = 'Gia đình Demo')
select 'q1' as question, 'di-an income received in October 2026' as figure, coalesce(sum(a.amount_vnd), 0)::bigint as value
from public.allocation_facts a
join public.properties p on p.id = a.property_id
where a.household_id = (select id from demo) and p.code = 'DIAN' and a.received_on between '2026-10-01' and '2026-10-31'
order by question, figure;
