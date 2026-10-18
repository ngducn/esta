begin;
\ir _harness.psql

select plan(38);

select tests.create_household('a') as a, tests.create_household('b') as b \gset

select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Đất Bảo Lộc', 'BAOLOC', 'residential_land', 'held'),
  ('00000000-0000-4000-8000-0000000000a2', :'a', 'Căn hộ Thủ Đức', 'THUDUC', 'apartment', 'rental'),
  ('00000000-0000-4000-8000-0000000000b1', :'b', 'Đất Bảo Lộc B', 'BAOLOCB', 'residential_land', 'held');
insert into public.documents (id, household_id, property_id, category, title, storage_path, mime, size_bytes, sha256, sensitivity, tags, ocr_text, deleted_at)
select id::uuid, household::uuid, property::uuid, category, title, household || '/' || id || '/tai-lieu.pdf', 'application/pdf', 100,
       repeat(left(replace(id, '-', ''), 1), 64), sensitivity, tags, ocr_text, deleted_at::timestamptz
from (values
  ('00000000-0000-4000-8000-00000000d0a1', :'a', '00000000-0000-4000-8000-0000000000a1', 'certificate', 'Sổ hồng Bảo Lộc', 'sensitive', '{}'::text[], null, null),
  ('00000000-0000-4000-8000-00000000d0a2', :'a', '00000000-0000-4000-8000-0000000000a2', 'lease_contract', 'Hợp đồng thuê Căn hộ Thủ Đức', 'normal', '{}', null, null),
  ('00000000-0000-4000-8000-00000000d0a3', :'a', '00000000-0000-4000-8000-0000000000a1', 'insurance', 'Bảo hiểm cháy nổ Bảo Lộc', 'normal', '{nhà phố}', null, null),
  ('00000000-0000-4000-8000-00000000d0a4', :'a', '00000000-0000-4000-8000-0000000000a2', 'utility_bill', 'Hóa đơn điện tháng 9', 'normal', '{}',
   'TỔNG CÔNG TY ĐIỆN LỰC MIỀN NAM. Mã khách hàng PE0123456789. Tiền điện 1.234.000 đ', null),
  ('00000000-0000-4000-8000-00000000d0a5', :'a', '00000000-0000-4000-8000-0000000000a1', 'other', 'Hợp đồng đặt cọc Bảo Lộc', 'normal', '{}', null, '2026-10-01T09:00:00+07:00'),
  ('00000000-0000-4000-8000-00000000d0b1', :'b', '00000000-0000-4000-8000-0000000000b1', 'certificate', 'Sổ hồng Bảo Lộc B', 'sensitive', '{}', null, null)
) as seed (id, household, property, category, title, sensitivity, tags, ocr_text, deleted_at);

select tests.act_as('member.a@test.esta.test');

select is((select title from public.search_documents('hop dong') limit 1), 'Hợp đồng thuê Căn hộ Thủ Đức',
  'hop dong finds the Thủ Đức lease (DOC-3)');
select is((select title from public.search_documents('bao loc so') limit 1), 'Sổ hồng Bảo Lộc',
  'bao loc so finds Sổ hồng Bảo Lộc first (DOC-3)');
select is((select title from public.search_documents('Bảo Lộc SỔ') limit 1), 'Sổ hồng Bảo Lộc',
  'the query is unaccented and lower-cased like the vector');
select set_eq($$ select title from public.search_documents('bao loc') $$,
  $$ values ('Bảo hiểm cháy nổ Bảo Lộc'), ('Sổ hồng Bảo Lộc') $$,
  'both live Bảo Lộc documents match bao loc');
select is_empty($$ select 1 from public.search_documents('bao loc hop thue') $$,
  'tokens combine with AND: no live document holds all four words');
select is_empty($$ select 1 from public.search_documents('dat coc') $$,
  'an archived document is absent');
select is((select title from public.search_documents('mien nam') limit 1), 'Hóa đơn điện tháng 9',
  'a word found only in ocr_text finds its document');
