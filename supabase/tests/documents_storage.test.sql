begin;
\ir _harness.psql

select plan(34);

select tests.create_household('a') as a, tests.create_household('b') as b \gset

select set_config('esta.actor', 'system:test', true);
insert into public.documents (id, household_id, category, title, storage_path, mime, size_bytes, sha256, sensitivity) values
  ('00000000-0000-4000-8000-00000000d0a1', :'a', 'certificate', 'Sổ hồng A', :'a' || '/00000000-0000-4000-8000-00000000d0a1/so-hong.jpg',
   'image/jpeg', 1000, repeat('a', 64), 'sensitive'),
  ('00000000-0000-4000-8000-00000000d0b1', :'b', 'certificate', 'Sổ hồng B', :'b' || '/00000000-0000-4000-8000-00000000d0b1/so-hong.jpg',
   'image/jpeg', 1000, repeat('b', 64), 'sensitive');

select set_config('tests.a_path', :'a' || '/00000000-0000-4000-8000-00000000d0a1/so-hong.jpg', true);
select set_config('tests.a_thumb', :'a' || '/00000000-0000-4000-8000-00000000d0a1/thumb-blur.webp', true);
select set_config('tests.b_path', :'b' || '/00000000-0000-4000-8000-00000000d0b1/so-hong.jpg', true);
select set_config('tests.b_prefix', :'b' || '/00000000-0000-4000-8000-00000000d0b1/', true);
select set_config('tests.a_with_b_doc', :'a' || '/00000000-0000-4000-8000-00000000d0b1/so-hong.jpg', true);
select set_config('tests.a_new', format('%s/%s/giay.pdf', :'a', gen_random_uuid()), true);
select set_config('tests.a_new_thumb', regexp_replace(current_setting('tests.a_new'), 'giay\.pdf$', 'thumb.webp'), true);
select set_config('tests.a_registered_extra', :'a' || '/00000000-0000-4000-8000-00000000d0a1/thay.jpg', true);
select set_config('storage.allow_delete_query', 'true', true);

insert into storage.objects (bucket_id, name) values
  ('documents', current_setting('tests.a_path')),
  ('documents', current_setting('tests.a_thumb')),
  ('documents', current_setting('tests.b_path'));

select results_eq(
  $$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'documents' $$,
  $$ values (false, 26214400::bigint, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']) $$,
  'documents is private, capped at 25 MB and takes JPEG, PNG, WebP and PDF only');

select is(private.document_household(current_setting('tests.a_path')), :'a'::uuid, 'a document file of A resolves to A');
select is(private.document_household(current_setting('tests.a_new')), :'a'::uuid,
  'a new document id under A resolves to A, since the row is written after the upload');
select is(private.document_household(current_setting('tests.a_with_b_doc')), null,
  'household A with household B''s document id resolves to nothing');
select is(private.document_household(:'a' || '/00000000-0000-4000-8000-00000000d0a1/../so-hong.jpg'), null,
  'a path with a parent segment resolves to nothing');
select is(private.document_household(:'a' || '/00000000-0000-4000-8000-00000000d0a1/Sổ Hồng.JPG'), null,
  'a name outside the ASCII grammar resolves to nothing');
select is(private.document_household(:'a' || '/00000000-0000-4000-8000-00000000d0a1/' || repeat('a', 101)), null,
  'a name over 100 characters resolves to nothing');
select is(private.document_household('not-a-uuid/x/so-hong.jpg'), null, 'a malformed path resolves to nothing');

select tests.act_as('member.a@test.esta.test');
select isnt_empty($$ select 1 from storage.objects where name = current_setting('tests.a_path') $$, 'a member of A reads A''s document');
select is_empty($$ select 1 from storage.objects where name = current_setting('tests.b_path') $$, 'a member of A reads none of B''s documents');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('documents', current_setting('tests.a_new')) $$,
  'a member of A uploads a new document under A');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('documents', current_setting('tests.b_prefix') || 'intruder.jpg') $$,
  '42501', null, 'a member of A cannot upload under B''s prefix');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('documents', current_setting('tests.a_with_b_doc')) $$,
  '42501', null, 'a member of A cannot upload under a document id that B uses');
select throws_ok(
  $$ update storage.objects set name = current_setting('tests.b_prefix') || 'moved.jpg' where name = current_setting('tests.a_path') $$,
  '42501', null, 'a member of A cannot rename A''s document under B''s prefix');
select isnt_empty($$ select 1 from storage.objects where name = current_setting('tests.a_path') $$,
  'the refused rename leaves the document in place');
select is_empty($$ update storage.objects set metadata = '{}' where name = current_setting('tests.b_path') returning 1 $$,
  'a member of A updates none of B''s objects');
select is_empty($$ delete from storage.objects where name = current_setting('tests.b_path') returning 1 $$,
  'a member of A deletes none of B''s objects');
select is_empty($$ delete from storage.objects where name = current_setting('tests.a_path') returning 1 $$,
  'a member deletes no file of a registered document, since deleting a document archives its row');
select is_empty($$ delete from storage.objects where name = current_setting('tests.a_new') returning 1 $$,
  'a member deletes no file of a document still being uploaded');
select is_empty($$ update storage.objects set metadata = '{"size": 1}' where name = current_setting('tests.a_path') returning 1 $$,
  'a member cannot overwrite a registered document''s file');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('documents', current_setting('tests.a_registered_extra')) $$,
  '42501', null, 'a member cannot add a file to a registered document''s folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('documents', current_setting('tests.a_thumb'))
     on conflict (bucket_id, name) do update set metadata = '{"size": 1}' $$,
  '42501', null, 'a member cannot upsert a registered document''s thumbnail');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('documents', current_setting('tests.a_new_thumb')) $$,
  'a member adds the thumbnail of a document still being uploaded');
select isnt_empty($$ update storage.objects set metadata = '{"size": 2}' where name = current_setting('tests.a_new') returning 1 $$,
  'a retried upload rewrites the file while no row is registered');

select tests.act_as('viewer.a@test.esta.test');
select isnt_empty($$ select 1 from storage.objects where name = current_setting('tests.a_thumb') $$, 'a viewer of A reads A''s thumbnail');
select throws_ok(format($$ insert into storage.objects (bucket_id, name) values ('documents', '%s/%s/viewer.jpg') $$, :'a', gen_random_uuid()),
  '42501', null, 'a viewer cannot upload');
select is_empty($$ update storage.objects set metadata = '{}' where name = current_setting('tests.a_path') returning 1 $$, 'a viewer updates no document');
select is_empty($$ delete from storage.objects where name = current_setting('tests.a_path') returning 1 $$, 'a viewer deletes no document');
select is_empty($$ update storage.objects set metadata = '{}' where name = current_setting('tests.a_new') returning 1 $$,
  'a viewer rewrites no file of a document still being uploaded');
select is_empty($$ delete from storage.objects where name = current_setting('tests.a_new') returning 1 $$,
  'a viewer deletes no file of a document still being uploaded');

reset role;
select tests.clear_request();
select is((select metadata from storage.objects where name = current_setting('tests.b_path')), null, 'B''s object is unchanged');
select isnt_empty($$ select 1 from storage.objects where name = current_setting('tests.b_path') $$, 'B''s object is still there');
select is((select metadata from storage.objects where name = current_setting('tests.a_path')), null, 'A''s registered file is unchanged');
select ok(not has_function_privilege('anon', 'private.document_household(text)', 'execute'), 'anon cannot call document_household');

select * from finish();
rollback;
