begin;
\ir _harness.psql

select plan(44);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select private.audit_now() as clock \gset

select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Đất Bảo Lộc', 'BAOLOC', 'residential_land', 'held'),
  ('00000000-0000-4000-8000-0000000000b1', :'b', 'Nhà B', 'B1', 'townhouse', 'rental');
insert into public.documents (id, household_id, property_id, category, title, storage_path, mime, size_bytes, sha256, sensitivity) values
  ('00000000-0000-4000-8000-00000000d0b1', :'b', '00000000-0000-4000-8000-0000000000b1', 'certificate', 'Sổ hồng B',
   :'b' || '/00000000-0000-4000-8000-00000000d0b1/so-hong.jpg', 'image/jpeg', 1000, repeat('b', 64), 'sensitive');
insert into public.certificates (household_id, property_id, form)
values (:'a', '00000000-0000-4000-8000-0000000000a1', 'gcn_2009_2024');
insert into public.document_access_log (household_id, document_id, user_id, action)
values (:'b', '00000000-0000-4000-8000-00000000d0b1', tests.user_id('member.b@test.esta.test'), 'view');

select tests.act_as('member.a@test.esta.test');
select lives_ok(format($$
  insert into public.documents (id, household_id, property_id, category, title, storage_path, mime, size_bytes, page_count, sha256, sensitivity)
  values ('00000000-0000-4000-8000-00000000d0a1', %L, '00000000-0000-4000-8000-0000000000a1', 'certificate', 'Sổ hồng Bảo Lộc',
          %L || '/00000000-0000-4000-8000-00000000d0a1/so-hong-bao-loc.jpg', 'image/jpeg', 2048, 1, repeat('a', 64), 'sensitive') $$, :'a', :'a'),
  'a member of A adds a document');
select lives_ok(format($$
  insert into public.documents (id, household_id, property_id, category, title, storage_path, mime, size_bytes, sha256, sensitivity)
  values ('00000000-0000-4000-8000-00000000d0a1', %L, '00000000-0000-4000-8000-0000000000a1', 'certificate', 'Sổ hồng Bảo Lộc',
          %L || '/00000000-0000-4000-8000-00000000d0a1/so-hong-bao-loc.jpg', 'image/jpeg', 2048, repeat('a', 64), 'sensitive')
  on conflict (id) do nothing $$, :'a', :'a'),
  'registering the same id again converges');
select is((select count(*)::int from public.documents where id = '00000000-0000-4000-8000-00000000d0a1'), 1,
  'a retried register leaves one row');
select is((select count(*)::int from public.audit_log where table_name = 'documents' and row_id = '00000000-0000-4000-8000-00000000d0a1' and action = 'insert'), 1,
  'the insert wrote one audit row');
select tests.sees_household('public.documents', :'a', true);
select tests.sees_household('public.documents', :'b', false);
select is_empty($$ select 1 from public.document_access_log where document_id = '00000000-0000-4000-8000-00000000d0b1' $$,
  'a member of A reads none of B''s access log');
select throws_ok(format($$
  insert into public.documents (household_id, property_id, category, title, storage_path, mime, size_bytes, sha256, sensitivity)
  values (%L, '00000000-0000-4000-8000-0000000000b1', 'other', 'x', 'x', 'image/jpeg', 1, repeat('c', 64), 'normal') $$, :'b'),
  '42501', null, 'a member of A cannot add a document to B');

select throws_ok(format($$
  insert into public.documents (id, household_id, category, title, storage_path, mime, size_bytes, sha256, sensitivity)
  values ('00000000-0000-4000-8000-00000000d0a2', %L, 'other', 'Giấy', %L || '/00000000-0000-4000-8000-00000000d0a2/giay.pdf',
          'application/pdf', 10, repeat('c', 64), 'normal') $$, :'a', :'b'),
  '23514', null, 'storage_path refuses another household''s folder');
select throws_ok(format($$
  insert into public.documents (id, household_id, category, title, storage_path, mime, size_bytes, sha256, sensitivity)
  values ('00000000-0000-4000-8000-00000000d0a2', %L, 'other', 'Giấy', %L || '/00000000-0000-4000-8000-00000000d0a1/giay.pdf',
          'application/pdf', 10, repeat('c', 64), 'normal') $$, :'a', :'a'),
  '23514', null, 'storage_path refuses another document''s folder');
