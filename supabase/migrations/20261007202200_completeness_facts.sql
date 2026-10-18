-- One row per live property with the facts the completeness registry (packages/core/src/completeness) scores.
-- P2-02 and P3-07 replace the view to add their document facts.
create view public.property_completeness_facts with (security_invoker = true) as
select
  p.id as property_id,
  p.household_id,
  p.kind,
  coalesce(p.current_address ->> 'commune_code', '') <> ''
    and coalesce(btrim(p.current_address ->> 'street'), '') <> '' as has_current_address,
  p.location is not null as has_location,
  p.acquired_on is not null and p.acquisition_kind is not null as has_acquisition,
  coalesce(parcel.total, 0)::integer as parcel_count,
  parcel.without_number_id as parcel_without_number_id,
  parcel.without_area_id as parcel_without_area_id,
  coalesce(structure.total, 0)::integer as structure_count,
  structure.without_floor_area_id as structure_without_floor_area_id,
  coalesce(share.total_bp, 0)::integer as share_total_bp,
  coalesce(account.total, 0)::integer as utility_account_count
from public.properties p
left join lateral (
  select
    count(*) as total,
    (array_agg(x.id order by x.created_at, x.id) filter (where x.parcel_no is null or x.map_sheet_no is null))[1] as without_number_id,
    (array_agg(x.id order by x.created_at, x.id) filter (where x.area_m2 is null))[1] as without_area_id
  from public.parcels x
  where x.household_id = p.household_id and x.property_id = p.id
) parcel on true
left join lateral (
  select
    count(*) as total,
    (array_agg(x.id order by x.created_at, x.id) filter (where x.floor_area_m2 is null))[1] as without_floor_area_id
  from public.structures x
  where x.household_id = p.household_id and x.property_id = p.id
) structure on true
left join lateral (
  select sum(x.share_bp) as total_bp
  from public.ownership_shares x
  where x.household_id = p.household_id and x.property_id = p.id
) share on true
left join lateral (
  select count(*) as total
  from public.utility_accounts x
  where x.household_id = p.household_id and x.property_id = p.id
) account on true
where p.deleted_at is null;

revoke all on public.property_completeness_facts from anon, authenticated;
grant select on public.property_completeness_facts to authenticated;
