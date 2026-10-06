-- SPEC D8 signs in with an email code only. GoTrue has no switch to turn off password signup or the password
-- grant, and a password set by whoever signs up first survives the owner's code confirmation, so no user keeps one.
create function private.drop_password()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.encrypted_password := '';
  return new;
end;
$$;
revoke all on function private.drop_password() from public;

create trigger drop_password
  before insert or update on auth.users
  for each row
  when (new.encrypted_password is distinct from '')
  execute function private.drop_password();