select throws_ok(format($$
  insert into public.documents (id, household_id, category, title, storage_path, mime, size_bytes, sha256, sensitivity)
  values ('00000000-0000-4000-8000-00000000d0a2', %L, 'other', 'Giấy', %L || '/00000000-0000-4000-8000-00000000d0a2/thumb.webp',
          'image/webp', 10, repeat('c', 64), 'normal') $$, :'a', :'a'),
  '23514', null, 'storage_path refuses a thumbnail name');
select throws_ok(format($$
  insert into public.documents (id, household_id, category, title, storage_path, mime, size_bytes, sha256, sensitivity)
  values ('00000000-0000-4000-8000-00000000d0a2', %L, 'other', 'Giấy', %L || '/00000000-0000-4000-8000-00000000d0a2/giay.gif',
          'image/gif', 10, repeat('c', 64), 'normal') $$, :'a', :'a'),
  '23514', null, 'mime refuses a type the bucket does not take');
select throws_ok(format($$
  insert into public.documents (id, household_id, category, title, storage_path, mime, size_bytes, sha256, sensitivity)
  values ('00000000-0000-4000-8000-00000000d0a2', %L, 'other', 'Giấy', %L || '/00000000-0000-4000-8000-00000000d0a2/giay.pdf',
          'application/pdf', 26214401, repeat('c', 64), 'normal') $$, :'a', :'a'),
  '23514', null, 'size_bytes refuses more than 25 MB');

select is_empty($$ delete from public.documents where id = '00000000-0000-4000-8000-00000000d0a1' returning 1 $$,
  'a member''s DELETE on documents touches no row');
select isnt_empty($$ update public.documents set deleted_at = '2026-10-07 09:00+07' where id = '00000000-0000-4000-8000-00000000d0a1' returning 1 $$,
  'a member archives a document by setting deleted_at');
select isnt_empty($$ update public.documents set deleted_at = null where id = '00000000-0000-4000-8000-00000000d0a1' returning 1 $$,
  'a member restores it by clearing deleted_at');

select throws_ok(format($$ update public.documents set id = '00000000-0000-4000-8000-00000000d0a2' where id = '00000000-0000-4000-8000-00000000d0a1' $$),
  '23514', 'documents: id, household_id, storage_path, mime, size_bytes and sha256 never change', 'a member cannot change a document''s id');
select throws_ok(format($$ update public.documents set household_id = %L where id = '00000000-0000-4000-8000-00000000d0a1' $$, :'b'),
  '23514', 'documents: id, household_id, storage_path, mime, size_bytes and sha256 never change', 'a member cannot change a document''s household');
select throws_ok(format($$ update public.documents set storage_path = %L || '/00000000-0000-4000-8000-00000000d0a1/thay.jpg' where id = '00000000-0000-4000-8000-00000000d0a1' $$, :'a'),
  '23514', 'documents: id, household_id, storage_path, mime, size_bytes and sha256 never change', 'a member cannot point a document at another file');
select throws_ok($$ update public.documents set mime = 'image/png' where id = '00000000-0000-4000-8000-00000000d0a1' $$,
  '23514', 'documents: id, household_id, storage_path, mime, size_bytes and sha256 never change', 'a member cannot change the recorded type');
select throws_ok($$ update public.documents set size_bytes = 4096 where id = '00000000-0000-4000-8000-00000000d0a1' $$,
  '23514', 'documents: id, household_id, storage_path, mime, size_bytes and sha256 never change', 'a member cannot change the recorded size');
select throws_ok($$ update public.documents set sha256 = repeat('f', 64) where id = '00000000-0000-4000-8000-00000000d0a1' $$,
  '23514', 'documents: id, household_id, storage_path, mime, size_bytes and sha256 never change', 'a member cannot change the recorded checksum');
-- Step 1 of the file swap: rename the row away so its original object counts as unsaved, overwrite it, rename back.
select throws_ok(format($$ update public.documents set id = '00000000-0000-4000-8000-00000000d0a2',
    storage_path = %L || '/00000000-0000-4000-8000-00000000d0a2/so-hong-bao-loc.jpg' where id = '00000000-0000-4000-8000-00000000d0a1' $$, :'a'),
  '23514', 'documents: id, household_id, storage_path, mime, size_bytes and sha256 never change', 'the rename that frees a saved file for overwriting is refused at step 1');
select results_eq(
  $$ select id, storage_path, mime, size_bytes, sha256 from public.documents where id in ('00000000-0000-4000-8000-00000000d0a1', '00000000-0000-4000-8000-00000000d0a2') $$,
  format($$ values ('00000000-0000-4000-8000-00000000d0a1'::uuid, %L, 'image/jpeg', 2048::bigint, %L) $$,
    :'a' || '/00000000-0000-4000-8000-00000000d0a1/so-hong-bao-loc.jpg', repeat('a', 64)),
  'after the refused updates the row still names its own file, type, size and checksum');
