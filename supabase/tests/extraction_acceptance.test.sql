begin;
\ir _harness.psql

select plan(22);

select tests.create_household('a') as a, tests.create_household('b') as b \gset

select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Đất Bảo Lộc', 'BAOLOC', 'residential_land', 'held');
insert into public.documents (id, household_id, property_id, category, title, storage_path, mime, size_bytes, sha256, sensitivity) values
  ('00000000-0000-4000-8000-00000000d0a1', :'a', '00000000-0000-4000-8000-0000000000a1', 'certificate', 'Sổ hồng đọc được',
   :'a' || '/00000000-0000-4000-8000-00000000d0a1/so-hong.jpg', 'image/jpeg', 1000, repeat('a', 64), 'sensitive'),
  ('00000000-0000-4000-8000-00000000d0a2', :'a', '00000000-0000-4000-8000-0000000000a1', 'certificate', 'Trang trống',
   :'a' || '/00000000-0000-4000-8000-00000000d0a2/trang.jpg', 'image/jpeg', 1000, repeat('b', 64), 'normal');

select tests.act_as('member.a@test.esta.test');
select public.enqueue_extract_document('00000000-0000-4000-8000-00000000d0a1', '2026-10-07T02:00:00Z') as read_id \gset
select public.enqueue_extract_document('00000000-0000-4000-8000-00000000d0a2', '2026-10-07T02:00:00Z') as blank_id \gset

select throws_ok(
  $$ insert into public.document_extractions (id, household_id, document_id, schema_name, schema_version, status, accepted_fields)
     select '00000000-0000-4000-8000-00000000e0a1', household_id, document_id, schema_name, 1, 'accepted', '{}'
     from public.document_extractions where document_id = '00000000-0000-4000-8000-00000000d0a2' $$,
  '23514', null, 'no manual entry while the assistant is still reading');

select tests.act_as_service('{"x-esta-actor": "agent:test-worker"}');
update public.document_extractions set status = 'running' where id = :'read_id';
update public.document_extractions set status = 'needs_review', result = '{"form": null}', model = 'claude-test' where id = :'read_id';
-- One transaction gives every row the same created_at; the failed read happened earlier in real use.
update public.document_extractions set status = 'failed', created_at = created_at - interval '1 hour' where id = :'blank_id';
select throws_ok(
  format($$ insert into public.document_extractions (household_id, document_id, schema_name, schema_version, status, accepted_fields, model)
            values (%L, '00000000-0000-4000-8000-00000000d0a2', 'certificate_v1', 1, 'accepted', '{}', 'claude-test') $$, :'a'),
  '23514', null, 'an accepted insert with a model is refused, whoever inserts it');

select tests.act_as('viewer.a@test.esta.test');
select throws_ok(
  format($$ insert into public.document_extractions (household_id, document_id, schema_name, schema_version, status, accepted_fields)
            values (%L, '00000000-0000-4000-8000-00000000d0a2', 'certificate_v1', 1, 'accepted', '{}') $$, :'a'),
  '42501', null, 'a viewer cannot enter a document by hand (FND-2)');
select is_empty($$ update public.document_extractions set status = 'accepted' returning 1 $$, 'a viewer cannot accept a review');

select tests.act_as('member.b@test.esta.test');
select throws_ok(
  format($$ insert into public.document_extractions (household_id, document_id, schema_name, schema_version, status, accepted_fields)
            values (%L, '00000000-0000-4000-8000-00000000d0a2', 'certificate_v1', 1, 'accepted', '{}') $$, :'a'),
  '23514', null, 'a member of another household cannot enter it either, refused before it reads anything');

select tests.act_as('member.a@test.esta.test');
select throws_ok(
  format($$ insert into public.document_extractions (household_id, document_id, schema_name, schema_version, status, accepted_fields)
            values (%L, '00000000-0000-4000-8000-00000000d0a2', 'certificate_v1', 1, 'needs_review', '{}') $$, :'a'),
  '23514', null, 'a member inserts no state but queued or a manual accepted');
select throws_ok(
  format($$ insert into public.document_extractions (household_id, document_id, schema_name, schema_version, status)
            values (%L, '00000000-0000-4000-8000-00000000d0a2', 'certificate_v1', 1, 'accepted') $$, :'a'),
  '23514', null, 'a manual entry carries the fields it accepted');
