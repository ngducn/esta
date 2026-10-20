begin;
\ir _harness.psql

select plan(24);

select tests.create_household('a') as a, tests.create_household('b') as b \gset

-- Dĩ An billed by calendar month on the 1st at 3.000.000 ₫. Phòng 5 holds September and October issued and a November
-- draft; Phòng 6 holds an October bill issued by mistake. The household's default receiving account is Vietcombank.
select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental');
insert into public.units (id, household_id, property_id, label, kind) values
  ('00000000-0000-4000-8000-000000000a15', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 5', 'room'),
  ('00000000-0000-4000-8000-000000000a16', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 6', 'room');
insert into public.parties (id, household_id, kind, full_name, phone, tags) values
  ('00000000-0000-4000-8000-00000000a0a1', :'a', 'individual', 'Hoàng Văn Em Demo', '+84901111005', array['tenant']);
insert into public.leases (
  id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, billing_cycle_months, period_anchor,
  utilities_mode, due_offset_days, deposit_vnd, status
)
select ('00000000-0000-4000-8000-00000000e0' || k || '1')::uuid, :'a', '00000000-0000-4000-8000-0000000000a1',
  ('00000000-0000-4000-8000-000000000a1' || k)::uuid, '00000000-0000-4000-8000-00000000a0a1', '2026-09-01', '2027-08-31', 3000000, 1,
  'calendar_month', 'tenant_direct', 0, 3000000, 'active'
from (values ('5'), ('6')) as room (k);
insert into public.invoices (id, household_id, lease_id, period_start, period_end, due_date, issue_on, status, issued_at)
select ('00000000-0000-4000-8000-0000000f00' || k || m)::uuid, :'a', ('00000000-0000-4000-8000-00000000e0' || k || '1')::uuid,
  period_start, (period_start + interval '1 month' - interval '1 day')::date, period_start, period_start, status,
  case when status = 'issued' then period_start::timestamptz end
from (values
  ('5', '1', date '2026-09-01', 'issued'),
  ('5', '2', date '2026-10-01', 'issued'),
  ('5', '3', date '2026-11-01', 'draft'),
  ('6', '2', date '2026-10-01', 'issued')
) as bill (k, m, period_start, status);
insert into public.invoice_lines (household_id, invoice_id, kind, unit_price_vnd, amount_vnd)
select :'a', id, 'rent', 3000000, 3000000 from public.invoices where household_id = :'a';
insert into public.payments (id, household_id, payer_party_id, amount_vnd, received_on, method) values
  ('00000000-0000-4000-8000-0000000c0001', :'a', '00000000-0000-4000-8000-00000000a0a1', 1000000, '2026-10-02', 'cash');
insert into public.payment_allocations (household_id, payment_id, invoice_id, amount_vnd) values
  (:'a', '00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000f0052', 1000000);
insert into public.bank_accounts (id, household_id, bank_bin, account_no, account_name, is_default) values
  ('00000000-0000-4000-8000-00000000aa01', :'a', '970436', '0123456789', 'NGUYEN THI DEMO', true);

insert into private.local_stack default values on conflict do nothing;
insert into public.test_clock (id, frozen_now) values (true, '2026-10-20T09:00:00+07:00')
  on conflict (id) do update set frozen_now = excluded.frozen_now;

select share_token as october, memo_code as october_memo from public.invoices where id = '00000000-0000-4000-8000-0000000f0052' \gset
select share_token as wrong from public.invoices where id = '00000000-0000-4000-8000-0000000f0062' \gset

-- Tokens follow the bill's status (LSE-11).
select is((select count(*)::integer from public.invoices where household_id = :'a' and status = 'issued' and share_token ~ '^[A-Za-z0-9_-]{22}$'), 3,
  'every issued bill holds 22 base64url characters');
select is((select count(distinct share_token)::integer from public.invoices where household_id = :'a'), 3, 'no two bills share a token');
select is((select share_token from public.invoices where id = '00000000-0000-4000-8000-0000000f0053'), null, 'a draft holds no token');
update public.invoices set share_token = 'AAAAAAAAAAAAAAAAAAAAAA' where id = '00000000-0000-4000-8000-0000000f0053';
select is((select share_token from public.invoices where id = '00000000-0000-4000-8000-0000000f0053'), null, 'a draft cannot be given one');
select throws_ok($$ alter table public.invoices disable trigger share_invoice; update public.invoices set share_token = 'AAAAAAAAAAAAAAAAAAAAAA' where id = '00000000-0000-4000-8000-0000000f0053' $$,
  '23514', null, 'the constraint refuses a token on a draft even without the trigger');
alter table public.invoices enable trigger share_invoice;

-- What anon may read.
select is(pg_get_function_result('public.invoice_qr_by_token(text)'::regprocedure),
  'TABLE(bank_bin text, bank_name text, account_no text, account_name text, outstanding_vnd bigint, memo_code text)',
  'the token lookup returns the account, the amount still owed and the memo code, and nothing about the tenant');
select ok(has_function_privilege('anon', 'public.invoice_qr_by_token(text)', 'execute'), 'anon may look a token up');
select ok(not has_table_privilege('anon', 'public.invoices', 'select'), 'anon cannot select invoices');
select ok(not has_table_privilege('anon', 'public.invoice_balances', 'select'), 'anon cannot select invoice balances');
select ok(not has_table_privilege('anon', 'public.bank_accounts', 'select'), 'anon cannot select bank accounts');
select ok(not has_table_privilege('anon', 'public.parties', 'select'), 'anon cannot select parties');
select ok(not has_function_privilege('anon', 'private.new_share_token()', 'execute'), 'anon cannot mint a token');

set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select results_eq(
  format($$ select * from public.invoice_qr_by_token(%L) $$, :'october'),
  format($$ values ('970436', 'Vietcombank', '0123456789', 'NGUYEN THI DEMO', 2000000::bigint, %L) $$, :'october_memo'),
  'anon reads October''s account, the 2.000.000 ₫ still owed after a part payment, and its memo code');
select is_empty($$ select * from public.invoice_qr_by_token('AAAAAAAAAAAAAAAAAAAAAA') $$, 'a token no bill holds reads nothing');
select is_empty($$ select * from public.invoice_qr_by_token($t$' or true --$t$) $$, 'a malformed token reads nothing');
select is_empty($$ select * from public.invoice_qr_by_token(null) $$, 'no token reads nothing');
select is_empty(format($$ select * from public.invoice_qr_by_token(%L) $$, case when :'october' like 'A%' then 'B' else 'A' end || substr(:'october', 2)),
  'a token one character off reads nothing');
reset role;
select tests.clear_request();

update public.bank_accounts set is_default = false where id = '00000000-0000-4000-8000-00000000aa01';
select is_empty(format($$ select * from public.invoice_qr_by_token(%L) $$, :'october'), 'without a default receiving account the link draws nothing');
update public.bank_accounts set is_default = true where id = '00000000-0000-4000-8000-00000000aa01';

-- Voiding clears the token; issuing mints one.
select tests.act_as('member.a@test.esta.test');
select lives_ok($$ select public.void_invoice('00000000-0000-4000-8000-0000000f0062', 'Người thuê Demo đã chuyển đi') $$, 'a member voids the wrong bill');
select lives_ok($$ select public.issue_invoice_now('00000000-0000-4000-8000-0000000f0053') $$, 'a member issues November early');
select tests.clear_request();
reset role;
select is((select share_token from public.invoices where id = '00000000-0000-4000-8000-0000000f0062'), null, 'the void bill holds no token');
select is_empty(format($$ select * from public.invoice_qr_by_token(%L) $$, :'wrong'), 'its old link reads nothing');
select matches((select share_token from public.invoices where id = '00000000-0000-4000-8000-0000000f0053'), '^[A-Za-z0-9_-]{22}$',
  'the bill issued early gets its token');
select is((select share_token from public.invoices where id = '00000000-0000-4000-8000-0000000f0052'), :'october', 'an issued bill keeps its token');

select * from finish();
rollback;