select is((select title from public.search_documents('nha pho') limit 1), 'Bảo hiểm cháy nổ Bảo Lộc',
  'a tag finds its document');
select is((select count(*)::int from public.search_documents('ho')), 3,
  'a short word matches as a prefix (hồng, hợp, hóa)');
select is_empty($$ select 1 from public.search_documents('') $$, 'an empty query returns nothing');
select is_empty($$ select 1 from public.search_documents(' ,;- ') $$, 'punctuation alone returns nothing');

reset role;
select tests.act_as('member.b@test.esta.test');
select results_eq($$ select title from public.search_documents('bao loc so') $$, $$ values ('Sổ hồng Bảo Lộc B') $$,
  'a member of B finds only B''s certificate (FND-2)');

reset role;
select tests.act_as('member.a@test.esta.test');
select is_empty(format($$ select 1 from public.search_documents('so hong bao loc') where household_id = %L $$, :'b'),
  'a member of A gets none of B''s rows through the function (FND-2)');

select throws_ok($$ update public.documents set ocr_text = 'Số CCCD 079123456789 của chủ hộ' where id = '00000000-0000-4000-8000-00000000d0a4' $$,
  '23514', null, 'ocr_text refuses a labelled full ID (D11)');
select throws_ok($$ update public.documents set ocr_text = 'mã 079123456789' where id = '00000000-0000-4000-8000-00000000d0a4' $$,
  '23514', null, 'ocr_text refuses an unlabelled 12-digit run (D11)');
select lives_ok($$ update public.documents set ocr_text = 'Số CCCD ...6789 của chủ hộ' where id = '00000000-0000-4000-8000-00000000d0a4' $$,
  'ocr_text keeps the last four digits of an ID');
select throws_ok($$ update public.documents set ocr_text = 'Hóa đơn ' || 'số 079123' || U&'\0301' || '456789' where id = '00000000-0000-4000-8000-00000000d0a4' $$,
  '23514', null, 'ocr_text refuses an ID with a combining acute between its groups (D11)');
select throws_ok($$ update public.documents set ocr_text = 'Hóa đơn ' || 'CCCD 079123' || U&'\0301' || '456789' where id = '00000000-0000-4000-8000-00000000d0a4' $$,
  '23514', null, 'ocr_text refuses a labelled ID with a combining acute inside (D11)');
select throws_ok($$ update public.documents set ocr_text = 'Hóa đơn ' || 'số 079123' || U&'\034F' || '456789' where id = '00000000-0000-4000-8000-00000000d0a4' $$,
  '23514', null, 'ocr_text refuses an ID with a combining grapheme joiner between its groups (D11)');
select throws_ok($$ update public.documents set ocr_text = 'Hóa đơn ' || 'CCCD 079123' || U&'\034F' || '456789' where id = '00000000-0000-4000-8000-00000000d0a4' $$,
  '23514', null, 'ocr_text refuses a labelled ID with a combining grapheme joiner inside (D11)');
select throws_ok($$ update public.documents set ocr_text = 'Hóa đơn ' || 'số 079123' || U&'\0323' || '456789' where id = '00000000-0000-4000-8000-00000000d0a4' $$,
  '23514', null, 'ocr_text refuses an ID with a combining dot below between its groups (D11)');
select throws_ok($$ update public.documents set ocr_text = 'Hóa đơn ' || 'CCCD 079123' || U&'\0323' || '456789' where id = '00000000-0000-4000-8000-00000000d0a4' $$,
  '23514', null, 'ocr_text refuses a labelled ID with a combining dot below inside (D11)');
select throws_ok($$ update public.documents set ocr_text = 'Hóa đơn ' || 'số 079123' || U&'\00B7' || '456789' where id = '00000000-0000-4000-8000-00000000d0a4' $$,
  '23514', null, 'ocr_text refuses an ID with a middle dot between its groups (D11)');
