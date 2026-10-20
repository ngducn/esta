export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_unit_legacy_map: {
        Row: {
          id: number
          merge_kind: Database["public"]["Enums"]["admin_merge_kind"]
          new_commune_code: string
          old_commune_code: string | null
          old_commune_key: string | null
          old_commune_name: string | null
          old_district_code: string
          old_district_key: string
          old_district_name: string
          old_province_code: string
          old_province_key: string
          old_province_name: string
          source: string
        }
        Insert: {
          id?: never
          merge_kind: Database["public"]["Enums"]["admin_merge_kind"]
          new_commune_code: string
          old_commune_code?: string | null
          old_commune_key?: string | null
          old_commune_name?: string | null
          old_district_code: string
          old_district_key?: string
          old_district_name: string
          old_province_code: string
          old_province_key?: string
          old_province_name: string
          source: string
        }
        Update: {
          id?: never
          merge_kind?: Database["public"]["Enums"]["admin_merge_kind"]
          new_commune_code?: string
          old_commune_code?: string | null
          old_commune_key?: string | null
          old_commune_name?: string | null
          old_district_code?: string
          old_district_key?: string
          old_district_name?: string
          old_province_code?: string
          old_province_key?: string
          old_province_name?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_unit_legacy_map_new_commune_code_fkey"
            columns: ["new_commune_code"]
            isOneToOne: false
            referencedRelation: "admin_units"
            referencedColumns: ["code"]
          },
        ]
      }
      admin_units: {
        Row: {
          code: string
          effective_from: string
          kind: Database["public"]["Enums"]["admin_unit_kind"]
          name: string
          parent_code: string | null
        }
        Insert: {
          code: string
          effective_from: string
          kind: Database["public"]["Enums"]["admin_unit_kind"]
          name: string
          parent_code?: string | null
        }
        Update: {
          code?: string
          effective_from?: string
          kind?: Database["public"]["Enums"]["admin_unit_kind"]
          name?: string
          parent_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_units_parent_code_fkey"
            columns: ["parent_code"]
            isOneToOne: false
            referencedRelation: "admin_units"
            referencedColumns: ["code"]
          },
        ]
      }
      agent_items: {
        Row: {
          audience: string
          body_md: string | null
          citations: Json
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          dedupe_key: string
          household_id: string
          id: string
          job_id: string | null
          kind: string
          proposal: Json | null
          related: Json
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string
          body_md?: string | null
          citations?: Json
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          dedupe_key: string
          household_id: string
          id?: string
          job_id?: string | null
          kind: string
          proposal?: Json | null
          related?: Json
          severity: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          body_md?: string | null
          citations?: Json
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          dedupe_key?: string
          household_id?: string
          id?: string
          job_id?: string | null
          kind?: string
          proposal?: Json | null
          related?: Json
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_items_household_id_job_id_fkey"
            columns: ["household_id", "job_id"]
            isOneToOne: false
            referencedRelation: "agent_jobs"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      agent_jobs: {
        Row: {
          attempts: number
          created_at: string
          created_by: string | null
          error: string | null
          finished_at: string | null
          household_id: string
          id: string
          idempotency_key: string | null
          kind: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          priority: number
          requested_by: string | null
          result: Json | null
          run_after: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          household_id: string
          id?: string
          idempotency_key?: string | null
          kind: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          requested_by?: string | null
          result?: Json | null
          run_after: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          household_id?: string
          id?: string
          idempotency_key?: string | null
          kind?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          requested_by?: string | null
          result?: Json | null
          run_after?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_jobs_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          agent_mode: string
          auth_mode: string
          cost_estimate_usd: number | null
          created_at: string
          created_by: string | null
          finished_at: string | null
          household_id: string
          id: string
          job_id: string
          model: string | null
          num_turns: number | null
          session_id: string | null
          started_at: string
          tool_calls: Json
          updated_at: string
          usage: Json
        }
        Insert: {
          agent_mode: string
          auth_mode: string
          cost_estimate_usd?: number | null
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          household_id: string
          id?: string
          job_id: string
          model?: string | null
          num_turns?: number | null
          session_id?: string | null
          started_at: string
          tool_calls?: Json
          updated_at?: string
          usage?: Json
        }
        Update: {
          agent_mode?: string
          auth_mode?: string
          cost_estimate_usd?: number | null
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          household_id?: string
          id?: string
          job_id?: string
          model?: string | null
          num_turns?: number | null
          session_id?: string | null
          started_at?: string
          tool_calls?: Json
          updated_at?: string
          usage?: Json
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_household_id_job_id_fkey"
            columns: ["household_id", "job_id"]
            isOneToOne: false
            referencedRelation: "agent_jobs"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string
          actor_kind: string
          at: string
          diff: Json
          household_id: string
          id: number
          row_id: string
          table_name: string
        }
        Insert: {
          action: string
          actor_id: string
          actor_kind: string
          at?: string
          diff: Json
          household_id: string
          id?: never
          row_id: string
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string
          actor_kind?: string
          at?: string
          diff?: Json
          household_id?: string
          id?: never
          row_id?: string
          table_name?: string
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_no: string
          bank_bin: string
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          is_default: boolean
          owner_party_id: string | null
          updated_at: string
        }
        Insert: {
          account_name: string
          account_no: string
          bank_bin: string
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          is_default?: boolean
          owner_party_id?: string | null
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_no?: string
          bank_bin?: string
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          is_default?: boolean
          owner_party_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_bank_bin_fkey"
            columns: ["bank_bin"]
            isOneToOne: false
            referencedRelation: "bank_bins"
            referencedColumns: ["bin"]
          },
          {
            foreignKeyName: "bank_accounts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_household_id_owner_party_id_fkey"
            columns: ["household_id", "owner_party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      bank_bins: {
        Row: {
          bin: string
          name: string
          napas_code: string
          short_name: string | null
        }
        Insert: {
          bin: string
          name: string
          napas_code: string
          short_name?: string | null
        }
        Update: {
          bin?: string
          name?: string
          napas_code?: string
          short_name?: string | null
        }
        Relationships: []
      }
      certificates: {
        Row: {
          annotations: Json
          book_entry_no: string | null
          created_at: string
          created_by: string | null
          document_id: string | null
          extraction_id: string | null
          form: string
          holder_party_ids: string[]
          household_id: string
          id: string
          issued_by: string | null
          issued_on: string | null
          mortgage: Json | null
          property_id: string
          serial_no: string | null
          status: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          annotations?: Json
          book_entry_no?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          extraction_id?: string | null
          form: string
          holder_party_ids?: string[]
          household_id: string
          id?: string
          issued_by?: string | null
          issued_on?: string | null
          mortgage?: Json | null
          property_id: string
          serial_no?: string | null
          status?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          annotations?: Json
          book_entry_no?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          extraction_id?: string | null
          form?: string
          holder_party_ids?: string[]
          household_id?: string
          id?: string
          issued_by?: string | null
          issued_on?: string | null
          mortgage?: Json | null
          property_id?: string
          serial_no?: string | null
          status?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificates_document_id_fkey"
            columns: ["household_id", "document_id"]
            isOneToOne: false
            referencedRelation: "document_status"
            referencedColumns: ["household_id", "document_id"]
          },
          {
            foreignKeyName: "certificates_document_id_fkey"
            columns: ["household_id", "document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "certificates_extraction_id_fkey"
            columns: ["household_id", "extraction_id"]
            isOneToOne: false
            referencedRelation: "document_extractions"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "certificates_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "certificates_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_completeness_facts"
            referencedColumns: ["household_id", "property_id"]
          },
          {
            foreignKeyName: "certificates_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_list_rows"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      change_batches: {
        Row: {
          applied_at: string | null
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          outcomes: Json | null
          plan: Json
          planned_at: string
          status: string
          summary: string
          undone_at: string | null
          updated_at: string
          via: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          outcomes?: Json | null
          plan: Json
          planned_at: string
          status?: string
          summary: string
          undone_at?: string | null
          updated_at?: string
          via?: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          outcomes?: Json | null
          plan?: Json
          planned_at?: string
          status?: string
          summary?: string
          undone_at?: string | null
          updated_at?: string
          via?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_batches_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      deposit_entries: {
        Row: {
          amount_vnd: number
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          idempotency_key: string | null
          kind: string
          lease_id: string
          note: string | null
          on_date: string
          payment_id: string | null
          updated_at: string
        }
        Insert: {
          amount_vnd: number
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          idempotency_key?: string | null
          kind: string
          lease_id: string
          note?: string | null
          on_date: string
          payment_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_vnd?: number
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          idempotency_key?: string | null
          kind?: string
          lease_id?: string
          note?: string | null
          on_date?: string
          payment_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposit_entries_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_entries_household_id_lease_id_fkey"
            columns: ["household_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "lease_deposits"
            referencedColumns: ["household_id", "lease_id"]
          },
          {
            foreignKeyName: "deposit_entries_household_id_lease_id_fkey"
            columns: ["household_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "deposit_entries_household_id_payment_id_fkey"
            columns: ["household_id", "payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      document_access_log: {
        Row: {
          action: string
          at: string
          document_id: string
          household_id: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          at?: string
          document_id: string
          household_id: string
          id?: string
          user_id?: string
        }
        Update: {
          action?: string
          at?: string
          document_id?: string
          household_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_access_log_household_id_document_id_fkey"
            columns: ["household_id", "document_id"]
            isOneToOne: false
            referencedRelation: "document_status"
            referencedColumns: ["household_id", "document_id"]
          },
          {
            foreignKeyName: "document_access_log_household_id_document_id_fkey"
            columns: ["household_id", "document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "document_access_log_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      document_extractions: {
        Row: {
          accepted_fields: Json | null
          created_at: string
          created_by: string | null
          document_id: string
          field_confidence: Json | null
          household_id: string
          id: string
          job_id: string | null
          model: string | null
          result: Json | null
          reviewed_at: string | null
          reviewed_by: string | null
          schema_name: string
          schema_version: number
          status: string
          updated_at: string
        }
        Insert: {
          accepted_fields?: Json | null
          created_at?: string
          created_by?: string | null
          document_id: string
          field_confidence?: Json | null
          household_id: string
          id?: string
          job_id?: string | null
          model?: string | null
          result?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          schema_name: string
          schema_version: number
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_fields?: Json | null
          created_at?: string
          created_by?: string | null
          document_id?: string
          field_confidence?: Json | null
          household_id?: string
          id?: string
          job_id?: string | null
          model?: string | null
          result?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          schema_name?: string
          schema_version?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_extractions_household_id_document_id_fkey"
            columns: ["household_id", "document_id"]
            isOneToOne: false
            referencedRelation: "document_status"
            referencedColumns: ["household_id", "document_id"]
          },
          {
            foreignKeyName: "document_extractions_household_id_document_id_fkey"
            columns: ["household_id", "document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "document_extractions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_extractions_household_id_job_id_fkey"
            columns: ["household_id", "job_id"]
            isOneToOne: false
            referencedRelation: "agent_jobs"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      documents: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          expires_on: string | null
          household_id: string
          id: string
          lease_id: string | null
          mime: string
          ocr_text: string | null
          page_count: number | null
          party_id: string | null
          property_id: string | null
          search_vector: unknown
          sensitivity: string
          sha256: string
          size_bytes: number
          storage_path: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expires_on?: string | null
          household_id: string
          id?: string
          lease_id?: string | null
          mime: string
          ocr_text?: string | null
          page_count?: number | null
          party_id?: string | null
          property_id?: string | null
          search_vector?: unknown
          sensitivity: string
          sha256: string
          size_bytes: number
          storage_path: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expires_on?: string | null
          household_id?: string
          id?: string
          lease_id?: string | null
          mime?: string
          ocr_text?: string | null
          page_count?: number | null
          party_id?: string | null
          property_id?: string | null
          search_vector?: unknown
          sensitivity?: string
          sha256?: string
          size_bytes?: number
          storage_path?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_household_id_party_id_fkey"
            columns: ["household_id", "party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "documents_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "documents_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_completeness_facts"
            referencedColumns: ["household_id", "property_id"]
          },
          {
            foreignKeyName: "documents_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_list_rows"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "documents_lease_fk"
            columns: ["household_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "lease_deposits"
            referencedColumns: ["household_id", "lease_id"]
          },
          {
            foreignKeyName: "documents_lease_fk"
            columns: ["household_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount_vnd: number
          category: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          document_id: string | null
          household_id: string
          id: string
          note: string | null
          paid_on: string
          property_id: string
          updated_at: string
          vendor_party_id: string | null
        }
        Insert: {
          amount_vnd: number
          category: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_id?: string | null
          household_id: string
          id?: string
          note?: string | null
          paid_on: string
          property_id: string
          updated_at?: string
          vendor_party_id?: string | null
        }
        Update: {
          amount_vnd?: number
          category?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_id?: string | null
          household_id?: string
          id?: string
          note?: string | null
          paid_on?: string
          property_id?: string
          updated_at?: string
          vendor_party_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_household_id_document_id_fkey"
            columns: ["household_id", "document_id"]
            isOneToOne: false
            referencedRelation: "document_status"
            referencedColumns: ["household_id", "document_id"]
          },
          {
            foreignKeyName: "expenses_household_id_document_id_fkey"
            columns: ["household_id", "document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "expenses_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "expenses_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_completeness_facts"
            referencedColumns: ["household_id", "property_id"]
          },
          {
            foreignKeyName: "expenses_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_list_rows"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "expenses_household_id_vendor_party_id_fkey"
            columns: ["household_id", "vendor_party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      household_members: {
        Row: {
          created_at: string
          created_by: string | null
          density: string
          display_name: string | null
          household_id: string
          id: string
          invited_email: string
          is_operator: boolean
          locale: string
          role: Database["public"]["Enums"]["member_role"]
          text_scale: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          density?: string
          display_name?: string | null
          household_id: string
          id?: string
          invited_email: string
          is_operator?: boolean
          locale?: string
          role?: Database["public"]["Enums"]["member_role"]
          text_scale?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          density?: string
          display_name?: string | null
          household_id?: string
          id?: string
          invited_email?: string
          is_operator?: boolean
          locale?: string
          role?: Database["public"]["Enums"]["member_role"]
          text_scale?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_settings: {
        Row: {
          agent: Json
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          invoicing: Json
          updated_at: string
        }
        Insert: {
          agent?: Json
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          invoicing?: Json
          updated_at?: string
        }
        Update: {
          agent?: Json
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          invoicing?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_settings_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          locale: string
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          locale?: string
          name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          locale?: string
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoice_lines: {
        Row: {
          amount_vnd: number
          created_at: string
          created_by: string | null
          description: string | null
          household_id: string
          id: string
          invoice_id: string
          kind: string
          meter_id: string | null
          quantity: number
          reading_month: string | null
          sort_order: number
          unit_price_vnd: number
          updated_at: string
        }
        Insert: {
          amount_vnd: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          household_id: string
          id?: string
          invoice_id: string
          kind: string
          meter_id?: string | null
          quantity?: number
          reading_month?: string | null
          sort_order?: number
          unit_price_vnd: number
          updated_at?: string
        }
        Update: {
          amount_vnd?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          household_id?: string
          id?: string
          invoice_id?: string
          kind?: string
          meter_id?: string | null
          quantity?: number
          reading_month?: string | null
          sort_order?: number
          unit_price_vnd?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_household_id_invoice_id_fkey"
            columns: ["household_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_balances"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "invoice_lines_household_id_invoice_id_fkey"
            columns: ["household_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "invoice_lines_meter_fkey"
            columns: ["household_id", "meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          created_by: string | null
          due_date: string
          household_id: string
          id: string
          issue_on: string
          issued_at: string | null
          lease_id: string
          memo_code: string
          number: string
          period_end: string
          period_start: string
          share_token: string | null
          status: string
          updated_at: string
          voided_reason: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          due_date: string
          household_id: string
          id?: string
          issue_on: string
          issued_at?: string | null
          lease_id: string
          memo_code: string
          number: string
          period_end: string
          period_start: string
          share_token?: string | null
          status?: string
          updated_at?: string
          voided_reason?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          due_date?: string
          household_id?: string
          id?: string
          issue_on?: string
          issued_at?: string | null
          lease_id?: string
          memo_code?: string
          number?: string
          period_end?: string
          period_start?: string
          share_token?: string | null
          status?: string
          updated_at?: string
          voided_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_household_id_lease_id_fkey"
            columns: ["household_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "lease_deposits"
            referencedColumns: ["household_id", "lease_id"]
          },
          {
            foreignKeyName: "invoices_household_id_lease_id_fkey"
            columns: ["household_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      land_use_codes: {
        Row: {
          code: string
          land_group: Database["public"]["Enums"]["land_group"]
          name_en: string
          name_vi: string
        }
        Insert: {
          code: string
          land_group: Database["public"]["Enums"]["land_group"]
          name_en: string
          name_vi: string
        }
        Update: {
          code?: string
          land_group?: Database["public"]["Enums"]["land_group"]
          name_en?: string
          name_vi?: string
        }
        Relationships: []
      }
      lease_amendments: {
        Row: {
          changes: Json
          created_at: string
          created_by: string | null
          effective_period_start: string
          household_id: string
          id: string
          lease_id: string
          reason: string | null
          updated_at: string
        }
        Insert: {
          changes: Json
          created_at?: string
          created_by?: string | null
          effective_period_start: string
          household_id: string
          id?: string
          lease_id: string
          reason?: string | null
          updated_at?: string
        }
        Update: {
          changes?: Json
          created_at?: string
          created_by?: string | null
          effective_period_start?: string
          household_id?: string
          id?: string
          lease_id?: string
          reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lease_amendments_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_amendments_household_id_lease_id_fkey"
            columns: ["household_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "lease_deposits"
            referencedColumns: ["household_id", "lease_id"]
          },
          {
            foreignKeyName: "lease_amendments_household_id_lease_id_fkey"
            columns: ["household_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      leases: {
        Row: {
          billing_cycle_months: number
          created_at: string
          created_by: string | null
          declaring_party_id: string | null
          deposit_vnd: number | null
          due_offset_days: number
          end_date: string | null
          escalation: Json
          first_period_proration: string
          household_id: string
          id: string
          notes: string | null
          notice_days: number | null
          paid_through_date: string | null
          period_anchor: string
          property_id: string
          renewal_of_lease_id: string | null
          rent_vnd: number | null
          start_date: string | null
          status: string
          tax_payer: string
          tenant_party_id: string | null
          terminated_on: string | null
          termination_reason: string | null
          unit_id: string
          updated_at: string
          utilities_mode: string
        }
        Insert: {
          billing_cycle_months?: number
          created_at?: string
          created_by?: string | null
          declaring_party_id?: string | null
          deposit_vnd?: number | null
          due_offset_days?: number
          end_date?: string | null
          escalation?: Json
          first_period_proration?: string
          household_id: string
          id?: string
          notes?: string | null
          notice_days?: number | null
          paid_through_date?: string | null
          period_anchor?: string
          property_id: string
          renewal_of_lease_id?: string | null
          rent_vnd?: number | null
          start_date?: string | null
          status?: string
          tax_payer?: string
          tenant_party_id?: string | null
          terminated_on?: string | null
          termination_reason?: string | null
          unit_id: string
          updated_at?: string
          utilities_mode?: string
        }
        Update: {
          billing_cycle_months?: number
          created_at?: string
          created_by?: string | null
          declaring_party_id?: string | null
          deposit_vnd?: number | null
          due_offset_days?: number
          end_date?: string | null
          escalation?: Json
          first_period_proration?: string
          household_id?: string
          id?: string
          notes?: string | null
          notice_days?: number | null
          paid_through_date?: string | null
          period_anchor?: string
          property_id?: string
          renewal_of_lease_id?: string | null
          rent_vnd?: number | null
          start_date?: string | null
          status?: string
          tax_payer?: string
          tenant_party_id?: string | null
          terminated_on?: string | null
          termination_reason?: string | null
          unit_id?: string
          updated_at?: string
          utilities_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "leases_household_id_declaring_party_id_fkey"
            columns: ["household_id", "declaring_party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "leases_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_household_id_property_id_unit_id_fkey"
            columns: ["household_id", "property_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["household_id", "property_id", "id"]
          },
          {
            foreignKeyName: "leases_household_id_renewal_of_lease_id_fkey"
            columns: ["household_id", "renewal_of_lease_id"]
            isOneToOne: false
            referencedRelation: "lease_deposits"
            referencedColumns: ["household_id", "lease_id"]
          },
          {
            foreignKeyName: "leases_household_id_renewal_of_lease_id_fkey"
            columns: ["household_id", "renewal_of_lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "leases_household_id_tenant_party_id_fkey"
            columns: ["household_id", "tenant_party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      meter_readings: {
        Row: {
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          meter_id: string
          photo_document_id: string | null
          read_on: string
          reading: number
          reading_month: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          meter_id: string
          photo_document_id?: string | null
          read_on: string
          reading: number
          reading_month: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          meter_id?: string
          photo_document_id?: string | null
          read_on?: string
          reading?: number
          reading_month?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meter_readings_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_readings_household_id_meter_id_fkey"
            columns: ["household_id", "meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "meter_readings_household_id_photo_document_id_fkey"
            columns: ["household_id", "photo_document_id"]
            isOneToOne: false
            referencedRelation: "document_status"
            referencedColumns: ["household_id", "document_id"]
          },
          {
            foreignKeyName: "meter_readings_household_id_photo_document_id_fkey"
            columns: ["household_id", "photo_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      meters: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          kind: string
          pricing: Json
          property_id: string
          serial: string | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          kind: string
          pricing: Json
          property_id: string
          serial?: string | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          kind?: string
          pricing?: Json
          property_id?: string
          serial?: string | null
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meters_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meters_household_id_property_id_unit_id_fkey"
            columns: ["household_id", "property_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["household_id", "property_id", "id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          daily_cap: number | null
          household_id: string
          id: string
          kinds: string[]
          member_id: string
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          created_by?: string | null
          daily_cap?: number | null
          household_id: string
          id?: string
          kinds?: string[]
          member_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          daily_cap?: number | null
          household_id?: string
          id?: string
          kinds?: string[]
          member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_household_id_member_id_fkey"
            columns: ["household_id", "member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      ownership_shares: {
        Row: {
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          named_on_certificate: boolean
          party_id: string
          property_id: string
          share_bp: number
          since: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          named_on_certificate?: boolean
          party_id: string
          property_id: string
          share_bp: number
          since?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          named_on_certificate?: boolean
          party_id?: string
          property_id?: string
          share_bp?: number
          since?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ownership_shares_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ownership_shares_household_id_party_id_fkey"
            columns: ["household_id", "party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "ownership_shares_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "ownership_shares_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_completeness_facts"
            referencedColumns: ["household_id", "property_id"]
          },
          {
            foreignKeyName: "ownership_shares_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_list_rows"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      parcels: {
        Row: {
          area_m2: number | null
          certificate_id: string | null
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          map_sheet_no: string | null
          origin_text: string | null
          parcel_no: string | null
          property_id: string
          purposes: Json
          updated_at: string
          use_form: string | null
        }
        Insert: {
          area_m2?: number | null
          certificate_id?: string | null
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          map_sheet_no?: string | null
          origin_text?: string | null
          parcel_no?: string | null
          property_id: string
          purposes?: Json
          updated_at?: string
          use_form?: string | null
        }
        Update: {
          area_m2?: number | null
          certificate_id?: string | null
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          map_sheet_no?: string | null
          origin_text?: string | null
          parcel_no?: string | null
          property_id?: string
          purposes?: Json
          updated_at?: string
          use_form?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parcels_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parcels_household_id_property_id_certificate_id_fkey"
            columns: ["household_id", "property_id", "certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["household_id", "property_id", "id"]
          },
          {
            foreignKeyName: "parcels_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "parcels_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_completeness_facts"
            referencedColumns: ["household_id", "property_id"]
          },
          {
            foreignKeyName: "parcels_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_list_rows"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      parties: {
        Row: {
          address_text: string | null
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          household_id: string
          id: string
          id_last4: string | null
          kind: string
          member_id: string | null
          notes: string | null
          phone: string | null
          short_name: string | null
          tags: string[]
          tax_code: string | null
          updated_at: string
          zalo_phone: string | null
        }
        Insert: {
          address_text?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          household_id: string
          id?: string
          id_last4?: string | null
          kind: string
          member_id?: string | null
          notes?: string | null
          phone?: string | null
          short_name?: string | null
          tags?: string[]
          tax_code?: string | null
          updated_at?: string
          zalo_phone?: string | null
        }
        Update: {
          address_text?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          household_id?: string
          id?: string
          id_last4?: string | null
          kind?: string
          member_id?: string | null
          notes?: string | null
          phone?: string | null
          short_name?: string | null
          tags?: string[]
          tax_code?: string | null
          updated_at?: string
          zalo_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parties_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parties_household_id_member_id_fkey"
            columns: ["household_id", "member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          amount_vnd: number
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          invoice_id: string
          payment_id: string
          updated_at: string
        }
        Insert: {
          amount_vnd: number
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          invoice_id: string
          payment_id: string
          updated_at?: string
        }
        Update: {
          amount_vnd?: number
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          invoice_id?: string
          payment_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_household_id_invoice_id_fkey"
            columns: ["household_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_balances"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "payment_allocations_household_id_invoice_id_fkey"
            columns: ["household_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "payment_allocations_household_id_payment_id_fkey"
            columns: ["household_id", "payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_vnd: number
          bank_account_id: string | null
          bank_ref: string | null
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          idempotency_key: string | null
          memo: string | null
          method: string
          payer_party_id: string | null
          received_on: string
          source: string
          updated_at: string
        }
        Insert: {
          amount_vnd: number
          bank_account_id?: string | null
          bank_ref?: string | null
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          idempotency_key?: string | null
          memo?: string | null
          method: string
          payer_party_id?: string | null
          received_on: string
          source?: string
          updated_at?: string
        }
        Update: {
          amount_vnd?: number
          bank_account_id?: string | null
          bank_ref?: string | null
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          idempotency_key?: string | null
          memo?: string | null
          method?: string
          payer_party_id?: string | null
          received_on?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_bank_account_fkey"
            columns: ["household_id", "bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "payments_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_household_id_payer_party_id_fkey"
            columns: ["household_id", "payer_party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      properties: {
        Row: {
          acquired_on: string | null
          acquisition_kind: string | null
          acquisition_price_vnd: number | null
          boundary: unknown
          certificate_address_text: string | null
          code: string
          cover_photo_path: string | null
          created_at: string
          created_by: string | null
          current_address: Json | null
          deleted_at: string | null
          household_id: string
          id: string
          kind: string
          kind_details: Json
          legal_status: string
          location: unknown
          nickname: string
          notes: string | null
          updated_at: string
          use_mode: string
        }
        Insert: {
          acquired_on?: string | null
          acquisition_kind?: string | null
          acquisition_price_vnd?: number | null
          boundary?: unknown
          certificate_address_text?: string | null
          code: string
          cover_photo_path?: string | null
          created_at?: string
          created_by?: string | null
          current_address?: Json | null
          deleted_at?: string | null
          household_id: string
          id?: string
          kind: string
          kind_details?: Json
          legal_status?: string
          location?: unknown
          nickname: string
          notes?: string | null
          updated_at?: string
          use_mode: string
        }
        Update: {
          acquired_on?: string | null
          acquisition_kind?: string | null
          acquisition_price_vnd?: number | null
          boundary?: unknown
          certificate_address_text?: string | null
          code?: string
          cover_photo_path?: string | null
          created_at?: string
          created_by?: string | null
          current_address?: Json | null
          deleted_at?: string | null
          household_id?: string
          id?: string
          kind?: string
          kind_details?: Json
          legal_status?: string
          location?: unknown
          nickname?: string
          notes?: string | null
          updated_at?: string
          use_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      structures: {
        Row: {
          certificate_id: string | null
          completed_year: number | null
          created_at: string
          created_by: string | null
          floor_area_m2: number | null
          floors: number | null
          footprint_m2: number | null
          household_id: string
          id: string
          kind: string
          ownership_term: string | null
          property_id: string
          structure_text: string | null
          updated_at: string
        }
        Insert: {
          certificate_id?: string | null
          completed_year?: number | null
          created_at?: string
          created_by?: string | null
          floor_area_m2?: number | null
          floors?: number | null
          footprint_m2?: number | null
          household_id: string
          id?: string
          kind: string
          ownership_term?: string | null
          property_id: string
          structure_text?: string | null
          updated_at?: string
        }
        Update: {
          certificate_id?: string | null
          completed_year?: number | null
          created_at?: string
          created_by?: string | null
          floor_area_m2?: number | null
          floors?: number | null
          footprint_m2?: number | null
          household_id?: string
          id?: string
          kind?: string
          ownership_term?: string | null
          property_id?: string
          structure_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "structures_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "structures_household_id_property_id_certificate_id_fkey"
            columns: ["household_id", "property_id", "certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["household_id", "property_id", "id"]
          },
          {
            foreignKeyName: "structures_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "structures_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_completeness_facts"
            referencedColumns: ["household_id", "property_id"]
          },
          {
            foreignKeyName: "structures_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_list_rows"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      tax_rules: {
        Row: {
          effective_from: string
          effective_to: string | null
          kind: Database["public"]["Enums"]["tax_rule_kind"]
          note: string | null
          params: Json
          source_citation: string
        }
        Insert: {
          effective_from: string
          effective_to?: string | null
          kind: Database["public"]["Enums"]["tax_rule_kind"]
          note?: string | null
          params: Json
          source_citation: string
        }
        Update: {
          effective_from?: string
          effective_to?: string | null
          kind?: Database["public"]["Enums"]["tax_rule_kind"]
          note?: string | null
          params?: Json
          source_citation?: string
        }
        Relationships: []
      }
      test_clock: {
        Row: {
          frozen_now: string
          id: boolean
        }
        Insert: {
          frozen_now: string
          id?: boolean
        }
        Update: {
          frozen_now?: string
          id?: boolean
        }
        Relationships: []
      }
      units: {
        Row: {
          area_m2: number | null
          available_from: string | null
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          kind: string
          label: string
          list_rent_vnd: number | null
          property_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          area_m2?: number | null
          available_from?: string | null
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          kind: string
          label: string
          list_rent_vnd?: number | null
          property_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          area_m2?: number | null
          available_from?: string | null
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          kind?: string
          label?: string
          list_rent_vnd?: number | null
          property_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "units_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_completeness_facts"
            referencedColumns: ["household_id", "property_id"]
          },
          {
            foreignKeyName: "units_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_list_rows"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      utility_accounts: {
        Row: {
          created_at: string
          created_by: string | null
          customer_code: string | null
          holder_name: string | null
          household_id: string
          id: string
          kind: string
          note: string | null
          property_id: string
          provider: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_code?: string | null
          holder_name?: string | null
          household_id: string
          id?: string
          kind: string
          note?: string | null
          property_id: string
          provider?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_code?: string | null
          holder_name?: string | null
          household_id?: string
          id?: string
          kind?: string
          note?: string | null
          property_id?: string
          provider?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "utility_accounts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "utility_accounts_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "utility_accounts_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_completeness_facts"
            referencedColumns: ["household_id", "property_id"]
          },
          {
            foreignKeyName: "utility_accounts_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_list_rows"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "utility_accounts_household_id_property_id_unit_id_fkey"
            columns: ["household_id", "property_id", "unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["household_id", "property_id", "id"]
          },
        ]
      }
      worker_heartbeats: {
        Row: {
          agent_mode: string
          auth_mode: string
          host_label: string
          last_seen_at: string
          version: string
          worker_id: string
        }
        Insert: {
          agent_mode: string
          auth_mode: string
          host_label: string
          last_seen_at: string
          version: string
          worker_id: string
        }
        Update: {
          agent_mode?: string
          auth_mode?: string
          host_label?: string
          last_seen_at?: string
          version?: string
          worker_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      document_status: {
        Row: {
          document_id: string | null
          extraction_id: string | null
          household_id: string | null
          property_id: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "documents_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_completeness_facts"
            referencedColumns: ["household_id", "property_id"]
          },
          {
            foreignKeyName: "documents_household_id_property_id_fkey"
            columns: ["household_id", "property_id"]
            isOneToOne: false
            referencedRelation: "property_list_rows"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      invoice_balances: {
        Row: {
          allocated_vnd: number | null
          due_date: string | null
          household_id: string | null
          id: string | null
          issue_on: string | null
          lease_id: string | null
          number: string | null
          outstanding_vnd: number | null
          payment_status: string | null
          period_end: string | null
          period_start: string | null
          status: string | null
          total_vnd: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_household_id_lease_id_fkey"
            columns: ["household_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "lease_deposits"
            referencedColumns: ["household_id", "lease_id"]
          },
          {
            foreignKeyName: "invoices_household_id_lease_id_fkey"
            columns: ["household_id", "lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      lease_deposits: {
        Row: {
          held_vnd: number | null
          household_id: string | null
          lease_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leases_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      property_completeness_facts: {
        Row: {
          certificate_document_count: number | null
          has_acquisition: boolean | null
          has_current_address: boolean | null
          has_location: boolean | null
          household_id: string | null
          kind: string | null
          parcel_count: number | null
          parcel_without_area_id: string | null
          parcel_without_number_id: string | null
          photo_count: number | null
          property_id: string | null
          share_total_bp: number | null
          structure_count: number | null
          structure_without_floor_area_id: string | null
          utility_account_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      property_list_rows: {
        Row: {
          address_line: string | null
          certificate_address_text: string | null
          code: string | null
          commune_name: string | null
          cover_photo_path: string | null
          has_boundary: boolean | null
          household_id: string | null
          id: string | null
          kind: string | null
          lat: number | null
          leased_unit_count: number | null
          legacy_province_names: string[] | null
          legal_status: string | null
          lng: number | null
          monthly_rent_vnd: number | null
          nickname: string | null
          owner_party_ids: string[] | null
          province_code: string | null
          province_name: string | null
          search_text: string | null
          unit_count: number | null
          use_mode: string | null
          vacant_since: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activate_lease: {
        Args: { p_lease_id: string; p_paid_through?: string }
        Returns: {
          due_date: string
          id: string
          period_end: string
          period_start: string
          status: string
        }[]
      }
      admin_name_fold: { Args: { p_text: string }; Returns: string }
      admin_name_key: { Args: { p_text: string }; Returns: string }
      amend_lease: {
        Args: {
          p_billing_cycle_months?: number
          p_effective_period_start: string
          p_lease_id: string
          p_reason?: string
          p_rent_vnd?: number
        }
        Returns: string
      }
      apply_deposit: {
        Args: {
          p_amount_vnd: number
          p_idempotency_key: string
          p_invoice_id: string
          p_lease_id: string
          p_note?: string
          p_on_date: string
        }
        Returns: string
      }
      claim_abandoned_agent_job: {
        Args: { p_as_of: string; worker_id: string }
        Returns: {
          attempts: number
          created_at: string
          created_by: string | null
          error: string | null
          finished_at: string | null
          household_id: string
          id: string
          idempotency_key: string | null
          kind: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          priority: number
          requested_by: string | null
          result: Json | null
          run_after: string
          started_at: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "agent_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_agent_job: {
        Args: { p_as_of: string; worker_id: string }
        Returns: {
          attempts: number
          created_at: string
          created_by: string | null
          error: string | null
          finished_at: string | null
          household_id: string
          id: string
          idempotency_key: string | null
          kind: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          priority: number
          requested_by: string | null
          result: Json | null
          run_after: string
          started_at: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "agent_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_pending_invites: { Args: never; Returns: number }
      collection_candidates: {
        Args: { p_month: string }
        Returns: {
          allocated_vnd: number
          due_date: string
          household_id: string
          invoice_id: string
          lease_id: string
          number: string
          outstanding_vnd: number
          payment_status: string
          period_end: string
          period_start: string
          property_id: string
          property_nickname: string
          tenant_name: string
          tenant_party_id: string
          total_vnd: number
          unit_id: string
          unit_kind: string
          unit_label: string
        }[]
      }
      create_household: {
        Args: { p_display_name: string; p_name: string }
        Returns: string
      }
      end_expired_leases: { Args: { p_as_of: string }; Returns: number }
      enqueue_extract_document: {
        Args: { p_as_of: string; p_document_id: string }
        Returns: string
      }
      esta_unaccent: { Args: { p_text: string }; Returns: string }
      invite_member: {
        Args: {
          p_email: string
          p_household_id: string
          p_role: Database["public"]["Enums"]["member_role"]
        }
        Returns: string
      }
      invoice_qr_by_token: {
        Args: { p_token: string }
        Returns: {
          account_name: string
          account_no: string
          bank_bin: string
          bank_name: string
          memo_code: string
          outstanding_vnd: number
        }[]
      }
      issue_invoice_now: { Args: { p_invoice_id: string }; Returns: undefined }
      lease_schedule: {
        Args: { p_lease_ids: string[]; p_until: string }
        Returns: {
          covered_by_paid_through: boolean
          cycle_months: number
          due_date: string
          invoice_id: string
          invoice_status: string
          lease_id: string
          monthly_rent_vnd: number
          period_end: string
          period_start: string
          prorated: boolean
          rent_vnd: number
        }[]
      }
      national_id_indexes: { Args: { p_values: Json }; Returns: number[] }
      preview_activation: {
        Args: { p_lease_id: string; p_paid_through?: string }
        Returns: {
          due_date: string
          issues_now: boolean
          period_end: string
          period_start: string
          rent_vnd: number
        }[]
      }
      preview_lease_bills: {
        Args: { p_household_id: string; p_lease: Json; p_paid_through?: string }
        Returns: {
          due_date: string
          issues_now: boolean
          period_end: string
          period_start: string
          rent_vnd: number
        }[]
      }
      property_activity: {
        Args: { p_limit?: number; p_property_id: string }
        Returns: {
          action: string
          actor_id: string
          actor_kind: string
          actor_name: string
          at: string
          diff: Json
          id: number
        }[]
      }
      property_boundary: { Args: { p_property_id: string }; Returns: Json }
      record_deposit_entry: {
        Args: {
          p_amount_vnd: number
          p_idempotency_key: string
          p_kind: string
          p_lease_id: string
          p_note?: string
          p_on_date: string
        }
        Returns: string
      }
      record_payment: {
        Args: {
          p_amount_vnd: number
          p_bank_account_id?: string
          p_idempotency_key: string
          p_invoice_id: string
          p_invoice_ids?: string[]
          p_method: string
          p_owed_vnd: number
          p_received_on: string
        }
        Returns: {
          allocated_vnd: number
          amount_vnd: number
          id: string
        }[]
      }
      renew_lease: {
        Args: {
          p_end_date?: string
          p_increase_bps: number
          p_lease_id: string
          p_paid_through?: string
        }
        Returns: string
      }
      run_invoicing: {
        Args: { p_as_of: string; p_household_id: string; p_issued_at: string }
        Returns: {
          drafted: number
          issued: number
        }[]
      }
      save_expense: {
        Args: {
          p_amount_vnd: number
          p_category: string
          p_document_id?: string
          p_id: string
          p_new_document?: Json
          p_new_vendor?: Json
          p_note?: string
          p_paid_on: string
          p_property_id: string
          p_vendor_id?: string
        }
        Returns: {
          amount_vnd: number
          id: string
          property_id: string
        }[]
      }
      save_meter_readings: {
        Args: {
          p_property_id: string
          p_reading_month: string
          p_readings: Json
        }
        Returns: {
          issued: number
          saved: number
        }[]
      }
      search_documents: {
        Args: { p_query: string }
        Returns: {
          category: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          expires_on: string | null
          household_id: string
          id: string
          lease_id: string | null
          mime: string
          ocr_text: string | null
          page_count: number | null
          party_id: string | null
          property_id: string | null
          search_vector: unknown
          sensitivity: string
          sha256: string
          size_bytes: number
          storage_path: string
          tags: string[]
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "documents"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      set_my_locale: { Args: { p_locale: string }; Returns: undefined }
      set_ownership_shares: {
        Args: { p_property_id: string; p_shares: Json }
        Returns: undefined
      }
      set_property_boundary: {
        Args: { p_boundary: Json; p_property_id: string }
        Returns: Json
      }
      set_property_location: {
        Args: { p_lat?: number; p_lng?: number; p_property_id: string }
        Returns: Json
      }
      suggest_current_unit: {
        Args: { p_text: string }
        Returns: {
          commune_code: string
          commune_name: string
          matched_legacy_name: string
          merge_kind: Database["public"]["Enums"]["admin_merge_kind"]
          province_code: string
          province_name: string
          rank: number
          source: string
        }[]
      }
      terminate_lease: {
        Args: { p_lease_id: string; p_reason: string; p_terminated_on: string }
        Returns: undefined
      }
      undo_payment: { Args: { p_payment_id: string }; Returns: undefined }
      update_my_display_settings: {
        Args: { p_density: string; p_locale: string; p_text_scale: number }
        Returns: undefined
      }
      void_invoice: {
        Args: { p_invoice_id: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      admin_merge_kind: "whole" | "partial"
      admin_unit_kind: "province" | "city" | "ward" | "commune" | "special_zone"
      land_group: "agricultural" | "non_agricultural" | "unused"
      member_role: "viewer" | "member" | "admin"
      tax_rule_kind: "vn_rental_individual"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      admin_merge_kind: ["whole", "partial"],
      admin_unit_kind: ["province", "city", "ward", "commune", "special_zone"],
      land_group: ["agricultural", "non_agricultural", "unused"],
      member_role: ["viewer", "member", "admin"],
      tax_rule_kind: ["vn_rental_individual"],
    },
  },
} as const

