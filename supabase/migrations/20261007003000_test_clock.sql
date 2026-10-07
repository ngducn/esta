create table public.test_clock (
  id boolean primary key default true check (id),
  frozen_now timestamptz not null
);

alter table public.test_clock enable row level security;
revoke all on table public.test_clock from anon, authenticated, service_role;
grant select on table public.test_clock to anon, authenticated;
grant select, insert, update, delete on table public.test_clock to service_role;

create policy test_clock_select on public.test_clock
  for select to anon, authenticated
  using (true);
