create extension if not exists pg_trgm with schema extensions;

-- What research_scan searches for, derived from the portfolio each run (AGENT.md §5.2).
create table public.research_topics (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  topic_key text not null check (topic_key ~ '^(province|commune|national):[a-z0-9_]+$'),
  label text not null check (btrim(label) <> '' and char_length(label) <= 200),
  query_templates text[] not null check (cardinality(query_templates) between 1 and 20),
  province_codes text[] not null default '{}',
  property_ids uuid[] not null default '{}',
  source text not null default 'auto' check (source in ('auto', 'user')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  unique (household_id, topic_key)
);

create table public.research_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  url_normalized text not null check (url_normalized ~ '^https://'),
  source_url text not null check (source_url ~ '^https://' and char_length(source_url) <= 2000),
  source_name text not null check (btrim(source_name) <> '' and char_length(source_name) <= 120),
  published_on date not null,
  effective_on date,
  title_vi text not null check (btrim(title_vi) <> '' and char_length(title_vi) <= 400),
  summary_vi text not null check (btrim(summary_vi) <> '' and cardinality(regexp_split_to_array(btrim(summary_vi), '\s+')) <= 60),
  why_it_matters_vi text not null check (btrim(why_it_matters_vi) <> ''),
  kind text not null check (kind in ('infrastructure', 'land_price', 'legal_tax', 'market_rent', 'planning', 'other')),
  relevance numeric(3, 2) not null check (relevance between 0 and 1),
  related_property_ids uuid[] not null default '{}',
  province_codes text[] not null default '{}',
  job_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (household_id, id),
  unique (household_id, url_normalized),
  foreign key (household_id, job_id) references public.agent_jobs (household_id, id) on delete set null (job_id)
);
create index research_items_household_created_idx on public.research_items (household_id, created_at desc);
create index research_items_title_trgm_idx on public.research_items using gin (public.esta_unaccent(title_vi) extensions.gin_trgm_ops);

select private.enable_household_rls('public.research_topics', 'admin');
select private.enable_audit('public.research_topics');
select private.enable_household_rls('public.research_items', 'admin');
select private.enable_audit('public.research_items');

drop policy research_topics_insert on public.research_topics;
drop policy research_topics_update on public.research_topics;
drop policy research_topics_delete on public.research_topics;
drop policy research_items_insert on public.research_items;
drop policy research_items_update on public.research_items;
drop policy research_items_delete on public.research_items;
revoke insert, update, delete on table public.research_topics from authenticated;
revoke insert, update, delete on table public.research_items from authenticated;

create function public.research_title_similar(p_household_id uuid, p_title text, p_since timestamptz)
returns real
language sql
stable
set search_path = ''
as $$
  select coalesce(max(extensions.similarity(public.esta_unaccent(r.title_vi), public.esta_unaccent(p_title))), 0)::real
  from public.research_items r
  where r.household_id = p_household_id
    and r.created_at >= p_since
    and public.esta_unaccent(r.title_vi) operator(extensions.%) public.esta_unaccent(p_title);
$$;
revoke all on function public.research_title_similar(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.research_title_similar(uuid, text, timestamptz) to service_role;
