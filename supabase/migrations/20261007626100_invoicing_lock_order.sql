-- The nightly run numbers a property's bills in room order, and rooms can be re-sorted or renamed between two runs, so
-- the order it walks the leases in is not a fixed lock order any more. A batch undo locks several leases in id order
-- (lock_batch_rows), and a run that walked the same leases by room could wait on the undo while the undo waited on it.
-- The run now locks every lease it will bill in id order first, the order every other multi-lease locker uses, and only
-- then walks them by room, so the numbers follow the room order and no two lockers can wait on each other in a circle.
-- Rooms that tie on their sort order go by name in number order too.
-- A room label in number order, as the screens sort rooms: Phòng 9 before Phòng 10. Each run of digits is padded to a
-- fixed width, so plain text order puts the number in its right place.
create function private.natural_key(p_label text)
returns text
language sql
immutable
set search_path = ''
as $fn$
  select coalesce(string_agg(case when m[1] ~ '^[0-9]' then lpad(m[1], 12, '0') else lower(m[1]) end, '' order by n), '')
  from regexp_matches(p_label, '([0-9]+|[^0-9]+)', 'g') with ordinality as t(m, n);
$fn$;
revoke all on function private.natural_key(text) from public;

create or replace function public.run_invoicing(p_household_id uuid, p_as_of date, p_issued_at timestamptz)
returns table (drafted integer, issued integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lease uuid;
  v_billed uuid[];
  v_done record;
begin
  if p_household_id is null or p_as_of is null or p_issued_at is null then
    raise exception 'ESTA_CRON_ARGUMENTS' using errcode = '22004';
  end if;
  drafted := 0;
  issued := 0;
  v_billed := array(
    select l.id from public.leases l
    where l.household_id = p_household_id and (
      l.status = 'active'
      or (l.status = 'terminated' and l.end_date >= p_as_of)
      or (l.status in ('ended', 'terminated') and exists (
        select 1 from public.invoices i where i.lease_id = l.id and i.status = 'draft' and i.issue_on <= p_as_of
      ))
    )
  );
  -- Locks are taken in the order the sorted rows come out, so this order is the lock order.
  perform 1 from public.leases l where l.id = any (v_billed) order by l.id for no key update;
  for v_lease in
    select l.id from public.leases l
    join public.units u on u.id = l.unit_id
    where l.id = any (v_billed)
    order by l.property_id, u.sort_order, private.natural_key(u.label), u.label, u.id, l.id
  loop
    select * into v_done from private.issue_invoices(v_lease, p_as_of, p_issued_at);
    drafted := drafted + v_done.drafted;
    issued := issued + v_done.issued;
  end loop;
  return next;
end;
$$;
