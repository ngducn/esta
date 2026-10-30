-- Bank statements are for admins only, so their audit history is too (#353). Before this, a member or a viewer read
-- every imported statement line through audit_log.
alter policy audit_log_select on public.audit_log
  using (
    private.is_member(household_id, 'viewer')
    and (
      table_name not in ('agent_jobs', 'agent_runs', 'agent_items', 'conversations', 'messages', 'statement_imports', 'statement_rows')
      or (table_name in ('agent_jobs', 'agent_runs', 'agent_items') and private.is_operator(household_id))
      or (table_name = 'agent_items' and private.agent_item_audience(row_id) = 'all')
      or (table_name in ('conversations', 'messages') and private.thread_row_creator(table_name, row_id) = (select auth.uid()))
      or (table_name in ('statement_imports', 'statement_rows') and private.is_member(household_id, 'admin'))
    )
  );
