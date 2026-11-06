begin;
\ir _harness.psql

select plan(24);

select tests.create_household('a') as a, tests.create_household('b') as b \gset

select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Đất Bảo Lộc', 'BAOLOC', 'residential_land', 'held'),
  ('00000000-0000-4000-8000-0000000000b1', :'b', 'Nhà B', 'B1', 'townhouse', 'held');
insert into public.documents (id, household_id, property_id, category, title, storage_path, mime, size_bytes, sha256, sensitivity) values
  ('00000000-0000-4000-8000-00000000d0a1', :'a', '00000000-0000-4000-8000-0000000000a1', 'certificate', 'Sổ hồng Demo',
   :'a' || '/00000000-0000-4000-8000-00000000d0a1/so-hong.jpg', 'image/jpeg', 1000, repeat('a', 64), 'sensitive'),
  ('00000000-0000-4000-8000-00000000d0a2', :'a', null, 'certificate', 'Sổ chưa xếp Demo',
   :'a' || '/00000000-0000-4000-8000-00000000d0a2/so.jpg', 'image/jpeg', 1000, repeat('b', 64), 'sensitive'),
  ('00000000-0000-4000-8000-00000000d0a3', :'a', '00000000-0000-4000-8000-0000000000a1', 'certificate', 'Trang trống Demo',
   :'a' || '/00000000-0000-4000-8000-00000000d0a3/trang.jpg', 'image/jpeg', 1000, repeat('c', 64), 'sensitive'),
  ('00000000-0000-4000-8000-00000000d0a4', :'a', '00000000-0000-4000-8000-0000000000a1', 'utility_bill', 'Hóa đơn điện Demo',
   :'a' || '/00000000-0000-4000-8000-00000000d0a4/hd.pdf', 'application/pdf', 1000, repeat('d', 64), 'normal');

select tests.act_as('member.a@test.esta.test');
select public.enqueue_extract_document('00000000-0000-4000-8000-00000000d0a1', '2026-10-07T02:00:00Z') as read_id \gset
select public.enqueue_extract_document('00000000-0000-4000-8000-00000000d0a2', '2026-10-07T02:00:00Z') as unfiled_id \gset
select public.enqueue_extract_document('00000000-0000-4000-8000-00000000d0a3', '2026-10-07T02:00:00Z') as failed_id \gset
select public.enqueue_extract_document('00000000-0000-4000-8000-00000000d0a4', '2026-10-07T02:00:00Z') as bill_id \gset

select tests.act_as_service('{"x-esta-actor": "agent:test-worker"}');
update public.document_extractions set status = 'running' where id in (:'read_id', :'unfiled_id', :'failed_id', :'bill_id');
update public.document_extractions set status = 'needs_review', result = '{"form": null}', model = 'claude-test' where id in (:'read_id', :'unfiled_id', :'bill_id');
update public.document_extractions set status = 'failed' where id = :'failed_id';
insert into public.agent_items (household_id, kind, severity, title, dedupe_key) values
  (:'a', 'alert', 'info', 'Xem lại sổ', 'extract_review:' || :'read_id'),
  (:'a', 'alert', 'info', 'Xem lại sổ chưa xếp', 'extract_review:' || :'unfiled_id'),
  (:'a', 'alert', 'info', 'Sổ không đọc được', 'extract_failed:' || :'failed_id');

-- Two holders, a certificate, a parcel and a structure, in the order the plan writes them.
select format($j$[
  {"table": "parties", "row": {"id": "00000000-0000-4000-8000-00000000a001", "household_id": %1$s, "kind": "individual", "full_name": "Nguyễn Văn Demo", "id_last4": "1234", "address_text": null, "tags": ["owner"]}},
  {"table": "certificates", "row": {"id": "00000000-0000-4000-8000-00000000c001", "household_id": %1$s, "property_id": "00000000-0000-4000-8000-0000000000b1", "form": "gcn_2024", "serial_no": "DEMO 1", "book_entry_no": "CS 1", "issued_on": "2024-01-02", "issued_by": null, "holder_party_ids": ["00000000-0000-4000-8000-00000000a001"], "annotations": [], "document_id": "00000000-0000-4000-8000-00000000d0a1", "extraction_id": "00000000-0000-4000-8000-00000000f0f0"}},
  {"table": "parcels", "row": {"id": "00000000-0000-4000-8000-00000000b001", "household_id": %1$s, "property_id": "00000000-0000-4000-8000-0000000000b1", "certificate_id": "00000000-0000-4000-8000-00000000c001", "parcel_no": "56", "map_sheet_no": "12", "area_m2": 82.7, "use_form": "private", "purposes": [], "origin_text": null}},
  {"table": "structures", "row": {"id": "00000000-0000-4000-8000-00000000b002", "household_id": %1$s, "property_id": "00000000-0000-4000-8000-0000000000b1", "certificate_id": "00000000-0000-4000-8000-00000000c001", "kind": "house", "footprint_m2": 40, "floor_area_m2": 80, "floors": 2, "structure_text": null, "completed_year": 2010, "ownership_term": null}},
  {"table": "properties", "row": {"id": "00000000-0000-4000-8000-0000000000b1", "household_id": %1$s, "certificate_address_text": "Thửa 56, tờ 12"}}
]$j$, to_json(:'a'::text)::text) as steps \gset
select jsonb_set(:'steps'::jsonb, '{2,row,certificate_id}', '"00000000-0000-4000-8000-00000000dead"') as bad_steps \gset

-- Nobody but a member of the household accepts.
select tests.act_as('viewer.a@test.esta.test');
select throws_ok(
  format($$ select * from public.accept_extraction(%L, %L, '{}') $$, :'read_id', :'steps'),
  '42501', 'ESTA_FORBIDDEN', 'a viewer cannot accept');
