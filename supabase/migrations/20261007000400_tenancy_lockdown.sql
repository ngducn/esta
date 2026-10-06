create function private.guard_member_claim()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.user_id is distinct from (case when tg_op = 'UPDATE' then old.user_id end) then
    raise exception 'only the service role or a claim function links a member row to a user'
      using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.user_id is not null and new.invited_email is distinct from old.invited_email then
    raise exception 'a claimed member row keeps its invited email'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_member_claim() from public;

create trigger guard_member_claim
  before insert or update of user_id, invited_email on public.household_members
  for each row execute function private.guard_member_claim();

drop policy households_delete on public.households;
