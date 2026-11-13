import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Plus, Waypoints, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useProdutos } from "@/lib/session";
import { Card, ColorBadge, EmptyState, FilterLabel, PageHeader } from "@/components/app/ui";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/vinculos")({
  head: () => ({ meta: [{ title: "Produtos e onboardings — ICOM" }] }),
  component: Vinculos,
});

function Vinculos() {
  const { data: me } = useMe();
  const { data: produtos = [] } = useProdutos();
  const qc = useQueryClient();
  const admin = !!me?.isAdmin;
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["produto-onboardings"],
    queryFn: async () => {
      const [v, m] = await Promise.all([
        supabase.from("produto_onboardings").select("produto_id, onboarding_produto_id"),
        supabase
          .from("modelos")
          .select("produto_id, nome, versao, status")
          .neq("status", "arquivado"),
      ]);
      if (v.error) throw v.error;
      return { vinculos: v.data, modelos: m.data ?? [] };
    },
  });
  const vinculos = useMemo(() => data?.vinculos ?? [], [data]);
  const modelos = useMemo(() => data?.modelos ?? [], [data]);

  // Linhas de onboarding: produtos que têm modelo (publicado ou rascunho).
  const linhas = useMemo(
    () => produtos.filter((p) => modelos.some((m) => m.produto_id === p.id)),
    [produtos, modelos],
  );
  const ativos = produtos.filter(
    (p) => p.ativo && (!q || p.nome.toLowerCase().includes(q.toLowerCase())),
  );

  function modeloDe(produtoId: string) {
    const pub = modelos.find((m) => m.produto_id === produtoId && m.status === "publicado");
    if (pub) return { texto: `${pub.nome} · v${pub.versao}`, ok: true };
    const ras = modelos.find((m) => m.produto_id === produtoId);
    return { texto: ras ? "Só rascunho: publique o modelo" : "Sem modelo", ok: false };
  }

  async function adicionar(produtoId: string, alvo: string) {
    const { error } = await supabase
      .from("produto_onboardings")
      .insert({ produto_id: produtoId, onboarding_produto_id: alvo });
    if (error) {
      toast.error(
        error.code === "23505" ? "Este vínculo já existe." : "Não foi possível vincular.",
      );
      return;
    }
    await qc.invalidateQueries({ queryKey: ["produto-onboardings"] });
    toast.success("Vínculo criado. Vale para os próximos clientes enviados para onboarding.");
  }

  async function remover(produtoId: string, alvo: string) {
    const { error } = await supabase
      .from("produto_onboardings")
      .delete()
      .eq("produto_id", produtoId)
      .eq("onboarding_produto_id", alvo);
    if (error) {
      toast.error("Não foi possível remover.");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["produto-onboardings"] });
    toast.success("Vínculo removido. Onboardings que já começaram continuam.");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produtos e onboardings"
        description="Quais onboardings cada produto vendido inicia quando o cliente é enviado para onboarding. Um produto pode iniciar vários."
      />

      {linhas.length === 0 && !isLoading ? (
        <EmptyState
          icon={Waypoints}
          title="Nenhum modelo de onboarding ainda"
          description="Crie e publique um modelo em Modelos de onboarding para poder vinculá-lo aos produtos."
        />
      ) : (
        <>
          <Card className="flex flex-wrap items-end gap-4 p-4">
            <div className="w-64">
              <FilterLabel htmlFor="bp">Produto</FilterLabel>
              <Input
                id="bp"
                placeholder="Buscar produto..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            {!admin && (
              <p className="text-xs text-muted-foreground">
                Só administradores alteram os vínculos.
              </p>
            )}
          </Card>

          <Card className="divide-y">
            {ativos.map((p) => {
              const meus = vinculos.filter((v) => v.produto_id === p.id);
              const disponiveis = linhas.filter(
                (l) => !meus.some((v) => v.onboarding_produto_id === l.id),
              );
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div className="w-48 shrink-0">
                    <ColorBadge color={p.cor}>{p.nome}</ColorBadge>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Quando vendido, inicia:
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    {meus.length === 0 && (
                      <span className="text-sm text-muted-foreground">Nenhum onboarding</span>
                    )}
                    {meus.map((v) => {
                      const alvo = produtos.find((x) => x.id === v.onboarding_produto_id);
                      if (!alvo) return null;
                      const m = modeloDe(alvo.id);
                      return (
                        <span
                          key={v.onboarding_produto_id}
                          className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ${m.ok ? "bg-card" : "border-[#FCD34D] bg-[#FFFBEB]"}`}
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: alvo.cor }}
                          />
                          <span className="leading-tight">
                            <span className="block font-medium">{alvo.nome}</span>
                            <span
                              className={`block text-[11px] ${m.ok ? "text-muted-foreground" : "text-[#B45309]"}`}
                            >
                              {m.texto}
                            </span>
                          </span>
                          {admin && (
                            <button
                              type="button"
                              onClick={() => remover(p.id, alvo.id)}
                              aria-label={`Remover ${alvo.nome} de ${p.nome}`}
                              className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-[#FEE2E2] hover:text-[#B91C1C]"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </span>
                      );
                    })}
                    {admin && disponiveis.length > 0 && (
                      <Select value="" onValueChange={(alvo) => adicionar(p.id, alvo)}>
                        <SelectTrigger
                          className="h-9 w-auto gap-1.5 border-dashed text-muted-foreground"
                          aria-label={`Adicionar onboarding a ${p.nome}`}
                        >
                          <Plus className="h-3.5 w-3.5" />{" "}
                          <SelectValue placeholder="Adicionar onboarding" />
                        </SelectTrigger>
                        <SelectContent>
                          {disponiveis.map((l) => (
                            <SelectItem key={l.id} value={l.id}>
                              {l.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
          <p className="text-xs text-muted-foreground">
            Os modelos de cada onboarding ficam em{" "}
            <Link to="/modelos" className="font-medium text-primary hover:underline">
              Modelos de onboarding
            </Link>
            . Mudanças aqui valem para os próximos envios; para um cliente já enviado, use "Enviar
            para onboarding" na ficha dele para criar o que faltar.
          </p>
        </>
      )}
    </div>
  );
}
