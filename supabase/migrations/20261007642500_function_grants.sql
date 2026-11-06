-- Supabase's default privileges grant EXECUTE on every new function in public to anon, and Postgres
-- grants a new function to PUBLIC. The `revoke ... from public` in earlier migrations covered most
-- of them, but on main's catalog five of the 60 public functions were still open to a signed-out
-- caller (invoice_qr_by_token, log_export_downloads, esta_unaccent, admin_name_fold, admin_name_key),
-- and private.touch_updated_at was open through PUBLIC. Only the bill-by-token lookup is meant for anon.
-- A new function is still granted to PUBLIC; that is closed per function and held by `pnpm db:test`
-- (scripts/function-grants.ts), because a global default revoke would also close the pg_temp helpers
-- the pgTAP files call as a member.
alter default privileges for role postgres in schema public revoke execute on functions from anon;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.invoice_qr_by_token(text) to anon;

-- A trigger function is not called through a grant; nothing needs it open to everyone.
revoke execute on function private.touch_updated_at() from public, anon;

-- Added by the statement import migration after this one was written: the same rule, open to a signed-in member only, since its views and tests call it as one.
revoke execute on function private.statement_text_key(text) from public, anon;
grant execute on function private.statement_text_key(text) to authenticated;
