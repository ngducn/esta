begin;
\ir _harness.psql

select plan(40);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select tests.user_id('admin.a@test.esta.test') as admin_a, tests.user_id('member.a@test.esta.test') as member_a \gset
select id as admin_a_member from public.household_members where household_id = :'a' and role = 'admin' \gset
select id as member_a_member from public.household_members where household_id = :'a' and role = 'member' \gset
select id as viewer_a_member from public.household_members where household_id = :'a' and role = 'viewer' \gset

select tests.act_as('admin.a@test.esta.test');
insert into public.household_members (household_id, invited_email, role)
values (:'a', 'pending.a@test.esta.test', 'admin');

select throws_ok(
  format($$ update public.household_members set role = 'member' where id = %L $$, :'admin_a_member'),
  '23514', 'a household keeps at least one admin who has signed in',
  'the last claimed admin cannot demote itself, and an unclaimed admin invite does not count'
);
select throws_ok(
  format($$ delete from public.household_members where id = %L $$, :'admin_a_member'),
  '23514', 'a household keeps at least one admin who has signed in',
  'the last claimed admin cannot delete itself'
);
select throws_ok(
  format($$ update public.household_members set user_id = null where id = %L $$, :'admin_a_member'),
  '42501', 'only the service role or a claim function links a member row to a user',
  'the last claimed admin cannot unclaim its row'
);

update public.household_members set role = 'admin' where id = :'member_a_member';
select lives_ok(
  format($$ update public.household_members set role = 'member' where id = %L $$, :'admin_a_member'),
  'an admin steps down while another claimed admin remains'
);
reset role;

select tests.act_as_service('{"x-esta-actor": "system:test"}');
select lives_ok(
  format($$ update public.household_members set role = 'viewer' where id = %L $$, :'member_a_member'),
  'the service role may demote the last admin'
);
update public.household_members set role = 'admin' where id = :'admin_a_member';
reset role;

select tests.act_as('admin.a@test.esta.test');
select throws_ok(
  format($$ update public.household_members set is_operator = true where id = %L $$, :'admin_a_member'),
  '42501', 'only an operator of the household can grant or revoke operator',
  'a non-operator admin cannot make itself operator'
);
select throws_ok(
  format($$ insert into public.household_members (household_id, invited_email, role, is_operator)
            values (%L, 'op.a@test.esta.test', 'member', true) $$, :'a'),
  '42501', 'only an operator of the household can grant or revoke operator',
  'a non-operator admin cannot invite an operator'
);
select lives_ok(
  format($$ update public.household_members set display_name = 'Admin A' where id = %L $$, :'admin_a_member'),
  'a non-operator admin edits other member fields'
);
reset role;

select tests.act_as_service('{"x-esta-actor": "system:test"}');
select lives_ok(
  format($$ update public.household_members set is_operator = true where id = %L $$, :'admin_a_member'),
  'the service role grants operator'
);
reset role;

select tests.act_as('admin.a@test.esta.test');
select lives_ok(
  format($$ update public.household_members set is_operator = true where id = %L $$, :'viewer_a_member'),
  'an operator grants operator'
);
select lives_ok(
  format($$ update public.household_members set is_operator = false where id = %L $$, :'viewer_a_member'),
  'an operator revokes operator'
);
update public.household_members set role = 'admin' where id = :'member_a_member';
reset role;

select tests.act_as('member.a@test.esta.test');
select throws_ok(
  format($$ update public.household_members set is_operator = false where id = %L $$, :'admin_a_member'),
  '42501', 'only an operator of the household can grant or revoke operator',
  'a non-operator admin cannot revoke an operator'
);
update public.household_members set role = 'member' where id = :'member_a_member';
reset role;

select tests.create_user('outsider@test.esta.test') as outsider \gset
select id as pending_a_member from public.household_members where invited_email = 'pending.a@test.esta.test' \gset
update public.household_members set role = 'admin' where id = :'member_a_member';

select tests.act_as('member.a@test.esta.test');
select throws_ok(
  format($$ update public.household_members set user_id = %L where id = %L $$, :'outsider', :'admin_a_member'),
  '42501', 'only the service role or a claim function links a member row to a user',
  'a non-operator admin cannot hand the operator row to another user'
);
select throws_ok(
  format($$ update public.household_members set user_id = %L where id = %L $$, :'outsider', :'viewer_a_member'),
  '42501', 'only the service role or a claim function links a member row to a user',
  'an admin cannot reassign a claimed member row'
);
select throws_ok(
  format($$ update public.household_members set user_id = %L where id = %L $$, :'outsider', :'pending_a_member'),
  '42501', 'only the service role or a claim function links a member row to a user',
  'an admin cannot claim an invite for a user'
);
select throws_ok(
  format($$ insert into public.household_members (household_id, user_id, invited_email, role)
            values (%L, %L, 'outsider@test.esta.test', 'admin') $$, :'a', :'outsider'),
  '42501', 'only the service role or a claim function links a member row to a user',
  'an admin cannot add a member row already linked to a user'
);
select throws_ok(
  format($$ update public.household_members set invited_email = 'outsider@test.esta.test' where id = %L $$, :'viewer_a_member'),
  '42501', 'a claimed member row keeps its invited email',
  'an admin cannot change the invited email of a claimed row'
);
select lives_ok(
  format($$ update public.household_members set invited_email = 'pending2.a@test.esta.test' where id = %L $$, :'pending_a_member'),
  'an admin corrects the invited email of an unclaimed invite'
);
reset role;

