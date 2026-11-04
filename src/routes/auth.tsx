import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — Central de Onboarding ICOM" },
      { name: "description", content: "Acesso da equipe ICOM." },
      { property: "og:title", content: "Entrar — Central de Onboarding ICOM" },
      { property: "og:description", content: "Acesso da equipe ICOM." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [hasUsers, setHasUsers] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/painel", replace: true });
    });
    supabase.rpc("has_any_users").then(({ data }) => setHasUsers(Boolean(data)));
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (hasUsers === false) {
        if (password.length < 8) throw new Error("A senha precisa ter ao menos 8 caracteres.");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Conta de administrador criada. Confirme pelo link enviado ao seu e-mail.");
          setHasUsers(true);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error("E-mail ou senha inválidos.");
      }
      navigate({ to: "/painel", replace: true });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const setup = hasUsers === false;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-sidebar px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-base font-black text-white">IC</span>
        <span className="leading-tight">
          <span className="block text-lg font-bold tracking-wide text-white">ICOM</span>
          <span className="block text-xs text-sidebar-foreground/70">Central de Onboarding</span>
        </span>
      </div>
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-lg border border-white/10 bg-card p-7 shadow-2xl">
        <div>
          <h2 className="text-xl font-semibold">{setup ? "Criar administrador" : "Entrar"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {setup ? "Primeiro acesso: crie a conta que vai gerenciar a equipe." : "Contratos e onboarding de clientes, do pagamento à ativação."}
          </p>
        </div>
        {setup && (
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <Input id="password" type="password" autoComplete={setup ? "new-password" : "current-password"} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" variant="dark" className="w-full" disabled={loading || hasUsers === null}>
          {loading ? "Aguarde..." : setup ? "Criar conta" : "Entrar"}
        </Button>
      </form>
      <p className="mt-6 text-xs text-sidebar-foreground/50">Uso interno · ICOM</p>
    </div>
  );
}
