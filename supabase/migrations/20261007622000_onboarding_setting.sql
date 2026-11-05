-- Holds only dismissed_at, the moment an admin hid the first-run checklist. Completion is derived from data, never stored.
-- household_settings keeps its admin-write RLS, so a viewer or a member cannot write it and another household cannot read it.
alter table public.household_settings
  add column onboarding jsonb not null default '{}' check (jsonb_typeof(onboarding) = 'object' and onboarding - 'dismissed_at' = '{}');
