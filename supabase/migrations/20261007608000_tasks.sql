-- Tasks (SPEC §5.5): a to-do for the household, typed by a member or created by approving an assistant proposal.
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  property_id uuid,
  lease_id uuid,
  title text not null check (btrim(title) <> '' and char_length(title) <= 200),
  due_on date,
  status text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  assignee_member_id uuid,
  source text not null default 'user' check (source in ('user', 'agent_proposal')),
  agent_item_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  check (source = 'agent_proposal' or agent_item_id is null),
  foreign key (household_id, property_id) references public.properties (household_id, id) on delete cascade,
  foreign key (household_id, lease_id) references public.leases (household_id, id) on delete cascade,
  foreign key (household_id, assignee_member_id) references public.household_members (household_id, id) on delete set null (assignee_member_id),
  foreign key (household_id, agent_item_id) references public.agent_items (household_id, id) on delete set null (agent_item_id)
);
create index tasks_household_open_idx on public.tasks (household_id, due_on) where status = 'open';

select private.enable_household_rls('public.tasks', 'member');
select private.enable_audit('public.tasks');

-- Only approve_proposal says a task came from the assistant, so a member's own write cannot pose as an approval.
revoke insert, update on table public.tasks from authenticated;
grant insert (id, household_id, property_id, lease_id, title, due_on, status, assignee_member_id) on table public.tasks to authenticated;
grant update (household_id, property_id, lease_id, title, due_on, status, assignee_member_id) on table public.tasks to authenticated;

-- Approved and failed are what approve_proposal decided; a member's own update cannot set them or undo them.
alter policy agent_items_update on public.agent_items
  using (
    private.is_member(household_id, 'member') and (audience = 'all' or private.is_operator(household_id))
    and status not in ('approved', 'failed')
  )
  with check (
    private.is_member(household_id, 'member') and (audience = 'all' or private.is_operator(household_id))
    and status not in ('approved', 'failed')
  );

-- AGT-6: a member approves a proposal and its effect lands under her session in the same transaction, exactly once.
-- The row lock makes a second approval wait and then read `approved`, so a double tap, two devices and a retry all
-- converge on the one effect. `p_params_valid` is the registry's zod verdict at approval time (packages/core
-- proposals); params that no longer parse, like a subject that is gone, mark the item `failed` and write nothing else.
create function public.approve_proposal(p_item_id uuid, p_params_valid boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.agent_items;
  v_params jsonb;
  v_now timestamptz := private.audit_now();
  v_applies boolean := p_params_valid;
begin
  select * into v_item from public.agent_items i
  where i.id = p_item_id and i.kind = 'proposal'
    and private.is_member(i.household_id, 'member') and (i.audience = 'all' or private.is_operator(i.household_id))
  for update;
  if not found then
    raise exception 'ESTA_PROPOSAL_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_item.status in ('approved', 'failed') then
    return v_item.status;
  end if;
  if v_item.status not in ('new', 'read') then
    raise exception 'ESTA_PROPOSAL_DECIDED' using errcode = '55000';
  end if;

  v_params := v_item.proposal -> 'params';
  if v_applies then
    case v_item.proposal ->> 'type'
      when 'create_task' then
        v_applies := (v_params ->> 'property_id' is null or exists (
            select 1 from public.properties p
            where p.household_id = v_item.household_id and p.id = (v_params ->> 'property_id')::uuid and p.deleted_at is null
          ))
          and (v_params ->> 'lease_id' is null or exists (
            select 1 from public.leases l
            where l.household_id = v_item.household_id and l.id = (v_params ->> 'lease_id')::uuid and l.status in ('draft', 'active')
          ));
        if v_applies then
          insert into public.tasks (household_id, property_id, lease_id, title, due_on, source, agent_item_id)
          values (
            v_item.household_id, (v_params ->> 'property_id')::uuid, (v_params ->> 'lease_id')::uuid,
            v_params ->> 'title', (v_params ->> 'due_on')::date, 'agent_proposal', v_item.id
          );
        end if;
      else
        v_applies := false;
    end case;
  end if;

  update public.agent_items
  set status = case when v_applies then 'approved' else 'failed' end, decided_by = (select auth.uid()), decided_at = v_now
  where id = v_item.id;
  return case when v_applies then 'approved' else 'failed' end;
end;
$$;
revoke all on function public.approve_proposal(uuid, boolean) from public, anon;
grant execute on function public.approve_proposal(uuid, boolean) to authenticated;
