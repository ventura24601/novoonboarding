import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  operador: "Operador",
  vendedor: "Vendedor",
  cs: "CS",
};

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const [{ data: profile }, { data: roles }, { data: gestor }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
        supabase.from("produto_gestores").select("produto_id").eq("user_id", u.user.id),
      ]);
      const r = (roles ?? []).map((x) => x.role as AppRole);
      const isAdmin = r.includes("admin");
      return {
        id: u.user.id,
        email: u.user.email ?? "",
        name: profile?.full_name || u.user.email || "",
        avatarUrl: profile?.avatar_url ?? null,
        roles: r,
        isAdmin,
        isGestor: isAdmin || r.includes("gestor"),
        podeOperar: r.some((x) => x === "admin" || x === "gestor" || x === "operador" || x === "cs"),
        produtosGeridos: (gestor ?? []).map((g) => g.produto_id),
      };
    },
  });
}

export function useSellers() {
  return useQuery({
    queryKey: ["sellers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email").order("full_name");
      if (error) throw error;
      return data;
    },
  });
}

export function useProdutos() {
  return useQuery({
    queryKey: ["produtos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("produtos").select("*").order("nome");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export type OnboardingResumo = Database["public"]["Views"]["onboardings_resumo"]["Row"];

export function useOnboardings() {
  return useQuery({
    queryKey: ["onboardings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("onboardings_resumo").select("*").order("data_inicio", { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: 5 * 60_000,
  });
}

export type ClientRow = {
  id: string;
  clinic_name: string;
  phone: string | null;
  client_type: string;
  products: string[];
  seller_id: string | null;
  value: number;
  contract_signed: boolean;
  paid: boolean;
  contract_verified_at: string | null;
  onboarding_released_at: string | null;
  started_at: string;
  onboarding_completed_at: string | null;
  contract_signed_at: string | null;
  created_at: string;
  specialty: string | null;
  email: string | null;
  activation_status: string | null;
  billing_system: string | null;
  payment_method: string | null;
  city: string | null;
  state: string | null;
};

export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((c) => ({ ...c, value: Number(c.value) })) as ClientRow[];
    },
  });
}
