begin;
\ir _harness.psql

select plan(35);

select tests.create_household('a') as a, tests.create_household('b') as b \gset

select set_config('esta.actor', 'system:test', true);
insert into public.properties (household_id, nickname, code, kind, use_mode)
values (:'a', 'Nhà A', 'A1', 'townhouse', 'rental'), (:'a', 'Nhà A hai', 'A2', 'townhouse', 'rental'),
       (:'b', 'Nhà B', 'B1', 'townhouse', 'rental');
select id as pa from public.properties where household_id = :'a' and code = 'A1' \gset
select id as pa2 from public.properties where household_id = :'a' and code = 'A2' \gset
select id as pb from public.properties where household_id = :'b' and code = 'B1' \gset

select set_config('tests.a_path', format('%s/%s/cover.webp', :'a', :'pa'), true);
select set_config('tests.b_path', format('%s/%s/cover.webp', :'b', :'pb'), true);
select set_config('tests.b_avif', format('%s/%s/cover.avif', :'b', :'pb'), true);
select set_config('tests.b_prefix', format('%s/%s/', :'b', :'pb'), true);
select set_config('tests.a_unknown', format('%s/%s/cover.webp', :'a', gen_random_uuid()), true);
select set_config('storage.allow_delete_query', 'true', true);

insert into storage.objects (bucket_id, name) values
  ('property-photos', current_setting('tests.a_path')),
  ('property-photos', current_setting('tests.b_path')),
  ('property-photos', current_setting('tests.b_avif'));

select results_eq(
  $$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'property-photos' $$,
  $$ values (false, 5242880::bigint, array['image/avif', 'image/webp', 'image/jpeg', 'image/png']) $$,
  'property-photos is private, capped at 5 MB and takes AVIF, WebP, JPEG and PNG only');

select is(private.property_photo_household(current_setting('tests.a_path')), :'a'::uuid,
  'a path under a property of household A resolves to A');
select is(private.property_photo_household(format('%s/%s/cover.avif', :'a', :'pa')), :'a'::uuid,
  'an AVIF cover under a property of household A resolves to A');
select is(private.property_photo_household(format('%s/%s/cover.webp', :'a', :'pb')), null,
  'household A with household B''s property resolves to nothing');
select is(private.property_photo_household(current_setting('tests.a_unknown')), null,
  'an unknown property id resolves to nothing');
select is(private.property_photo_household(format('%s/%s/../cover.webp', :'a', :'pa')), null,
  'a path with a parent segment resolves to nothing');
select is(private.property_photo_household(format('%s/%s/Cover.WEBP', :'a', :'pa')), null,
  'an upper-case name resolves to nothing');
select is(private.property_photo_household('not-a-uuid/x/cover.webp'), null, 'a malformed path resolves to nothing');

select lives_ok(format($$ update public.properties set cover_photo_path = '%s/%s/nha-pho.avif' where id = %L $$, :'a', :'pa', :'pa'),
  'cover_photo_path takes a name under the row''s own household and id');
select throws_ok(format($$ update public.properties set cover_photo_path = '%s/%s/nha-pho.webp' where id = %L $$, :'b', :'pb', :'pa'),
  '23514', null, 'cover_photo_path refuses a path naming another household');
select throws_ok(format($$ update public.properties set cover_photo_path = '%s/%s/nha-pho.webp' where id = %L $$, :'a', :'pa2', :'pa'),
  '23514', null, 'cover_photo_path refuses a path naming another property of the same household');
select throws_ok(format($$ update public.properties set cover_photo_path = '%s/%s/nha pho.gif' where id = %L $$, :'a', :'pa', :'pa'),
  '23514', null, 'cover_photo_path refuses a name outside the lower-case image grammar');

select tests.act_as('member.a@test.esta.test');
select isnt_empty($$ select 1 from storage.objects where name = current_setting('tests.a_path') $$,
  'a member of A reads A''s photo');
select is_empty($$ select 1 from storage.objects where name = current_setting('tests.b_path') $$,
  'a member of A reads none of B''s photos');
select is_empty($$ select 1 from storage.objects where name = current_setting('tests.b_avif') $$,
  'a member of A reads none of B''s AVIF covers');
select lives_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('property-photos', '%s/%s/front.jpg') $$, :'a', :'pa'),
  'a member of A uploads under A''s property');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('property-photos', current_setting('tests.b_prefix') || 'intruder.webp') $$,
  '42501', null, 'a member of A cannot upload under B''s prefix');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('property-photos', current_setting('tests.a_unknown')) $$,
  '42501', null, 'a member of A cannot upload under an unknown property id');
select throws_ok(
  $$ update storage.objects set name = current_setting('tests.b_prefix') || 'moved.webp' where name = current_setting('tests.a_path') $$,
  '42501', null, 'a member of A cannot move A''s photo under B''s prefix');
select throws_ok(
  $$ update storage.objects set name = current_setting('tests.a_unknown') where name = current_setting('tests.a_path') $$,
  '42501', null, 'a member of A cannot move A''s photo under an unknown property');
select isnt_empty($$ select 1 from storage.objects where name = current_setting('tests.a_path') $$,
  'the refused moves leave the photo at its A path');
select is_empty($$ update storage.objects set metadata = '{}' where name = current_setting('tests.b_path') returning 1 $$,
  'a member of A updates none of B''s photos');
select is_empty($$ delete from storage.objects where name = current_setting('tests.b_path') returning 1 $$,
  'a member of A deletes none of B''s photos');

select tests.act_as('viewer.a@test.esta.test');
select isnt_empty($$ select 1 from storage.objects where name = current_setting('tests.a_path') $$,
  'a viewer of A reads A''s photo');
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('property-photos', '%s/%s/side.png') $$, :'a', :'pa'),
  '42501', null, 'a viewer cannot upload');
select is_empty($$ update storage.objects set metadata = '{}' where name = current_setting('tests.a_path') returning 1 $$,
  'a viewer updates no photo');
select is_empty($$ delete from storage.objects where name = current_setting('tests.a_path') returning 1 $$,
  'a viewer deletes no photo');

select tests.act_as('admin.a@test.esta.test');
select isnt_empty($$ delete from storage.objects where name = current_setting('tests.a_path') returning 1 $$,
  'an admin of A deletes A''s photo, since admin passes the member write role');

select tests.act_as('member.a@test.esta.test');
select lives_ok(format($$ update public.properties set deleted_at = '2026-10-07 09:00+07' where id = %L $$, :'pa'),
  'a member of A archives Nhà A');
select isnt_empty(format($$ select 1 from storage.objects where name = '%s/%s/front.jpg' $$, :'a', :'pa'),
  'an archived property keeps a readable photo, since its row stays readable and restorable');
-- No where clause and no returning, so no select policy hides B's rows: only the update and delete using clauses do.
select lives_ok($$ update storage.objects set metadata = '{"touched": true}' $$,
  'a blanket update by a member of A reaches only rows her update policy allows');
select lives_ok($$ delete from storage.objects $$,
  'a blanket delete by a member of A reaches only rows her delete policy allows');

reset role;
select tests.clear_request();
select is((select metadata from storage.objects where name = current_setting('tests.b_path')), null,
  'the blanket update left B''s photo unchanged');
select isnt_empty($$ select 1 from storage.objects where name = current_setting('tests.b_path') $$,
  'B''s photo is untouched by everything household A tried, the blanket delete included');
select ok(not has_function_privilege('anon', 'private.property_photo_household(text)', 'execute'),
  'anon cannot call property_photo_household');

select * from finish();
rollback;
