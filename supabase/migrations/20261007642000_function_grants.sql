-- Supabase's default privileges grant EXECUTE on every new function in public to anon, so the
-- `revoke ... from public` in earlier migrations left every public function open to a signed-out
-- caller. Only the bill-by-token lookup is meant for anon. Postgres itself still grants a new function to
-- PUBLIC; that is closed per function and held by `pnpm db:test` (scripts/function-grants.ts), because a
-- global default revoke would also close the pg_temp helpers the pgTAP files call as a member.
alter default privileges for role postgres in schema public revoke execute on functions from anon;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.invoice_qr_by_token(text) to anon;

-- A trigger function is not called through a grant; nothing needs it open to everyone.
revoke execute on function private.touch_updated_at() from public, anon;
