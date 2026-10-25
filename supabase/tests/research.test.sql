begin;
\ir _harness.psql

select plan(14);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select set_config('esta.actor', 'system:test', true);

select tests.act_as_service('{"x-esta-actor": "agent:test-worker"}');
insert into public.research_topics (household_id, topic_key, label, query_templates, province_codes) values
  (:'a', 'province:79', 'TP. Hồ Chí Minh (Bình Dương cũ)', '{"quy hoạch Bình Dương"}', '{79}'),
  (:'b', 'province:80', 'Tây Ninh (Long An cũ)', '{"quy hoạch Long An"}', '{80}');
insert into public.research_items (id, household_id, url_normalized, source_url, source_name, published_on, title_vi, summary_vi, why_it_matters_vi, kind, relevance, created_at) values
  ('00000000-0000-4000-8000-0000000002a1', :'a', 'https://example.vn/vanh-dai', 'https://www.example.vn/vanh-dai/', 'Báo Demo', '2026-10-06',
   'Khởi công đoạn Vành đai qua Dĩ An', 'Đoạn đường vành đai qua Dĩ An bắt đầu thi công.', 'Dãy trọ Dĩ An ở gần tuyến đường.', 'infrastructure', 0.8, '2026-10-06 06:05+07'),
  ('00000000-0000-4000-8000-0000000002a2', :'a', 'https://example.vn/cu', 'https://example.vn/cu', 'Báo Demo', '2026-08-01',
   'Bảng giá đất Đồng Nai điều chỉnh', 'Tin cũ.', 'Kho Biên Hòa.', 'land_price', 0.5, '2026-08-01 06:05+07'),
  ('00000000-0000-4000-8000-0000000002b1', :'b', 'https://example.vn/vanh-dai', 'https://example.vn/vanh-dai', 'Báo Demo', '2026-10-06',
   'Thu hồi đất làm cầu ở Tây Ninh', 'Tin của hộ khác.', 'Đất Long An.', 'planning', 0.7, '2026-10-06 06:05+07');

select throws_ok(
  format($$ insert into public.research_items (household_id, url_normalized, source_url, source_name, published_on, title_vi, summary_vi, why_it_matters_vi, kind, relevance)
    values (%L, 'https://example.vn/vanh-dai', 'https://example.vn/vanh-dai', 'Báo Demo', '2026-10-06', 'Lặp', 'Lặp.', 'Lặp.', 'other', 0.1) $$, :'a'),
  '23505', null, 'the normalized link is unique per household');
select throws_ok(
  format($$ insert into public.research_items (household_id, url_normalized, source_url, source_name, published_on, title_vi, summary_vi, why_it_matters_vi, kind, relevance)
    values (%L, 'http://example.vn/x', 'http://example.vn/x', 'Báo Demo', '2026-10-06', 'Tin', 'Tin.', 'Tin.', 'other', 0.1) $$, :'a'),
  '23514', null, 'a source link must be https');
select throws_ok(
  format($$ insert into public.research_items (household_id, url_normalized, source_url, source_name, published_on, title_vi, summary_vi, why_it_matters_vi, kind, relevance)
    values (%L, 'https://example.vn/dai', 'https://example.vn/dai', 'Báo Demo', '2026-10-06', 'Tin', %L, 'Tin.', 'other', 0.1) $$, :'a', repeat('chữ ', 61)),
  '23514', null, 'a summary holds at most 60 words');

select ok(public.research_title_similar(:'a', 'Khởi công đoạn Vành đai qua Dĩ An hôm nay', '2026-09-07 00:00+07') > 0.6,
  'a title retyped with a word more is similar above 0.6');
select ok(public.research_title_similar(:'a', 'Khoi cong doan Vanh dai qua Di An', '2026-09-07 00:00+07') > 0.6,
  'and so is the same title without diacritics');
select is(public.research_title_similar(:'b', 'Khởi công đoạn Vành đai qua Dĩ An', '2026-09-07 00:00+07'), 0::real,
  'another household''s titles never count');
select ok(public.research_title_similar(:'a', 'Bảng giá đất Đồng Nai điều chỉnh', '2026-09-07 00:00+07') < 0.6,
  'an item stored before the window does not count');

select tests.act_as('viewer.a@test.esta.test');
select results_eq($$ select label from public.research_topics $$, $$ values ('TP. Hồ Chí Minh (Bình Dương cũ)') $$,
  'a viewer reads her household''s topics');
select is((select count(*)::int from public.research_items), 2, 'and its items');
select tests.sees_household('public.research_items', :'b', false);

select tests.act_as('admin.a@test.esta.test');
select throws_ok($$ update public.research_topics set label = 'sửa' $$, '42501', null, 'no member edits a topic, not even an admin');
select throws_ok(
  format($$ insert into public.research_topics (household_id, topic_key, label, query_templates) values (%L, 'national:x', 'Thêm', '{"x"}') $$, :'a'),
  '42501', null, 'nor adds one');
select throws_ok($$ delete from public.research_items $$, '42501', null, 'nor deletes an item');
select ok(not has_function_privilege('authenticated', 'public.research_title_similar(uuid, text, timestamptz)', 'execute'),
  'only the worker runs the title check');

select * from finish();
rollback;
