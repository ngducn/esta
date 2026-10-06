-- Shared reference data. No household owns these rows; only migrations write them.

create type public.admin_unit_kind as enum ('province', 'city', 'ward', 'commune', 'special_zone');
create type public.admin_merge_kind as enum ('whole', 'partial');
create type public.land_group as enum ('agricultural', 'non_agricultural', 'unused');
create type public.tax_rule_kind as enum ('vn_rental_individual');

create function private.admin_name_fold(p_text text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        translate(public.esta_unaccent(p_text), '’‘ʼ', ''''''''),
        '[‐‑‒–—―−-]', ' ', 'g'),
      '\mtp(\.|\M)\s*', 'thanh pho ', 'g'),
    '\s+', ' ', 'g'));
$$;

-- One unit prefix is stripped, so "Phường Xã Đàn" keys as "xa dan" and "Quận 7" as "7".
create function public.admin_name_key(p_text text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select regexp_replace(
    private.admin_name_fold(p_text),
    '^(thanh pho|tinh|quan|huyen|thi xa|thi tran|phuong|xa|dac khu) ', '');
$$;

grant execute on function private.admin_name_fold(text) to authenticated, service_role;
grant execute on function public.admin_name_key(text) to anon, authenticated, service_role;

create table public.admin_units (
  code text primary key,
  name text not null check (name <> ''),
  kind public.admin_unit_kind not null,
  parent_code text references public.admin_units (code),
  effective_from date not null,
  constraint admin_units_level check (
    case
      when kind in ('province', 'city') then parent_code is null and code ~ '^[0-9]{2}$'
      else parent_code is not null and code ~ '^[0-9]{5}$'
    end
  )
);

create index admin_units_parent_code on public.admin_units (parent_code);

create table public.admin_unit_legacy_map (
  id bigint generated always as identity primary key,
  old_province_code text not null check (old_province_code ~ '^[0-9]{2}$'),
  old_province_name text not null,
  old_district_code text not null check (old_district_code ~ '^[0-9]{3}$'),
  old_district_name text not null,
  old_commune_code text check (old_commune_code ~ '^[0-9]{5}$'),
  old_commune_name text,
  new_commune_code text not null references public.admin_units (code),
  merge_kind public.admin_merge_kind not null,
  source text not null check (source <> ''),
  old_province_key text not null generated always as (public.admin_name_key(old_province_name)) stored,
  old_district_key text not null generated always as (public.admin_name_key(old_district_name)) stored,
  old_commune_key text generated always as (public.admin_name_key(old_commune_name)) stored,
  constraint admin_unit_legacy_map_named check (old_commune_code is null or old_commune_name is not null),
  constraint admin_unit_legacy_map_link unique nulls not distinct (old_district_code, old_commune_code, new_commune_code)
);

create index admin_unit_legacy_map_old_province_key on public.admin_unit_legacy_map (old_province_key);
create index admin_unit_legacy_map_old_district_key on public.admin_unit_legacy_map (old_district_key);
create index admin_unit_legacy_map_old_commune_key on public.admin_unit_legacy_map (old_commune_key);
create index admin_unit_legacy_map_new_commune_code on public.admin_unit_legacy_map (new_commune_code);

create table public.land_use_codes (
  code text primary key check (code ~ '^[A-Z]{3}$'),
  name_vi text not null,
  name_en text not null,
  land_group public.land_group not null
);

create table public.bank_bins (
  bin text primary key check (bin ~ '^[0-9]{6}$'),
  name text not null,
  napas_code text not null,
  short_name text
);

create table public.tax_rules (
  kind public.tax_rule_kind not null,
  effective_from date not null,
  effective_to date,
  params jsonb not null check (jsonb_typeof(params) = 'object'),
  source_citation text not null,
  note text,
  primary key (kind, effective_from),
  constraint tax_rules_period check (effective_to is null or effective_to > effective_from)
);

do $$
declare
  v_table regclass;
begin
  foreach v_table in array array[
    'public.admin_units', 'public.admin_unit_legacy_map', 'public.land_use_codes', 'public.bank_bins', 'public.tax_rules'
  ]::regclass[] loop
    execute format('alter table %s enable row level security', v_table);
    execute format('revoke all on table %s from anon, authenticated, service_role', v_table);
    execute format('grant select on table %s to authenticated, service_role', v_table);
    execute format('create policy reference_read on %s for select to authenticated using (true)', v_table);
  end loop;
end;
$$;

-- Suggests current communes for an old address such as "Phường 1, Thành phố Vũng Tàu, Tỉnh Bà Rịa–Vũng Tàu".
-- The words are cut into at most three runs (commune, district, province, in that order), and commas
-- must fall between runs. A run's own prefix ("Phường", "Quận", "Tỉnh") limits its level. A numeric
-- commune name needs its district. Leading words that match nothing, such as a street, are skipped,
-- and only the longest matching tail of the address counts. Every candidate of a split unit is listed.
-- merge_kind is 'whole' when the matched old unit went entirely into that one commune.
-- Security definer so the pre-sign-in /dev/core playground can call it with the anon key; it reads
-- only the public reference tables above.
create function public.suggest_current_unit(p_text text)
returns table (
  commune_code text,
  commune_name text,
  province_code text,
  province_name text,
  merge_kind public.admin_merge_kind,
  matched_legacy_name text,
  source text,
  rank integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive
  tokens as (
    select t.token, t.ord, lag(t.token) over (order by t.ord) as previous
    from unnest(regexp_split_to_array(
      private.admin_name_fold(replace(right(p_text, 120), ',', ' , ')), ' ')) with ordinality as t (token, ord)
  ),
  words as (
    select row_number() over (order by ord)::integer as i, token as word, coalesce(previous = ',', false) as after_comma
    from tokens
    where token not in (',', '')
  ),
  bounds as (
    select coalesce(max(i), 0) as n from words
  ),
  spans as (
    select a.i, b.i as j, string_agg(w.word, ' ' order by w.i) as phrase
    from words a
    join words b on b.i between a.i and a.i + 9
    join words w on w.i between a.i and b.i
    group by a.i, b.i
    having not bool_or(w.after_comma and w.i > a.i)
  ),
  keyed as (
    select i, j, key, btrim(left(phrase, length(phrase) - length(key))) as prefix
    from (select i, j, phrase, public.admin_name_key(phrase) as key from spans) as s
    where key <> ''
  ),
  span_levels as (
    select k.i, k.j, k.key, l.level
    from keyed k
    cross join (values (1), (2), (3)) as l (level)
    where case k.prefix
        when '' then true
        when 'tinh' then l.level = 3
        when 'thanh pho' then l.level in (2, 3)
        when 'quan' then l.level = 2
        when 'huyen' then l.level = 2
        when 'thi xa' then l.level = 2
        when 'phuong' then l.level = 1
        when 'xa' then l.level = 1
        when 'thi tran' then l.level = 1
        else false
      end
      and case l.level
        when 1 then exists (select 1 from public.admin_unit_legacy_map m where m.old_commune_key = k.key)
        when 2 then exists (select 1 from public.admin_unit_legacy_map m where m.old_district_key = k.key)
        else exists (select 1 from public.admin_unit_legacy_map m where m.old_province_key = k.key)
      end
  ),
  chains (start_i, level, c_key, d_key, p_key) as (
    select s.i, s.level,
      case s.level when 1 then s.key end,
      case s.level when 2 then s.key end,
      case s.level when 3 then s.key end
    from span_levels s
    cross join bounds
    where s.j = bounds.n
    union all
    select s.i, s.level,
      coalesce(c.c_key, case s.level when 1 then s.key end),
      coalesce(c.d_key, case s.level when 2 then s.key end),
      coalesce(c.p_key, case s.level when 3 then s.key end)
    from chains c
    join span_levels s on s.j = c.start_i - 1 and s.level < c.level
  ),
  valid as (
    select c.start_i, c.c_key, c.d_key, c.p_key
    from chains c
    join words w on w.i = c.start_i
    where (w.i = 1 or w.after_comma)
      and not coalesce(c.c_key ~ '^[0-9]+$' and c.d_key is null, false)
  ),
  matches as (
    select v.start_i, v.c_key, v.d_key, v.p_key, m.*
    from valid v
    join public.admin_unit_legacy_map m on m.old_commune_key = v.c_key
    where (v.d_key is null or m.old_district_key = v.d_key)
      and (v.p_key is null or m.old_province_key = v.p_key)
    union all
    select v.start_i, v.c_key, v.d_key, v.p_key, m.*
    from valid v
    join public.admin_unit_legacy_map m on m.old_district_key = v.d_key
    where v.c_key is null
      and (v.p_key is null or m.old_province_key = v.p_key)
    union all
    select v.start_i, v.c_key, v.d_key, v.p_key, m.*
    from valid v
    join public.admin_unit_legacy_map m on m.old_province_key = v.p_key
    where v.c_key is null and v.d_key is null
  ),
  units as (
    select
      m.new_commune_code,
      m.merge_kind,
      m.source,
      case
        when m.c_key is not null then 'c:' || m.old_district_code || ':' || coalesce(m.old_commune_code, m.old_commune_name)
        when m.d_key is not null then 'd:' || m.old_district_code
        else 'p:' || m.old_province_code
      end as old_unit,
      case when m.c_key is not null then 4 else 0 end
        + case when m.d_key is not null then 2 else 0 end
        + case when m.p_key is not null then 1 else 0 end as score,
      concat_ws(', ',
        case when m.c_key is not null then m.old_commune_name end,
        case when m.c_key is not null or m.d_key is not null then m.old_district_name end,
        m.old_province_name) as matched_name
    from matches m
    where m.start_i = (select min(start_i) from matches)
  ),
  unit_shape as (
    select old_unit, score, count(distinct new_commune_code) = 1 and bool_and(merge_kind = 'whole') as whole
    from units
    group by old_unit, score
  ),
  candidates as (
    select
      u.new_commune_code,
      u.score,
      min(u.matched_name) as matched_name,
      case when s.whole then 'whole' else 'partial' end::public.admin_merge_kind as merge_kind,
      string_agg(distinct u.source, '; ' order by u.source) as source
    from units u
    join unit_shape s using (old_unit, score)
    group by u.new_commune_code, u.score, u.old_unit, s.whole
  ),
  best as (
    select distinct on (new_commune_code) *
    from candidates
    order by new_commune_code, score desc, matched_name
  )
  select
    a.code,
    a.name,
    p.code,
    p.name,
    b.merge_kind,
    b.matched_name,
    b.source,
    (row_number() over (order by b.score desc, a.code))::integer
  from best b
  join public.admin_units a on a.code = b.new_commune_code
  join public.admin_units p on p.code = a.parent_code
  order by 8;
$$;

revoke all on function public.suggest_current_unit(text) from public;
grant execute on function public.suggest_current_unit(text) to anon, authenticated, service_role;
