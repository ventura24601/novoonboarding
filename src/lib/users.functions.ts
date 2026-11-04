import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLES = ["admin", "gestor", "operador", "vendedor", "cs"] as const;

const createSchema = z.object({
  full_name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  /** Sem senha: envia convite por e-mail (Supabase Auth). */
  password: z.union([z.literal(""), z.string().min(8).max(72)]),
  role: z.enum(ROLES),
  redirectTo: z.string().url().max(500).optional(),
});

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");
  if (!data || data.length === 0) throw new Error("Apenas administradores podem gerenciar usuários.");
}

export const createTeamUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const res = data.password
      ? await supabaseAdmin.auth.admin.createUser({
          email: data.email, password: data.password, email_confirm: true, user_metadata: { full_name: data.full_name },
        })
      : await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
          data: { full_name: data.full_name }, ...(data.redirectTo ? { redirectTo: data.redirectTo } : {}),
        });
    const user = res.data.user;
    if (res.error || !user) throw new Error(res.error?.message ?? "Erro ao criar usuário");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", user.id);
    await supabaseAdmin.from("user_roles").insert({ user_id: user.id, role: data.role });
    return { id: user.id, invited: !data.password };
  });

export const resetTeamUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid(), password: z.string().min(8).max(72) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Um perfil por usuário. O admin não pode remover o próprio acesso de admin. */
export const setTeamUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid(), role: z.enum(ROLES) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId && data.role !== "admin") throw new Error("Você não pode remover o seu próprio perfil de administrador.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: data.role });
    if (error) throw new Error(error.message);
    if (data.role !== "gestor") await supabaseAdmin.from("produto_gestores").delete().eq("user_id", data.userId);
    return { ok: true };
  });

export const setTeamUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid(), ativo: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId && !data.ativo) throw new Error("Você não pode desativar a sua própria conta.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("profiles").update({ ativo: data.ativo }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    // Usuário desativado não entra mais (ban longo); reativar remove o bloqueio.
    await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: data.ativo ? "none" : "876000h" });
    return { ok: true };
  });

export const setProdutoGestores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid(), produtoIds: z.array(z.string().uuid()).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("produto_gestores").delete().eq("user_id", data.userId);
    if (data.produtoIds.length) {
      const { error } = await supabaseAdmin.from("produto_gestores").insert(data.produtoIds.map((produto_id) => ({ produto_id, user_id: data.userId })));
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const listTeamUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: profiles }, { data: roles }, { data: gestores }] = await Promise.all([
      context.supabase.from("profiles").select("id, full_name, email, avatar_url, ativo, created_at").order("created_at"),
      context.supabase.from("user_roles").select("user_id, role"),
      context.supabase.from("produto_gestores").select("user_id, produto_id"),
    ]);
    return (profiles ?? []).map((p) => ({
      ...p,
      roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as string),
      produtos: (gestores ?? []).filter((g) => g.user_id === p.id).map((g) => g.produto_id),
    }));
  });
