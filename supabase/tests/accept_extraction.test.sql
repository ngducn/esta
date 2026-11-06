begin;
\ir _harness.psql

select plan(38);

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
   :'a' || '/00000000-0000-4000-8000-00000000d0a4/hd.pdf', 'application/pdf', 1000, repeat('d', 64), 'normal'),
  ('00000000-0000-4000-8000-00000000d0b1', :'b', '00000000-0000-4000-8000-0000000000b1', 'certificate', 'Sổ hồng B Demo',
   :'b' || '/00000000-0000-4000-8000-00000000d0b1/so.jpg', 'image/jpeg', 1000, repeat('e', 64), 'sensitive'),
  ('00000000-0000-4000-8000-00000000d0a5', :'a', '00000000-0000-4000-8000-0000000000a1', 'utility_bill', 'Hóa đơn nước Demo',
   :'a' || '/00000000-0000-4000-8000-00000000d0a5/hd.pdf', 'application/pdf', 1000, repeat('f', 64), 'normal');

insert into public.parties (id, household_id, kind, full_name) values ('00000000-0000-4000-8000-00000000b0a1', :'b', 'individual', 'Chủ B Demo');
insert into public.certificates (id, household_id, property_id, form, serial_no, book_entry_no, issued_on, document_id) values
  ('00000000-0000-4000-8000-00000000b0c1', :'b', '00000000-0000-4000-8000-0000000000b1', 'gcn_2024', 'B DEMO', 'CS B', '2024-01-02', '00000000-0000-4000-8000-00000000d0b1');
