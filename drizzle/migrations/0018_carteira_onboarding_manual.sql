-- 1) Carteira do cliente (Infinity, Select, Select Club), perguntada na revisão do cadastro e mostrada em todas as etapas.
-- 2) Onboarding manual a partir da base de clientes (downgrade ou reonboarding), sem passar pela etapa de contratos.
-- 3) Responsável da etapa: quem opera o onboarding escolhe no painel da etapa (antes só o gestor, no "Editar etapa").

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS carteira text CHECK (carteira IN ('infinity','select','select_club','nenhuma')),
  -- contrato = veio da etapa 1; base = criado direto no onboarding a partir da base de clientes.
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'contrato' CHECK (origem IN ('contrato','base'));

ALTER TABLE public.onboardings
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'novo' CHECK (tipo IN ('novo','downgrade','reonboarding'));

-- Reonboarding: o mesmo produto pode ter um onboarding novo depois que o anterior terminou.
DROP INDEX IF EXISTS public.onboardings_um_ativo;
CREATE UNIQUE INDEX onboardings_um_ativo ON public.onboardings (cliente_id, produto_id)
  WHERE status NOT IN ('cancelado','concluido');

-- Responsável deixa de ser exclusivo do gestor (a política de UPDATE já exige pode_operar).
CREATE OR REPLACE FUNCTION public.onboarding_etapas_regras() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  cal text := public.onboarding_calendario(NEW.onboarding_id);
  hoje date := current_date;
  produto uuid;
  sistema boolean := current_user IN ('postgres','service_role','supabase_admin') OR COALESCE(auth.role(),'') = 'service_role';
BEGIN
  SELECT produto_id INTO produto FROM public.onboardings WHERE id = NEW.onboarding_id;

  IF TG_OP = 'UPDATE' AND NOT sistema AND NOT public.gere_produto(produto) AND (
       NEW.sla_dias IS DISTINCT FROM OLD.sla_dias OR NEW.prazo_em IS DISTINCT FROM OLD.prazo_em
    OR NEW.papel_id IS DISTINCT FROM OLD.papel_id
    OR NEW.nome IS DISTINCT FROM OLD.nome OR NEW.ordem IS DISTINCT FROM OLD.ordem
    OR NEW.obrigatoria IS DISTINCT FROM OLD.obrigatoria OR NEW.onboarding_id IS DISTINCT FROM OLD.onboarding_id
    OR NEW.dias_pausados IS DISTINCT FROM OLD.dias_pausados) THEN
    RAISE EXCEPTION 'Apenas gestores do produto alteram prazo ou estrutura da etapa';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('bloqueada','pulada') AND COALESCE(btrim(NEW.motivo), '') = '' THEN
      RAISE EXCEPTION 'Informe o motivo para bloquear ou pular a etapa';
    END IF;
    IF NEW.status = 'pulada' AND OLD.obrigatoria AND NOT sistema AND NOT public.gere_produto(produto) THEN
      RAISE EXCEPTION 'Apenas gestores pulam etapas obrigatórias';
    END IF;
    IF NEW.status = 'concluida' AND NEW.exige_checklist AND EXISTS (
      SELECT 1 FROM public.onboarding_checklist WHERE onboarding_etapa_id = NEW.id AND obrigatorio AND NOT feito) THEN
      RAISE EXCEPTION 'Conclua os itens obrigatórios do checklist antes de concluir a etapa';
    END IF;

    -- Saindo de uma pausa: soma os dias pausados e empurra o prazo.
    IF OLD.pausada_desde IS NOT NULL THEN
      NEW.dias_pausados := OLD.dias_pausados + GREATEST(public.dias_entre(OLD.pausada_desde::date, hoje, cal), 0);
      NEW.pausada_desde := NULL;
      NEW.prazo_em := public.somar_dias(COALESCE(NEW.iniciada_em, now())::date, NEW.sla_dias + NEW.dias_pausados, cal);
    END IF;

    IF NEW.iniciada_em IS NULL AND NEW.status IN ('em_andamento','aguardando_cliente','bloqueada','concluida') THEN
      NEW.iniciada_em := now();
      NEW.prazo_em := public.somar_dias(hoje, NEW.sla_dias + NEW.dias_pausados, cal);
    END IF;

    IF NEW.status = 'aguardando_cliente' AND NEW.pausa_sla_aguardando_cliente THEN
      NEW.pausada_desde := now();
    END IF;

    IF NEW.status = 'concluida' THEN
      NEW.concluida_em := now();
      NEW.concluida_por := auth.uid();
    ELSE
      NEW.concluida_em := NULL;
      NEW.concluida_por := NULL;
    END IF;

    IF NEW.status IN ('em_andamento','concluida','pendente') THEN NEW.motivo := NULL; END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.sla_dias IS DISTINCT FROM OLD.sla_dias AND NEW.iniciada_em IS NOT NULL
     AND NEW.prazo_em IS NOT DISTINCT FROM OLD.prazo_em THEN
    NEW.prazo_em := public.somar_dias(NEW.iniciada_em::date, NEW.sla_dias + NEW.dias_pausados, cal);
  END IF;
  RETURN NEW;
