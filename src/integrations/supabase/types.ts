export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      clients: {
        Row: {
          activation_status: string | null
          address: string | null
          billing_system: string | null
          cep: string | null
          city: string | null
          client_type: string
          clinic_name: string
          contract_id: string | null
          contract_signed: boolean
          contract_signed_at: string | null
          contract_verified_at: string | null
          created_at: string
          created_by: string | null
          current_scenario: string | null
          document: string | null
          email: string | null
          finalized_webhook_sent_at: string | null
          financial_id: string | null
          general_notes: string | null
          goal: string | null
          has_crc: boolean | null
          has_facebook: boolean | null
          has_marketing_experience: boolean | null
          ic_id: string | null
          id: string
          legal_name: string | null
          notes: string | null
          onboarding_completed_at: string | null
          onboarding_released_at: string | null
          onboarding_sent: boolean
          paid: boolean
          pain: string | null
          payment_date: string | null
          payment_method: string | null
          payment_modality: string | null
          payment_value: number | null
          phone: string | null
          products: string[]
          seller_id: string | null
          special_condition: string | null
          specialty: string | null
          started_at: string
          state: string | null
          updated_at: string
          value: number
          whatsapp: string | null
          whatsapp_group: boolean
        }
        Insert: {
          activation_status?: string | null
          address?: string | null
          billing_system?: string | null
          cep?: string | null
          city?: string | null
          client_type?: string
          clinic_name: string
          contract_id?: string | null
          contract_signed?: boolean
          contract_signed_at?: string | null
          contract_verified_at?: string | null
          created_at?: string
          created_by?: string | null
          current_scenario?: string | null
          document?: string | null
          email?: string | null
          finalized_webhook_sent_at?: string | null
          financial_id?: string | null
          general_notes?: string | null
          goal?: string | null
          has_crc?: boolean | null
          has_facebook?: boolean | null
          has_marketing_experience?: boolean | null
          ic_id?: string | null
          id?: string
          legal_name?: string | null
          notes?: string | null
          onboarding_completed_at?: string | null
          onboarding_released_at?: string | null
          onboarding_sent?: boolean
          paid?: boolean
          pain?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_modality?: string | null
          payment_value?: number | null
          phone?: string | null
          products?: string[]
          seller_id?: string | null
          special_condition?: string | null
          specialty?: string | null
          started_at?: string
          state?: string | null
          updated_at?: string
          value?: number
          whatsapp?: string | null
          whatsapp_group?: boolean
        }
        Update: {
          activation_status?: string | null
          address?: string | null
          billing_system?: string | null
          cep?: string | null
          city?: string | null
          client_type?: string
          clinic_name?: string
          contract_id?: string | null
          contract_signed?: boolean
          contract_signed_at?: string | null
          contract_verified_at?: string | null
          created_at?: string
          created_by?: string | null
          current_scenario?: string | null
          document?: string | null
          email?: string | null
          finalized_webhook_sent_at?: string | null
          financial_id?: string | null
          general_notes?: string | null
          goal?: string | null
          has_crc?: boolean | null
          has_facebook?: boolean | null
          has_marketing_experience?: boolean | null
          ic_id?: string | null
          id?: string
          legal_name?: string | null
          notes?: string | null
          onboarding_completed_at?: string | null
          onboarding_released_at?: string | null
          onboarding_sent?: boolean
          paid?: boolean
          pain?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_modality?: string | null
          payment_value?: number | null
          phone?: string | null
          products?: string[]
          seller_id?: string | null
          special_condition?: string | null
          specialty?: string | null
          started_at?: string
          state?: string | null
          updated_at?: string
          value?: number
          whatsapp?: string | null
          whatsapp_group?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "clients_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          email?: string
          full_name?: string
          id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_any_users: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "vendedor" | "cs"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "vendedor", "cs"],
    },
  },
} as const
