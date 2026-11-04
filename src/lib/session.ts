import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
      ]);
      const r = (roles ?? []).map((x) => x.role as string);
      return { id: u.user.id, email: u.user.email ?? "", name: profile?.full_name || u.user.email || "", roles: r, isAdmin: r.includes("admin") };
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
  whatsapp_group: boolean;
  onboarding_sent: boolean;
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
