-- Connector change batches (CONNECTOR.md §3.4): one row per plan Claude shows Ryan. The connector stores the plan as
-- `planned`, claims it once with `applying` so a second apply finds nothing to claim, and ends it `applied` or
-- `partial` with what landed. `undone` arrives with batch undo. A plan expires 30 minutes after `planned_at`, which
-- comes from the injected clock. Only an operator plans, only the planner applies (§3.3), and every member reads.
create table public.change_batches (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  summary text not null check (btrim(summary) <> ''),
  via text not null default 'claude' check (via in ('claude')),
  status text not null default 'planned' check (status in ('planned', 'applying', 'applied', 'partial', 'undone')),
  plan jsonb not null check (jsonb_typeof(plan) = 'object'),
  outcomes jsonb check (jsonb_typeof(outcomes) = 'array'),
  planned_at timestamptz not null,
  applied_at timestamptz,
  undone_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  constraint change_batches_applied check ((status = 'planned') = (applied_at is null)),
  constraint change_batches_outcomes check ((status in ('applied', 'partial', 'undone')) = (outcomes is not null)),
  constraint change_batches_undone check ((status = 'undone') = (undone_at is not null))
);

create index change_batches_household_planned_at on public.change_batches (household_id, planned_at desc);

select private.enable_household_rls('public.change_batches', 'admin');
select private.enable_audit('public.change_batches');

drop policy change_batches_insert on public.change_batches;
drop policy change_batches_update on public.change_batches;
drop policy change_batches_delete on public.change_batches;
create policy change_batches_insert on public.change_batches for insert to authenticated
  with check (private.is_member(household_id, 'admin') and private.is_operator(household_id));
create policy change_batches_update on public.change_batches for update to authenticated
  using (created_by = (select auth.uid()) and private.is_member(household_id, 'admin') and private.is_operator(household_id))
  with check (private.is_member(household_id, 'admin') and private.is_operator(household_id));

-- What Ryan approved never changes after planning, nor what landed once recorded, and a batch only moves forward: a claimed or finished batch can
-- never be planned again, so it is applied at most once.
create function private.guard_change_batch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.summary, new.via, new.plan, new.planned_at, new.created_by)
       is distinct from (old.summary, old.via, old.plan, old.planned_at, old.created_by)
     or (old.outcomes is not null and new.outcomes is distinct from old.outcomes) then
    raise exception 'ESTA_BATCH_FROZEN' using errcode = '23514';
  end if;
  if new.status is distinct from old.status and (old.status, new.status) not in (
    ('planned', 'applying'), ('applying', 'applied'), ('applying', 'partial'), ('applied', 'undone'), ('partial', 'undone')) then
    raise exception 'ESTA_BATCH_TRANSITION' using errcode = '23514', detail = format('%s to %s', old.status, new.status);
  end if;
  return new;
end;
$$;
revoke all on function private.guard_change_batch() from public;

create trigger guard_change_batch
  before update on public.change_batches
  for each row execute function private.guard_change_batch();
