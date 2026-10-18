-- SPEC D8 now signs in with a password (Ryan's ruling, 2026-10-19), so passwords are kept again, but only one written
-- after the email is confirmed. GoTrue keeps a password from an unconfirmed signup when the owner later confirms by
-- code, so whoever signed up first with another person's address would hold a working password to that account and
-- to every invite it claims.
drop trigger drop_password on auth.users;
drop function private.drop_password();

create function private.drop_unconfirmed_password()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.encrypted_password is distinct from ''
     and (new.email_confirmed_at is null or (tg_op = 'UPDATE' and old.email_confirmed_at is null)) then
    new.encrypted_password := '';
  end if;
  return new;
end;
$$;
revoke all on function private.drop_unconfirmed_password() from public;

create trigger drop_unconfirmed_password
  before insert or update on auth.users
  for each row
  execute function private.drop_unconfirmed_password();
