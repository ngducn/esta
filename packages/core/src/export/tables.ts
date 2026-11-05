export type HouseholdTable = {
  readonly name: string;
  readonly parents: readonly string[];
  readonly columns: readonly string[];
  /** The column that holds the household's id: `households` is its own household. */
  readonly scope: 'id' | 'household_id';
};

const table = (name: string, parents: readonly string[], columns: string): HouseholdTable => ({
  name,
  parents,
  columns: columns.split(' '),
  scope: name === 'households' ? 'id' : 'household_id',
});

/**
 * Every table a household owns, parents first, so import order is data. A column the database generates is left out
 * (`documents.search_vector`); `tables.test.ts` fails when a migration adds a table or a column this list lacks, so a
 * backup cannot lose one silently.
 */
export const EXPORT_TABLES: readonly HouseholdTable[] = [
  table('households', [], 'created_at created_by id locale name timezone updated_at'),
  table('agent_jobs', [], 'attempts created_at created_by error finished_at household_id id idempotency_key kind locked_at locked_by max_attempts payload priority requested_by result run_after started_at status updated_at'),
  table('agent_items', ['agent_jobs'], 'audience body_md citations created_at created_by decided_at decided_by dedupe_key household_id id job_id kind proposal related severity status title updated_at'),
  table('agent_runs', ['agent_jobs'], 'agent_mode auth_mode cost_estimate_usd created_at created_by finished_at household_id id job_id model num_turns session_id started_at tool_calls updated_at usage'),
  table('audit_log', [], 'action actor_id actor_kind at batch_id diff household_id id row_id table_name via'),
  table('change_batches', [], 'applied_at created_at created_by household_id id outcomes plan planned_at status summary undone_at updated_at via'),
  table('conversations', [], 'created_at created_by household_id id last_asked_at sdk_handles sdk_session_id sdk_turn_hash title updated_at'),
  table('household_members', [], 'created_at created_by density display_name household_id id invited_email is_operator locale role text_scale updated_at user_id'),
  table('household_settings', [], 'agent created_at created_by household_id id invoicing updated_at'),
  table('notification_preferences', ['household_members'], 'channel created_at created_by daily_cap household_id id kinds member_id updated_at'),
  table('parties', ['household_members'], 'address_text created_at created_by email full_name household_id id id_last4 kind member_id notes phone short_name tags tax_code updated_at zalo_phone'),
  table('bank_accounts', ['parties'], 'account_name account_no bank_bin created_at created_by household_id id is_default owner_party_id updated_at'),
  table('owner_tax_inputs', ['parties'], 'created_at created_by household_id id notes other_business_revenue_vnd party_id updated_at year'),
  table('properties', [], 'acquired_on acquisition_kind acquisition_price_vnd boundary certificate_address_text code cover_photo_path created_at created_by current_address deleted_at household_id id kind kind_details legal_status location nickname notes updated_at use_mode'),
  table('messages', ['agent_items', 'agent_jobs', 'conversations', 'properties'], 'content_md conversation_id created_at created_by deferred_until household_id id job_id refs role status topic_item_id topic_property_id updated_at'),
  table('ownership_shares', ['parties', 'properties'], 'created_at created_by household_id id named_on_certificate party_id property_id share_bp since updated_at'),
  table('research_items', ['agent_jobs'], 'created_at created_by effective_on household_id id job_id kind province_codes published_on related_property_ids relevance source_name source_url summary_vi title_vi updated_at url_normalized why_it_matters_vi'),
  table('research_topics', [], 'active created_at created_by household_id id label property_ids province_codes query_templates source topic_key updated_at'),
  table('statement_imports', ['bank_accounts'], 'bank_account_id column_mapping committed_at created_at created_by file_name household_id id rejected status updated_at'),
  table('units', ['properties'], 'area_m2 available_from created_at created_by household_id id kind label list_rent_vnd property_id sort_order updated_at'),
  table('leases', ['agent_items', 'parties', 'units'], 'agent_item_id billing_cycle_months created_at created_by declaring_party_id deposit_vnd due_offset_days end_date escalation first_period_proration household_id id notes notice_days paid_through_date period_anchor property_id renewal_of_lease_id rent_vnd start_date status tax_payer tenant_party_id terminated_on termination_reason unit_id updated_at utilities_mode'),
  table('documents', ['leases', 'parties', 'properties'], 'category created_at created_by deleted_at expires_on household_id id lease_id mime ocr_text page_count party_id property_id sensitivity sha256 size_bytes storage_path tags title updated_at'),
  table('document_access_log', ['documents'], 'action at document_id household_id id user_id'),
  table('document_extractions', ['agent_jobs', 'documents'], 'accepted_fields created_at created_by document_id field_confidence household_id id job_id model result reviewed_at reviewed_by schema_name schema_version status updated_at'),
  table('certificates', ['document_extractions', 'documents', 'properties'], 'annotations book_entry_no created_at created_by document_id extraction_id form holder_party_ids household_id id issued_by issued_on mortgage property_id serial_no status updated_at verified_at verified_by'),
  table('expenses', ['documents', 'parties', 'properties'], 'amount_vnd category created_at created_by deleted_at document_id household_id id note paid_on property_id updated_at vendor_party_id'),
  table('invoices', ['leases'], 'created_at created_by due_date household_id id issue_on issued_at lease_id memo_code number period_end period_start share_token status updated_at voided_reason'),
  table('lease_amendments', ['agent_items', 'leases'], 'agent_item_id changes created_at created_by effective_period_start household_id id lease_id reason updated_at'),
  table('meters', ['units'], 'active created_at created_by household_id id kind pricing property_id serial unit_id updated_at'),
  table('invoice_lines', ['invoices', 'meters'], 'amount_vnd created_at created_by description household_id id invoice_id kind live meter_id quantity reading_month sort_order unit_price_vnd updated_at'),
  table('meter_readings', ['documents', 'meters'], 'created_at created_by household_id id meter_id photo_document_id read_on reading reading_month updated_at'),
  table('parcels', ['certificates', 'properties'], 'area_m2 certificate_id created_at created_by household_id id map_sheet_no origin_text parcel_no property_id purposes updated_at use_form'),
  table('statement_rows', ['invoices', 'statement_imports'], 'amount_vnd bank_ref candidate_invoice_ids created_at created_by description fingerprint household_id id import_id invoice_id posted_on reason row_index status updated_at'),
  table('payments', ['bank_accounts', 'parties', 'statement_rows'], 'amount_vnd bank_account_id bank_ref created_at created_by household_id id idempotency_key memo method payer_party_id received_on source statement_row_id updated_at'),
  table('deposit_entries', ['leases', 'payments'], 'amount_vnd created_at created_by household_id id idempotency_key kind lease_id note on_date payment_id updated_at'),
  table('payment_allocations', ['invoices', 'payments'], 'amount_vnd created_at created_by household_id id invoice_id payment_id updated_at'),
  table('structures', ['certificates', 'properties'], 'certificate_id completed_year created_at created_by floor_area_m2 floors footprint_m2 household_id id kind ownership_term property_id structure_text updated_at'),
  table('tasks', ['agent_items', 'household_members', 'leases', 'properties'], 'agent_item_id assignee_member_id created_at created_by due_on household_id id lease_id property_id source status title updated_at'),
  table('utility_accounts', ['properties', 'units'], 'created_at created_by customer_code holder_name household_id id kind note property_id provider unit_id updated_at'),
  table('valuations', ['properties'], 'as_of created_at created_by household_id id method note property_id source_url updated_at value_vnd'),
];
