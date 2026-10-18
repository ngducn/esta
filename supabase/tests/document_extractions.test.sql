begin;
\ir _harness.psql

select plan(30);

select tests.create_household('a') as a, tests.create_household('b') as b \gset

select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Đất Bảo Lộc', 'BAOLOC', 'residential_land', 'held'),
  ('00000000-0000-4000-8000-0000000000b1', :'b', 'Nhà B', 'B1', 'townhouse', 'rental');
insert into public.documents (id, household_id, property_id, category, title, storage_path, mime, size_bytes, sha256, sensitivity) values
  ('00000000-0000-4000-8000-00000000d0a1', :'a', '00000000-0000-4000-8000-0000000000a1', 'certificate', 'Sổ hồng Bảo Lộc',
   :'a' || '/00000000-0000-4000-8000-00000000d0a1/so-hong.jpg', 'image/jpeg', 1000, repeat('a', 64), 'sensitive'),
  ('00000000-0000-4000-8000-00000000d0a2', :'a', '00000000-0000-4000-8000-0000000000a1', 'photo', 'Ảnh lô đất',
   :'a' || '/00000000-0000-4000-8000-00000000d0a2/anh.jpg', 'image/jpeg', 1000, repeat('c', 64), 'normal'),
  ('00000000-0000-4000-8000-00000000d0a3', :'a', '00000000-0000-4000-8000-0000000000a1', 'lease_contract', 'Hợp đồng thuê',
   :'a' || '/00000000-0000-4000-8000-00000000d0a3/hop-dong.pdf', 'application/pdf', 1000, repeat('d', 64), 'normal'),
  ('00000000-0000-4000-8000-00000000d0b1', :'b', '00000000-0000-4000-8000-0000000000b1', 'certificate', 'Sổ hồng B',
   :'b' || '/00000000-0000-4000-8000-00000000d0b1/so-hong.jpg', 'image/jpeg', 1000, repeat('b', 64), 'sensitive');

select tests.act_as('member.a@test.esta.test');
select public.enqueue_extract_document('00000000-0000-4000-8000-00000000d0a1', '2026-10-07T02:00:00Z') as extraction_a \gset
select isnt(:'extraction_a'::uuid, null, 'a member queues the extraction of a certificate');
select is(public.enqueue_extract_document('00000000-0000-4000-8000-00000000d0a1', '2026-10-07T02:00:00Z'), :'extraction_a'::uuid,
  'a second enqueue of the same document returns the same extraction');
select is(public.enqueue_extract_document('00000000-0000-4000-8000-00000000d0a2', '2026-10-07T02:00:00Z'), null,
  'a photo queues nothing');
select is(public.enqueue_extract_document('00000000-0000-4000-8000-00000000d0a3', '2026-10-07T02:00:00Z'), null,
  'a lease contract queues nothing until lease_v1 arrives');
select is(public.enqueue_extract_document('00000000-0000-4000-8000-00000000d0b1', '2026-10-07T02:00:00Z'), null,
  'a document of another household is invisible to enqueue');
select results_eq(
  $$ select document_id, schema_name, schema_version::int, status from public.document_extractions $$,
  $$ values ('00000000-0000-4000-8000-00000000d0a1'::uuid, 'certificate_v1', 1, 'queued') $$,
  'one queued certificate_v1 extraction');
select results_eq(
  $$ select status from public.document_status order by document_id $$,
  $$ values ('queued'), ('none'), ('none') $$,
  'document_status gives every document of the household its latest status or none');
select is_empty($$ select 1 from public.agent_jobs $$, 'a member reads no job, not even the one she queued');

select throws_ok(
  format($$ insert into public.agent_jobs (household_id, kind, payload, idempotency_key, run_after, requested_by)
            values (%L, 'extract_document', '{"document_id": "00000000-0000-4000-8000-00000000d0a2"}',
                    'extract_document:00000000-0000-4000-8000-00000000d0a2:' || repeat('c', 64), '2026-10-07T02:00:00Z',
                    tests.user_id('member.a@test.esta.test')) $$, :'a'),
  '42501', null, 'a member cannot queue an extraction of a photo directly');
