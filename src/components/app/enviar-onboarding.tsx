/**
 * "Enviar para onboarding": mostra os pré-requisitos (contrato verificado, pagamento), os onboardings que
 * os produtos do cliente vão disparar (tela Produtos e onboardings) e libera o cliente — ou, se ele já foi
 * liberado, cria os onboardings que faltam. As regras ficam no banco (clients_release_guard e
 * clients_inicia_onboarding / iniciar_onboardings_pendentes).
 */
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, CircleAlert, Rocket, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useProdutos } from "@/lib/session";
import { confirmContractManually } from "@/lib/contract-verification.functions";
import { notifyClientFinalized } from "@/lib/finalized-webhook.functions";
import { ColorBadge, FilterLabel } from "@/components/app/ui";
import { planoDeOnboarding } from "@/lib/plano-onboarding";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function EnviarOnboardingDialog({
  clienteId,
  onClose,
}: {
  clienteId: string;
  onClose: () => void;
}) {
  const { data: me } = useMe();
  const { data: produtos = [] } = useProdutos();
  const qc = useQueryClient();
  const confirmar = useServerFn(confirmContractManually);
  const notificar = useServerFn(notifyClientFinalized);
  const [ocupado, setOcupado] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ["enviar-onboarding", clienteId],
    queryFn: async () => {
      const [c, v, m, o] = await Promise.all([
        supabase
          .from("clients")
          .select(
            "id, clinic_name, products, paid, contract_signed, contract_verified_at, onboarding_released_at",
          )
          .eq("id", clienteId)
          .single(),
        supabase.from("produto_onboardings").select("produto_id, onboarding_produto_id"),
        supabase.from("modelos").select("produto_id, nome, versao").eq("status", "publicado"),
        supabase.from("onboardings").select("id, produto_id, status").eq("cliente_id", clienteId),
      ]);
      if (c.error) throw c.error;
      return {
        cliente: c.data,
        vinculos: v.data ?? [],
        modelos: m.data ?? [],
        onboardings: o.data ?? [],
      };
    },
  });

  const plano = useMemo(
    () =>
      data
        ? planoDeOnboarding({
            produtosCliente: data.cliente.products,
            produtos,
            vinculos: data.vinculos,
            modelosPublicados: data.modelos,
            onboardings: data.onboardings,
          })
        : [],
    [data, produtos],
  );

  if (!data) return null;
  const c = data.cliente;
  const liberado = !!c.onboarding_released_at;
  const contratoOk = c.contract_signed && !!c.contract_verified_at;
  const aCriar = plano.filter((p) => p.situacao === "criar").length;
  const podeEnviar = contratoOk && c.paid && (liberado ? aCriar > 0 : true);

  async function recarregar() {
    await Promise.all([
      refetch(),
      qc.invalidateQueries({ queryKey: ["clients"] }),
      qc.invalidateQueries({ queryKey: ["client", clienteId] }),
      qc.invalidateQueries({ queryKey: ["onboardings"] }),
    ]);
  }

  async function marcarPago(v: boolean) {
    setOcupado(true);
    const { error } = await supabase.from("clients").update({ paid: v }).eq("id", c.id);
    if (error) toast.error("Não foi possível salvar o pagamento.");
    else if (v && c.contract_signed) {
      try {
        const r = await notificar({ data: { clientId: c.id } });
        if (r.sent) toast.success("Ficha do cliente enviada ao n8n.");
      } catch {
        /* aviso não bloqueia */
      }
    }
    await recarregar();
    setOcupado(false);
  }

  async function confirmarContrato() {
    setOcupado(true);
    try {
      await confirmar({ data: { clientId: c.id } });
      toast.success("Contrato confirmado.");
    } catch (e) {
      toast.error((e as Error).message);
    }
    await recarregar();
    setOcupado(false);
  }

  async function enviar() {
    setOcupado(true);
    let criados = 0;
    if (!liberado) {
      const { data: ok, error } = await supabase
        .from("clients")
        .update({ onboarding_released_at: new Date().toISOString() })
        .eq("id", c.id)
        .is("onboarding_released_at", null)
        .select("id");
      if (error || !ok?.length) {
        toast.error("Não foi possível enviar. Confira o pagamento e a assinatura verificada.");
        setOcupado(false);
        return;
      }
      const { count } = await supabase
        .from("onboardings")
        .select("id", { count: "exact", head: true })
        .eq("cliente_id", c.id)
        .neq("status", "cancelado");
      criados = (count ?? 0) - data!.onboardings.filter((o) => o.status !== "cancelado").length;
    } else {
      const { data: n, error } = await supabase.rpc("iniciar_onboardings_pendentes", {
        _cliente_id: c.id,
      });
      if (error) {
        toast.error(error.message);
        setOcupado(false);
        return;
      }
      criados = n ?? 0;
    }
    await recarregar();
    setOcupado(false);
    toast.success(
      criados
        ? `${c.clinic_name} enviado para onboarding: ${criados} onboarding${criados === 1 ? "" : "s"} iniciado${criados === 1 ? "" : "s"}.`
        : `${c.clinic_name} liberado. Nenhum onboarding foi criado: vincule os produtos em Produtos e onboardings.`,
    );
    onClose();
  }

  const Req = ({
    ok,
    titulo,
    children,
  }: {
    ok: boolean;
    titulo: string;
    children?: React.ReactNode;
  }) => (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm">
      <span className="flex items-center gap-2">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full ${ok ? "bg-[#10B981] text-white" : "bg-[#FEF3C7] text-[#B45309]"}`}
        >
          {ok ? <Check className="h-3 w-3" strokeWidth={3} /> : <CircleAlert className="h-3 w-3" />}
        </span>
        <span className="font-medium">{titulo}</span>
      </span>
      {children}
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {liberado ? "Onboardings do cliente" : "Enviar para onboarding"}
          </DialogTitle>
          <DialogDescription>
            {c.clinic_name} · {c.products.join(", ") || "sem produtos"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!liberado && (
            <div className="space-y-2">
              <FilterLabel>Antes de enviar</FilterLabel>
              <Req ok={contratoOk} titulo="Contrato assinado e verificado">
                {!contratoOk &&
                  (me?.isAdmin ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={ocupado}
                      onClick={confirmarContrato}
                    >
                      Confirmar assinatura
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Aguardando DocuSign ou um administrador
                    </span>
                  ))}
              </Req>
              <Req ok={c.paid} titulo="Pagamento confirmado">
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={c.paid}
                    disabled={ocupado}
                    onCheckedChange={(v) => marcarPago(v === true)}
                  />{" "}
                  Pago
                </label>
              </Req>
            </div>
          )}

          <div className="space-y-1.5">
            <FilterLabel>Onboardings {liberado ? "do cliente" : "que serão iniciados"}</FilterLabel>
            {plano.length === 0 ? (
              <p className="rounded-md bg-[#FEF3C7] px-3 py-2 text-sm text-[#B45309]">
                Nenhum produto contratado está vinculado a um onboarding.{" "}
                <Link to="/vinculos" className="font-semibold underline" onClick={onClose}>
                  Configurar vínculos
                </Link>
              </p>
            ) : (
              plano.map((p) => (
                <div
                  key={p.produtoId}
                  className="flex items-center justify-between gap-3 rounded-md bg-[#F8FAFC] px-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <ColorBadge color={p.cor}>{p.nome}</ColorBadge>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {p.modelo ?? "Sem modelo publicado"}
                      {p.origem.length && !(p.origem.length === 1 && p.origem[0] === p.nome)
                        ? ` · pelo produto ${p.origem.join(", ")}`
                        : ""}
                    </span>
                  </span>
                  {p.situacao === "existe" ? (
                    <Link
                      to="/onboardings/$id"
                      params={{ id: p.onboardingId! }}
                      onClick={onClose}
                      className="shrink-0 text-xs font-semibold text-primary hover:underline"
                    >
                      Já existe · abrir
                    </Link>
                  ) : p.situacao === "criar" ? (
                    <span className="shrink-0 rounded bg-[#D1FAE5] px-1.5 py-0.5 text-[11px] font-bold text-[#065F46]">
                      {liberado ? "Falta criar" : "Será iniciado"}
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                      <X className="h-3 w-3" /> Publique o modelo
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button
            onClick={enviar}
            disabled={ocupado || !podeEnviar}
            title={
              !contratoOk
                ? "Falta o contrato verificado"
                : !c.paid
                  ? "Falta confirmar o pagamento"
                  : liberado && !aCriar
                    ? "Nada a criar"
                    : undefined
            }
          >
            <Rocket />{" "}
            {liberado
              ? `Criar ${aCriar || ""} onboarding${aCriar === 1 ? "" : "s"} que falta${aCriar === 1 ? "" : "m"}`
              : "Enviar para onboarding"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