select throws_ok($$ update public.documents set ocr_text = 'Hóa đơn ' || 'số ' || U&'\FF10\FF17\FF19\FF11\FF12\FF13\FF14\FF15\FF16\FF17\FF18\FF19' where id = '00000000-0000-4000-8000-00000000d0a4' $$,
  '23514', null, 'ocr_text refuses an ID in full-width digits (D11)');
select lives_ok($$ update public.documents set ocr_text = 'Hóa đơn ' || 'Nhận chuyển nhượng 079123    456789' where id = '00000000-0000-4000-8000-00000000d0a4' $$,
  'ocr_text keeps four spaces inside an ID, the known gap of #140, as read');
select is_empty($$ select 1 from public.search_documents('079123456789') $$,
  'the 12 digits of four spaces inside an ID, the known gap of #140, find no document');
select lives_ok($$ update public.documents set ocr_text = 'Hóa đơn ' || 'số 079123' || E'\t\t\t\t' || '456789' where id = '00000000-0000-4000-8000-00000000d0a4' $$,
  'ocr_text keeps four tabs inside an ID, the known gap of #140, as read');
select is_empty($$ select 1 from public.search_documents('079123456789') $$,
  'the 12 digits of four tabs inside an ID, the known gap of #140, find no document');
select lives_ok($$ update public.documents set ocr_text = 'Hóa đơn ' || 'số 079123/456789' where id = '00000000-0000-4000-8000-00000000d0a4' $$,
  'ocr_text keeps two groups split by a slash with no label as read');
select is_empty($$ select 1 from public.search_documents('079123456789') $$,
  'the 12 digits of two groups split by a slash with no label find no document');
select lives_ok($$ update public.documents set ocr_text = 'Hóa đơn ' || 'Mã KH PE079123456789' where id = '00000000-0000-4000-8000-00000000d0a4' $$,
  'ocr_text keeps an electricity code as read');
select is_empty($$ select 1 from public.search_documents('079123456789') $$,
  'the 12 digits of an electricity code find no document');
select lives_ok($$ update public.documents set ocr_text = 'Số CCCD ...6789 của chủ hộ' where id = '00000000-0000-4000-8000-00000000d0a4' $$,
  'ocr_text takes the last four digits again');
select throws_ok($$ update public.documents set ocr_text = 'Giấy chứng nhận' where id = '00000000-0000-4000-8000-00000000d0a1' $$,
  '23514', null, 'a sensitive document keeps no ocr_text');
select throws_ok($$ update public.documents set sensitivity = 'sensitive' where id = '00000000-0000-4000-8000-00000000d0a4' $$,
  '23514', null, 'a document with ocr_text cannot turn sensitive without dropping it');

reset role;
-- As the test owner: a member calling a private function directly crashes local Postgres (#128).
select is_empty($$
  select to_hex(c) || ' after ' || shape.head
  from generate_series(1, 65535) as c
  cross join (values ('số 079123', '456789', '079123456789'), ('CCCD 079123', '456789', '079123456789'), ('CMND 0791', '23456', '079123456')) as shape (head, tail, digits)
  where c not between 55296 and 57343
    and private.document_search_vector('', '{}', shape.head || chr(c) || shape.tail) @@ to_tsquery('simple', shape.digits || ':*')
    and not private.holds_national_id(to_jsonb(shape.head || chr(c) || shape.tail))
$$, 'no character between the groups of an ID lets the search index hold the whole ID while the CHECK keeps the text (D11)');

select ok(not (select prosecdef from pg_proc where oid = 'public.search_documents(text)'::regprocedure),
  'search_documents runs as the caller, so RLS decides');
select ok(not has_function_privilege('anon', 'public.search_documents(text)', 'execute')
          and has_function_privilege('authenticated', 'public.search_documents(text)', 'execute'),
  'anon cannot call search_documents; a signed-in member can');

select * from finish();
rollback;
