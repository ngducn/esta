begin;
\ir _harness.psql

select plan(21);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select tests.user_id('admin.a@test.esta.test') as admin_a \gset

create temporary view newest_audit as
  select * from public.audit_log order by id desc limit 1;

-- A user session is the actor.
select tests.act_as('admin.a@test.esta.test');
update public.parties set full_name = 'Owner a renamed' where household_id = :'a';
reset role;
select is((select actor_kind || ':' || actor_id from newest_audit), 'user:' || :'admin_a', 'a user session is recorded as that user');
select is((select household_id from newest_audit), :'a'::uuid, 'household_id is copied from the audited row');
select is((select table_name || ':' || action from newest_audit), 'parties:update', 'table and action are recorded');
select is((select diff -> 'full_name' from newest_audit), '{"old": "Owner a", "new": "Owner a renamed"}'::jsonb,
  'the diff holds the old and new value');

select tests.act_as('admin.a@test.esta.test');
update public.households set name = 'Test a renamed' where id = :'a';
reset role;
select is((select household_id from newest_audit), :'a'::uuid, 'a households row uses its own id as household_id');

-- Service-role requests name the actor with x-esta-actor.
select tests.act_as_service('{"x-esta-actor": "system:cron"}');
update public.parties set notes = 'cron' where household_id = :'a';
reset role;
select is((select actor_kind || ':' || actor_id from newest_audit), 'system:cron', 'service role with x-esta-actor system:cron');

select tests.act_as_service('{"x-esta-actor": "agent:worker-1"}');
update public.parties set notes = 'agent' where household_id = :'a';
reset role;
select is((select actor_kind || ':' || actor_id from newest_audit), 'agent:worker-1', 'service role with x-esta-actor agent:worker-1');

-- A user cannot claim another actor through the header.
select tests.act_as('admin.a@test.esta.test');
select set_config('request.headers', '{"x-esta-actor": "agent:spoof"}', true);
update public.parties set notes = 'spoof' where household_id = :'a';
reset role;
select is((select actor_kind || ':' || actor_id from newest_audit), 'user:' || :'admin_a', 'a spoofed header from a user session is ignored');
select is_empty($$ select 1 from public.audit_log where actor_id = 'spoof' $$, 'no audit row names the spoofed actor');

-- Direct connections name themselves with esta.actor.
select tests.clear_request();
select set_config('esta.actor', 'system:backup', true);
update public.parties set notes = 'backup' where household_id = :'a';
select is((select actor_kind || ':' || actor_id from newest_audit), 'system:backup', 'a direct connection uses esta.actor');

select set_config('esta.actor', '', true);
update public.parties set notes = 'studio' where household_id = :'a';
select is((select actor_kind || ':' || actor_id from newest_audit), 'system:postgres', 'a direct connection without esta.actor records the session user');

select tests.act_as_service();
select throws_ok($$ update public.parties set notes = 'anonymous' $$, '42501', null,
  'a service-role write without x-esta-actor fails');
reset role;
select tests.act_as_service('{"x-esta-actor": "user:someone"}');
select throws_ok($$ update public.parties set notes = 'bad' $$, '22023', null,
  'a service-role write with a malformed actor fails');
reset role;

-- Insert and delete are recorded too.
select tests.act_as('member.a@test.esta.test');
insert into public.parties (household_id, kind, full_name) values (:'a', 'individual', 'Tenant a');
reset role;
select is((select action || ':' || actor_kind from newest_audit), 'insert:user', 'an insert is recorded');

select tests.act_as('admin.a@test.esta.test');
delete from public.notification_preferences
  where member_id = (select id from public.household_members where invited_email = 'viewer.a@test.esta.test');
reset role;
select is((select action || ':' || (diff -> 'channel' ->> 'old') from newest_audit), 'delete:inapp',
  'a delete is recorded with the old values');

-- Members read only their household's history, and nobody writes it.
select tests.act_as('admin.a@test.esta.test');
select isnt_empty(format($$ select 1 from public.audit_log where household_id = %L $$, :'a'),
  'a member reads its household''s audit rows');
select is_empty(format($$ select 1 from public.audit_log where household_id = %L $$, :'b'),
  'a member reads none of another household''s audit rows');
select throws_ok(
  format($$ insert into public.audit_log (household_id, table_name, row_id, action, actor_kind, actor_id, diff)
            values (%L, 'parties', gen_random_uuid(), 'insert', 'user', 'forged', '{}') $$, :'a'),
  '42501', null, 'authenticated cannot insert audit rows');
select throws_ok($$ update public.audit_log set actor_id = 'forged' $$, '42501', null,
  'authenticated cannot update audit rows');
select throws_ok($$ delete from public.audit_log $$, '42501', null, 'authenticated cannot delete audit rows');
reset role;

select tests.act_as_service('{"x-esta-actor": "system:cron"}');
select throws_ok($$ delete from public.audit_log $$, '42501', null, 'service role cannot delete audit rows');
reset role;

select * from finish();
rollback;