END; $$;


-- Troca de responsável entra no histórico da etapa.
CREATE OR REPLACE FUNCTION public.onboarding_etapas_responsavel() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.onboarding_eventos (onboarding_id, onboarding_etapa_id, tipo, de, para, user_id)
  VALUES (NEW.onboarding_id, NEW.id, 'responsavel', OLD.responsavel_id::text, NEW.responsavel_id::text, auth.uid());
  RETURN NEW;
END; $$;
CREATE TRIGGER onboarding_etapas_responsavel AFTER UPDATE OF responsavel_id ON public.onboarding_etapas
  FOR EACH ROW WHEN (OLD.responsavel_id IS DISTINCT FROM NEW.responsavel_id)
  EXECUTE FUNCTION public.onboarding_etapas_responsavel();

-- O tipo do onboarding é definido na criação; só o gestor muda.
CREATE OR REPLACE FUNCTION public.onboardings_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('postgres','service_role','supabase_admin') AND COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.gere_produto(OLD.produto_id) AND (
          NEW.produto_id IS DISTINCT FROM OLD.produto_id OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
       OR NEW.modelo_id IS DISTINCT FROM OLD.modelo_id OR NEW.modelo_versao IS DISTINCT FROM OLD.modelo_versao
       OR NEW.data_inicio IS DISTINCT FROM OLD.data_inicio OR NEW.previsao_termino IS DISTINCT FROM OLD.previsao_termino
       OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.tipo IS DISTINCT FROM OLD.tipo
       OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'cancelado')) THEN
    RAISE EXCEPTION 'Apenas gestores do produto alteram prazos, estrutura ou cancelam o onboarding';
  END IF;
  IF NEW.status IN ('pausado','cancelado') AND NEW.status IS DISTINCT FROM OLD.status AND COALESCE(btrim(NEW.motivo),'') = '' THEN
    RAISE EXCEPTION 'Informe o motivo para pausar ou cancelar o onboarding';
  END IF;
  IF NEW.status = 'concluido' AND OLD.status <> 'concluido' AND NEW.data_termino IS NULL THEN NEW.data_termino := current_date; END IF;
  IF NEW.status <> 'concluido' THEN NEW.data_termino := NULL; END IF;
  RETURN NEW;
END; $$;


-- Criação a partir do modelo, agora com o tipo. Fora do fluxo normal (novo), um onboarding já concluído do
-- mesmo produto não impede outro.
DROP FUNCTION public._criar_onboarding(uuid, uuid, date);
CREATE OR REPLACE FUNCTION public._criar_onboarding(_cliente_id uuid, _produto_id uuid, _data_inicio date DEFAULT current_date,
  _tipo text DEFAULT 'novo')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m public.modelos%ROWTYPE;
  onb uuid;
  me public.modelo_etapas%ROWTYPE;
  nova uuid;
  primeira uuid;
  total int;
