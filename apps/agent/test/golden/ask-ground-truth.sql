with demo as (select id from public.households where name = 'Gia đình Demo')
select 'q1' as question, 'di-an income received in October 2026' as figure, coalesce(sum(a.amount_vnd), 0)::bigint as value
from public.allocation_facts a
join public.properties p on p.id = a.property_id
where a.household_id = (select id from demo) and p.code = 'DIAN' and a.received_on between '2026-10-01' and '2026-10-31'
order by question, figure;
