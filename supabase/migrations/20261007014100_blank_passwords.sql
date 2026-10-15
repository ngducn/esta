-- The drop_password trigger (20261007009100) blanks a password only when a row is written, so a user who
-- signed up with one before that migration keeps it. Blank them all once, wherever the migrations run.
create function private.blank_passwords()
returns bigint
language sql
set search_path = ''
as $$
  with blanked as (
    update auth.users set encrypted_password = ''
    where encrypted_password is distinct from ''
    returning 1
  )
  select count(*) from blanked;
$$;
revoke all on function private.blank_passwords() from public;

select private.blank_passwords();
