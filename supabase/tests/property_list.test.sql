-- PRP-8: the list view behind search, filters and sorts.
begin;
\ir _harness.psql

select plan(16);

select tests.create_household('a') as a, tests.create_household('b') as b \gset
select set_config('tests.a', :'a', true);

create function tests.list_search(p_household uuid, p_query text, p_phrase boolean default false)
returns setof text
language sql
stable
as $$
  select r.nickname
  from public.property_list_rows r
  where r.household_id = p_household
    and case
      when p_phrase then r.search_text like '%' || public.esta_unaccent(p_query) || '%'
      else not exists (
        select 1 from regexp_split_to_table(public.esta_unaccent(p_query), '\s+') as token
        where token <> '' and r.search_text not like '%' || token || '%')
    end
$$;
grant execute on function tests.list_search(uuid, text, boolean) to authenticated;

select set_config('esta.actor', 'system:test', true);
insert into public.properties (household_id, nickname, code, kind, use_mode, current_address, certificate_address_text)
select :'a', nickname, code, kind, use_mode, address::jsonb, certificate
from (values
  ('Nhà phố Q7', 'Q7', 'townhouse', 'rental',
   '{"street": "Đường số 15", "commune_code": "27475", "province_code": "79", "line": "901 Demo Đường số 15"}',
   'Số 901 Demo, đường số 15, Khu phố 1, Phường Tân Phong, Quận 7, Thành phố Hồ Chí Minh'),
  ('Căn hộ Thủ Đức', 'THUDUC', 'apartment', 'rental',
   '{"street": "Đường Võ Văn Ngân", "commune_code": "26824", "province_code": "79", "line": "902 Demo Đường Võ Văn Ngân"}',
   'Căn hộ A-12.05, Chung cư Demo Bình Thọ, số 902 Demo, đường Võ Văn Ngân, Phường Bình Thọ, Thành phố Thủ Đức, Thành phố Hồ Chí Minh'),
  ('Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental',
   '{"street": "Đường Nguyễn An Ninh", "commune_code": "25942", "province_code": "79", "line": "903/9 Demo Đường Nguyễn An Ninh"}',
   'Số 903/9 Demo, đường Nguyễn An Ninh, Khu phố Nhị Đồng 2, Phường Dĩ An, Thành phố Dĩ An, Tỉnh Bình Dương'),
  ('Mặt bằng Quận 1', 'Q1', 'commercial_space', 'rental',
   '{"street": "Đường Lê Thánh Tôn", "commune_code": "26740", "province_code": "79", "line": "904 Demo Đường Lê Thánh Tôn"}',
   'Số 904 Demo, đường Lê Thánh Tôn, Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh'),
  ('Kho Biên Hòa', 'BIENHOA', 'warehouse', 'rental',
   '{"street": "Đường số 7", "commune_code": "26188", "province_code": "75", "line": "C95 Demo Đường số 7"}',
   'Lô C95 Demo, đường số 7, Khu phố 3, Phường Tân Phong, Thành phố Biên Hòa, Tỉnh Đồng Nai'),
  ('Đất vườn Long An', 'LONGAN', 'agricultural_land', 'held',
   '{"street": "Đường Châu Thị Kim", "commune_code": "27694", "province_code": "80", "line": "Đường Châu Thị Kim"}',
   'Thửa đất số 906 Demo, tờ bản đồ số 96, Phường 2, Thành phố Tân An, Tỉnh Long An'),
  ('Đất Bảo Lộc', 'BAOLOC', 'residential_land', 'held',
   '{"street": "Đường Trần Phú", "commune_code": "24823", "province_code": "68", "line": "907 Demo Đường Trần Phú"}',
   'Số 907 Demo, đường Trần Phú, Phường 1, Thành phố Bảo Lộc, Tỉnh Lâm Đồng'),
  ('Nhà cũ đã bán', 'SOLD', 'townhouse', 'held',
   '{"street": "Đường Dĩ An", "commune_code": "25942", "province_code": "79", "line": "1 Demo Đường Dĩ An"}',
   null)
) as seed (nickname, code, kind, use_mode, address, certificate);
update public.properties set deleted_at = '2026-10-01T00:00:00Z' where household_id = :'a' and code = 'SOLD';
insert into public.properties (household_id, nickname, code, kind, use_mode, current_address)
values (:'b', 'Dãy trọ Dĩ An nhà B', 'DIAN', 'rooming_house', 'rental',
        '{"street": "Đường số 1", "commune_code": "25942", "province_code": "79", "line": "1 Đường số 1"}');