BEGIN
  SELECT * INTO m FROM public.modelos WHERE produto_id = _produto_id AND status = 'publicado';
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.onboardings WHERE cliente_id = _cliente_id AND produto_id = _produto_id
               AND status <> 'cancelado' AND (_tipo = 'novo' OR status <> 'concluido')) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(sum(sla_dias), 0) INTO total FROM public.modelo_etapas WHERE modelo_id = m.id;

  INSERT INTO public.onboardings (cliente_id, produto_id, modelo_id, modelo_versao, data_inicio, previsao_termino, created_by, tipo)
  VALUES (_cliente_id, _produto_id, m.id, m.versao, _data_inicio, public.somar_dias(_data_inicio, total, m.calendario), auth.uid(), _tipo)
  RETURNING id INTO onb;

  FOR me IN SELECT * FROM public.modelo_etapas WHERE modelo_id = m.id ORDER BY ordem LOOP
    INSERT INTO public.onboarding_etapas (onboarding_id, modelo_etapa_id, fase_nome, fase_cor, nome, descricao, ordem,
      papel_id, sla_dias, principal, obrigatoria, pausa_sla_aguardando_cliente, exige_checklist)
    SELECT onb, me.id, f.nome, f.cor, me.nome, me.descricao, me.ordem, me.papel_id, me.sla_dias, me.principal,
           me.obrigatoria, me.pausa_sla_aguardando_cliente, me.exige_checklist
    FROM (SELECT 1) x LEFT JOIN public.modelo_fases f ON f.id = me.fase_id
    RETURNING id INTO nova;
    IF primeira IS NULL THEN primeira := nova; END IF;
    INSERT INTO public.onboarding_checklist (onboarding_etapa_id, texto, obrigatorio, ordem)
    SELECT nova, texto, obrigatorio, ordem FROM public.modelo_checklist WHERE etapa_id = me.id;
  END LOOP;

  INSERT INTO public.onboarding_eventos (onboarding_id, tipo, para, detalhe, user_id)
  VALUES (onb, 'criado', 'em_andamento', 'Modelo ' || m.nome || ' v' || m.versao
            || CASE _tipo WHEN 'downgrade' THEN ' · downgrade' WHEN 'reonboarding' THEN ' · reonboarding' ELSE '' END, auth.uid());

  IF primeira IS NOT NULL THEN
    UPDATE public.onboarding_etapas
       SET status = 'em_andamento', iniciada_em = _data_inicio::timestamptz,
           prazo_em = public.somar_dias(_data_inicio, sla_dias, m.calendario)
     WHERE id = primeira;
  END IF;
  RETURN onb;
END; $$;

REVOKE ALL ON FUNCTION public._criar_onboarding(uuid, uuid, date, text) FROM PUBLIC, anon, authenticated;