select throws_ok(
  format($$ insert into public.document_extractions (household_id, document_id, schema_name, schema_version, status, accepted_fields, model)
            values (%L, '00000000-0000-4000-8000-00000000d0a2', 'certificate_v1', 1, 'accepted', '{}', 'forged') $$, :'a'),
  '42501', null, 'a member cannot name a model');
select throws_ok(
  format($$ insert into public.document_extractions (household_id, document_id, schema_name, schema_version, status, accepted_fields)
            values (%L, '00000000-0000-4000-8000-00000000d0a1', 'certificate_v1', 1, 'accepted', '{}') $$, :'a'),
  '23514', null, 'no manual entry beside an extraction waiting for review');

select lives_ok(
  format($$ insert into public.document_extractions (id, household_id, document_id, schema_name, schema_version, status, accepted_fields)
            values ('00000000-0000-4000-8000-00000000e0a1', %L, '00000000-0000-4000-8000-00000000d0a2', 'certificate_v1', 1, 'accepted',
                    '{"form": {"decision": "edited", "value": "paper_only"}}') $$, :'a'),
  'a member enters a failed document by hand as an accepted extraction with no model');
select lives_ok(
  format($$ insert into public.document_extractions (id, household_id, document_id, schema_name, schema_version, status, accepted_fields)
            values ('00000000-0000-4000-8000-00000000e0a1', %L, '00000000-0000-4000-8000-00000000d0a2', 'certificate_v1', 1, 'accepted',
                    '{"form": {"decision": "edited", "value": "paper_only"}}')
            on conflict (id) do nothing $$, :'a'),
  'a retried manual save passes the rule and inserts nothing more');
select results_eq(
  $$ select status, model, reviewed_by from public.document_extractions where document_id = '00000000-0000-4000-8000-00000000d0a2' order by status $$,
  format($$ values ('accepted', null::text, %L::uuid), ('failed', null, null) $$, tests.user_id('member.a@test.esta.test')),
  'the manual entry is stamped with its member and is now the document''s latest');
select is((select status from public.document_status where document_id = '00000000-0000-4000-8000-00000000d0a2'), 'accepted',
  'document_status reads the manual entry');

select throws_ok(
  format($$ update public.document_extractions set reviewed_by = %L where id = %L $$, tests.user_id('admin.a@test.esta.test'), :'read_id'),
  '42501', null, 'a member cannot name the reviewer');
select lives_ok(
  format($$ update public.document_extractions set status = 'accepted', accepted_fields = '{"form": {"decision": "accepted", "value": "gcn_2024"}}' where id = %L $$, :'read_id'),
  'a member accepts the waiting extraction');
select is((select reviewed_by from public.document_extractions where id = :'read_id'), tests.user_id('member.a@test.esta.test'),
  'the accepting member is the reviewer');
select lives_ok(
  format($$ update public.document_extractions set status = 'accepted' where id = %L $$, :'read_id'),
  'saving the accepted review again is a no-op');

insert into public.certificates (id, household_id, property_id, form, extraction_id) values
  ('00000000-0000-4000-8000-00000000c0a1', :'a', '00000000-0000-4000-8000-0000000000a1', 'gcn_2024', :'read_id');
select throws_ok(
  format($$ insert into public.certificates (household_id, property_id, form, extraction_id) values (%L, '00000000-0000-4000-8000-0000000000a1', 'gcn_2024', %L) $$, :'a', :'read_id'),
  '23505', null, 'one extraction yields one certificate');
select lives_ok(
  format($$ insert into public.certificates (household_id, property_id, form) values (%L, '00000000-0000-4000-8000-0000000000a1', 'paper_only'), (%L, '00000000-0000-4000-8000-0000000000a1', 'paper_only') $$, :'a', :'a'),
  'certificates entered by hand have no extraction and are not limited');
select has_index('public', 'certificates', 'certificates_extraction_idx', 'certificates have the extraction index');

-- The review save's ID judge (national_id.test.sql runs the shared vectors through it as a member).
select ok(
  has_function_privilege('authenticated', 'public.national_id_indexes(jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.national_id_indexes(jsonb)', 'execute'),
  'members may ask the ID judge and anonymous callers may not');
select is(
  (select (provolatile, prosecdef) from pg_proc where oid = 'public.national_id_indexes(jsonb)'::regprocedure)::text,
  '(i,f)', 'the ID judge is immutable and runs as its caller');

select * from finish();
rollback;
