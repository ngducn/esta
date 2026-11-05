begin;
\ir _harness.psql

select plan(15);

select tests.create_household('a') as a, tests.create_household('b') as b \gset

select set_config('esta.actor', 'system:test', true);
insert into public.documents (id, household_id, category, title, storage_path, mime, size_bytes, sha256, sensitivity) values
  ('00000000-0000-4000-8000-00000000e0a1', :'a', 'other', 'Giấy A1', :'a' || '/00000000-0000-4000-8000-00000000e0a1/giay.pdf', 'application/pdf', 10, repeat('a', 64), 'normal'),
  ('00000000-0000-4000-8000-00000000e0a2', :'a', 'other', 'Giấy A2', :'a' || '/00000000-0000-4000-8000-00000000e0a2/giay.pdf', 'application/pdf', 10, repeat('b', 64), 'normal'),
  ('00000000-0000-4000-8000-00000000e0b1', :'b', 'other', 'Giấy B1', :'b' || '/00000000-0000-4000-8000-00000000e0b1/giay.pdf', 'application/pdf', 10, repeat('c', 64), 'normal');

select set_config('tests.a_zip', :'a' || '/00000000-0000-4000-8000-0000000000e1.zip', true);
select set_config('tests.a_part', :'a' || '/00000000-0000-4000-8000-0000000000e1-part-2.zip', true);
select set_config('tests.b_zip', :'b' || '/00000000-0000-4000-8000-0000000000e2.zip', true);
select set_config('tests.a_new', :'a' || '/00000000-0000-4000-8000-0000000000e3.zip', true);
select set_config('tests.b_under_a', :'b' || '/00000000-0000-4000-8000-0000000000e4.zip', true);

insert into storage.objects (bucket_id, name) values
  ('exports', current_setting('tests.a_zip')),
  ('exports', current_setting('tests.a_part')),
  ('exports', current_setting('tests.b_zip'));

select results_eq(
  $$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'exports' $$,
  $$ values (false, 52428800::bigint, array['application/zip']) $$,
  'exports is private, capped at 50 MB and takes ZIP files only');

select is(private.export_household(current_setting('tests.a_part')), :'a'::uuid, 'a part of an export resolves to its household');
select is(private.export_household(:'a' || '/00000000-0000-4000-8000-0000000000e1/../x.zip'), null, 'a path with a parent segment resolves to nothing');
select is(private.export_household(:'a' || '/notes.txt'), null, 'a name that is not an export resolves to nothing');

select tests.act_as('admin.a@test.esta.test');
select is((select count(*)::int from storage.objects where bucket_id = 'exports' and name = current_setting('tests.a_zip')), 1, 'an admin of A reads A''s export');
select is((select count(*)::int from storage.objects where bucket_id = 'exports' and name = current_setting('tests.a_part')), 1, 'an admin of A reads A''s second part');
select is_empty($$ select 1 from storage.objects where bucket_id = 'exports' and name = current_setting('tests.b_zip') $$, 'an admin of A reads none of B''s exports');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('exports', current_setting('tests.a_new')) $$, 'an admin of A writes an export under A');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('exports', current_setting('tests.b_under_a')) $$, '42501', null, 'an admin of A cannot write under B''s prefix');

select tests.act_as('member.a@test.esta.test');
select is_empty($$ select 1 from storage.objects where bucket_id = 'exports' $$, 'a member of A who is not an admin reads no export');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('exports', current_setting('tests.a_new') || 'x') $$, '42501', null, 'a non-admin cannot write an export');

select tests.act_as('viewer.a@test.esta.test');
select is_empty($$ select 1 from storage.objects where bucket_id = 'exports' $$, 'a viewer of A reads no export');

select tests.act_as('admin.a@test.esta.test');
select is(public.log_export_downloads(:'a', array['00000000-0000-4000-8000-00000000e0a1', '00000000-0000-4000-8000-00000000e0a2', '00000000-0000-4000-8000-00000000e0b1']::uuid[]), 2,
  'logging an export writes a row for each of A''s documents and none for a document of B');

select tests.act_as('member.a@test.esta.test');
select throws_ok(format($$ select public.log_export_downloads(%L, array['00000000-0000-4000-8000-00000000e0a1']::uuid[]) $$, :'a'), '42501', null,
  'a non-admin cannot log an export');

select tests.act_as('admin.a@test.esta.test');
select throws_ok(format($$ select public.log_export_downloads(%L, array['00000000-0000-4000-8000-00000000e0b1']::uuid[]) $$, :'b'), '42501', null,
  'an admin of A cannot log an export for B');

select * from finish();
rollback;
