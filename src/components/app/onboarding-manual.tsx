/**
 * Entrada manual no onboarding (downgrade ou reonboarding), sem passar pela etapa de contratos.
 * O cliente é buscado na base total de clientes (clientes_base, coletada da API de gestão), que preenche
 * nome, carteira e os onboardings sugeridos. A gravação é toda na função onboarding_manual (migração 0018).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check, Search, UserPlus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProdutos } from "@/lib/session";
import { CARTEIRAS, carteiraDoContexto } from "@/lib/carteira";
import { onboardingsSugeridos } from "@/lib/plano-onboarding";
import { produtoCanonico } from "@/lib/retencao";
import { CarteiraBadge, ColorBadge, FilterLabel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ClienteBase = {
  id_cliente: string;
  nome: string | null;
  contexto: string | null;
  produtos: string[];
  ativo: boolean;
  cliente_id: string | null;
  carteira: string | null;
};

const TIPOS = [
  { value: "downgrade", label: "Downgrade", ajuda: "O cliente trocou para um plano menor." },
  {
    value: "reonboarding",
    label: "Reonboarding",
    ajuda: "Refazer o onboarding de quem já é cliente.",
  },
] as const;

function useDebounce<T>(v: T, ms: number) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function OnboardingManualDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: produtos = [] } = useProdutos();
  const [tipo, setTipo] = useState<"downgrade" | "reonboarding" | "">("");
  const [busca, setBusca] = useState("");
  const termo = useDebounce(busca.trim(), 300);
  const [escolhido, setEscolhido] = useState<ClienteBase | null>(null);
  const [semBase, setSemBase] = useState(false);
  const [nome, setNome] = useState("");
  const [carteira, setCarteira] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  const { data: achados = [], isFetching } = useQuery({
    queryKey: ["buscar-clientes-base", termo],
    enabled: termo.length >= 2 && !escolhido && !semBase,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("buscar_clientes_base", { _q: termo });
      if (error) throw error;
      return (data ?? []) as unknown as ClienteBase[];
    },
  });

  const { data: cfg } = useQuery({
    queryKey: ["onboarding-manual-cfg"],
    queryFn: async () => {
      const [v, m] = await Promise.all([
        supabase.from("produto_onboardings").select("produto_id, onboarding_produto_id"),
        supabase.from("modelos").select("produto_id").eq("status", "publicado"),
      ]);
      if (v.error) throw v.error;
      if (m.error) throw m.error;
      return {
        vinculos: v.data ?? [],
        comModelo: new Set((m.data ?? []).map((x) => x.produto_id)),
      };
    },
  });

  // Linhas de onboarding que podem ser iniciadas (têm modelo publicado).
  const linhas = useMemo(
    () => produtos.filter((p) => p.ativo && cfg?.comModelo.has(p.id)),
    [produtos, cfg],
  );

  function escolher(c: ClienteBase) {
    setEscolhido(c);
    setNome(c.nome ?? "");
    setCarteira(c.carteira ?? carteiraDoContexto(c.contexto) ?? "");
    if (cfg)
      setMarcados(
        new Set(
          onboardingsSugeridos({
            produtosBase: c.produtos ?? [],
            produtos,
            vinculos: cfg.vinculos,
            comModelo: cfg.comModelo,
            canonico: produtoCanonico,
          }),
        ),
      );
  }

  function limpar() {
    setEscolhido(null);
    setSemBase(false);
    setNome("");
    setCarteira("");
    setMarcados(new Set());
  }

  const temCliente = !!escolhido || semBase;
  const podeSalvar =
    !!tipo &&
    temCliente &&
    marcados.size > 0 &&
    (!!escolhido?.cliente_id || nome.trim().length >= 2);

  async function salvar() {
    if (!podeSalvar) return;
    setSalvando(true);
    const { data, error } = await supabase.rpc("onboarding_manual", {
      _tipo: tipo,
      _produtos: [...marcados],
      _id_base: escolhido?.id_cliente ?? null,
      _nome: nome.trim() || null,
      _carteira: carteira || null,
      _cliente_id: escolhido?.cliente_id ?? null,
    });
    setSalvando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const r = data as { cliente_id: string; criados: number; ignorados: string[] };
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["onboardings"] }),
      qc.invalidateQueries({ queryKey: ["clientes-view"] }),
    ]);
    toast.success(
      `${r.criados} onboarding${r.criados === 1 ? "" : "s"} iniciado${r.criados === 1 ? "" : "s"}` +
        (r.ignorados?.length ? ` · já em andamento: ${r.ignorados.join(", ")}` : ""),
    );
    onClose();
    navigate({ to: "/clientes/$id", params: { id: r.cliente_id }, hash: "onboarding" });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Adicionar cliente ao onboarding</DialogTitle>
          <DialogDescription>
            Para downgrade ou reonboarding. O cliente vem da base de clientes e não passa pela etapa
            de contratos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <FilterLabel>Motivo *</FilterLabel>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {TIPOS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTipo(t.value)}
                  aria-pressed={tipo === t.value}
                  className={`rounded-lg border p-3 text-left text-sm transition ${tipo === t.value ? "border-primary bg-secondary" : "hover:bg-[#F8FAFC]"}`}
                >
                  <span className="font-semibold">{t.label}</span>
                  <span className="block text-xs text-muted-foreground">{t.ajuda}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <FilterLabel htmlFor="busca-base">Cliente *</FilterLabel>
            {temCliente ? (
              <div className="mt-1 space-y-3 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 text-sm">
                    {escolhido ? (
                      <>
                        <div className="font-semibold">{escolhido.nome || "Sem nome"}</div>
                        <div className="text-xs text-muted-foreground">
                          ID {escolhido.id_cliente}
                          {escolhido.contexto ? ` · ${escolhido.contexto}` : ""}
                          {escolhido.ativo ? "" : " · sem produto ativo na base"}
                        </div>
                        {escolhido.cliente_id && (
                          <div className="mt-1 text-xs text-[#047857]">
                            Já cadastrado aqui: os onboardings entram na ficha que existe.
                          </div>
                        )}
                        {escolhido.produtos?.length > 0 && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Produtos hoje: {escolhido.produtos.join(", ")}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-muted-foreground">Cliente fora da base</div>
                    )}
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={limpar}>
                    <X /> Trocar
                  </Button>
                </div>
                {!escolhido?.cliente_id && (
                  <div>
                    <FilterLabel htmlFor="nome-cli">Nome da clínica *</FilterLabel>
                    <Input id="nome-cli" value={nome} onChange={(e) => setNome(e.target.value)} />
                  </div>
                )}
                <div>
                  <FilterLabel>É Infinity, Select ou Select Club?</FilterLabel>
                  <Select value={carteira} onValueChange={setCarteira}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {CARTEIRAS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.value === "nenhuma" ? "Nenhuma das três" : c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="mt-1 space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="busca-base"
                    className="pl-8"
                    placeholder="Nome ou ID do cliente na base..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    autoFocus
                  />
                </div>
                {termo.length >= 2 && (
                  <ul className="max-h-60 divide-y overflow-y-auto rounded-lg border">
                    {isFetching && achados.length === 0 && (
                      <li className="px-3 py-2 text-sm text-muted-foreground">Buscando...</li>
                    )}
                    {!isFetching && achados.length === 0 && (
                      <li className="px-3 py-2 text-sm text-muted-foreground">
                        Nenhum cliente na base com esse nome ou ID.
                      </li>
                    )}
                    {achados.map((c) => (
                      <li key={c.id_cliente}>
                        <button
                          type="button"
                          onClick={() => escolher(c)}
                          className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[#F8FAFC]"
                        >
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-1.5 font-medium">
                              {c.nome || "Sem nome"}
                              <CarteiraBadge
                                carteira={c.carteira ?? carteiraDoContexto(c.contexto)}
                              />
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              ID {c.id_cliente}
                              {c.produtos?.length
                                ? ` · ${c.produtos.join(", ")}`
                                : " · sem produto ativo"}
                            </span>
                          </span>
                          {c.cliente_id && (
                            <span className="shrink-0 text-[11px] font-semibold text-[#047857]">
                              já cadastrado
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  onClick={() => {
                    setSemBase(true);
                    setNome(busca.trim());
                  }}
                >
                  Não está na base? Cadastrar só com o nome
                </button>
              </div>
            )}
          </div>

          {temCliente && (
            <div>
              <FilterLabel>Onboardings *</FilterLabel>
              {linhas.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Nenhum produto tem modelo publicado.
                </p>
              ) : (
                <div className="mt-1 flex flex-wrap gap-2">
                  {linhas.map((p) => {
                    const on = marcados.has(p.id);
                    return (
                      <label
                        key={p.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${on ? "border-primary bg-secondary" : ""}`}
                      >
                        <Checkbox
                          checked={on}
                          onCheckedChange={(v) =>
                            setMarcados((s) => {
                              const n = new Set(s);
                              if (v) n.add(p.id);
                              else n.delete(p.id);
                              return n;
                            })
                          }
                        />
                        <ColorBadge color={p.cor}>{p.nome}</ColorBadge>
                      </label>
                    );
                  })}
                </div>
              )}
              {escolhido && marcados.size > 0 && (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <Check className="h-3 w-3" /> Sugeridos pelos produtos que o cliente tem hoje.
                  Ajuste se precisar.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={!podeSalvar || salvando}>
            <UserPlus /> {salvando ? "Iniciando..." : "Iniciar onboarding"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
