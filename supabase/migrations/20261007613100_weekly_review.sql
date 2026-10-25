-- The Sunday weekly review leaves one note of its own kind, so Home never reads it as the morning brief.
alter table public.agent_items drop constraint agent_items_kind_check;
alter table public.agent_items add constraint agent_items_kind_check
  check (kind in ('brief', 'alert', 'proposal', 'answer_note', 'research_scan_empty', 'system', 'weekly'));

-- The operator diagnostics page shows which credential and mode the worker runs with. Both are fixed words the check
-- constraints allow, never a token, and the hostname stays unreadable.
grant select (auth_mode, agent_mode) on table public.worker_heartbeats to authenticated;
