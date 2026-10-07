begin;

select plan(16);

create temporary view fnd6 (old_address, commune_code, province_code) as values
  ('Phường Dĩ An, Thành phố Dĩ An, Tỉnh Bình Dương', '25942', '79'),
  ('Phường 1, Thành phố Vũng Tàu, Tỉnh Bà Rịa–Vũng Tàu', '26506', '79'),
  ('Phường 2, Thành phố Tân An, Tỉnh Long An', '27694', '80'),
  ('Phường Tân Phong, Thành phố Biên Hòa, Tỉnh Đồng Nai', '26188', '75'),
  ('Phường 1, Thành phố Bảo Lộc, Tỉnh Lâm Đồng', '24823', '68');

select results_eq(
  format('select commune_code, province_code from public.suggest_current_unit(%L)', old_address),
  format('values (%L, %L)', commune_code, province_code),
  format('FND-6: %s resolves to %s in %s and nothing else', old_address, commune_code, province_code))
from fnd6;

select is(
  (select source from public.suggest_current_unit('Phường 2, Thành phố Tân An, Tỉnh Long An')),
  (select source from public.admin_unit_legacy_map where old_commune_code = '27688'),
  'Phường 2 of Tân An resolves through its curated row');
select results_eq(
  $$ select commune_code from public.suggest_current_unit('Thành phố Tân An, Tỉnh Long An') $$,
  $$ values ('27694'), ('27712'), ('27715') $$,
  'the old city of Tân An lists every ward it fed');

select results_eq(
  $$ select commune_code, province_name, merge_kind::text, rank from public.suggest_current_unit('Dĩ An, Bình Dương') $$,
  $$ values ('25942', 'Thành phố Hồ Chí Minh', 'whole', 1),
            ('25945', 'Thành phố Hồ Chí Minh', 'partial', 2),
            ('25951', 'Thành phố Hồ Chí Minh', 'partial', 3) $$,
  'PRP-4: Dĩ An, Bình Dương lists Phường Dĩ An first, then the other wards of the old city');
select results_eq(
  $$ select commune_code from public.suggest_current_unit('di an binh duong') $$,
  $$ values ('25942'), ('25945'), ('25951') $$,
  'typed without accents or commas, the same three wards');
select results_eq(
  $$ select commune_code from public.suggest_current_unit('Dĩ An – Bình Dương') $$,
  $$ values ('25942'), ('25945'), ('25951') $$,
  'with an en dash, the same three wards');

select results_eq(
  $$ select commune_code, merge_kind::text from public.suggest_current_unit('Quận 7') $$,
  $$ values ('27475', 'partial'), ('27478', 'partial'), ('27484', 'partial'), ('27487', 'partial') $$,
  'Quận 7 fans out to its four wards, each a partial match');
select results_eq(
  $$ select commune_code from public.suggest_current_unit('Quận 7, TP. Hồ Chí Minh') $$,
  $$ values ('27475'), ('27478'), ('27484'), ('27487') $$,
  'TP. expands to Thành phố');

select results_eq(
  $$ select commune_code, merge_kind::text from public.suggest_current_unit('Phường Phú Mỹ, Quận 7') $$,
  $$ values ('27484', 'partial'), ('27487', 'partial') $$,
  'a split ward lists every current ward it went to');
select is_empty(
  $$ select 1 from public.suggest_current_unit('Phường 1') $$,
  'a numeric ward name alone matches nothing');
select results_eq(
  $$ select commune_code from public.suggest_current_unit('12 Demo, Phường 1, Thành phố Vũng Tàu, Bà Rịa - Vũng Tàu') $$,
  $$ values ('26506') $$,
  'a leading street part is skipped');
select is_empty($$ select 1 from public.suggest_current_unit('') $$, 'empty input matches nothing');

select * from finish();
rollback;