insert into public.parcels (id, household_id, property_id, certificate_id, parcel_no, map_sheet_no, area_m2, use_form, purposes) values
  ('00000000-0000-4000-8000-00000000b0d1', :'b', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000b0c1', '99', '1', 10, 'private', '[]');
select tests.act_as('member.b@test.esta.test');
select public.enqueue_extract_document('00000000-0000-4000-8000-00000000d0b1', '2026-10-07T02:00:00Z') as other_id \gset
select tests.act_as('member.a@test.esta.test');
select public.enqueue_extract_document('00000000-0000-4000-8000-00000000d0a5', '2026-10-07T02:00:00Z') as water_id \gset
select public.enqueue_extract_document('00000000-0000-4000-8000-00000000d0a1', '2026-10-07T02:00:00Z') as read_id \gset
select public.enqueue_extract_document('00000000-0000-4000-8000-00000000d0a2', '2026-10-07T02:00:00Z') as unfiled_id \gset
select public.enqueue_extract_document('00000000-0000-4000-8000-00000000d0a3', '2026-10-07T02:00:00Z') as failed_id \gset
select public.enqueue_extract_document('00000000-0000-4000-8000-00000000d0a4', '2026-10-07T02:00:00Z') as bill_id \gset

select tests.act_as_service('{"x-esta-actor": "agent:test-worker"}');
update public.document_extractions set status = 'running' where id in (:'read_id', :'unfiled_id', :'failed_id', :'bill_id', :'other_id', :'water_id');
update public.document_extractions set status = 'needs_review', result = '{"form": null}', model = 'claude-test' where id in (:'read_id', :'unfiled_id', :'bill_id', :'other_id', :'water_id');
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
select throws_ok(
  format($$ select public.reject_extraction(%L) $$, :'bill_id'),
  '42501', 'ESTA_FORBIDDEN', 'and a viewer cannot reject');
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
  format($$ select * from public.accept_extraction(%L, %L, '{"form": {"decision": "accepted", "value": "gcn_2024"}}', %L) $$,
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
  format($$ select * from public.accept_extraction(%L, '[]', '{}', %L) $$, :'unfiled_id', '00000000-0000-4000-8000-0000000000b1'),
  'P0002', 'ESTA_PROPERTY_NOT_FOUND', 'and so is a property of another household');
select results_eq(
  format($$ select property_id, document_id from public.accept_extraction(%L, %L, '{"form": {"decision": "accepted", "value": "gcn_2024"}}', %L) $$,
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

-- A failed read is saved as a manual entry whose id the stored read decides (manualEntryId's value for this id).
select lives_ok(
  format($$ select * from public.accept_extraction(%L, '[]', '{"form": {"decision": "edited", "value": "paper_only"}}') $$, :'failed_id'),
  'a failed read is accepted as a manual entry');
select results_eq(
  format($$ select status, model from public.document_extractions where id = extensions.uuid_generate_v5(extensions.uuid_ns_url(), 'manual:' || %L) $$, :'failed_id'),
  $$ values ('accepted', null::text) $$, 'inserted accepted with no model, under the id the TypeScript side computes');
select is(extensions.uuid_generate_v5(extensions.uuid_ns_url(), 'manual:00000000-0000-4000-8000-00000000f0f1'), '73dd4027-1a24-597c-acc1-918b6f2d1220'::uuid,
  'and that id is the one uuid-v5.ts gives');
select throws_ok(
  format($$ select * from public.accept_extraction(%L, '[]', '{}', p_manual_id => %L) $$, :'failed_id', :'other_id'),
  '42883', null, 'no argument names the manual entry, so another household''s extraction cannot be named as one');
select tests.act_as('member.b@test.esta.test');
select results_eq(
  format($$ select status, accepted_fields, reviewed_by from public.document_extractions where id = %L $$, :'other_id'),
  $$ values ('needs_review', null::jsonb, null::uuid) $$, 'and the other household''s read is untouched');
select tests.act_as('member.a@test.esta.test');

-- Reject and accept take turns on one read.
select is((select public.reject_extraction(:'water_id')), '00000000-0000-4000-8000-00000000d0a5'::uuid, 'a waiting read is rejected');
select throws_ok(
  format($$ select * from public.accept_extraction(%L, '[]', '{}') $$, :'water_id'),
  '23514', 'ESTA_EXTRACTION_NOT_REVIEWABLE', 'a rejected read cannot be accepted');
select is((select public.reject_extraction(:'unfiled_id')), null::uuid, 'an accepted read cannot be rejected');
select is((select status from public.document_extractions where id = :'unfiled_id'), 'accepted', 'and stays accepted');

-- Ids inside the steps never reach another household: a step row that is another household's row is refused, a
-- foreign key to its certificate fails, and its rows stay as they were.
select throws_ok(
  format($$ select * from public.accept_extraction(%L, %L, '{}') $$, :'read_id',
    '[{"table": "parties", "row": {"id": "00000000-0000-4000-8000-00000000b0a1", "kind": "individual", "full_name": "Kẻ lạ Demo", "tags": []}}]'),
  '22023', 'ESTA_EXTRACTION_STEP', 'a party step with another household''s party id is refused');
select throws_ok(
  format($$ select * from public.accept_extraction(%L, %L, '{}') $$, :'read_id',
    '[{"table": "certificates", "row": {"id": "00000000-0000-4000-8000-00000000b0c1", "form": "gcn_2024", "serial_no": "KE LA", "book_entry_no": "X", "issued_on": "2024-01-02", "holder_party_ids": [], "annotations": []}}]'),
  '22023', 'ESTA_EXTRACTION_STEP', 'a certificate step with another household''s certificate id is refused');
select throws_ok(
  format($$ select * from public.accept_extraction(%L, %L, '{}') $$, :'read_id',
    '[{"table": "parcels", "row": {"id": "00000000-0000-4000-8000-00000000b0d1", "certificate_id": "00000000-0000-4000-8000-00000000b0c1", "parcel_no": "1", "area_m2": 1, "use_form": "private", "purposes": []}}]'),
  '22023', 'ESTA_EXTRACTION_STEP', 'a parcel step with another household''s parcel id, under their certificate, is refused');
select throws_ok(
  format($$ select * from public.accept_extraction(%L, %L, '{}') $$, :'read_id',
    '[{"table": "parcels", "row": {"id": "00000000-0000-4000-8000-00000000b0d9", "certificate_id": "00000000-0000-4000-8000-00000000b0c1", "parcel_no": "1", "area_m2": 1, "use_form": "private", "purposes": []}}]'),
  '23503', null, 'a new parcel under another household''s certificate is refused');
select throws_ok(
  format($$ select * from public.accept_extraction(%L, %L, '{}') $$, :'read_id',
    '[{"table": "certificates", "row": {"id": "00000000-0000-4000-8000-00000000c0f1", "form": "gcn_2024", "serial_no": "A", "book_entry_no": "B", "issued_on": "2024-01-02", "holder_party_ids": ["00000000-0000-4000-8000-00000000b0a1"], "annotations": []}}]'),
  null, null, 'a certificate whose holder is another household''s party is refused');
select throws_ok(
  format($$ select * from public.accept_extraction(%L, %L, '{}') $$, :'read_id',
    '[{"table": "utility_accounts", "row": {"id": "00000000-0000-4000-8000-00000000c0f2", "unit_id": "00000000-0000-4000-8000-00000000c0f3", "kind": "water"}}]'),
  '23503', null, 'a utility account step naming a room that is not on the property is refused');
select tests.act_as('member.b@test.esta.test');
select results_eq(
  $$ select (select full_name from public.parties where id = '00000000-0000-4000-8000-00000000b0a1'),
            (select serial_no from public.certificates where id = '00000000-0000-4000-8000-00000000b0c1'),
            (select parcel_no from public.parcels where id = '00000000-0000-4000-8000-00000000b0d1'),
            (select status from public.document_extractions where id = (select id from public.document_extractions where document_id = '00000000-0000-4000-8000-00000000d0b1')) $$,
  $$ values ('Chủ B Demo', 'B DEMO', '99', 'needs_review') $$, 'and the other household''s party, certificate, parcel and read are as they were');
select tests.act_as('member.a@test.esta.test');

-- Rejecting.
select is((select public.reject_extraction(:'bill_id')), '00000000-0000-4000-8000-00000000d0a4'::uuid, 'rejecting answers the document');
select is((select public.reject_extraction(:'bill_id')), null::uuid, 'rejecting a read no longer waiting does nothing');

select * from finish();
rollback;
