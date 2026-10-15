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
      properties: {
        Row: {
          certificate_address_text: string | null
          code: string
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
          updated_at: string
          use_mode: string
        }
        Insert: {
          certificate_address_text?: string | null
          code: string
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
          updated_at?: string
          use_mode: string
        }
        Update: {
          certificate_address_text?: string | null
          code?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_name_fold: { Args: { p_text: string }; Returns: string }
      admin_name_key: { Args: { p_text: string }; Returns: string }
      claim_pending_invites: { Args: never; Returns: number }
      create_household: {
        Args: { p_display_name: string; p_name: string }
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
      set_my_locale: { Args: { p_locale: string }; Returns: undefined }
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
      update_my_display_settings: {
        Args: { p_density: string; p_locale: string; p_text_scale: number }
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

