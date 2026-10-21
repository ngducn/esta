-- Batch history and undo (CONNECTOR.md §3.4). While the connector applies a batch it tags every write with
-- x-esta-via and x-esta-batch, the audit trigger stores both, and undo_change_batch replays the batch's audit rows in
-- reverse as Ryan, refusing while anything outside the batch depends on what it wrote.

alter table public.audit_log
  add column via text check (via in ('claude', 'undo')),
  add column batch_id uuid,
  add constraint audit_log_batch_tag check ((via is null) = (batch_id is null));
create index audit_log_batch_idx on public.audit_log (batch_id, id) where batch_id is not null;

-- The batch a write belongs to. undo_change_batch names its own writes with esta.via and esta.batch, which no API
-- caller can set. The headers count only for a batch that is applying, in the row's household, planned by the writer,
-- so nobody files a write under someone else's batch.
create function private.audit_tag(p_household_id uuid, out via text, out batch_id uuid)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  v_batch text := v_headers ->> 'x-esta-batch';
begin
  via := nullif(current_setting('esta.via', true), '');
  if via is not null then
    batch_id := current_setting('esta.batch')::uuid;
    return;
  end if;
  via := v_headers ->> 'x-esta-via';
  if via is null and v_batch is null then
    return;
  end if;
  if v_batch ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    batch_id := v_batch::uuid;
  end if;
  if via is distinct from 'claude' or batch_id is null or not exists (
    select from public.change_batches b
    where b.id = batch_id and b.household_id = p_household_id and b.status = 'applying' and b.created_by = auth.uid()
  ) then
    raise exception 'ESTA_BATCH_TAG' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.audit_tag(uuid) from public;

create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'updated_at' end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - 'updated_at' end;
  v_row jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  v_household uuid := (v_row ->> tg_argv[0])::uuid;
  v_actor record;
  v_tag record;
  v_diff jsonb;
begin
  select * into v_actor from private.audit_actor();

  select coalesce(jsonb_object_agg(k.key, jsonb_build_object('old', v_old -> k.key, 'new', v_new -> k.key)), '{}')
  into v_diff
  from jsonb_object_keys(coalesce(v_old, '{}') || coalesce(v_new, '{}')) as k (key)
  where coalesce(v_old -> k.key, 'null') is distinct from coalesce(v_new -> k.key, 'null');

  if tg_op = 'UPDATE' and v_diff = '{}' then
    return null;
  end if;

  select * into v_tag from private.audit_tag(v_household);
  insert into public.audit_log (household_id, table_name, row_id, action, actor_kind, actor_id, diff, via, batch_id)
  values (v_household, tg_table_name, (v_row ->> 'id')::uuid, lower(tg_op), v_actor.actor_kind, v_actor.actor_id, v_diff, v_tag.via, v_tag.batch_id);
  return null;
end;
$$;

