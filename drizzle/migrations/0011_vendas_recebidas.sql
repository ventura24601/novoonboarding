-- Vendas recebidas por webhook (sistema de vendas → Central). Ficam "aguardando revisão" até alguém
-- aprovar (cadastrando o cliente ou vinculando a um existente) ou descartar. O webhook grava com service role.

CREATE TABLE public.vendas_recebidas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL UNIQUE,                 -- hash do conteúdo: reenvio idêntico não duplica
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','descartada')),
  tipo text,
  nome text,
  cnpj text,                                  -- só dígitos
  telefone text,
  whatsapp text,
  whatsapp2 text,
  email text,
  condicao_pagamento text,
  meio_pagamento text,
  vendedor text,
  vendedor_email text,
  id_cliente text,
  id_cliente_appcrc text,
  id_cliente_smarttv text,
  curso_acesso jsonb NOT NULL DEFAULT '{}',   -- nome, cpf, email, contato
  payload jsonb NOT NULL,                     -- dados originais (até 64 KiB)
  recebido_em timestamptz NOT NULL DEFAULT now(),
  cliente_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  revisado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revisado_em timestamptz,
  motivo_descarte text
);
CREATE INDEX vendas_recebidas_status ON public.vendas_recebidas (status, recebido_em DESC);
CREATE INDEX vendas_recebidas_cnpj ON public.vendas_recebidas (cnpj);

-- Quem revisa: admin e vendedores (o cadastro de cliente já é deles).
CREATE OR REPLACE FUNCTION public.pode_revisar_vendas() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() OR (public.usuario_ativo(auth.uid()) AND public.has_role(auth.uid(), 'vendedor'))
$$;

-- Usuário só muda a decisão (status, cliente, motivo); o resto é o que chegou do webhook.
CREATE OR REPLACE FUNCTION public.vendas_recebidas_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('postgres','service_role','supabase_admin') OR COALESCE(auth.role(),'') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - 'status' - 'cliente_id' - 'motivo_descarte' - 'revisado_por' - 'revisado_em')
     <> (to_jsonb(OLD) - 'status' - 'cliente_id' - 'motivo_descarte' - 'revisado_por' - 'revisado_em') THEN
    RAISE EXCEPTION 'Os dados recebidos da venda não podem ser alterados';
  END IF;
  IF NEW.status = 'aprovada' AND NEW.cliente_id IS NULL THEN
    RAISE EXCEPTION 'Para aprovar, cadastre ou escolha o cliente';
  END IF;
  IF NEW.status = 'descartada' AND coalesce(btrim(NEW.motivo_descarte), '') = '' THEN
    RAISE EXCEPTION 'Informe o motivo do descarte';
  END IF;
  IF OLD.status <> 'pendente' AND NEW.status <> 'pendente' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Reabra a venda antes de mudar a decisão';
  END IF;
  IF OLD.status = 'aprovada' AND NEW.status = 'pendente' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Só administradores reabrem vendas aprovadas';
  END IF;
  IF NEW.status = 'pendente' THEN
    NEW.cliente_id := NULL; NEW.motivo_descarte := NULL; NEW.revisado_por := NULL; NEW.revisado_em := NULL;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.revisado_por := auth.uid(); NEW.revisado_em := now();
    IF NEW.status = 'aprovada' THEN NEW.motivo_descarte := NULL; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER vendas_recebidas_guard BEFORE UPDATE ON public.vendas_recebidas
  FOR EACH ROW EXECUTE FUNCTION public.vendas_recebidas_guard();

GRANT SELECT, UPDATE ON public.vendas_recebidas TO authenticated;
GRANT ALL ON public.vendas_recebidas TO service_role;
ALTER TABLE public.vendas_recebidas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Revisores e gestores leem vendas" ON public.vendas_recebidas FOR SELECT TO authenticated
  USING (public.pode_revisar_vendas() OR public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "Revisores decidem vendas" ON public.vendas_recebidas FOR UPDATE TO authenticated
  USING (public.pode_revisar_vendas()) WITH CHECK (public.pode_revisar_vendas());
