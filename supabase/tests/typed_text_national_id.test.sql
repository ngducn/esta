-- SPEC D11 for typed text (#147): a member's direct write of a full ID into any free-text column of parcels,
-- certificates, structures, parties or a document's title and tags is refused, as the review save's judge refuses it.
begin;
\ir _harness.psql

select plan(64);

select tests.create_household('a') as a \gset

select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Nhà phố Demo', 'DEMO', 'townhouse', 'rental');
insert into public.certificates (id, household_id, property_id, form) values
  ('00000000-0000-4000-8000-00000000c0a1', :'a', '00000000-0000-4000-8000-0000000000a1', 'gcn_2024');
insert into public.parcels (id, household_id, property_id, area_m2) values
  ('00000000-0000-4000-8000-00000000f0a1', :'a', '00000000-0000-4000-8000-0000000000a1', 50);
insert into public.structures (id, household_id, property_id, kind) values
  ('00000000-0000-4000-8000-00000000e0a1', :'a', '00000000-0000-4000-8000-0000000000a1', 'Nhà ở');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000aa01', :'a', 'individual', 'Bà Demo', array['owner']),
  ('00000000-0000-4000-8000-00000000aa02', :'a', 'organization', 'Công ty Demo', array['other']);
insert into public.documents (id, household_id, property_id, category, title, storage_path, mime, size_bytes, sha256, sensitivity) values
  ('00000000-0000-4000-8000-00000000d0a1', :'a', '00000000-0000-4000-8000-0000000000a1', 'other', 'Giấy tờ Demo',
   :'a' || '/00000000-0000-4000-8000-00000000d0a1/giay-to.pdf', 'application/pdf', 100, repeat('a', 64), 'normal');

select tests.act_as('member.a@test.esta.test');

-- parcels
select throws_ok($$ update public.parcels set parcel_no = '079123456789' where id = '00000000-0000-4000-8000-00000000f0a1' $$,
  '23514', null, 'parcel_no refuses a full ID');
select throws_ok($$ update public.parcels set map_sheet_no = 'CMND 023456789' where id = '00000000-0000-4000-8000-00000000f0a1' $$,
  '23514', null, 'map_sheet_no refuses a labelled CMND');
select throws_ok($$ update public.parcels set origin_text = 'Nhận chuyển nhượng từ ông Demo, CCCD 079123456789' where id = '00000000-0000-4000-8000-00000000f0a1' $$,
  '23514', null, 'origin_text refuses a labelled full ID');
select throws_ok($$ update public.parcels set purposes = '[{"land_use_code": "CCCD 079123456789"}]' where id = '00000000-0000-4000-8000-00000000f0a1' $$,
  '23514', null, 'a purpose''s land use code refuses a full ID');
select throws_ok(format($$ insert into public.parcels (household_id, property_id, origin_text) values (%L, '00000000-0000-4000-8000-0000000000a1', 'Số CCCD 079123456789') $$, :'a'),
  '23514', null, 'a new parcel refuses a full ID');
select lives_ok($$ update public.parcels set parcel_no = '125', map_sheet_no = '12', origin_text = 'Nhận chuyển nhượng từ ông Demo, CCCD 6789',
                   purposes = '[{"land_use_code": "ODT", "area_m2": 50, "term": "2043-10-15"}]' where id = '00000000-0000-4000-8000-00000000f0a1' $$,
  'a parcel keeps the last four digits of an ID, an area and a term');

-- certificates
select throws_ok($$ update public.certificates set serial_no = '079123456789' where id = '00000000-0000-4000-8000-00000000c0a1' $$,
  '23514', null, 'serial_no refuses a full ID');
select throws_ok($$ update public.certificates set book_entry_no = 'CMND 023456789' where id = '00000000-0000-4000-8000-00000000c0a1' $$,
  '23514', null, 'book_entry_no refuses a labelled CMND');
select throws_ok($$ update public.certificates set issued_by = 'Sở Demo, CCCD 079123456789' where id = '00000000-0000-4000-8000-00000000c0a1' $$,
  '23514', null, 'issued_by refuses a labelled full ID');
select throws_ok($$ update public.certificates set annotations = '[{"text": "Chuyển nhượng cho bà Demo, CCCD 079123456789"}]' where id = '00000000-0000-4000-8000-00000000c0a1' $$,
  '23514', null, 'an annotation''s text refuses a labelled full ID');
select throws_ok(format($$ insert into public.certificates (household_id, property_id, form, serial_no) values (%L, '00000000-0000-4000-8000-0000000000a1', 'gcn_2024', '079 123 456 789') $$, :'a'),
  '23514', null, 'a new certificate refuses a grouped full ID');
select lives_ok($$ update public.certificates set serial_no = 'AA 01234567', book_entry_no = 'CS 01234', issued_by = 'Sở Tài nguyên và Môi trường Demo',
                   annotations = '[{"date": "2024-03-12", "text": "Thế chấp 125·000·000·000 đồng, CCCD 6789", "kind": "mortgage"}]'
                 where id = '00000000-0000-4000-8000-00000000c0a1' $$,
  'a certificate keeps a serial, a book entry and an annotation with an amount written with middle dots');

-- structures
select throws_ok($$ update public.structures set kind = 'Nhà ở, CCCD 079123456789' where id = '00000000-0000-4000-8000-00000000e0a1' $$,
  '23514', null, 'kind refuses a labelled full ID');
select throws_ok($$ update public.structures set structure_text = 'Chủ sở hữu CMND 023456789' where id = '00000000-0000-4000-8000-00000000e0a1' $$,
  '23514', null, 'structure_text refuses a labelled CMND');
select throws_ok($$ update public.structures set ownership_term = '079123456789' where id = '00000000-0000-4000-8000-00000000e0a1' $$,
  '23514', null, 'ownership_term refuses a full ID');
select throws_ok(format($$ insert into public.structures (household_id, property_id, kind) values (%L, '00000000-0000-4000-8000-0000000000a1', 'Nhà 079123456789') $$, :'a'),
  '23514', null, 'a new structure refuses a full ID');
select lives_ok($$ update public.structures set kind = 'Nhà ở riêng lẻ', structure_text = 'Bê tông cốt thép', ownership_term = 'Đến 15/10/2043'
                 where id = '00000000-0000-4000-8000-00000000e0a1' $$,
  'a structure keeps its kind, structure and a term with a date');

-- parties
select throws_ok($$ update public.parties set full_name = 'Bà Demo 079123456789' where id = '00000000-0000-4000-8000-00000000aa01' $$,
  '23514', null, 'full_name refuses a full ID');
select throws_ok($$ update public.parties set short_name = 'CMND 023456789' where id = '00000000-0000-4000-8000-00000000aa01' $$,
  '23514', null, 'short_name refuses a labelled CMND');
select throws_ok($$ update public.parties set email = 'demo079123456789@test.esta.test' where id = '00000000-0000-4000-8000-00000000aa01' $$,
  '23514', null, 'email refuses a full ID glued inside it');
select throws_ok($$ update public.parties set tax_code = '079123456789' where id = '00000000-0000-4000-8000-00000000aa02' $$,
  '23514', null, 'tax_code refuses a full ID');
select throws_ok($$ update public.parties set address_text = '12 đường Demo, CCCD 079123456789' where id = '00000000-0000-4000-8000-00000000aa01' $$,
  '23514', null, 'address_text refuses a labelled full ID');
select throws_ok($$ update public.parties set notes = 'Số định danh 079123456789' where id = '00000000-0000-4000-8000-00000000aa01' $$,
  '23514', null, 'notes refuses a labelled full ID');
select throws_ok(format($$ insert into public.parties (household_id, kind, full_name, tags) values (%L, 'individual', 'Ông Demo CCCD 079123456789', array['owner']) $$, :'a'),
  '23514', null, 'a new party refuses a full ID in its name');
select lives_ok($$ update public.parties set full_name = 'Bà Nguyễn Thị Demo', short_name = 'Bà Demo', email = 'demo@test.esta.test',
                   address_text = '12 đường Demo, Phường Demo', notes = 'CCCD 6789', phone = '+842838123456', zalo_phone = '+84903123456'
                 where id = '00000000-0000-4000-8000-00000000aa01' $$,
  'a party keeps a landline in E.164, which has 12 digits, and the last four digits of an ID');
select lives_ok($$ update public.parties set tax_code = '0312345678-001' where id = '00000000-0000-4000-8000-00000000aa02' $$,
  'an organization keeps a 13-digit tax code');

-- documents
select throws_ok($$ update public.documents set title = 'CCCD 079123456789 của bà Demo' where id = '00000000-0000-4000-8000-00000000d0a1' $$,
  '23514', null, 'a document title refuses a labelled full ID');
select throws_ok($$ update public.documents set tags = array['ok', '079123456789'] where id = '00000000-0000-4000-8000-00000000d0a1' $$,
  '23514', null, 'a document tag refuses a full ID');
select throws_ok(format($$ insert into public.documents (id, household_id, property_id, category, title, storage_path, mime, size_bytes, sha256, sensitivity)
                          values ('00000000-0000-4000-8000-00000000d0a2', %L, '00000000-0000-4000-8000-0000000000a1', 'other', 'Bản sao 079123456789', %L, 'application/pdf', 100, repeat('b', 64), 'normal') $$,
                 :'a', :'a' || '/00000000-0000-4000-8000-00000000d0a2/ban-sao.pdf'),
  '23514', null, 'an uploaded document refuses a full ID in its title');
select lives_ok($$ update public.documents set title = 'CCCD bà Demo (6789)', tags = array['giấy tờ', 'Demo'] where id = '00000000-0000-4000-8000-00000000d0a1' $$,
  'a document keeps a title with the last four digits and plain tags');

-- the folded labels and middle dots of #140 reach every CHECK through the one judge
select throws_ok($$ update public.parties set notes = U&'C\1E3FND 023456789' where id = '00000000-0000-4000-8000-00000000aa01' $$,
  '23514', null, 'notes refuses a CMND whose label carries an acute on the M');
select throws_ok($$ update public.parties set notes = 'CMNĐ 023456789' where id = '00000000-0000-4000-8000-00000000aa01' $$,
  '23514', null, 'notes refuses a CMND whose label OCR read as CMNĐ');
select throws_ok($$ update public.certificates set issued_by = 'Chung minh nhan dan so 023456789' where id = '00000000-0000-4000-8000-00000000c0a1' $$,
  '23514', null, 'issued_by refuses a CMND after a label without accents');
select lives_ok($$ update public.parties set notes = 'CMND 6789 cấp ngày 15·03·2015' where id = '00000000-0000-4000-8000-00000000aa01' $$,
  'notes keeps a date written with middle dots after the last four digits');

select is((select origin_text from public.parcels where id = '00000000-0000-4000-8000-00000000f0a1'), 'Nhận chuyển nhượng từ ông Demo, CCCD 6789',
  'a refused write leaves the parcel as the last accepted write left it');

-- ordinary family wording that main kept: an unaccented word label must not turn it into an ID
select lives_ok($$ update public.certificates set annotations = jsonb_build_array(jsonb_build_object('kind', 'other', 'text', 'Thế chấp tại Ngân hàng Demo theo hồ sơ thế chấp số 123456789')) where id = '00000000-0000-4000-8000-00000000c0a1' $$, 'certificates.annotations keeps Thế chấp tại Ngân hàng Demo theo hồ sơ thế chấp số 123456789');
select lives_ok($$ update public.certificates set annotations = jsonb_build_array(jsonb_build_object('kind', 'other', 'text', 'Đăng ký thế chấp ngày 12/03/2021, số hồ sơ 0123456789')) where id = '00000000-0000-4000-8000-00000000c0a1' $$, 'certificates.annotations keeps Đăng ký thế chấp ngày 12/03/2021, số hồ sơ 0123456789');
select lives_ok($$ update public.certificates set annotations = jsonb_build_array(jsonb_build_object('kind', 'other', 'text', 'Xóa thế chấp theo hồ sơ số 001234567')) where id = '00000000-0000-4000-8000-00000000c0a1' $$, 'certificates.annotations keeps Xóa thế chấp theo hồ sơ số 001234567');
select lives_ok($$ update public.certificates set annotations = jsonb_build_array(jsonb_build_object('kind', 'other', 'text', 'Sổ thế chấp ở ngân hàng, gọi anh Demo 0903123456')) where id = '00000000-0000-4000-8000-00000000c0a1' $$, 'certificates.annotations keeps Sổ thế chấp ở ngân hàng, gọi anh Demo 0903123456');
select lives_ok($$ update public.certificates set annotations = jsonb_build_array(jsonb_build_object('kind', 'other', 'text', 'Hồ sơ thể hiện chủ cũ, ĐT 0903123456')) where id = '00000000-0000-4000-8000-00000000c0a1' $$, 'certificates.annotations keeps Hồ sơ thể hiện chủ cũ, ĐT 0903123456');
select lives_ok($$ update public.parcels set origin_text = 'Cập nhật hồ sơ theo đơn số 123456789' where id = '00000000-0000-4000-8000-00000000f0a1' $$, 'parcels.origin_text keeps Cập nhật hồ sơ theo đơn số 123456789');
select lives_ok($$ update public.parties set notes = 'Sổ theo dõi thuê nhà, gọi 0903123456' where id = '00000000-0000-4000-8000-00000000aa01' $$, 'parties.notes keeps Sổ theo dõi thuê nhà, gọi 0903123456');
select lives_ok($$ update public.parties set notes = 'Nhà chúng mình, gọi Demo 0903123456' where id = '00000000-0000-4000-8000-00000000aa01' $$, 'parties.notes keeps Nhà chúng mình, gọi Demo 0903123456');
select lives_ok($$ update public.parties set address_text = 'Sở Thể thao Demo, ĐT 0283812345' where id = '00000000-0000-4000-8000-00000000aa01' $$, 'parties.address_text keeps Sở Thể thao Demo, ĐT 0283812345');
select lives_ok($$ update public.documents set title = 'Hồ sơ thế chấp HĐ 0123456789' where id = '00000000-0000-4000-8000-00000000d0a1' $$, 'documents.title keeps Hồ sơ thế chấp HĐ 0123456789');
select lives_ok($$ update public.parties set notes = 'Hồ sơ thế chấp tại Ngân hàng Demo, MST 0312345678' where id = '00000000-0000-4000-8000-00000000aa01' $$, 'parties.notes keeps Hồ sơ thế chấp tại Ngân hàng Demo, MST 0312345678');
select lives_ok($$ update public.certificates set annotations = jsonb_build_array(jsonb_build_object('kind', 'other', 'text', 'Giá chuyển nhượng 1.500.000.000 đồng')) where id = '00000000-0000-4000-8000-00000000c0a1' $$, 'certificates.annotations keeps Giá chuyển nhượng 1.500.000.000 đồng');
select lives_ok($$ update public.certificates set annotations = jsonb_build_array(jsonb_build_object('kind', 'other', 'text', 'Giá 125·000·000·000 đồng')) where id = '00000000-0000-4000-8000-00000000c0a1' $$, 'certificates.annotations keeps Giá 125·000·000·000 đồng');
select lives_ok($$ update public.certificates set annotations = jsonb_build_array(jsonb_build_object('kind', 'other', 'text', 'Ngày 15·03·2015')) where id = '00000000-0000-4000-8000-00000000c0a1' $$, 'certificates.annotations keeps Ngày 15·03·2015');
select lives_ok($$ update public.parties set notes = 'Gọi 0903 123 456' where id = '00000000-0000-4000-8000-00000000aa01' $$, 'parties.notes keeps Gọi 0903 123 456');
select lives_ok($$ update public.parcels set origin_text = 'Thửa 123, tờ bản đồ 45' where id = '00000000-0000-4000-8000-00000000f0a1' $$, 'parcels.origin_text keeps Thửa 123, tờ bản đồ 45');
select lives_ok($$ update public.parties set address_text = 'Số 12 đường Demo, phường Demo, quận 1' where id = '00000000-0000-4000-8000-00000000aa01' $$, 'parties.address_text keeps Số 12 đường Demo, phường Demo, quận 1');
select lives_ok($$ update public.parties set tax_code = '0312345678' where id = '00000000-0000-4000-8000-00000000aa02' $$, 'parties.tax_code keeps 0312345678');
select lives_ok($$ update public.parties set notes = 'CCCD 6789' where id = '00000000-0000-4000-8000-00000000aa01' $$, 'parties.notes keeps CCCD 6789');
select lives_ok($$ update public.structures set structure_text = 'Nhà 3 tầng, cửa sổ thép, ĐT chủ 0903123456' where id = '00000000-0000-4000-8000-00000000e0a1' $$, 'structures.structure_text keeps Nhà 3 tầng, cửa sổ thép, ĐT chủ 0903123456');
select lives_ok($$ update public.parties set notes = 'Thêm số thêm 0903123456' where id = '00000000-0000-4000-8000-00000000aa01' $$, 'parties.notes keeps Thêm số thêm 0903123456');
select lives_ok($$ update public.parties set notes = 'Tiền chung mình góp, STK 0123456789' where id = '00000000-0000-4000-8000-00000000aa01' $$, 'parties.notes keeps Tiền chung mình góp, STK 0123456789');
select lives_ok($$ update public.documents set title = 'Sổ đỏ, liên hệ 0903123456' where id = '00000000-0000-4000-8000-00000000d0a1' $$, 'documents.title keeps Sổ đỏ, liên hệ 0903123456');
select lives_ok($$ update public.certificates set annotations = jsonb_build_array(jsonb_build_object('kind', 'other', 'text', 'Hồ sơ địa chính, ĐT 0903123456')) where id = '00000000-0000-4000-8000-00000000c0a1' $$, 'certificates.annotations keeps Hồ sơ địa chính, ĐT 0903123456');
select lives_ok($$ update public.parcels set origin_text = 'Theo hồ sơ số 0123456789' where id = '00000000-0000-4000-8000-00000000f0a1' $$, 'parcels.origin_text keeps Theo hồ sơ số 0123456789');
select lives_ok($$ update public.parties set notes = 'số thứ tự 0123456789' where id = '00000000-0000-4000-8000-00000000aa01' $$, 'parties.notes keeps số thứ tự 0123456789');
select lives_ok($$ update public.parcels set origin_text = 'Số tờ 12, số thửa 123456789' where id = '00000000-0000-4000-8000-00000000f0a1' $$, 'parcels.origin_text keeps Số tờ 12, số thửa 123456789');

select is(
  (select array_agg(conname::text order by conname) from pg_constraint where conname in (
     'parcels_no_national_id', 'certificates_no_national_id', 'structures_no_national_id', 'parties_no_national_id',
     'documents_title_no_national_id') and not convalidated),
  array['certificates_no_national_id', 'documents_title_no_national_id', 'parcels_no_national_id', 'parties_no_national_id',
        'structures_no_national_id'],
  'every new CHECK is NOT VALID, so rows written before it are not read');

select is(
  (select count(*)::integer from pg_constraint where conname = 'documents_ocr_text_no_national_id' and convalidated), 1,
  'the read text CHECK is unchanged');

select * from finish();
rollback;
