alter table public.properties
  add column acquired_on date,
  add column acquisition_kind text check (acquisition_kind in ('purchase', 'inheritance', 'gift', 'allocation', 'other')),
  add column acquisition_price_vnd bigint check (acquisition_price_vnd between 0 and 9007199254740991),
  add column notes text check (char_length(notes) <= 4000);

-- SPEC §5.3 lists the keys each kind may carry; every key is optional, and a key from another kind is refused,
-- so changing a property's kind must also replace its details.
create function private.valid_kind_details(p_kind text, p_details jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select jsonb_typeof(p_details) = 'object' and not exists (
    select 1
    from jsonb_each(p_details) as d (key, value)
    cross join lateral (
      select
        jsonb_typeof(d.value) = 'string' and btrim(d.value #>> '{}') <> '' and char_length(d.value #>> '{}') <= 120 as is_text,
        case when jsonb_typeof(d.value) = 'number' then d.value::numeric end as num
    ) as v
    where not case
      when p_kind = 'apartment' then case d.key
        when 'building_name' then v.is_text
        when 'block' then v.is_text
        when 'unit_no' then v.is_text
        when 'floor' then coalesce(v.num = trunc(v.num) and v.num between -10 and 200, false)
        when 'management_fee_vnd' then coalesce(v.num = trunc(v.num) and v.num between 0 and 9007199254740991, false)
        else false
      end
      when p_kind = 'rooming_house' then
        d.key = 'room_count' and coalesce(v.num = trunc(v.num) and v.num between 1 and 1000, false)
      when p_kind in ('residential_land', 'agricultural_land') then
        d.key in ('frontage_m', 'road_width_m') and coalesce(v.num > 0 and v.num < 10000, false)
      else false
    end
  );
$$;

revoke all on function private.valid_kind_details(text, jsonb) from public;
grant execute on function private.valid_kind_details(text, jsonb) to authenticated, service_role;

alter table public.properties add constraint properties_kind_details check (private.valid_kind_details(kind, kind_details));

-- An INSERT could store a wrapped point the same way a direct UPDATE could (#84), so creating a property never sets a
-- pin or boundary: those go through set_property_location and set_property_boundary once the row exists. Grants are
-- per column, so every column a later migration adds must be granted here too; property_details.test.sql fails until it is.
revoke insert on table public.properties from authenticated;
do $$
declare
  v_columns text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_columns
  from information_schema.columns
  where table_schema = 'public' and table_name = 'properties' and column_name not in ('location', 'boundary');
  execute format('grant insert (%s) on table public.properties to authenticated', v_columns);
end;
$$;
grant update (acquired_on, acquisition_kind, acquisition_price_vnd, notes) on table public.properties to authenticated;
