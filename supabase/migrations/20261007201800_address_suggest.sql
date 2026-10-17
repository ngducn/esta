-- Mẹ writes addresses the way they appear on envelopes and receipts: `Q.7`, `P.1`, `TX. Dĩ An`, `TP.HCM`, and often a
-- trailing `Việt Nam` (#17). The fold reads each abbreviation as the unit word it stands for. A single letter counts only
-- with a dot, or before a number for P and Q, so a name such as `Ia Pa` is untouched.
create or replace function public.admin_name_fold(p_text text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      regexp_replace(
        translate(public.esta_unaccent(p_text), '’‘ʼ', ''''''''),
        '[‐‑‒–—―−-]', ' ', 'g'),
      '\m(tp\.?\s*)?hcm\M\.?', 'thanh pho ho chi minh', 'g'),
      '\mtp(\.|\M)\s*', 'thanh pho ', 'g'),
      '\mtx(\.|\M)\s*', 'thi xa ', 'g'),
      '\mtt(\.|\M)\s*', 'thi tran ', 'g'),
      '\mq(\.\s*|\s*(?=[0-9]))', 'quan ', 'g'),
      '\mp(\.\s*|\s*(?=[0-9]))', 'phuong ', 'g'),
      '\mh\.\s*', 'huyen ', 'g'),
      '\mx\.\s*', 'xa ', 'g'),
    '\s+', ' ', 'g'));
$$;

-- The stored keys are generated from the fold, so they are recomputed under the new one.
update public.admin_unit_legacy_map set old_province_name = old_province_name;

-- Lower case and NFC with the diacritics kept, so a typed `Tân An` can tell Thành phố Tân An from Xã Tân Ân.
create function private.admin_name_exact(p_text text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(regexp_replace(lower(normalize(p_text, nfc)), '[‐‑‒–—―−-]', ' ', 'g'), '\s+', ' ', 'g'));
$$;

create function private.admin_bare_name(p_name text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select regexp_replace(private.admin_name_exact(p_name), '^(thành phố|tỉnh|quận|huyện|thị xã|thị trấn|phường|xã|đặc khu) ', '');
$$;

revoke all on function private.admin_name_exact(text), private.admin_bare_name(text) from public;
grant execute on function private.admin_name_exact(text), private.admin_bare_name(text) to authenticated, service_role;

-- A match that keeps the typed diacritics ranks above one that matched only once folded (#17).
create or replace function public.suggest_current_unit(p_text text)
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
set search_path = ''
as $$
  with recursive
  typed as (
    select private.admin_name_exact(p_text) as text
  ),
  tokens as (
    select t.token, t.ord, lag(t.token) over (order by t.ord) as previous
    from unnest(regexp_split_to_array(
      regexp_replace(public.admin_name_fold(replace(right(p_text, 120), ',', ' , ')), '(\s*,)?\s*\m(viet nam|vietnam)\M[\s.]*$', ''),
      ' ')) with ordinality as t (token, ord)
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
  prefix_levels (prefix, level) as (
    values ('', 1), ('', 2), ('', 3),
      ('phuong', 1), ('xa', 1), ('thi tran', 1),
      ('quan', 2), ('huyen', 2), ('thi xa', 2), ('thanh pho', 2),
      ('thanh pho', 3), ('tinh', 3)
  ),
  span_levels as (
    select k.i, k.j, k.key, l.level
    from keyed k
    join prefix_levels l using (prefix)
    where case l.level
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
      (m.c_key is null or position(private.admin_bare_name(m.old_commune_name) in typed.text) > 0)
        and (m.d_key is null or position(private.admin_bare_name(m.old_district_name) in typed.text) > 0)
        and (m.p_key is null or position(private.admin_bare_name(m.old_province_name) in typed.text) > 0) as exact,
      concat_ws(', ',
        case when m.c_key is not null then m.old_commune_name end,
        case when m.c_key is not null or m.d_key is not null then m.old_district_name end,
        m.old_province_name) as matched_name
    from matches m
    cross join typed
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
      bool_or(u.exact) as exact,
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
    order by new_commune_code, exact desc, score desc, matched_name
  )
  select
    a.code,
    a.name,
    p.code,
    p.name,
    b.merge_kind,
    b.matched_name,
    b.source,
    (row_number() over (order by b.exact desc, b.score desc, a.code))::integer
  from best b
  join public.admin_units a on a.code = b.new_commune_code
  join public.admin_units p on p.code = a.parent_code
  order by 8;
$$;

