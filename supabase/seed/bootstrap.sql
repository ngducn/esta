-- Bootstrap seed: Gia đình Demo plus lane households Gia đình Demo 1..10, each with two
-- confirmed admins and two owner parties. P0-07 replaces this file with the generator.
-- Ids are UUIDv5 over seed keys in the URL namespace, for example 'seed:household:lane-4'.

-- One DO block because the CLI sends the seed as a single prepared batch.
do $seed$
begin
  perform set_config('esta.actor', 'system:seed', true);

  create temporary table seed_people as
  select
    extensions.uuid_generate_v5(extensions.uuid_ns_url(), 'seed:household:' || h.key) as household_id,
    h.name as household_name,
    extensions.uuid_generate_v5(extensions.uuid_ns_url(), 'seed:user:' || p.person || '-' || h.key) as user_id,
    extensions.uuid_generate_v5(extensions.uuid_ns_url(), 'seed:member:' || p.person || '-' || h.key) as member_id,
    extensions.uuid_generate_v5(extensions.uuid_ns_url(), 'seed:party:' || p.person || '-' || h.key) as party_id,
    p.person || h.email_suffix || '@demo.esta.test' as email,
    p.full_name,
    p.is_operator
  from (
    select
      case when n = 0 then 'demo' else 'lane-' || n end as key,
      case when n = 0 then 'Gia đình Demo' else 'Gia đình Demo ' || n end as name,
      case when n = 0 then '' else '.lane' || n end as email_suffix
    from generate_series(0, 10) as n
  ) as h
  cross join (
    values ('me', 'Nguyễn Thị Demo', false), ('ryan', 'Trần Minh Demo', true)
  ) as p (person, full_name, is_operator);

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  select
    '00000000-0000-0000-0000-000000000000', user_id, 'authenticated', 'authenticated', email, '',
    '2026-10-07 09:00:00+07', '{"provider": "email", "providers": ["email"]}', '{}',
    '2026-10-07 09:00:00+07', '2026-10-07 09:00:00+07', '', '', '', ''
  from seed_people;

  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  select
    user_id::text, user_id,
    jsonb_build_object('sub', user_id::text, 'email', email, 'email_verified', true),
    'email', '2026-10-07 09:00:00+07', '2026-10-07 09:00:00+07'
  from seed_people;

  insert into public.households (id, name)
  select distinct household_id, household_name from seed_people;

  insert into public.household_settings (household_id)
  select distinct household_id from seed_people;

  insert into public.household_members (id, household_id, user_id, invited_email, role, is_operator, display_name)
  select member_id, household_id, user_id, email, 'admin', is_operator, full_name from seed_people;

  insert into public.parties (id, household_id, kind, full_name, tags, member_id)
  select party_id, household_id, 'individual', full_name, array['owner'], member_id from seed_people;

  drop table seed_people;
end;
$seed$;