-- A batch is stored only as planned, and only undo_change_batch, running as its owner, marks one undone (#223).
create or replace function private.guard_change_batch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'planned' then
      raise exception 'ESTA_BATCH_TRANSITION' using errcode = '23514', detail = format('stored as %s', new.status);
    end if;
    return new;
  end if;
  if (new.summary, new.via, new.plan, new.planned_at, new.created_by)
       is distinct from (old.summary, old.via, old.plan, old.planned_at, old.created_by)
     or (old.outcomes is not null and new.outcomes is distinct from old.outcomes) then
    raise exception 'ESTA_BATCH_FROZEN' using errcode = '23514';
  end if;
  if new.status is distinct from old.status and (old.status, new.status) not in (
    ('planned', 'applying'), ('applying', 'applied'), ('applying', 'partial'), ('applied', 'undone'), ('partial', 'undone')) then
    raise exception 'ESTA_BATCH_TRANSITION' using errcode = '23514', detail = format('%s to %s', old.status, new.status);
  end if;
  if new.status = 'undone' and old.status <> 'undone' and current_user in ('authenticated', 'service_role') then
    raise exception 'ESTA_BATCH_UNDO_THROUGH_FUNCTION' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger guard_change_batch on public.change_batches;
create trigger guard_change_batch
  before insert or update on public.change_batches
  for each row execute function private.guard_change_batch();

-- How undo treats a table. With no column, reason and flow say what blocks an undo when a row of the table written
-- outside the batch references a row the batch created, and the flow Ryan uses instead; a table not listed blocks as
-- in_use, fixed by editing. With no column and no reason the table is bookkeeping about other rows: it never blocks and
-- undo leaves its rows alone. With a column, undo refuses to set that column back on a row the batch updated, because
-- it only moves forward.
create table private.undo_rules (
  table_name text not null,
  column_name text,
  reason text,
  flow text check (flow in ('void', 'end_lease', 'edit')),
  unique nulls not distinct (table_name, column_name),
  check ((reason is null) = (flow is null)),
  check (column_name is null or reason is not null)
);
revoke all on table private.undo_rules from public, anon, authenticated, service_role;

insert into private.undo_rules (table_name, column_name, reason, flow) values
  ('invoices', null, 'invoice_issued', 'void'),
  ('invoice_lines', null, 'invoice_issued', 'void'),
  ('payments', null, 'payment_recorded', 'end_lease'),
  ('payment_allocations', null, 'payment_recorded', 'end_lease'),
  ('deposit_entries', null, 'deposit_recorded', 'end_lease'),
  ('leases', 'status', 'lease_started', 'end_lease'),
  ('change_batches', null, null, null),
  ('agent_jobs', null, null, null),
  ('agent_runs', null, null, null),
  ('agent_items', null, null, null),
  ('document_extractions', null, null, null),
  ('document_access_log', null, null, null);

-- One row per row the batch wrote, bookkeeping aside: its first and last audit ids, whether the batch created it and
-- whether it removed it, and its image before the batch, the oldest value of every column the batch changed.
create function private.batch_rows(p_batch_id uuid)
returns table (table_name text, row_id uuid, first_id bigint, last_id bigint, created boolean, removed boolean, image jsonb)
language sql
stable
set search_path = ''
as $$
  select a.table_name, a.row_id, min(a.id), max(a.id),
    (array_agg(a.action order by a.id))[1] = 'insert',
    (array_agg(a.action order by a.id desc))[1] = 'delete',
    (
      select coalesce(jsonb_object_agg(e.key, e.old), '{}')
      from (
        select distinct on (d.key) d.key, d.value -> 'old' as old
        from public.audit_log x
        cross join lateral jsonb_each(x.diff) d
        where x.batch_id = p_batch_id and x.via = 'claude' and x.table_name = a.table_name and x.row_id = a.row_id
          and x.action <> 'insert'
        order by d.key, x.id
      ) e
    )
  from public.audit_log a
  where a.batch_id = p_batch_id and a.via = 'claude'
    and a.table_name not in (select r.table_name from private.undo_rules r where r.reason is null)
  group by a.table_name, a.row_id;
$$;
revoke all on function private.batch_rows(uuid) from public;

-- What stops an undo, one row per blocking row: a later write outside the batch to a row it wrote, which blocks with
-- the table's own reason where it has one (a bill the batch drafted and the nightly run issued is an issued bill), a
-- forward-only column it moved, or a row outside the batch that references a row it created. The references come from the foreign
-- keys themselves, so a table added later is covered without a rule.
create function private.undo_blockers(p_batch_id uuid)
returns table (table_name text, row_id uuid, reason text, flow text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_fk record;
begin
  return query
    select t.table_name, t.row_id, coalesce(r.reason, 'edited_after'), coalesce(r.flow, 'edit')
    from private.batch_rows(p_batch_id) t
    left join private.undo_rules r on r.table_name = t.table_name and r.column_name is null
    where exists (
      select from public.audit_log l
      where l.table_name = t.table_name and l.row_id = t.row_id and l.id > t.first_id and l.batch_id is distinct from p_batch_id
    );

  return query
    select t.table_name, t.row_id, r.reason, r.flow
    from private.batch_rows(p_batch_id) t
    join private.undo_rules r on r.table_name = t.table_name and r.column_name is not null
    where not t.created and t.image ? r.column_name;

  for v_fk in
    select distinct child.relname as child_table, child_column.attname as child_column, parent.relname as parent_table
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class child on child.oid = c.conrelid
    join pg_catalog.pg_class parent on parent.oid = c.confrelid
    cross join lateral unnest(c.confkey, c.conkey) as k (parent_attnum, child_attnum)
    join pg_catalog.pg_attribute parent_id on parent_id.attrelid = c.confrelid and parent_id.attnum = k.parent_attnum
    join pg_catalog.pg_attribute child_column on child_column.attrelid = c.conrelid and child_column.attnum = k.child_attnum
    where c.contype = 'f' and parent_id.attname = 'id'
      and child.relnamespace = 'public'::regnamespace and parent.relnamespace = 'public'::regnamespace
      and child.relname not in (select r.table_name from private.undo_rules r where r.reason is null)
      and parent.relname in (select t.table_name from private.batch_rows(p_batch_id) t where t.created and not t.removed)
  loop
    return query execute format(
      $q$
        select %1$L::text, c.id, coalesce(r.reason, 'in_use'), coalesce(r.flow, 'edit')
        from public.%1$I c
        left join private.undo_rules r on r.table_name = %1$L and r.column_name is null
        where c.%2$I = any ($1) and not c.id = any ($2)
      $q$, v_fk.child_table, v_fk.child_column)
    using
      array(select t.row_id from private.batch_rows(p_batch_id) t where t.table_name = v_fk.parent_table and t.created and not t.removed),
      array(select t.row_id from private.batch_rows(p_batch_id) t where t.table_name = v_fk.child_table);
  end loop;
end;
$$;
revoke all on function private.undo_blockers(uuid) from public;

-- Sets a row back to its image: the columns the image names, in place when the row exists, else as a new row.
-- Generated columns follow, and created_by stays the trigger's to set.
create function private.undo_restore(p_table text, p_row_id uuid, p_image jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_table regclass := format('public.%I', p_table)::regclass;
  v_columns text;
  v_set text;
  v_found boolean;
begin
  select string_agg(format('%I', a.attname), ', ' order by a.attnum),
         string_agg(format('%1$I = r.%1$I', a.attname), ', ' order by a.attnum) filter (where a.attname not in ('id', 'household_id'))
  into v_columns, v_set
  from pg_catalog.pg_attribute a
  where a.attrelid = v_table and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
    and a.attname <> 'created_by' and p_image ? a.attname;

  execute format('select exists (select from %s where id = $1)', v_table) into v_found using p_row_id;
  if not v_found then
    execute format('insert into %1$s (%2$s) select %2$s from jsonb_populate_record(null::%1$s, $1)', v_table, v_columns) using p_image;
  elsif v_set is not null then
    execute format('update %1$s t set %2$s from jsonb_populate_record(null::%1$s, $2) r where t.id = $1', v_table, v_set) using p_row_id, p_image;
  end if;
end;
$$;
revoke all on function private.undo_restore(text, uuid, jsonb) from public;

-- Undoes a batch as the operator, in one transaction (CONNECTOR.md §3.4). With any blocker it writes nothing and
-- returns them. Otherwise it puts back the columns the batch changed, removes the rows it created children first,
-- moving a row of a soft-delete table to the trash instead, brings back the rows it removed parents first, and marks the
-- batch undone. Its own writes carry via undo and the batch id, so the history reads both sides.
create function public.undo_change_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.change_batches;
  v_blockers jsonb;
  v_archived jsonb := '[]';
  v_now timestamptz := private.audit_now();
  v_row record;
begin
  select * into v_batch from public.change_batches b where b.id = p_batch_id for update;
  if not found or not (private.is_member(v_batch.household_id, 'admin') and private.is_operator(v_batch.household_id)) then
    raise exception 'ESTA_BATCH_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_batch.status not in ('applied', 'partial') then
    raise exception 'ESTA_BATCH_NOT_UNDOABLE' using errcode = '55000', detail = v_batch.status;
  end if;

  select coalesce(jsonb_agg(distinct to_jsonb(b)), '[]') into v_blockers from private.undo_blockers(p_batch_id) b;
  if v_blockers <> '[]' then
    return jsonb_build_object('undone', false, 'blockers', v_blockers);
  end if;

  perform set_config('esta.via', 'undo', true);
  perform set_config('esta.batch', p_batch_id::text, true);
  for v_row in select * from private.batch_rows(p_batch_id) t where not t.created and not t.removed order by t.last_id desc loop
    perform private.undo_restore(v_row.table_name, v_row.row_id, v_row.image);
  end loop;
  for v_row in select * from private.batch_rows(p_batch_id) t where t.created and not t.removed order by t.first_id desc loop
    if exists (
      select from pg_catalog.pg_attribute a
      where a.attrelid = format('public.%I', v_row.table_name)::regclass and a.attname = 'deleted_at' and not a.attisdropped
    ) then
      execute format('update public.%I set deleted_at = $2 where id = $1 and deleted_at is null', v_row.table_name) using v_row.row_id, v_now;
      v_archived := v_archived || jsonb_build_object('table_name', v_row.table_name, 'row_id', v_row.row_id);
    else
      execute format('delete from public.%I where id = $1', v_row.table_name) using v_row.row_id;
    end if;
  end loop;
  for v_row in select * from private.batch_rows(p_batch_id) t where not t.created and t.removed order by t.last_id desc loop
    perform private.undo_restore(v_row.table_name, v_row.row_id, v_row.image);
  end loop;
  update public.change_batches set status = 'undone', undone_at = v_now where id = p_batch_id;
  perform set_config('esta.via', '', true);
  perform set_config('esta.batch', '', true);
  return jsonb_build_object('undone', true, 'archived', v_archived);
end;
$$;
revoke all on function public.undo_change_batch(uuid) from public, anon;
grant execute on function public.undo_change_batch(uuid) to authenticated;

-- The household's history of what Claude changed, newest first. Security invoker, so RLS keeps it to the member's
-- households. archived_properties counts the properties an undo moved to Đã lưu trữ, which the history row names.
create function public.change_batch_history(p_household_id uuid, p_limit int default 50)
returns table (
  id uuid,
  summary text,
  via text,
  status text,
  planned_at timestamptz,
  applied_at timestamptz,
  undone_at timestamptz,
  planner_name text,
  archived_properties integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.id, b.summary, b.via, b.status, b.planned_at, b.applied_at, b.undone_at, m.display_name,
    (
      select count(*)::integer from public.audit_log a
      where a.batch_id = b.id and a.via = 'undo' and a.table_name = 'properties' and a.diff -> 'deleted_at' ->> 'new' is not null
    )
  from public.change_batches b
  left join public.household_members m on m.household_id = b.household_id and m.user_id = b.created_by
  where b.household_id = p_household_id and b.status in ('applied', 'partial', 'undone')
  order by b.planned_at desc, b.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;
revoke all on function public.change_batch_history(uuid, int) from public, anon;
grant execute on function public.change_batch_history(uuid, int) to authenticated;
