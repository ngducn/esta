begin;
\ir _harness.psql

-- A row some members may not read (creator-only, operator-only, admin-only) keeps its history from them too (#353).
-- The tables come from the catalog: every audited table whose select policy is narrower than household-wide. A new one
-- fails here until household a below holds a row of it that some member cannot read.
create function tests.private_tables()
returns setof text
language sql
stable
as $$
  select c.relname::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'audit_row')
    and not exists (
      select 1 from pg_policy p
      where p.polrelid = c.oid
        and p.polcmd in ('r', '*')
        and p.polpermissive
        and pg_get_expr(p.polqual, p.polrelid) in (
          'private.is_member(household_id, ''viewer''::member_role)',
          'private.is_member(id, ''viewer''::member_role)'))
  order by 1;
$$;

-- For every member of every household: the rows of the table she cannot read, and which of them she can still read
-- the history of. `checked` counts the hidden rows that have history, so a table with none proves nothing.
create function tests.audit_privacy(p_table text, out checked int, out leaks text[])
language plpgsql
as $$
declare
  v_member record;
  v_visible uuid[];
  v_history uuid[];
  v_hidden uuid[];
begin
  checked := 0;
  leaks := '{}';
  for v_member in
    select m.household_id, u.email
    from public.household_members m join auth.users u on u.id = m.user_id
    order by u.email
  loop
    perform tests.act_as(v_member.email);
    execute format('select coalesce(array_agg(id), ''{}'') from public.%I where household_id = $1', p_table)
      using v_member.household_id into v_visible;
    select coalesce(array_agg(distinct a.row_id), '{}') into v_history
    from public.audit_log a where a.table_name = p_table and a.household_id = v_member.household_id;
    reset role;
    perform tests.clear_request();
    execute format('select coalesce(array_agg(id), ''{}'') from public.%I where household_id = $1 and id <> all($2)', p_table)
      using v_member.household_id, v_visible into v_hidden;
    checked := checked + (select count(*)::int from public.audit_log a where a.table_name = p_table and a.row_id = any(v_hidden));
    leaks := leaks || array(select v_member.email || ' reads the history of ' || h from unnest(v_hidden) h where h = any(v_history));
  end loop;
end;
$$;

select plan((select count(*)::int * 2 + 1 from tests.private_tables()));

select tests.create_household('a') as a \gset
select set_config('esta.actor', 'system:test', true);
insert into private.local_stack default values on conflict do nothing;
insert into public.test_clock (id, frozen_now) values (true, '2026-10-07T09:00:00+07:00')
  on conflict (id) do update set frozen_now = excluded.frozen_now;
update public.household_members set is_operator = true where invited_email = 'admin.a@test.esta.test';

-- One row of each private kind in household a. The member's question is hers alone (conversations, messages) and its
-- job is the operator's (agent_jobs, agent_runs); an operator note and a bank statement stay with the operator and
-- the admins.
select tests.act_as('member.a@test.esta.test');
select public.ask_in_thread(:'a', '00000000-0000-4000-8000-00000000a501', 'Tháng này thu được bao nhiêu?') is not null as asked \gset
reset role;
select tests.act_as_service('{"x-esta-actor": "agent:test-worker"}');
insert into public.agent_runs (household_id, job_id, auth_mode, agent_mode, started_at)
select :'a', j.id, 'none', 'replay', '2026-10-07T02:00:00Z' from public.agent_jobs j where j.household_id = :'a';
insert into public.agent_items (household_id, kind, severity, audience, title, dedupe_key)
values (:'a', 'system', 'info', 'operator', 'Đăng nhập Claude hết hạn', 'audit-private:operator');
reset role;
select tests.clear_request();
insert into public.bank_accounts (id, household_id, bank_bin, account_no, account_name, is_default)
values ('00000000-0000-4000-8000-00000000a5ba', :'a', '970436', '0123456789', 'NGUYEN THI DEMO', true);
insert into public.statement_imports (id, household_id, bank_account_id, file_name, column_mapping)
values ('00000000-0000-4000-8000-00000000a5c1', :'a', '00000000-0000-4000-8000-00000000a5ba', 'sao-ke-demo.xlsx', '{}');
insert into public.statement_rows (household_id, import_id, row_index, posted_on, amount_vnd, description, fingerprint, status)
values (:'a', '00000000-0000-4000-8000-00000000a5c1', 0, '2026-10-05', 2800000, 'NGUYEN VAN AN DEMO CHUYEN TIEN PHONG 5',
        repeat('a', 64), 'unmatched');

select ok(
  (select array_agg(t) from tests.private_tables() t) @> array['agent_items', 'agent_jobs', 'agent_runs', 'conversations', 'messages', 'statement_imports', 'statement_rows'],
  'the catalog names every table with a narrower select policy');

select ok(checked > 0, format('%s: some member cannot read a row that has history', t))
from tests.private_tables() t, tests.audit_privacy(t);

select is(leaks, '{}'::text[], format('%s: a member who cannot read a row cannot read its history either', t))
from tests.private_tables() t, tests.audit_privacy(t);

select * from finish();
rollback;
