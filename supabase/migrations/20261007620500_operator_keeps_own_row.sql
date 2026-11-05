-- The operator is the only one who can grant the flag, and the update policy needs admin, so an operator who drops
-- below admin or removes their own row cannot be put back from the app. Refuse both for a signed-in user.
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
  return coalesce(new, old);
end;
$$;
revoke all on function private.guard_operator_row_stays() from public;

create trigger guard_operator_row_stays
  before update of role or delete on public.household_members
  for each row execute function private.guard_operator_row_stays();