select tests.act_as_service('{"x-esta-actor": "system:test"}');
select lives_ok(
  format($$ update public.household_members set user_id = %L where id = %L $$, :'outsider', :'pending_a_member'),
  'the service role claims an invite'
);
reset role;
update public.household_members set role = 'member' where id = :'member_a_member';

select tests.act_as('member.a@test.esta.test');
select isnt_empty(
  format($$ update public.notification_preferences set daily_cap = 3 where member_id = %L returning 1 $$, :'member_a_member'),
  'a member edits its own notification preferences'
);
select is_empty(
  format($$ update public.notification_preferences set daily_cap = 3 where member_id = %L returning 1 $$, :'admin_a_member'),
  'a member cannot edit another member''s notification preferences'
);
select is_empty(
  format($$ delete from public.notification_preferences where member_id = %L returning 1 $$, :'admin_a_member'),
  'a member cannot delete another member''s notification preferences'
);
select throws_ok(
  format($$ insert into public.notification_preferences (household_id, member_id, channel) values (%L, %L, 'email') $$,
    :'a', :'admin_a_member'),
  '42501', null,
  'a member cannot add notification preferences for another member'
);
reset role;

select tests.act_as('viewer.a@test.esta.test');
select lives_ok(
  format($$ insert into public.notification_preferences (household_id, member_id, channel) values (%L, %L, 'email') $$,
    :'a', :'viewer_a_member'),
  'a viewer adds its own notification preferences'
);
reset role;

select tests.act_as('admin.a@test.esta.test');
select isnt_empty(
  format($$ update public.notification_preferences set daily_cap = 5 where member_id = %L returning 1 $$, :'member_a_member'),
  'an admin edits a member''s notification preferences'
);
reset role;

select tests.act_as_service('{"x-esta-actor": "system:test"}');
select throws_ok(
  format($$ update public.households set id = gen_random_uuid() where id = %L $$, :'a'),
  '23514', 'households rows cannot move to another household',
  'households.id is frozen, even for the service role'
);
select throws_ok(
  format($$ update public.household_members set household_id = %L where household_id = %L $$, :'b', :'a'),
  '23514', 'household_members rows cannot move to another household',
  'household_members.household_id is frozen, even for the service role'
);
select throws_ok(
  format($$ update public.household_settings set household_id = %L where household_id = %L $$, :'b', :'a'),
  '23514', 'household_settings rows cannot move to another household',
  'household_settings.household_id is frozen, even for the service role'
);
select throws_ok(
  format($$ update public.parties set household_id = %L where household_id = %L $$, :'b', :'a'),
  '23514', 'parties rows cannot move to another household',
  'parties.household_id is frozen, even for the service role'
);
select throws_ok(
  format($$ update public.notification_preferences set household_id = %L where household_id = %L $$, :'b', :'a'),
  '23514', 'notification_preferences rows cannot move to another household',
  'notification_preferences.household_id is frozen, even for the service role'
);
select is_empty(
  $$ select c.relname from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where t.tgname = 'audit_row'
       and not exists (select 1 from pg_trigger f where f.tgrelid = t.tgrelid and f.tgname = 'keep_household') $$,
  'every audited table freezes its household column'
);
reset role;

select tests.act_as('admin.a@test.esta.test');
insert into public.parties (household_id, kind, full_name, created_by)
values (:'a', 'individual', 'Forged author', :'member_a');
reset role;
select is((select created_by from public.parties where full_name = 'Forged author'), :'admin_a'::uuid,
  'insert stamps created_by with the session user and ignores the client value');

select tests.act_as('admin.a@test.esta.test');
update public.parties set created_by = :'member_a' where full_name = 'Forged author';
reset role;
select is((select created_by from public.parties where full_name = 'Forged author'), :'admin_a'::uuid,
  'update keeps created_by');

select tests.act_as_service('{"x-esta-actor": "agent:worker-1"}');
insert into public.parties (household_id, kind, full_name, created_by)
values (:'a', 'individual', 'Agent party', :'member_a');
reset role;
select is((select created_by from public.parties where full_name = 'Agent party'), null,
  'a service role insert leaves created_by null');
select is(
  (select actor_kind || ':' || actor_id from public.audit_log
   where table_name = 'parties' and action = 'insert' and diff -> 'full_name' ->> 'new' = 'Agent party'),
  'agent:worker-1',
  'the audit row names the service role actor'
);
select is_empty(
  $$ select c.relname from pg_class c join pg_attribute a on a.attrelid = c.oid
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
       and a.attname = 'created_by' and not a.attisdropped
       and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'set_created_by') $$,
  'every table with created_by stamps it'
);

select tests.act_as('admin.b@test.esta.test');
select is_empty(
  format($$ delete from public.households where id = %L returning 1 $$, :'b'),
  'an admin cannot delete its household'
);
reset role;
select isnt_empty(format($$ select 1 from public.households where id = %L $$, :'b'),
  'the household survives an admin delete');

select tests.act_as_service('{"x-esta-actor": "system:test"}');
select isnt_empty(
  format($$ delete from public.households where id = %L returning 1 $$, :'b'),
  'the service role deletes a household'
);
reset role;
select is_empty(format($$ select 1 from public.household_members where household_id = %L $$, :'b'),
  'deleting the household removes its members');

select * from finish();
rollback;
