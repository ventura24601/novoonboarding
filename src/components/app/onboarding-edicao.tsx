/**
 * Edição do onboarding: ações de etapa (iniciar, concluir, aguardar cliente, bloquear, pular, reabrir),
 * edição da etapa (gestor do produto), checklist e status do onboarding (pausar, retomar, cancelar).
 * As regras ficam no banco (triggers de onboarding_etapas/onboardings); aqui só a interface.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  Lock,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  SkipForward,
  Unlock,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { toastComDesfazer, FilterLabel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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

type Etapa = Database["public"]["Views"]["onboarding_etapas_situacao"]["Row"];
type Resumo = Database["public"]["Views"]["onboardings_resumo"]["Row"];
type StatusEtapa =
  "pendente" | "em_andamento" | "aguardando_cliente" | "bloqueada" | "concluida" | "pulada";

const SEM = "__nenhum__";

/** Recarrega tudo que mostra onboarding depois de uma alteração. */
export function useRecarregarOnboarding(onboardingId: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["onboarding", onboardingId] }),
      qc.invalidateQueries({ queryKey: ["onboardings"] }),
      qc.invalidateQueries({ queryKey: ["minhas-etapas"] }),
    ]);
}

/** Pessoas ativas que podem ser responsáveis por uma etapa. */
export function usePessoasAtivas() {
  return useQuery({
    queryKey: ["pessoas-ativas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, ativo")
        .eq("ativo", true)
        .order("full_name");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

function mensagem(e: { message: string }) {
  if (/row-level|permission/i.test(e.message)) return "Seu perfil não pode fazer esta alteração.";
  return e.message;
}

async function mudarStatus(etapaId: string, status: StatusEtapa, motivo?: string) {
  const patch: Database["public"]["Tables"]["onboarding_etapas"]["Update"] = { status };
  if (motivo !== undefined) patch.motivo = motivo;
  const { error } = await supabase.from("onboarding_etapas").update(patch).eq("id", etapaId);
  return error;
}

async function reabrir(etapaId: string) {
  const { error } = await supabase.rpc("reabrir_etapa", { _etapa_id: etapaId });
  return error;
}

type Acao = { status: StatusEtapa; titulo: string; pedeMotivo: "obrigatorio" | "opcional" };

/** Botões de ação da etapa, conforme o status atual. */
export function AcoesEtapa({
  etapa,
  onboardingId,
  podeOperar,
  gestor,
  encerrado,
  checklistPendente,
}: {
  etapa: Etapa;
  onboardingId: string;
  podeOperar: boolean;
  gestor: boolean;
  encerrado: boolean;
  checklistPendente: number;
}) {
  const recarregar = useRecarregarOnboarding(onboardingId);
  const [ocupado, setOcupado] = useState(false);
  const [pedindo, setPedindo] = useState<Acao | null>(null);
  const [editando, setEditando] = useState(false);
  if (!podeOperar || encerrado) return null;

  const status = etapa.status as StatusEtapa;
  const id = etapa.id!;

  async function executar(novo: StatusEtapa, motivo?: string) {
    setOcupado(true);
    const anterior = status;
    const anteriorMotivo = etapa.motivo ?? "";
    const err =
      novo === "em_andamento" && (anterior === "concluida" || anterior === "pulada")
        ? await reabrir(id)
        : await mudarStatus(id, novo, motivo);
    setOcupado(false);
    if (err) {
      toast.error(mensagem(err));
      return;
    }
    await recarregar();
    const textos: Record<StatusEtapa, string> = {
      em_andamento: anterior === "pendente" ? "Etapa iniciada." : "Etapa retomada.",
      concluida: "Etapa concluída. A próxima já começou.",
      aguardando_cliente: "Etapa aguardando o cliente.",
      bloqueada: "Etapa bloqueada.",
      pulada: "Etapa pulada.",
      pendente: "Etapa voltou para pendente.",
    };
    if (anterior === "pendente") {
      toast.success(textos[novo]);
      return;
    }
    toastComDesfazer(textos[novo], async () => {
      const e2 =
        novo === "concluida" || novo === "pulada"
          ? await reabrir(id)
          : anterior === "concluida" || anterior === "pulada"
            ? await mudarStatus(id, anterior, anteriorMotivo || undefined)
            : await mudarStatus(
                id,
                anterior,
                ["bloqueada", "pulada", "aguardando_cliente"].includes(anterior)
                  ? anteriorMotivo
                  : undefined,
              );
      if (e2) toast.error(mensagem(e2));
      else toast.success("Alteração desfeita.");
      await recarregar();
    });
  }

  const pedir = (a: Acao) => setPedindo(a);
  const botoes: React.ReactNode[] = [];
  const B = (k: string, props: React.ComponentProps<typeof Button>, filho: React.ReactNode) => (
    <Button key={k} size="sm" disabled={ocupado} {...props}>
      {filho}
    </Button>
  );

  if (status === "pendente") {
    botoes.push(
      B(
        "ini",
        { onClick: () => executar("em_andamento") },
        <>
          <Play /> Iniciar etapa
        </>,
      ),
    );
  }
  if (status === "em_andamento" || status === "aguardando_cliente" || status === "bloqueada") {
    botoes.push(
      B(
        "conc",
        {
          onClick: () => executar("concluida"),
          disabled: ocupado || (!!etapa.exige_checklist && checklistPendente > 0),
          title:
            etapa.exige_checklist && checklistPendente > 0
              ? "Marque os itens obrigatórios do checklist primeiro"
              : undefined,
        },
        <>
          <CheckCircle2 /> Concluir
        </>,
      ),
    );
  }
  if (status === "aguardando_cliente")
    botoes.push(
      B(
        "ret",
        { variant: "outline", onClick: () => executar("em_andamento") },
        <>
          <Play /> Cliente respondeu
        </>,
      ),
    );
  if (status === "bloqueada")
    botoes.push(
      B(
        "desb",
        { variant: "outline", onClick: () => executar("em_andamento") },
        <>
          <Unlock /> Desbloquear
        </>,
      ),
    );
  if (status === "em_andamento") {
    botoes.push(
      B(
        "ag",
        {
          variant: "outline",
          onClick: () =>
            pedir({
              status: "aguardando_cliente",
              titulo: "Aguardando o cliente",
              pedeMotivo: "opcional",
            }),
        },
        <>
          <Clock /> Aguardando cliente
        </>,
      ),
    );
    botoes.push(
      B(
        "bl",
        {
          variant: "outline",
          onClick: () =>
            pedir({ status: "bloqueada", titulo: "Bloquear etapa", pedeMotivo: "obrigatorio" }),
        },
        <>
          <Lock /> Bloquear
        </>,
      ),
    );
  }
  if (status !== "concluida" && status !== "pulada" && (!etapa.obrigatoria || gestor)) {
    botoes.push(
      B(
        "pul",
        {
          variant: "ghost",
          onClick: () =>
            pedir({ status: "pulada", titulo: "Pular etapa", pedeMotivo: "obrigatorio" }),
        },
        <>
          <SkipForward /> Pular
        </>,
      ),
    );
  }
  if (status === "concluida" || status === "pulada") {
    botoes.push(
      B(
        "reab",
        { variant: "outline", onClick: () => executar("em_andamento") },
        <>
          <RotateCcw /> Reabrir etapa
        </>,
      ),
    );
  }
  if (gestor)
    botoes.push(
      B(
        "ed",
        { variant: "ghost", onClick: () => setEditando(true) },
        <>
          <Pencil /> Editar etapa
        </>,
      ),
    );

  return (
    <>
      <div className="flex flex-wrap gap-2">{botoes}</div>
      {pedindo && (
        <MotivoDialog
          titulo={pedindo.titulo}
          obrigatorio={pedindo.pedeMotivo === "obrigatorio"}
          descricao={
            pedindo.status === "aguardando_cliente" && etapa.pausa_sla_aguardando_cliente
              ? "O prazo desta etapa fica pausado enquanto aguarda o cliente."
              : pedindo.status === "pulada"
                ? "A etapa não conta como feita e a próxima começa."
                : undefined
          }
          onClose={() => setPedindo(null)}
          onConfirmar={async (m) => {
            setPedindo(null);
            await executar(pedindo.status, m);
          }}
        />
      )}
      {editando && (
        <EditarEtapaDialog etapa={etapa} onClose={() => setEditando(false)} onFeito={recarregar} />
      )}
    </>
  );
}

function MotivoDialog({
  titulo,
  descricao,
  obrigatorio,
  onClose,
  onConfirmar,
}: {
  titulo: string;
  descricao?: string | undefined;
  obrigatorio: boolean;
  onClose: () => void;
  onConfirmar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descricao && <DialogDescription>{descricao}</DialogDescription>}
        </DialogHeader>
        <div>
          <FilterLabel htmlFor="motivo">Motivo{obrigatorio ? " *" : " (opcional)"}</FilterLabel>
          <Textarea
            id="motivo"
            rows={3}
            maxLength={500}
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: aguardando acesso ao software do cliente"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => onConfirmar(motivo.trim())}
            disabled={obrigatorio && !motivo.trim()}
          >
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Edição da etapa pelo gestor do produto: nome, instruções, responsável, prazo, SLA e obrigatoriedade. */
function EditarEtapaDialog({
  etapa,
  onClose,
  onFeito,
}: {
  etapa: Etapa;
  onClose: () => void;
  onFeito: () => Promise<unknown>;
}) {
  const { data: pessoas = [] } = usePessoasAtivas();
  const [f, setF] = useState({
    nome: etapa.nome ?? "",
    descricao: etapa.descricao ?? "",
    responsavel_id: etapa.responsavel_id ?? SEM,
    prazo_em: etapa.prazo_em?.slice(0, 10) ?? "",
    sla_dias: String(etapa.sla_dias ?? 1),
    obrigatoria: !!etapa.obrigatoria,
  });
  const [salvando, setSalvando] = useState(false);
  const iniciada = !!etapa.iniciada_em;

  async function salvar() {
    const nome = f.nome.trim();
    const sla = Math.round(Number(f.sla_dias));
    if (!nome) {
      toast.error("Informe o nome da etapa.");
      return;
    }
    if (!Number.isFinite(sla) || sla < 0) {
      toast.error("SLA inválido.");
      return;
    }
    const patch: Database["public"]["Tables"]["onboarding_etapas"]["Update"] = {
      nome,
      descricao: f.descricao.trim() || null,
      responsavel_id: f.responsavel_id === SEM ? null : f.responsavel_id,
      sla_dias: sla,
      obrigatoria: f.obrigatoria,
    };
    // Prazo manual só quando mudou; se só o SLA mudou, o banco recalcula o prazo.
    if (iniciada && f.prazo_em && f.prazo_em !== (etapa.prazo_em?.slice(0, 10) ?? ""))
      patch.prazo_em = f.prazo_em;
    setSalvando(true);
    const { error } = await supabase.from("onboarding_etapas").update(patch).eq("id", etapa.id!);
    setSalvando(false);
    if (error) {
      toast.error(mensagem(error));
      return;
    }
    await onFeito();
    toast.success("Etapa salva.");
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar etapa</DialogTitle>
          <DialogDescription>
            Muda só este onboarding. O modelo do produto continua igual.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <FilterLabel htmlFor="en">Nome</FilterLabel>
            <Input id="en" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
          </div>
          <div>
            <FilterLabel htmlFor="ed">Instruções</FilterLabel>
            <Textarea
              id="ed"
              rows={3}
              value={f.descricao}
              onChange={(e) => setF({ ...f, descricao: e.target.value })}
            />
          </div>
          <div>
            <FilterLabel>Responsável</FilterLabel>
            <Select
              value={f.responsavel_id}
              onValueChange={(v) => setF({ ...f, responsavel_id: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM}>Sem responsável</SelectItem>
                {pessoas.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FilterLabel htmlFor="es">SLA (dias)</FilterLabel>
              <Input
                id="es"
                type="number"
                min={0}
                value={f.sla_dias}
                onChange={(e) => setF({ ...f, sla_dias: e.target.value })}
              />
            </div>
            <div>
              <FilterLabel htmlFor="ep">Prazo</FilterLabel>
              <Input
                id="ep"
                type="date"
                value={f.prazo_em}
                disabled={!iniciada}
                title={iniciada ? undefined : "O prazo é calculado quando a etapa começa"}
                onChange={(e) => setF({ ...f, prazo_em: e.target.value })}
              />
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
            <span>
              <span className="font-medium">Obrigatória</span>
              <span className="block text-xs text-muted-foreground">
                Só gestores pulam etapas obrigatórias.
              </span>
            </span>
            <Switch
              checked={f.obrigatoria}
              onCheckedChange={(v) => setF({ ...f, obrigatoria: v })}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Marca/desmarca item do checklist (com desfazer). */
export async function marcarItem(
  itemId: string,
  feito: boolean,
  recarregar: () => Promise<unknown>,
) {
  const { error } = await supabase.from("onboarding_checklist").update({ feito }).eq("id", itemId);
  if (error) {
    toast.error(mensagem(error));
    return;
  }
  await recarregar();
  toastComDesfazer(feito ? "Item marcado." : "Item desmarcado.", async () => {
    const { error: e2 } = await supabase
      .from("onboarding_checklist")
      .update({ feito: !feito })
      .eq("id", itemId);
    if (e2) toast.error(mensagem(e2));
    await recarregar();
  });
}

/** Status e datas do onboarding: pausar/retomar (operação), cancelar e datas (gestor). */
export function EditarOnboarding({
  resumo,
  podeOperar,
  gestor,
}: {
  resumo: Resumo;
  podeOperar: boolean;
  gestor: boolean;
}) {
  const id = resumo.id!;
  const recarregar = useRecarregarOnboarding(id);
  const [pedindo, setPedindo] = useState<null | "pausado" | "cancelado">(null);
  const [datas, setDatas] = useState(false);
  if (!podeOperar) return null;

  async function status(novo: "em_andamento" | "pausado" | "cancelado", motivo?: string) {
    const patch: Database["public"]["Tables"]["onboardings"]["Update"] = { status: novo };
    if (motivo !== undefined) patch.motivo = motivo;
    const { error } = await supabase.from("onboardings").update(patch).eq("id", id);
    if (error) {
      toast.error(mensagem(error));
      return;
    }
    await recarregar();
    toast.success(
      novo === "pausado"
        ? "Onboarding pausado."
        : novo === "cancelado"
          ? "Onboarding cancelado."
          : "Onboarding retomado.",
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {resumo.status === "em_andamento" && (
          <Button variant="outline" onClick={() => setPedindo("pausado")}>
            <Pause /> Pausar
          </Button>
        )}
        {(resumo.status === "pausado" || (resumo.status === "cancelado" && gestor)) && (
          <Button variant="outline" onClick={() => status("em_andamento")}>
            <Play /> {resumo.status === "pausado" ? "Retomar" : "Reativar"}
          </Button>
        )}
        {gestor && resumo.status !== "concluido" && resumo.status !== "cancelado" && (
          <Button
            variant="ghost"
            className="text-[#B91C1C] hover:bg-[#FEE2E2] hover:text-[#B91C1C]"
            onClick={() => setPedindo("cancelado")}
          >
            <XCircle /> Cancelar
          </Button>
        )}
        {gestor && (
          <Button variant="ghost" onClick={() => setDatas(true)}>
            <Pencil /> Datas
          </Button>
        )}
      </div>
      {pedindo && (
        <MotivoDialog
          obrigatorio
          titulo={pedindo === "pausado" ? "Pausar onboarding" : "Cancelar onboarding"}
          descricao={
            pedindo === "cancelado"
              ? "O onboarding sai do painel. Um gestor pode reativar depois."
              : "Fica parado até alguém retomar."
          }
          onClose={() => setPedindo(null)}
          onConfirmar={async (m) => {
            const s = pedindo;
            setPedindo(null);
            await status(s, m);
          }}
        />
      )}
      {datas && (
        <DatasDialog resumo={resumo} onClose={() => setDatas(false)} onFeito={recarregar} />
      )}
    </>
  );
}

function DatasDialog({
  resumo,
  onClose,
  onFeito,
}: {
  resumo: Resumo;
  onClose: () => void;
  onFeito: () => Promise<unknown>;
}) {
  const [inicio, setInicio] = useState(resumo.data_inicio?.slice(0, 10) ?? "");
  const [previsao, setPrevisao] = useState(resumo.previsao_termino?.slice(0, 10) ?? "");
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    if (!inicio) {
      toast.error("Informe a data de início.");
      return;
    }
    if (previsao && previsao < inicio) {
      toast.error("A previsão não pode ser antes do início.");
      return;
    }
    setSalvando(true);
    const { error } = await supabase
      .from("onboardings")
      .update({ data_inicio: inicio, previsao_termino: previsao || null })
      .eq("id", resumo.id!);
    setSalvando(false);
    if (error) {
      toast.error(mensagem(error));
      return;
    }
    await onFeito();
    toast.success("Datas salvas.");
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Datas do onboarding</DialogTitle>
          <DialogDescription>
            Os prazos das etapas não mudam; ajuste cada etapa em "Editar etapa".
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <FilterLabel htmlFor="di">Início</FilterLabel>
            <Input id="di" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div>
            <FilterLabel htmlFor="dp">Previsão de término</FilterLabel>
            <Input
              id="dp"
              type="date"
              value={previsao}
              onChange={(e) => setPrevisao(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
