-- A lease's yearly rent increase is stored as packages/core escalationJsonSchema reads it. Until now only its kind was
-- checked, so a step with no interval or a zero rounding passed storage and then failed activation with a raw error
-- (division by zero, or a loop bounded by null in private.plan_invoices). It is refused where it is written instead.

-- True when p_value is a JSON number written as a whole number from p_min to p_max. The digits are checked as text
-- before the cast, because Postgres may evaluate a cast before the conditions beside it.
create function private.jsonb_whole_between(p_value jsonb, p_min bigint, p_max bigint)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_value) = 'number'
      and case when p_value #>> '{}' ~ '^(0|[1-9][0-9]{0,12})$' then (p_value #>> '{}')::bigint between p_min and p_max else false end,
    false);
$$;
revoke all on function private.jsonb_whole_between(jsonb, bigint, bigint) from public;
grant execute on function private.jsonb_whole_between(jsonb, bigint, bigint) to authenticated;

alter table public.leases drop constraint leases_escalation_check;
alter table public.leases add constraint leases_escalation_check check (
  jsonb_typeof(escalation) = 'object'
  and case escalation ->> 'kind'
    when 'none' then true
    when 'percent' then private.jsonb_whole_between(escalation -> 'value', 1, 10000)
    when 'fixed' then private.jsonb_whole_between(escalation -> 'value', 0, 1000000000000)
    else false
  end
  and (escalation ->> 'kind' = 'none' or (
    private.jsonb_whole_between(escalation -> 'every_months', 1, 120)
    and (not escalation ? 'rounding_vnd' or private.jsonb_whole_between(escalation -> 'rounding_vnd', 1, 1000000000000))
  ))
);
