begin;
\ir _harness.psql

select plan(5);

select tests.create_household('a') as a \gset
select set_config('esta.actor', 'system:test', true);

select lives_ok(
  format($$ insert into public.agent_items (household_id, kind, severity, title, dedupe_key) values (%L, 'weekly', 'info', 'Tuần này', 'weekly_review:2026-W41') $$, :'a'),
  'the weekly review stores a note of kind weekly'
);
select throws_ok(
  format($$ insert into public.agent_items (household_id, kind, severity, title, dedupe_key) values (%L, 'monthly', 'info', 'Tháng này', 'monthly:2026-10') $$, :'a'),
  '23514', null, 'a kind outside the list is refused'
);
select ok(has_column_privilege('authenticated', 'public.worker_heartbeats', 'auth_mode', 'select'), 'members read the auth mode, a fixed word');
select ok(has_column_privilege('authenticated', 'public.worker_heartbeats', 'agent_mode', 'select'), 'and the agent mode');
select ok(not has_column_privilege('authenticated', 'public.worker_heartbeats', 'host_label', 'select'), 'and still not the host');

select * from finish();
rollback;
