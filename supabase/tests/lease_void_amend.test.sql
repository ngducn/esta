begin;
\ir _harness.psql

select plan(5);

select tests.create_household('a') as a \gset

-- #468: Phòng 5 bills by calendar month from 01/09 at 3.000.000 ₫ on the database clock's 2026-10-20. Its October bill is
-- issued and November's was issued by mistake and voided. A voided bill keeps its days, so a lease change that starts
-- inside it would leave the months after it unbilled.
select set_config('esta.actor', 'system:test', true);
insert into public.properties (id, household_id, nickname, code, kind, use_mode) values
  ('00000000-0000-4000-8000-0000000000a1', :'a', 'Dãy trọ Dĩ An', 'DIAN', 'rooming_house', 'rental');
insert into public.units (id, household_id, property_id, label, kind) values
  ('00000000-0000-4000-8000-000000000a15', :'a', '00000000-0000-4000-8000-0000000000a1', 'Phòng 5', 'room');
insert into public.parties (id, household_id, kind, full_name, tags) values
  ('00000000-0000-4000-8000-00000000a0a1', :'a', 'individual', 'Trần Thị Bình Demo', array['tenant']);
insert into public.leases (
  id, household_id, property_id, unit_id, tenant_party_id, start_date, end_date, rent_vnd, billing_cycle_months, period_anchor,
  utilities_mode, due_offset_days, deposit_vnd, status
) values
  ('00000000-0000-4000-8000-00000000e051', :'a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000a15',
   '00000000-0000-4000-8000-00000000a0a1', '2026-09-01', '2027-08-31', 3000000, 1, 'calendar_month', 'tenant_direct', 0, 3000000, 'active');
insert into public.invoices (id, household_id, lease_id, period_start, period_end, due_date, issue_on, status, issued_at) values
  ('00000000-0000-4000-8000-0000000f0051', :'a', '00000000-0000-4000-8000-00000000e051', '2026-09-01', '2026-09-30', '2026-09-01', '2026-09-01', 'issued', '2026-09-01T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0052', :'a', '00000000-0000-4000-8000-00000000e051', '2026-10-01', '2026-10-31', '2026-10-01', '2026-10-01', 'issued', '2026-10-01T00:30:00+07:00'),
  ('00000000-0000-4000-8000-0000000f0053', :'a', '00000000-0000-4000-8000-00000000e051', '2026-11-01', '2026-11-30', '2026-11-01', '2026-11-01', 'draft', null);
insert into public.invoice_lines (household_id, invoice_id, kind, unit_price_vnd, amount_vnd)
select :'a', id, 'rent', 3000000, 3000000 from public.invoices where household_id = :'a';
insert into private.local_stack default values on conflict do nothing;
delete from public.test_clock where for_household is null;
insert into public.test_clock (frozen_now) values ('2026-10-20T09:00:00+07:00');

select tests.act_as('member.a@test.esta.test');
select public.issue_invoice_now('00000000-0000-4000-8000-0000000f0053');
select public.void_invoice('00000000-0000-4000-8000-0000000f0053', 'Nhập nhầm');
select is((select status::text from public.invoices where id = '00000000-0000-4000-8000-0000000f0053'), 'void', 'November is voided');

select throws_ok($$ select public.amend_lease('00000000-0000-4000-8000-00000000e051', '2026-11-01', null, 3) $$,
  '22023', 'ESTA_AMENDMENT_ALREADY_BILLED', 'a quarterly start inside the voided November bill is refused');
select lives_ok($$ select public.amend_lease('00000000-0000-4000-8000-00000000e051', '2026-12-01', null, 3) $$,
  'the first of the month after the voided bill is accepted');
reset role;

delete from public.lease_amendments where lease_id = '00000000-0000-4000-8000-00000000e051';
select is(private.proposal_refusal(:'a', jsonb_build_object('type', 'suggest_rent_change', 'params', jsonb_build_object('title', 'x',
  'lease_id', '00000000-0000-4000-8000-00000000e051', 'effective_period_start', '2026-11-01', 'rent_vnd', 3300000)),
  private.business_date(private.audit_now())), 'ESTA_AMENDMENT_ALREADY_BILLED', 'the assistant''s rent change from the voided November is refused');
select is(private.proposal_refusal(:'a', jsonb_build_object('type', 'suggest_rent_change', 'params', jsonb_build_object('title', 'x',
  'lease_id', '00000000-0000-4000-8000-00000000e051', 'effective_period_start', '2026-12-01', 'rent_vnd', 3300000)),
  private.business_date(private.audit_now())), null, 'and one from the month after it is not');

select * from finish();
rollback;