-- Entrada manual no onboarding a partir da base de clientes (downgrade ou reonboarding).
-- Usa o cliente que já existe (pelo id escolhido ou pelo id da base em codigo_externo); senão cria um cliente
-- de origem "base", que não entra na etapa de contratos nem nas comissões.
CREATE OR REPLACE FUNCTION public.onboarding_manual(_tipo text, _produtos uuid[], _id_base text DEFAULT NULL,
  _nome text DEFAULT NULL, _carteira text DEFAULT NULL, _cliente_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cid uuid := _cliente_id;
  p uuid;
  novo uuid;
  criados int := 0;
  ignorados text[] := '{}';
  nomes text[];
BEGIN
  IF NOT public.pode_operar() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF _tipo NOT IN ('downgrade','reonboarding') THEN RAISE EXCEPTION 'Escolha downgrade ou reonboarding'; END IF;
  IF coalesce(cardinality(_produtos), 0) = 0 THEN RAISE EXCEPTION 'Escolha ao menos um onboarding'; END IF;
  IF _carteira IS NOT NULL AND _carteira NOT IN ('infinity','select','select_club','nenhuma') THEN
    RAISE EXCEPTION 'Carteira inválida';
  END IF;
  _id_base := nullif(btrim(_id_base), '');

  IF cid IS NULL AND _id_base IS NOT NULL THEN
    SELECT id INTO cid FROM public.clients WHERE codigo_externo = _id_base;
  END IF;
  SELECT array_agg(nome ORDER BY nome) INTO nomes FROM public.produtos WHERE id = ANY (_produtos);

  IF cid IS NULL THEN
    IF coalesce(btrim(_nome), '') = '' THEN RAISE EXCEPTION 'Informe o nome do cliente'; END IF;
    INSERT INTO public.clients (clinic_name, codigo_externo, carteira, origem, products, created_by)
    VALUES (btrim(_nome), _id_base, _carteira, 'base', coalesce(nomes, '{}'), auth.uid())
    RETURNING id INTO cid;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = cid) THEN RAISE EXCEPTION 'Cliente não encontrado'; END IF;
    UPDATE public.clients SET
      carteira = coalesce(_carteira, carteira),
      codigo_externo = coalesce(codigo_externo, _id_base)
    WHERE id = cid;
  END IF;

  FOREACH p IN ARRAY _produtos LOOP
    novo := public._criar_onboarding(cid, p, current_date, _tipo);
    IF novo IS NULL THEN
      ignorados := ignorados || (SELECT nome FROM public.produtos WHERE id = p);
    ELSE
      criados := criados + 1;
    END IF;
  END LOOP;
  IF criados = 0 THEN
    RAISE EXCEPTION 'Nenhum onboarding criado: % já está em andamento ou não tem modelo publicado',
      array_to_string(ignorados, ', ');
  END IF;
  RETURN jsonb_build_object('cliente_id', cid, 'criados', criados, 'ignorados', to_jsonb(ignorados));