select lives_ok($$ update public.documents set title = 'Sổ hồng Bảo Lộc (bản chính)', storage_path = storage_path, sha256 = sha256
    where id = '00000000-0000-4000-8000-00000000d0a1' $$,
  'a member still edits the title, and writing a frozen column back to its own value is not a change');

select lives_ok(format($$ insert into public.document_access_log (household_id, document_id, user_id, action)
  values (%L, '00000000-0000-4000-8000-00000000d0a1', %L, 'view') $$, :'a', tests.user_id('member.a@test.esta.test')),
  'a member logs her own view');
select lives_ok(format($$ insert into public.document_access_log (household_id, document_id, user_id, action, at)
  values (%L, '00000000-0000-4000-8000-00000000d0a1', %L, 'download', '2000-01-01 00:00+07') $$, :'a', tests.user_id('admin.a@test.esta.test')),
  'a member''s log row naming another member and another time is accepted, then stamped');
select results_eq(
  $$ select user_id, at from public.document_access_log where document_id = '00000000-0000-4000-8000-00000000d0a1' and action = 'download' $$,
  format($$ values (%L::uuid, %L::timestamptz) $$, tests.user_id('member.a@test.esta.test'), :'clock'),
  'the access log stamps the signed-in member and the clock, never the values she sends');
select throws_ok(format($$ insert into public.document_access_log (household_id, document_id, user_id, action)
  values (%L, '00000000-0000-4000-8000-00000000d0b1', %L, 'view') $$, :'b', tests.user_id('member.a@test.esta.test')),
  '42501', null, 'a member of A cannot log a view of B''s document');
select throws_ok($$ update public.document_access_log set action = 'share' $$, '42501', null, 'nobody updates an access log row');
select throws_ok($$ delete from public.document_access_log $$, '42501', null, 'nobody deletes an access log row');

select tests.act_as('viewer.a@test.esta.test');
select tests.sees_household('public.documents', :'a', true);
select tests.cannot_write('public.documents', :'a', format($$
  insert into public.documents (household_id, category, title, storage_path, mime, size_bytes, sha256, sensitivity)
  values (%L, 'other', 'x', 'x', 'image/jpeg', 1, repeat('c', 64), 'normal') $$, :'a'));
select lives_ok(format($$ insert into public.document_access_log (household_id, document_id, user_id, action)
  values (%L, '00000000-0000-4000-8000-00000000d0a1', %L, 'view') $$, :'a', tests.user_id('viewer.a@test.esta.test')),
  'a viewer logs her own view, since she can open documents');
select is((select count(*)::int from public.document_access_log where document_id = '00000000-0000-4000-8000-00000000d0a1'), 3,
  'a viewer reads the household''s access log');

reset role;
select tests.clear_request();
select tests.act_as_service('{"x-esta-actor": "agent:test"}');
select lives_ok($$ update public.documents set sha256 = repeat('e', 64) where id = '00000000-0000-4000-8000-00000000d0a1' $$,
  'the freeze is for user sessions: the service role, which no current path uses on these columns, is not stopped');
reset role;
select tests.clear_request();
select throws_ok(format($$ update public.certificates set document_id = gen_random_uuid() where household_id = %L $$, :'a'),
  '23503', null, 'certificates.document_id refuses a missing document (FND-2)');
select throws_ok(format($$ update public.certificates set document_id = '00000000-0000-4000-8000-00000000d0b1' where household_id = %L $$, :'a'),
  '23503', null, 'a certificate of A cannot link a document of B, even for a writer that bypasses RLS (FND-2)');
select lives_ok(format($$ update public.certificates set document_id = '00000000-0000-4000-8000-00000000d0a1' where household_id = %L $$, :'a'),
  'a certificate links a document of its own household');
select lives_ok($$ delete from public.documents where id = '00000000-0000-4000-8000-00000000d0a1' $$,
  'removing a linked document is allowed for the service role');
select results_eq(format($$ select household_id, document_id from public.certificates where household_id = %L $$, :'a'),
  format($$ values (%L::uuid, null::uuid) $$, :'a'),
  'removing the document clears only the certificate''s link and keeps its household');
select ok(not has_table_privilege('authenticated', 'public.document_access_log', 'update')
          and not has_table_privilege('authenticated', 'public.document_access_log', 'delete'),
  'authenticated holds no update or delete privilege on the access log');

select * from finish();
rollback;
