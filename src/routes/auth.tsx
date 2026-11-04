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
      { title: "Entrar — Icom Vendas & CS" },
      { name: "description", content: "Acesso da equipe comercial e de CS da Icom." },
      { property: "og:title", content: "Entrar — Icom Vendas & CS" },
      { property: "og:description", content: "Acesso da equipe comercial e de CS da Icom." },
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
      if (data.session) navigate({ to: "/dashboard", replace: true });
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
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const setup = hasUsers === false;

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden bg-hero p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <span className="font-display text-xl font-semibold">Icom</span>
        <div>
          <h1 className="text-4xl font-semibold leading-tight">Da venda ao onboarding,<br />em um só lugar.</h1>
          <p className="mt-4 max-w-md opacity-80">Contratos, grupos de WhatsApp, onboarding e comissões da equipe.</p>
        </div>
        <span className="text-sm opacity-60">Uso interno</span>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h2 className="text-2xl font-semibold">{setup ? "Criar administrador" : "Entrar"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {setup ? "Primeiro acesso: crie a conta que vai gerenciar a equipe." : "Use o acesso criado pelo seu administrador."}
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
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading || hasUsers === null}>
            {loading ? "Aguarde..." : setup ? "Criar conta" : "Entrar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