END; $$;
REVOKE ALL ON FUNCTION public.onboarding_manual(text, uuid[], text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.onboarding_manual(text, uuid[], text, text, text, uuid) TO authenticated;

-- Busca na base para o formulário de entrada manual (nome ou id), já com o cliente que existe aqui, se houver.
CREATE OR REPLACE FUNCTION public.buscar_clientes_base(_q text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE q text := btrim(coalesce(_q, ''));
BEGIN
  IF NOT public.pode_operar() THEN RAISE EXCEPTION 'Sem acesso'; END IF;
  IF length(q) < 2 THEN RETURN '[]'::jsonb; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.ativo DESC, x.nome) FROM (
      SELECT b.id_cliente, b.nome, b.contexto, b.produtos, b.ativo, c.id AS cliente_id, c.carteira
      FROM public.clientes_base b
      LEFT JOIN public.clients c ON c.codigo_externo = b.id_cliente
      WHERE b.id_cliente = q
         OR translate(lower(b.nome), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
            LIKE '%' || translate(lower(replace(replace(q, '%', ''), '_', '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') || '%'
      ORDER BY b.ativo DESC, b.nome LIMIT 20) x), '[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.buscar_clientes_base(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_clientes_base(text) TO authenticated;

-- Resumo do onboarding com a carteira e a origem do cliente.
DROP VIEW public.onboardings_resumo;
CREATE VIEW public.onboardings_resumo WITH (security_invoker = true) AS
SELECT o.*, c.clinic_name AS cliente_nome, c.carteira AS cliente_carteira, c.origem AS cliente_origem, p.nome AS produto_nome, p.cor AS produto_cor,
  m.calendario, m.limiar_risco_pct,
  atual.id AS etapa_atual_id, atual.nome AS etapa_atual_nome, atual.fase_nome AS etapa_atual_fase,
  atual.prazo_em AS etapa_atual_prazo, atual.responsavel_id AS etapa_atual_responsavel_id,
  atual.situacao AS etapa_atual_situacao,
  prog.total AS etapas_total, prog.feitas AS etapas_feitas,
  CASE
    WHEN o.status = 'concluido' THEN 'concluido'
    WHEN o.status IN ('pausado','cancelado') THEN o.status
    WHEN prog.bloqueadas > 0 THEN 'bloqueado'
    WHEN prog.atrasadas > 0 THEN 'atrasado'
    WHEN prog.aguardando > 0 THEN 'aguardando_cliente'
    WHEN prog.risco > 0 THEN 'em_risco'
    ELSE 'no_prazo'
  END AS situacao
FROM public.onboardings o
JOIN public.clients c ON c.id = o.cliente_id
JOIN public.produtos p ON p.id = o.produto_id
LEFT JOIN public.modelos m ON m.id = o.modelo_id
LEFT JOIN LATERAL (
  SELECT s.* FROM public.onboarding_etapas_situacao s
  WHERE s.onboarding_id = o.id AND s.status NOT IN ('concluida','pulada')
  ORDER BY (s.status = 'pendente'), s.ordem LIMIT 1) atual ON true
LEFT JOIN LATERAL (
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE s.status IN ('concluida','pulada'))::int AS feitas,
         count(*) FILTER (WHERE s.situacao = 'bloqueado')::int AS bloqueadas,
         count(*) FILTER (WHERE s.situacao = 'atrasado')::int AS atrasadas,
         count(*) FILTER (WHERE s.situacao = 'aguardando_cliente')::int AS aguardando,
         count(*) FILTER (WHERE s.situacao = 'em_risco')::int AS risco
  FROM public.onboarding_etapas_situacao s WHERE s.onboarding_id = o.id) prog ON true;
GRANT SELECT ON public.onboardings_resumo TO authenticated;
GRANT ALL ON public.onboardings_resumo TO service_role;

-- Lista de clientes (/carteira) com a carteira; cliente vindo da base já está no onboarding.
CREATE OR REPLACE VIEW public.clientes WITH (security_invoker = true) AS
SELECT c.id, c.clinic_name AS nome, c.codigo_externo, c.segmento, c.city AS cidade, c.state AS uf,
       c.contato_nome, COALESCE(c.whatsapp, c.phone) AS telefone, c.email,
       CASE
         WHEN c.onboarding_completed_at IS NOT NULL THEN 'onboarding_concluido'
         WHEN c.onboarding_released_at IS NOT NULL OR c.origem = 'base' THEN 'em_onboarding'
         WHEN NOT c.contract_signed THEN 'aguardando_assinatura'
         WHEN NOT c.paid THEN 'aguardando_pagamento'
         WHEN c.contract_verified_at IS NULL THEN 'aguardando_verificacao'
         ELSE 'pronto_para_liberar'
       END AS status_contrato,
       c.products AS produtos, c.created_at, c.carteira, c.origem
FROM public.clients c;

-- Carteira (contexto da base) dos clientes que aparecem na retenção: { id_appcrc: contexto }.
CREATE OR REPLACE FUNCTION public.carteiras_retencao() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.pode_operar() THEN RAISE EXCEPTION 'Sem acesso'; END IF;
  RETURN coalesce((SELECT jsonb_object_agg(b.id_cliente, b.contexto) FROM public.clientes_base b
                   WHERE b.contexto IS NOT NULL
                     AND b.id_cliente IN (SELECT id_appcrc FROM public.retencao_casos WHERE id_appcrc IS NOT NULL)), '{}');
END; $$;
REVOKE ALL ON FUNCTION public.carteiras_retencao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteiras_retencao() TO authenticated;