select tests.act_as('member.a@test.esta.test');

select results_eq($$ select tests.list_search(current_setting('tests.a')::uuid, 'di an') $$, array['Dãy trọ Dĩ An'],
  'di an finds Dãy trọ Dĩ An and nothing else');
select results_eq($$ select count(*)::int from tests.list_search(current_setting('tests.a')::uuid, 'DUONG') $$, array[7],
  'DUONG finds every live property, since each address names a Đường');
select results_eq($$ select tests.list_search(current_setting('tests.a')::uuid, 'binh duong', true) $$, array['Dãy trọ Dĩ An'],
  'the phrase binh duong finds only the property whose legacy province is Bình Dương');
select set_eq($$ select tests.list_search(current_setting('tests.a')::uuid, 'binh duong') $$,
  array['Căn hộ Thủ Đức', 'Dãy trọ Dĩ An', 'Đất vườn Long An', 'Kho Biên Hòa', 'Mặt bằng Quận 1'],
  'binh and duong as separate tokens also match a Bình ward beside a Đường street');
select results_eq($$ select tests.list_search(current_setting('tests.a')::uuid, 'quan 7') $$, array['Nhà phố Q7'],
  'quan 7 finds Nhà phố Q7 through its certificate and legacy district');
select results_eq($$ select tests.list_search(current_setting('tests.a')::uuid, 'bao loc') $$, array['Đất Bảo Lộc'],
  'bao loc finds Đất Bảo Lộc');
select results_eq($$ select tests.list_search(current_setting('tests.a')::uuid, 'q7 tan hung') $$, array['Nhà phố Q7'],
  'tokens combine with AND across the code and the current ward name');
select is_empty($$ select tests.list_search(current_setting('tests.a')::uuid, 'q7 bao loc') $$,
  'tokens that no single property holds together match nothing');
select is_empty($$ select 1 from public.property_list_rows where code = 'SOLD' $$,
  'an archived property is absent from the list');
select results_eq(
  $$ select province_code, province_name, legacy_province_names from public.property_list_rows where household_id = current_setting('tests.a')::uuid and code = 'DIAN' $$,
  $$ values ('79', 'Thành phố Hồ Chí Minh', array['Tỉnh Bình Dương']) $$,
  'Dãy trọ Dĩ An reads TP. Hồ Chí Minh now and Bình Dương before the reform');
select results_eq(
  $$ select commune_name, address_line from public.property_list_rows where household_id = current_setting('tests.a')::uuid and code = 'BIENHOA' $$,
  $$ values ('Phường Tân Triều', 'C95 Demo Đường số 7') $$,
  'the current commune name and street line come from the structured address');
select tests.sees_household('public.property_list_rows', :'a', true);
select tests.sees_household('public.property_list_rows', :'b', false);

select tests.act_as('viewer.a@test.esta.test');
select results_eq($$ select count(*)::int from public.property_list_rows $$, array[7],
  'a viewer reads the seven live properties of its household');
select tests.sees_household('public.property_list_rows', :'b', false);

reset role;
select tests.clear_request();
select ok(
  not has_table_privilege('anon', 'public.property_list_rows', 'select'),
  'anon cannot read property_list_rows');

select * from finish();
rollback;
