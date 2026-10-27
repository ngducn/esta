alter table public.agent_items drop constraint agent_items_kind_check;
alter table public.agent_items add constraint agent_items_kind_check
  check (kind in ('brief', 'alert', 'proposal', 'answer_note', 'research_scan_empty', 'system', 'weekly'));

create function public.worker_modes(p_household_id uuid, p_seen_by timestamptz)
returns table (auth_mode text, agent_mode text)
language sql
stable
security definer
set search_path = ''
as $$
  select h.auth_mode, h.agent_mode
  from public.worker_heartbeats h
  where private.is_operator(p_household_id) and h.last_seen_at <= p_seen_by
  order by h.last_seen_at desc
  limit 1
$$;
revoke all on function public.worker_modes(uuid, timestamptz) from public, anon;
grant execute on function public.worker_modes(uuid, timestamptz) to authenticated;