select tests.act_as('member.b@test.esta.test');
select throws_ok(
  format($$ select * from public.accept_extraction(%L, %L, '{}') $$, :'read_id', :'steps'),
  'P0002', 'ESTA_EXTRACTION_NOT_FOUND', 'a member of another household finds nothing');
select throws_ok(
  format($$ select * from public.reject_extraction(%L) $$, :'read_id'),
  'P0002', 'ESTA_EXTRACTION_NOT_FOUND', 'and cannot reject it either');

select tests.act_as('member.a@test.esta.test');

-- The last write fails (a parcel under a certificate that does not exist), and the party, the certificate, the filing and
-- the extraction's state written before it all roll back.
select throws_ok(
  format($$ select * from public.accept_extraction(%L, %L, '{"form": {"decision": "accepted", "value": "gcn_2024"}}', null, %L) $$,
    :'unfiled_id', :'bad_steps', '00000000-0000-4000-8000-0000000000a1'),
  '23503', null, 'a step that fails refuses the whole accept');
select is((select count(*) from public.parties where id = '00000000-0000-4000-8000-00000000a001'), 0::bigint, 'no party stays behind');
select is((select count(*) from public.certificates where document_id = '00000000-0000-4000-8000-00000000d0a1'), 0::bigint, 'no certificate stays behind');
select is((select property_id from public.documents where id = '00000000-0000-4000-8000-00000000d0a2'), null, 'the unfiled document stays unfiled');
select is((select status from public.document_extractions where id = :'unfiled_id'), 'needs_review', 'the extraction still waits for review');
select is((select status from public.agent_items where dedupe_key = 'extract_review:' || :'unfiled_id'), 'new', 'the Trợ lý item stays on the list');
select is((select certificate_address_text from public.properties where id = '00000000-0000-4000-8000-0000000000a1'), null, 'the property address is untouched');

-- A document with no property needs one chosen; the plan's household and property never decide where rows land.
select throws_ok(
  format($$ select * from public.accept_extraction(%L, '[]', '{}') $$, :'unfiled_id'),
  '23514', 'ESTA_NO_PROPERTY', 'an unfiled document with no property chosen is refused');
select throws_ok(
  format($$ select * from public.accept_extraction(%L, '[]', '{}', null, %L) $$, :'unfiled_id', '00000000-0000-4000-8000-0000000000b1'),
  'P0002', 'ESTA_PROPERTY_NOT_FOUND', 'and so is a property of another household');
select results_eq(
  format($$ select property_id, document_id from public.accept_extraction(%L, %L, '{"form": {"decision": "accepted", "value": "gcn_2024"}}', null, %L) $$,
    :'unfiled_id', :'steps', '00000000-0000-4000-8000-0000000000a1'),
  $$ values ('00000000-0000-4000-8000-0000000000a1'::uuid, '00000000-0000-4000-8000-00000000d0a2'::uuid) $$,
  'accepting files the document on the chosen property and answers it');
select results_eq(
  $$ select property_id, household_id from public.certificates where extraction_id = (select id from public.document_extractions where document_id = '00000000-0000-4000-8000-00000000d0a2') $$,
  format($$ values ('00000000-0000-4000-8000-0000000000a1'::uuid, %L::uuid) $$, :'a'),
  'the rows land on the extraction''s household and property, whatever property the plan named');
select results_eq(
  $$ select (select count(*) from public.parcels where certificate_id = '00000000-0000-4000-8000-00000000c001'),
            (select count(*) from public.structures where certificate_id = '00000000-0000-4000-8000-00000000c001'),
            (select certificate_address_text from public.properties where id = '00000000-0000-4000-8000-0000000000a1') $$,
  $$ values (1::bigint, 1::bigint, 'Thửa 56, tờ 12') $$,
  'the parcel, the structure and the property address are written');
select results_eq(
  format($$ select status, reviewed_by from public.document_extractions where id = %L $$, :'unfiled_id'),
  format($$ values ('accepted', %L::uuid) $$, tests.user_id('member.a@test.esta.test')),
  'the extraction is accepted by the member');
select is((select status from public.agent_items where dedupe_key = 'extract_review:' || :'unfiled_id'), 'done', 'the Trợ lý item leaves the new list');

-- Saving again rewrites the same rows.
select lives_ok(
  format($$ select * from public.accept_extraction(%L, %L, '{"form": {"decision": "accepted", "value": "gcn_2024"}}') $$, :'unfiled_id', :'steps'),
  'a retried accept passes');
select is((select count(*) from public.parcels where certificate_id = '00000000-0000-4000-8000-00000000c001'), 1::bigint, 'and leaves one parcel');

-- A failed read is saved as a manual entry named by the caller.
select lives_ok(
  format($$ select * from public.accept_extraction(%L, '[]', '{"form": {"decision": "edited", "value": "paper_only"}}', '00000000-0000-4000-8000-00000000e0a1') $$, :'failed_id'),
  'a failed read is accepted as a manual entry');
select results_eq(
  $$ select status, model from public.document_extractions where id = '00000000-0000-4000-8000-00000000e0a1' $$,
  $$ values ('accepted', null::text) $$, 'inserted accepted with no model');
select throws_ok(
  format($$ select * from public.accept_extraction(%L, '[]', '{}') $$, :'failed_id'),
  '23514', 'ESTA_EXTRACTION_NOT_REVIEWABLE', 'a failed read with no manual entry named is not reviewable');

-- Rejecting.
select is((select public.reject_extraction(:'bill_id')), '00000000-0000-4000-8000-00000000d0a4'::uuid, 'rejecting answers the document');
select is((select public.reject_extraction(:'bill_id')), null::uuid, 'rejecting a read no longer waiting does nothing');

select * from finish();
rollback;
