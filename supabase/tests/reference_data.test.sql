begin;
\ir _harness.psql

select plan(37);

select is((select count(*) from public.admin_units where parent_code is null), 34::bigint, '34 province-level units');
select is((select count(*) from public.admin_units where parent_code is not null), 3321::bigint, '3,321 commune-level units');
select results_eq(
  $$ select kind::text, count(*) from public.admin_units group by kind order by kind $$,
  $$ values ('city', 9::bigint), ('commune', 2599::bigint), ('province', 25::bigint), ('special_zone', 13::bigint), ('ward', 709::bigint) $$,
  'kinds come from the catalog: 25 provinces, 9 cities, 709 wards, 2,599 communes, 13 special zones');
select is(
  (select kind::text from public.admin_units where code = '75'), 'city',
  'Đồng Nai is a centrally run city after its 2026 upgrade');
select is_empty(
  $$ select 1 from public.admin_units c join public.admin_units p on p.code = c.parent_code where p.parent_code is not null $$,
  'every commune-level unit hangs directly off a province-level unit');

select ok((select count(*) from public.admin_unit_legacy_map) >= 10571, '10,571 or more legacy links');
select is((select count(*) from public.admin_unit_legacy_map where merge_kind = 'partial'), 969::bigint, '969 partial links');
select is_empty(
  $$ select new_commune_code from public.admin_unit_legacy_map
     except select code from public.admin_units where parent_code is not null $$,
  'every legacy link targets a commune-level unit');
select is_empty(
  $$ select code from public.admin_units where parent_code is not null
     except select new_commune_code from public.admin_unit_legacy_map $$,
  'every commune-level unit has a legacy link');
select results_eq(
  $$ select old_province_code, old_province_name from public.admin_unit_legacy_map where old_commune_code = '27691' $$,
  $$ values ('80', 'Tỉnh Long An') $$,
  'Phường 4 of Tân An takes Long An from its old district, not the Tiền Giang the table prints');
select results_eq(
  $$ select old_commune_code, new_commune_code from public.admin_unit_legacy_map
     where source like 'curated:%' order by old_commune_code $$,
  $$ values ('00556', '00562'), ('01651', '01648'), ('02482', '02494'), ('27688', '27694') $$,
  'the curated links: three recoded typos and Phường 2 of Tân An');
select is_empty(
  $$ select 1 from public.admin_unit_legacy_map
     where (old_commune_code, old_commune_name) in (('00553', 'Xã Đặng Xá'), ('01615', 'Xã Mỹ Hưng'), ('02485', 'Xã Phú Thịnh')) $$,
  'no link keeps a typo code');
select is(
  (select old_commune_key from public.admin_unit_legacy_map where old_commune_code = '27688'), '2',
  'legacy names carry their match key');

select is((select count(*) from public.bank_bins), 74::bigint, '74 NAPAS BINs');
select results_eq(
  $$ select napas_code, short_name from public.bank_bins where bin = '970436' $$,
  $$ values ('VCB', 'Vietcombank') $$,
  'a BIN carries its NAPAS code and curated short name');

select is((select count(*) from public.land_use_codes), 12::bigint, '12 land use codes');
select is((select name_vi from public.land_use_codes where code = 'TMD'), 'Đất thương mại, dịch vụ', 'land use names keep their commas');

select results_eq(
  $$ select effective_from, (params ->> 'threshold_vnd')::bigint, (params ->> 'vat_rate_bp')::int, (params ->> 'pit_rate_bp')::int
     from public.tax_rules where kind = 'vn_rental_individual' $$,
  $$ values ('2026-01-01'::date, 500000000::bigint, 500, 500) $$,
  'one vn_rental_individual rule with the 500,000,000 VND threshold');
select ok((select note like '%01/07/2026%' from public.tax_rules where kind = 'vn_rental_individual'), 'the rule notes the unsettled PIT date');

select is(public.admin_name_key('Thành phố Hồ Chí Minh'), 'ho chi minh', 'admin_name_key strips one prefix and folds marks');
select is(public.admin_name_key('TP. Hồ Chí Minh'), 'ho chi minh', 'admin_name_key expands TP.');
select is(public.admin_name_key('Tỉnh Bà Rịa–Vũng Tàu'), public.admin_name_key('Tỉnh Bà Rịa - Vũng Tàu'), 'admin_name_key treats dashes alike');
select is(public.admin_name_key('Xã Ea H’Leo'), 'ea h''leo', 'admin_name_key straightens a curly apostrophe');
select is(public.admin_name_key('Phường Xã Đàn'), 'xa dan', 'admin_name_key strips only one prefix');

select tests.create_household('a') as a \gset
select tests.act_as('admin.a@test.esta.test');
select is((select count(*) from public.admin_units), 3355::bigint, 'authenticated reads admin_units');
select throws_ok($$ insert into public.bank_bins (bin, name, napas_code) values ('999999', 'Demo Bank', 'DEMO') $$,
  '42501', null, 'authenticated cannot insert a BIN');
select throws_ok($$ update public.tax_rules set params = '{}' $$, '42501', null, 'authenticated cannot update tax rules');
select throws_ok($$ delete from public.admin_unit_legacy_map $$, '42501', null, 'authenticated cannot delete legacy links');
select throws_ok($$ insert into public.admin_units (code, name, kind, effective_from) values ('99', 'Tỉnh Demo', 'province', '2026-01-01') $$,
  '42501', null, 'authenticated cannot insert an admin unit');
select throws_ok($$ update public.land_use_codes set name_en = 'x' $$, '42501', null, 'authenticated cannot update land use codes');
reset role;

set local role anon;
select throws_ok($$ select 1 from public.admin_units $$, '42501', null, 'anon cannot read admin_units now that sign-in exists');
select throws_ok($$ insert into public.admin_units (code, name, kind, effective_from) values ('98', 'Tỉnh Demo', 'province', '2026-01-01') $$,
  '42501', null, 'anon cannot insert an admin unit');
select throws_ok($$ select 1 from public.bank_bins $$, '42501', null, 'anon cannot read bank_bins');
reset role;
select ok(not has_function_privilege('anon', 'public.suggest_current_unit(text)', 'execute'),
  'anon cannot call suggest_current_unit');

select tests.act_as_service();
select throws_ok($$ insert into public.land_use_codes values ('ZZZ', 'Demo', 'Demo', 'unused') $$,
  '42501', null, 'the service role cannot write reference data either');
select is((select count(*) from public.tax_rules), 1::bigint, 'the service role reads tax rules');
reset role;

select ok(
  (select bool_and(relrowsecurity) from pg_class
   where oid in ('public.admin_units'::regclass, 'public.admin_unit_legacy_map'::regclass, 'public.land_use_codes'::regclass,
                 'public.bank_bins'::regclass, 'public.tax_rules'::regclass)),
  'row level security is on for every reference table');

select * from finish();
rollback;
