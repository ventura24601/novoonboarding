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
          codigo_externo: string | null
          contato_nome: string | null
          contract_id: string | null
          contract_signed: boolean
          contract_signed_at: string | null
          contract_verification_source: string | null
          contract_verified_at: string | null
          contract_verified_by: string | null
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
          segmento: string | null
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
          codigo_externo?: string | null
          contato_nome?: string | null
          contract_id?: string | null
          contract_signed?: boolean
          contract_signed_at?: string | null
          contract_verification_source?: string | null
          contract_verified_at?: string | null
          contract_verified_by?: string | null
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
          segmento?: string | null
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
          codigo_externo?: string | null
          contato_nome?: string | null
          contract_id?: string | null
          contract_signed?: boolean
          contract_signed_at?: string | null
          contract_verification_source?: string | null
          contract_verified_at?: string | null
          contract_verified_by?: string | null
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
          segmento?: string | null
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
        Relationships: []
      }
      feriados: {
        Row: {
          data: string
          nome: string
        }
        Insert: {
          data: string
          nome: string
        }
        Update: {
          data?: string
          nome?: string
        }
        Relationships: []
      }
      modelo_checklist: {
        Row: {
          etapa_id: string
          id: string
          obrigatorio: boolean
          ordem: number
          texto: string
        }
        Insert: {
          etapa_id: string
          id?: string
          obrigatorio?: boolean
          ordem?: number
          texto: string
        }
        Update: {
          etapa_id?: string
          id?: string
          obrigatorio?: boolean
          ordem?: number
          texto?: string
        }
        Relationships: []
      }
      modelo_etapas: {
        Row: {
          descricao: string | null
          exige_checklist: boolean
          fase_id: string | null
          id: string
          modelo_id: string
          nome: string
          obrigatoria: boolean
          ordem: number
          papel_id: string | null
          pausa_sla_aguardando_cliente: boolean
          principal: boolean
          sla_dias: number
        }
        Insert: {
          descricao?: string | null
          exige_checklist?: boolean
          fase_id?: string | null
          id?: string
          modelo_id: string
          nome: string
          obrigatoria?: boolean
          ordem?: number
          papel_id?: string | null
          pausa_sla_aguardando_cliente?: boolean
          principal?: boolean
          sla_dias?: number
        }
        Update: {
          descricao?: string | null
          exige_checklist?: boolean
          fase_id?: string | null
          id?: string
          modelo_id?: string
          nome?: string
          obrigatoria?: boolean
          ordem?: number
          papel_id?: string | null
          pausa_sla_aguardando_cliente?: boolean
          principal?: boolean
          sla_dias?: number
        }
        Relationships: []
      }
      modelo_fases: {
        Row: {
          cor: string
          id: string
          modelo_id: string
          nome: string
          ordem: number
        }
        Insert: {
          cor?: string
          id?: string
          modelo_id: string
          nome: string
          ordem?: number
        }
        Update: {
          cor?: string
          id?: string
          modelo_id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      modelos: {
        Row: {
          calendario: string
          created_by: string | null
          id: string
          limiar_risco_pct: number
          nome: string
          produto_id: string
          status: string
          updated_at: string
          versao: number
        }
        Insert: {
          calendario?: string
          created_by?: string | null
          id?: string
          limiar_risco_pct?: number
          nome: string
          produto_id: string
          status?: string
          updated_at?: string
          versao?: number
        }
        Update: {
          calendario?: string
          created_by?: string | null
          id?: string
          limiar_risco_pct?: number
          nome?: string
          produto_id?: string
          status?: string
          updated_at?: string
          versao?: number
        }
        Relationships: []
      }
      onboarding_checklist: {
        Row: {
          feito: boolean
          feito_em: string | null
          feito_por: string | null
          id: string
          obrigatorio: boolean
          onboarding_etapa_id: string
          ordem: number
          texto: string
        }
        Insert: {
          feito?: boolean
          feito_em?: string | null
          feito_por?: string | null
          id?: string
          obrigatorio?: boolean
          onboarding_etapa_id: string
          ordem?: number
          texto: string
        }
        Update: {
          feito?: boolean
          feito_em?: string | null
          feito_por?: string | null
          id?: string
          obrigatorio?: boolean
          onboarding_etapa_id?: string
          ordem?: number
          texto?: string
        }
        Relationships: []
      }
      onboarding_etapas: {
        Row: {
          concluida_em: string | null
          concluida_por: string | null
          descricao: string | null
          dias_pausados: number
          exige_checklist: boolean
          fase_cor: string | null
          fase_nome: string | null
          id: string
          iniciada_em: string | null
          modelo_etapa_id: string | null
          motivo: string | null
          nome: string
          obrigatoria: boolean
          onboarding_id: string
          ordem: number
          papel_id: string | null
          pausa_sla_aguardando_cliente: boolean
          pausada_desde: string | null
          prazo_em: string | null
          principal: boolean
          responsavel_id: string | null
          sla_dias: number
          status: string
        }
        Insert: {
          concluida_em?: string | null
          concluida_por?: string | null
          descricao?: string | null
          dias_pausados?: number
          exige_checklist?: boolean
          fase_cor?: string | null
          fase_nome?: string | null
          id?: string
          iniciada_em?: string | null
          modelo_etapa_id?: string | null
          motivo?: string | null
          nome: string
          obrigatoria?: boolean
          onboarding_id: string
          ordem?: number
          papel_id?: string | null
          pausa_sla_aguardando_cliente?: boolean
          pausada_desde?: string | null
          prazo_em?: string | null
          principal?: boolean
          responsavel_id?: string | null
          sla_dias?: number
          status?: string
        }
        Update: {
          concluida_em?: string | null
          concluida_por?: string | null
          descricao?: string | null
          dias_pausados?: number
          exige_checklist?: boolean
          fase_cor?: string | null
          fase_nome?: string | null
          id?: string
          iniciada_em?: string | null
          modelo_etapa_id?: string | null
          motivo?: string | null
          nome?: string
          obrigatoria?: boolean
          onboarding_id?: string
          ordem?: number
          papel_id?: string | null
          pausa_sla_aguardando_cliente?: boolean
          pausada_desde?: string | null
          prazo_em?: string | null
          principal?: boolean
          responsavel_id?: string | null
          sla_dias?: number
          status?: string
        }
        Relationships: []
      }
      onboarding_eventos: {
        Row: {
          created_at: string
          de: string | null
          detalhe: string | null
          id: string
          onboarding_etapa_id: string | null
          onboarding_id: string
          para: string | null
          tipo: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          de?: string | null
          detalhe?: string | null
          id?: string
          onboarding_etapa_id?: string | null
          onboarding_id: string
          para?: string | null
          tipo: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          de?: string | null
          detalhe?: string | null
          id?: string
          onboarding_etapa_id?: string | null
          onboarding_id?: string
          para?: string | null
          tipo?: string
          user_id?: string | null
        }
        Relationships: []
      }
      onboarding_notas: {
        Row: {
          created_at: string
          id: string
          onboarding_id: string
          texto: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          onboarding_id: string
          texto: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          onboarding_id?: string
          texto?: string
          user_id?: string | null
        }
        Relationships: []
      }
      onboarding_responsaveis: {
        Row: {
          onboarding_id: string
          papel_id: string
          user_id: string
        }
        Insert: {
          onboarding_id: string
          papel_id: string
          user_id: string
        }
        Update: {
          onboarding_id?: string
          papel_id?: string
          user_id?: string
        }
        Relationships: []
      }
      onboardings: {
        Row: {
          campos: Json
          cliente_id: string
          created_at: string
          created_by: string | null
          data_inicio: string
          data_termino: string | null
          id: string
          modelo_id: string | null
          modelo_versao: number | null
          motivo: string | null
          previsao_termino: string | null
          produto_id: string
          status: string
        }
        Insert: {
          campos?: Json
          cliente_id: string
          created_at?: string
          created_by?: string | null
          data_inicio?: string
          data_termino?: string | null
          id?: string
          modelo_id?: string | null
          modelo_versao?: number | null
          motivo?: string | null
          previsao_termino?: string | null
          produto_id: string
          status?: string
        }
        Update: {
          campos?: Json
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          data_inicio?: string
          data_termino?: string | null
          id?: string
          modelo_id?: string | null
          modelo_versao?: number | null
          motivo?: string | null
          previsao_termino?: string | null
          produto_id?: string
          status?: string
        }
        Relationships: []
      }
      papeis: {
        Row: {
          cor: string
          id: string
          nome: string
        }
        Insert: {
          cor?: string
          id?: string
          nome: string
        }
        Update: {
          cor?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      produto_campos: {
        Row: {
          chave: string
          editavel_por: string[]
          id: string
          obrigatorio: boolean
          opcoes: Json
          ordem: number
          produto_id: string
          rotulo: string
          tipo: string
          visivel_padrao: boolean
        }
        Insert: {
          chave: string
          editavel_por?: string[]
          id?: string
          obrigatorio?: boolean
          opcoes?: Json
          ordem?: number
          produto_id: string
          rotulo: string
          tipo: string
          visivel_padrao?: boolean
        }
        Update: {
          chave?: string
          editavel_por?: string[]
          id?: string
          obrigatorio?: boolean
          opcoes?: Json
          ordem?: number
          produto_id?: string
          rotulo?: string
          tipo?: string
          visivel_padrao?: boolean
        }
        Relationships: []
      }
      produto_gestores: {
        Row: {
          produto_id: string
          user_id: string
        }
        Insert: {
          produto_id: string
          user_id: string
        }
        Update: {
          produto_id?: string
          user_id?: string
        }
        Relationships: []
      }
      produtos: {
        Row: {
          ativo: boolean
          cor: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          cor?: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          cor?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
        }
        Insert: {
          ativo?: boolean
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id: string
        }
        Update: {
          ativo?: boolean
          avatar_url?: string | null
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
      visoes: {
        Row: {
          config: Json
          dono_id: string
          id: string
          nome: string
          padrao_do_produto: boolean
          produto_id: string | null
          publica: boolean
        }
        Insert: {
          config?: Json
          dono_id?: string
          id?: string
          nome: string
          padrao_do_produto?: boolean
          produto_id?: string | null
          publica?: boolean
        }
        Update: {
          config?: Json
          dono_id?: string
          id?: string
          nome?: string
          padrao_do_produto?: boolean
          produto_id?: string | null
          publica?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      clientes: {
        Row: {
          cidade: string | null
          codigo_externo: string | null
          contato_nome: string | null
          created_at: string | null
          email: string | null
          id: string | null
          nome: string | null
          produtos: string[] | null
          segmento: string | null
          status_contrato: string | null
          telefone: string | null
          uf: string | null
        }
        Relationships: []
      }
      onboarding_etapas_situacao: {
        Row: {
          concluida_em: string | null
          concluida_por: string | null
          descricao: string | null
          dias_decorridos: number | null
          dias_pausados: number | null
          exige_checklist: boolean | null
          fase_cor: string | null
          fase_nome: string | null
          id: string | null
          iniciada_em: string | null
          modelo_etapa_id: string | null
          motivo: string | null
          nome: string | null
          obrigatoria: boolean | null
          onboarding_id: string | null
          ordem: number | null
          papel_id: string | null
          pausa_sla_aguardando_cliente: boolean | null
          pausada_desde: string | null
          prazo_em: string | null
          principal: boolean | null
          responsavel_id: string | null
          situacao: string | null
          sla_dias: number | null
          status: string | null
        }
        Relationships: []
      }
      onboardings_resumo: {
        Row: {
          calendario: string | null
          campos: Json | null
          cliente_id: string | null
          cliente_nome: string | null
          created_at: string | null
          created_by: string | null
          data_inicio: string | null
          data_termino: string | null
          etapa_atual_fase: string | null
          etapa_atual_id: string | null
          etapa_atual_nome: string | null
          etapa_atual_prazo: string | null
          etapa_atual_responsavel_id: string | null
          etapa_atual_situacao: string | null
          etapas_feitas: number | null
          etapas_total: number | null
          id: string | null
          limiar_risco_pct: number | null
          modelo_id: string | null
          modelo_versao: number | null
          motivo: string | null
          previsao_termino: string | null
          produto_cor: string | null
          produto_id: string | null
          produto_nome: string | null
          situacao: string | null
          status: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      criar_modelo: { Args: { _produto_id: string; _nome: string }; Returns: string }
      duplicar_modelo: { Args: { _modelo_id: string }; Returns: string }
      ordenar_etapas_modelo: { Args: { _modelo_id: string; _etapas: Json }; Returns: undefined }
      publicar_modelo: { Args: { _modelo_id: string }; Returns: undefined }
      dias_entre: { Args: { _a: string; _b: string; _calendario?: string }; Returns: number }
      gere_produto: { Args: { _produto_id: string }; Returns: boolean }
      has_any_users: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      iniciar_onboarding: { Args: { _cliente_id: string; _produto_id: string }; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      pode_operar: { Args: never; Returns: boolean }
      somar_dias: { Args: { _data: string; _n: number; _calendario?: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "vendedor" | "cs" | "gestor" | "operador"
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
      app_role: ["admin", "vendedor", "cs", "gestor", "operador"],
    },
  },
} as const
