-- The operator is the only one who can grant the flag, and the update policy needs admin, so an operator who drops
-- below admin, removes their own row or clears their own flag cannot be put back from the app. Refuse all three for a
-- signed-in user. Clearing the flag is refused whoever's it is when no other signed-in operator would remain.
create function private.guard_operator_row_stays()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and old.is_operator then
    if tg_op = 'UPDATE' and new.role is distinct from old.role and new.role <> 'admin' then
      raise exception 'the operator keeps the admin role and the row'
        using errcode = '42501';
    end if;
    if tg_op = 'DELETE' and old.user_id is not null and old.user_id = (select auth.uid()) then
      raise exception 'the operator keeps the admin role and the row'
        using errcode = '42501';
    end if;
  end if;
  if current_user = 'authenticated' and tg_op = 'UPDATE' and old.is_operator and not new.is_operator
     and old.user_id is not null
     and not exists (
       select 1
       from public.household_members m
       where m.household_id = old.household_id
         and m.id <> old.id
         and m.is_operator
         and m.user_id is not null
     ) then
    raise exception 'the household keeps an operator'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function private.guard_operator_row_stays() from public;

create trigger guard_operator_row_stays
  before update of role, is_operator or delete on public.household_members
  for each row execute function private.guard_operator_row_stays();