select throws_ok(
  format($$ insert into public.agent_jobs (household_id, kind, payload, idempotency_key, run_after, requested_by)
            values (%L, 'extract_document', '{"document_id": "00000000-0000-4000-8000-00000000d0a1"}',
                    'extract_document:00000000-0000-4000-8000-00000000d0a1:forged', '2026-10-07T02:00:00Z',
                    tests.user_id('member.a@test.esta.test')) $$, :'a'),
  '42501', null, 'a member cannot queue an extraction under any other idempotency key');
select throws_ok(
  format($$ insert into public.agent_jobs (household_id, kind, run_after, requested_by)
            values (%L, 'research_scan', '2026-10-07T02:00:00Z', tests.user_id('member.a@test.esta.test')) $$, :'a'),
  '42501', null, 'a member cannot queue a kind other than extract_document and ping');
select throws_ok(
  format($$ insert into public.document_extractions (household_id, document_id, schema_name, schema_version, status, result)
            values (%L, '00000000-0000-4000-8000-00000000d0a1', 'certificate_v1', 1, 'needs_review', '{}') $$, :'a'),
  '42501', null, 'a member cannot insert a filled extraction');
select throws_ok(
  $$ update public.document_extractions set result = '{"forged": true}' $$,
  '42501', null, 'a member cannot write the result');
select throws_ok(
  $$ update public.document_extractions set status = 'accepted' $$,
  '23514', null, 'the status trigger refuses queued > accepted');
select throws_ok(
  $$ update public.document_extractions set status = 'running' $$,
  '23514', null, 'a member cannot make a worker move');
select throws_ok($$ delete from public.document_extractions $$, '42501', null, 'a member cannot delete an extraction');

select tests.act_as_service('{"x-esta-actor": "agent:test-worker"}');
select is((select count(*)::int from public.agent_jobs where household_id = :'a'), 1, 'two enqueues made one job');
select results_eq(
  format($$ select kind, idempotency_key, payload ->> 'document_id', status, requested_by from public.agent_jobs where household_id = %L $$, :'a'),
  format($$ values ('extract_document', 'extract_document:00000000-0000-4000-8000-00000000d0a1:%s', '00000000-0000-4000-8000-00000000d0a1', 'queued', %L::uuid) $$,
    repeat('a', 64), tests.user_id('member.a@test.esta.test')),
  'the job carries the document id, the content key and its requester');
select is((select payload ->> 'extraction_id' from public.agent_jobs where household_id = :'a'), :'extraction_a', 'the job names its extraction');
select lives_ok(format($$ update public.document_extractions set status = 'running' where id = %L $$, :'extraction_a'), 'the worker moves queued > running');
select lives_ok(format($$ update public.document_extractions set status = 'needs_review', result = '{"form": null}' where id = %L $$, :'extraction_a'), 'the worker moves running > needs_review');
select lives_ok(format($$ update public.document_extractions set result = '{"form": null}' where id = %L $$, :'extraction_a'), 'a re-run rewrites a waiting extraction');
select throws_ok(format($$ update public.document_extractions set status = 'running' where id = %L $$, :'extraction_a'), '23514', null, 'needs_review never goes back to running');

select tests.act_as('viewer.a@test.esta.test');
select tests.sees_household('public.document_extractions', :'a', true);
select is_empty($$ update public.document_extractions set status = 'accepted' returning 1 $$, 'a viewer cannot accept');

select tests.act_as('member.b@test.esta.test');
select tests.sees_household('public.document_extractions', :'a', false);
select is_empty(format($$ select 1 from public.document_status where household_id = %L $$, :'a'), 'document_status hides another household');

select tests.act_as('member.a@test.esta.test');
select lives_ok($$ update public.document_extractions set status = 'accepted', accepted_fields = '{"form": true}' $$, 'a member accepts a waiting extraction');
select throws_ok($$ update public.document_extractions set status = 'rejected' $$, '23514', null, 'accepted is final');

select tests.clear_request();
reset role;
select is(
  (select count(*)::int from public.audit_log where table_name = 'document_extractions' and row_id = :'extraction_a'),
  4, 'every change to the extraction is audited, and a rewrite with the same result adds no row');

select * from finish();
rollback;
