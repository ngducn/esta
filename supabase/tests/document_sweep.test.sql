begin;
\ir _harness.psql

select plan(19);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select set_config('esta.actor', 'system:test', true);
insert into private.local_stack default values on conflict do nothing;

\set registered '''00000000-0000-4000-8000-00000000d0c1'''
\set stray '''00000000-0000-4000-8000-00000000d0c2'''
\set young '''00000000-0000-4000-8000-00000000d0c3'''
\set erased '''00000000-0000-4000-8000-00000000d0c4'''
\set kept '''00000000-0000-4000-8000-00000000d0c5'''

insert into public.documents (id, household_id, category, title, storage_path, mime, size_bytes, sha256, sensitivity) values
  (:registered, :'a', 'photo', 'Ảnh Demo', :'a' || '/' || :registered || '/photo.jpg', 'image/jpeg', 10, repeat('a', 64), 'normal');
insert into storage.objects (bucket_id, name, created_at) values
  ('documents', :'a' || '/' || :registered || '/photo.jpg', now() - interval '3 days'),
  ('documents', :'a' || '/' || :registered || '/thumb.webp', now() - interval '3 days'),
  ('documents', :'a' || '/' || :stray || '/front.jpg', now() - interval '2 days'),
  ('documents', :'a' || '/' || :stray || '/thumb.webp', now() - interval '2 days'),
  ('documents', :'a' || '/' || :young || '/front.jpg', now() - interval '23 hours'),
  ('documents', :'a' || '/' || :erased || '/front.jpg', now() - interval '1 hour'),
  ('documents', :'b' || '/' || :kept || '/front.jpg', now() - interval '5 days'),
  ('documents', 'loose-file.jpg', now() - interval '5 days'),
  ('property-photos', :'a' || '/' || :stray || '/front.jpg', now() - interval '5 days');
-- Rows from other tests or a dev session are not this test's: clear them inside the transaction, which rolls back.
delete from private.file_removals;
insert into private.file_removals (name, household_id, party_id) values
  (:'a' || '/' || :erased || '/front.jpg', :'a', '00000000-0000-4000-8000-00000000a0a1'),
  (:'a' || '/' || :erased || '/gone.jpg', :'a', '00000000-0000-4000-8000-00000000a0a1');
insert into public.documents (id, household_id, category, title, storage_path, mime, size_bytes, sha256, sensitivity) values
  (:kept, :'b', 'photo', 'Ảnh B Demo', :'b' || '/' || :kept || '/front.jpg', 'image/jpeg', 10, repeat('b', 64), 'normal');

reset role;
select tests.act_as_service('{"x-esta-actor": "system:test"}');

select is(public.stray_document_files(), array[:'a' || '/' || :stray || '/front.jpg', :'a' || '/' || :stray || '/thumb.webp'],
  'the sweep names the files of a folder with no document row that are older than a day');
select ok(not (public.stray_document_files() @> array[:'a' || '/' || :registered || '/thumb.webp']), 'it never names a file in a folder that has a document row, a thumbnail included');
select ok(not (public.stray_document_files() @> array[:'a' || '/' || :young || '/front.jpg']), 'it leaves a file younger than a day');
select ok(not (public.stray_document_files() @> array[:'a' || '/' || :young || '/front.jpg']), 'and a test clock set a week ahead cannot make it older, as the query takes no clock');
select ok(not (public.stray_document_files() @> array['loose-file.jpg']), 'it leaves a name that is no folder-shaped path');
select is((select count(*)::int from unnest(public.stray_document_files()) n where n like '%property-photos%'), 0, 'it reads the documents bucket only');
select is(array_length(public.stray_document_files(1), 1), 1, 'it honours the limit');

select is(public.pending_file_removal_names(), array[:'a' || '/' || :erased || '/front.jpg'], 'the service role reads every file waiting to be removed, and not the name whose file is gone');
select is(public.settle_file_removals(), 1, 'settling drops the name whose file is gone');
reset role;
select is((select count(*)::int from private.file_removals), 1, 'and keeps the name whose file Storage still holds');

select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where name = :'a' || '/' || :erased || '/front.jpg';
select tests.act_as_service('{"x-esta-actor": "system:test"}');
select is(public.settle_file_removals(), 1, 'once the file is gone the next settle clears its name');
reset role;
select is((select count(*)::int from private.file_removals), 0, 'so an interrupted erase leaves nothing behind');

select tests.act_as('admin.a@test.esta.test');
select is(has_function_privilege('authenticated', 'public.stray_document_files(integer)', 'execute'), false, 'a signed-in user cannot run the sweep query');
select is(has_function_privilege('authenticated', 'public.settle_file_removals()', 'execute'), false, 'a signed-in user cannot settle removals');
select throws_ok($$ select public.pending_file_removal_names() $$, '42501', null, 'a signed-in member cannot ask for every household''s names');
select is(public.pending_file_removal_names(:'a'), '{}'::text[], 'an admin reads their household''s names');
select tests.act_as('viewer.a@test.esta.test');
select throws_ok(format($$ select public.pending_file_removal_names(%L) $$, :'a'), '42501', null, 'a viewer cannot read the names of erased ID card files');
select tests.act_as('admin.b@test.esta.test');
select throws_ok(format($$ select public.pending_file_removal_names(%L) $$, :'a'), '42501', null, 'and not another household''s');
select is(has_function_privilege('anon', 'public.stray_document_files(integer)', 'execute'), false, 'anon may not execute the sweep query');

select * from finish();
rollback;
