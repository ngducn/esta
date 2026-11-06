-- A task proposal's due date is checked against the day it is made (#331). The worker already refuses a date before
-- today; the database now refuses it too (if TS refuses it, the database refuses it). Only the creation path asks:
-- approve_proposal asks private.proposal_refusal alone, so a card whose date passed while it waited can still be approved.
create or replace function public.proposal_refusal(p_household_id uuid, p_proposal jsonb)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.proposal_refusal(p_household_id, p_proposal, private.business_date(private.audit_now())),
    case when p_proposal ->> 'type' = 'create_task' and (p_proposal -> 'params' ->> 'due_on')::date < private.business_date(private.audit_now())
      then 'ESTA_PROPOSAL_DUE_PAST' end
  );
$$;
