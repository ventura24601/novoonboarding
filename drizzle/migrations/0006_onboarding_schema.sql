-- =====================================================================
-- Central de Onboarding ICOM — fundação do módulo de onboarding.
-- Etapa 1 (Contratos) continua em public.clients. Quando um cliente é
-- liberado (pago + contrato verificado), um onboarding é criado para
-- cada produto contratado que tenha modelo publicado (Etapa 2).
-- =====================================================================

-- ---------- Perfis ----------------------------------------------------
-- Perfis continuam em public.user_roles (nunca em profiles) para evitar
-- escalonamento de privilégio. profiles ganha avatar e ativo.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

-- Só admin altera "ativo" (o próprio usuário pode editar o resto do perfil).
CREATE OR REPLACE FUNCTION public.profiles_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('postgres','service_role','supabase_admin') AND COALESCE(auth.role(),'') <> 'service_role'
     AND NEW.ativo IS DISTINCT FROM OLD.ativo AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores ativam ou desativam usuários';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER profiles_guard BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_guard();

CREATE OR REPLACE FUNCTION public.usuario_ativo(_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND ativo)
$$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.usuario_ativo(auth.uid()) AND public.has_role(auth.uid(), 'admin')
$$;

-- Executa etapas: admin, gestor, operador e CS.
CREATE OR REPLACE FUNCTION public.pode_operar() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.usuario_ativo(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin','gestor','operador','cs'))
$$;

-- ---------- Cadastros base -------------------------------------------
CREATE TABLE public.papeis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  cor text NOT NULL DEFAULT '#64748B'
);

CREATE TABLE public.produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  cor text NOT NULL DEFAULT '#7C3AED',
  ativo boolean NOT NULL DEFAULT true
);

CREATE TABLE public.produto_gestores (
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (produto_id, user_id)
);

-- admin, ou gestor vinculado ao produto.
CREATE OR REPLACE FUNCTION public.gere_produto(_produto_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() OR (
    public.usuario_ativo(auth.uid()) AND public.has_role(auth.uid(), 'gestor') AND EXISTS (
      SELECT 1 FROM public.produto_gestores WHERE produto_id = _produto_id AND user_id = auth.uid()))
$$;

CREATE TABLE public.feriados (
  data date PRIMARY KEY,
  nome text NOT NULL
);

-- ---------- Clientes (mesma tabela da etapa de contratos) -------------
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS codigo_externo text UNIQUE,
  ADD COLUMN IF NOT EXISTS segmento text,
  ADD COLUMN IF NOT EXISTS contato_nome text,
  ADD COLUMN IF NOT EXISTS contract_verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contract_verification_source text;

UPDATE public.clients SET products = array_replace(products, 'IA Agendamento', 'IA de Agendamento');

-- O término do onboarding passa a vir dos onboardings (e não mais dos checkboxes antigos).
CREATE OR REPLACE FUNCTION public.clients_track() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.contract_signed AND NEW.contract_signed_at IS NULL THEN NEW.contract_signed_at := now(); END IF;
  IF NOT NEW.contract_signed THEN NEW.contract_signed_at := NULL; END IF;
  RETURN NEW;
END; $$;

-- Leitura em português, no formato do módulo de onboarding.
CREATE VIEW public.clientes WITH (security_invoker = true) AS
SELECT c.id, c.clinic_name AS nome, c.codigo_externo, c.segmento, c.city AS cidade, c.state AS uf,
       c.contato_nome, COALESCE(c.whatsapp, c.phone) AS telefone, c.email,
       CASE
         WHEN c.onboarding_completed_at IS NOT NULL THEN 'onboarding_concluido'
         WHEN c.onboarding_released_at IS NOT NULL THEN 'em_onboarding'
         WHEN NOT c.contract_signed THEN 'aguardando_assinatura'
         WHEN NOT c.paid THEN 'aguardando_pagamento'
         WHEN c.contract_verified_at IS NULL THEN 'aguardando_verificacao'
         ELSE 'pronto_para_liberar'
       END AS status_contrato,
       c.products AS produtos, c.created_at
FROM public.clients c;

-- ---------- Modelos ---------------------------------------------------
CREATE TABLE public.modelos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  versao int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','publicado','arquivado')),
  calendario text NOT NULL DEFAULT 'uteis' CHECK (calendario IN ('uteis','corridos')),
  limiar_risco_pct int NOT NULL DEFAULT 80 CHECK (limiar_risco_pct BETWEEN 1 AND 100),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (produto_id, versao)
);
-- Um único modelo publicado por produto.
CREATE UNIQUE INDEX modelos_um_publicado ON public.modelos (produto_id) WHERE status = 'publicado';

CREATE TABLE public.modelo_fases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id uuid NOT NULL REFERENCES public.modelos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cor text NOT NULL DEFAULT '#7C3AED',
  ordem int NOT NULL DEFAULT 0
);

CREATE TABLE public.modelo_etapas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id uuid NOT NULL REFERENCES public.modelos(id) ON DELETE CASCADE,
  fase_id uuid REFERENCES public.modelo_fases(id) ON DELETE SET NULL,
  nome text NOT NULL,
  descricao text,
  ordem int NOT NULL DEFAULT 0,
  papel_id uuid REFERENCES public.papeis(id) ON DELETE SET NULL,
  sla_dias int NOT NULL DEFAULT 1 CHECK (sla_dias >= 0),
  principal boolean NOT NULL DEFAULT true,
  obrigatoria boolean NOT NULL DEFAULT true,
  pausa_sla_aguardando_cliente boolean NOT NULL DEFAULT false,
  exige_checklist boolean NOT NULL DEFAULT false
);

CREATE TABLE public.modelo_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa_id uuid NOT NULL REFERENCES public.modelo_etapas(id) ON DELETE CASCADE,
  texto text NOT NULL,
  obrigatorio boolean NOT NULL DEFAULT true,
  ordem int NOT NULL DEFAULT 0
);

CREATE TABLE public.produto_campos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  chave text NOT NULL,
  rotulo text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('texto','numero','data','selecao','sim_nao','link','usuario')),
  opcoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  obrigatorio boolean NOT NULL DEFAULT false,
  visivel_padrao boolean NOT NULL DEFAULT true,
  editavel_por text[] NOT NULL DEFAULT ARRAY['admin','gestor','operador'],
  ordem int NOT NULL DEFAULT 0,
  UNIQUE (produto_id, chave)
);

-- ---------- Onboardings -----------------------------------------------
CREATE TABLE public.onboardings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos(id),
  modelo_id uuid REFERENCES public.modelos(id) ON DELETE SET NULL,
  modelo_versao int,
  status text NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento','concluido','pausado','cancelado')),
  data_inicio date NOT NULL DEFAULT current_date,
  previsao_termino date,
  data_termino date,
  campos jsonb NOT NULL DEFAULT '{}'::jsonb,
  motivo text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX onboardings_cliente_idx ON public.onboardings (cliente_id);
-- Um onboarding ativo por cliente e produto.
CREATE UNIQUE INDEX onboardings_um_ativo ON public.onboardings (cliente_id, produto_id) WHERE status <> 'cancelado';

CREATE TABLE public.onboarding_responsaveis (
  onboarding_id uuid NOT NULL REFERENCES public.onboardings(id) ON DELETE CASCADE,
  papel_id uuid NOT NULL REFERENCES public.papeis(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (onboarding_id, papel_id)
);

-- Cópia das etapas do modelo no início do onboarding (modelo_etapa_id null = etapa extra).
CREATE TABLE public.onboarding_etapas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id uuid NOT NULL REFERENCES public.onboardings(id) ON DELETE CASCADE,
  modelo_etapa_id uuid REFERENCES public.modelo_etapas(id) ON DELETE SET NULL,
  fase_nome text,
  fase_cor text,
  nome text NOT NULL,
  descricao text,
  ordem int NOT NULL DEFAULT 0,
  papel_id uuid REFERENCES public.papeis(id) ON DELETE SET NULL,
  responsavel_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sla_dias int NOT NULL DEFAULT 1 CHECK (sla_dias >= 0),
  principal boolean NOT NULL DEFAULT true,
  obrigatoria boolean NOT NULL DEFAULT true,
  pausa_sla_aguardando_cliente boolean NOT NULL DEFAULT false,
  exige_checklist boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','em_andamento','aguardando_cliente','bloqueada','concluida','pulada')),
  iniciada_em timestamptz,
  prazo_em date,
  concluida_em timestamptz,
  concluida_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  motivo text,
  dias_pausados int NOT NULL DEFAULT 0,
  pausada_desde timestamptz
);
CREATE INDEX onboarding_etapas_onb_idx ON public.onboarding_etapas (onboarding_id, ordem);
CREATE INDEX onboarding_etapas_resp_idx ON public.onboarding_etapas (responsavel_id) WHERE status NOT IN ('concluida','pulada');

CREATE TABLE public.onboarding_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_etapa_id uuid NOT NULL REFERENCES public.onboarding_etapas(id) ON DELETE CASCADE,
  texto text NOT NULL,
  obrigatorio boolean NOT NULL DEFAULT true,
  ordem int NOT NULL DEFAULT 0,
  feito boolean NOT NULL DEFAULT false,
  feito_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  feito_em timestamptz
);

CREATE TABLE public.onboarding_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id uuid NOT NULL REFERENCES public.onboardings(id) ON DELETE CASCADE,
  onboarding_etapa_id uuid REFERENCES public.onboarding_etapas(id) ON DELETE SET NULL,
  tipo text NOT NULL,
  de text,
  para text,
  detalhe text,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX onboarding_eventos_onb_idx ON public.onboarding_eventos (onboarding_id, created_at);

CREATE TABLE public.onboarding_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id uuid NOT NULL REFERENCES public.onboardings(id) ON DELETE CASCADE,
  texto text NOT NULL CHECK (length(texto) BETWEEN 1 AND 5000),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.visoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  produto_id uuid REFERENCES public.produtos(id) ON DELETE CASCADE,
  dono_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE DEFAULT auth.uid(),
  publica boolean NOT NULL DEFAULT false,
  padrao_do_produto boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- ---------- Funções de calendário ------------------------------------
-- Soma n dias úteis (seg–sex, sem feriados) ou corridos. n negativo volta no tempo.
CREATE OR REPLACE FUNCTION public.somar_dias(_data date, _n int, _calendario text DEFAULT 'uteis')
RETURNS date LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE d date := _data; faltam int := abs(COALESCE(_n, 0)); passo int := CASE WHEN _n < 0 THEN -1 ELSE 1 END;
BEGIN
  IF _data IS NULL THEN RETURN NULL; END IF;
  IF _calendario = 'corridos' THEN RETURN _data + COALESCE(_n, 0); END IF;
  WHILE faltam > 0 LOOP
    d := d + passo;
    IF extract(isodow FROM d) < 6 AND NOT EXISTS (SELECT 1 FROM public.feriados f WHERE f.data = d) THEN
      faltam := faltam - 1;
    END IF;
  END LOOP;
  RETURN d;
END; $$;

-- Dias entre a (exclusive) e b (inclusive), úteis ou corridos. Negativo se b < a.
CREATE OR REPLACE FUNCTION public.dias_entre(_a date, _b date, _calendario text DEFAULT 'uteis')
RETURNS int LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF _a IS NULL OR _b IS NULL THEN RETURN NULL; END IF;
  IF _calendario = 'corridos' THEN RETURN _b - _a; END IF;
  IF _b < _a THEN RETURN -public.dias_entre(_b, _a, _calendario); END IF;
  SELECT count(*) INTO n
  FROM generate_series(_a + 1, _b, interval '1 day') g(d)
  WHERE extract(isodow FROM g.d) < 6 AND NOT EXISTS (SELECT 1 FROM public.feriados f WHERE f.data = g.d::date);
  RETURN n;
END; $$;

CREATE OR REPLACE FUNCTION public.onboarding_calendario(_onboarding_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(m.calendario, 'uteis') FROM public.onboardings o
  LEFT JOIN public.modelos m ON m.id = o.modelo_id WHERE o.id = _onboarding_id
$$;

-- ---------- Regras das etapas ----------------------------------------
-- Controla permissões por coluna, prazos, pausa de SLA e conclusão.
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
    OR NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id OR NEW.papel_id IS DISTINCT FROM OLD.papel_id
    OR NEW.nome IS DISTINCT FROM OLD.nome OR NEW.ordem IS DISTINCT FROM OLD.ordem
    OR NEW.obrigatoria IS DISTINCT FROM OLD.obrigatoria OR NEW.onboarding_id IS DISTINCT FROM OLD.onboarding_id
    OR NEW.dias_pausados IS DISTINCT FROM OLD.dias_pausados) THEN
    RAISE EXCEPTION 'Apenas gestores do produto alteram responsável, prazo ou estrutura da etapa';
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
CREATE TRIGGER onboarding_etapas_regras BEFORE INSERT OR UPDATE ON public.onboarding_etapas
  FOR EACH ROW EXECUTE FUNCTION public.onboarding_etapas_regras();

-- Ao concluir/pular uma etapa, inicia a próxima pendente. Fecha o onboarding quando acabar.
CREATE OR REPLACE FUNCTION public.onboarding_etapas_fluxo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE proxima uuid; restantes int;
BEGIN
  INSERT INTO public.onboarding_eventos (onboarding_id, onboarding_etapa_id, tipo, de, para, detalhe, user_id)
  VALUES (NEW.onboarding_id, NEW.id, 'etapa_status', OLD.status, NEW.status, NEW.motivo, auth.uid());

  IF NEW.status IN ('concluida','pulada') THEN
    SELECT count(*) INTO restantes FROM public.onboarding_etapas
      WHERE onboarding_id = NEW.onboarding_id AND status IN ('em_andamento','aguardando_cliente','bloqueada');
    IF restantes = 0 THEN
      SELECT id INTO proxima FROM public.onboarding_etapas
        WHERE onboarding_id = NEW.onboarding_id AND status = 'pendente' ORDER BY ordem LIMIT 1;
      IF proxima IS NOT NULL THEN
        UPDATE public.onboarding_etapas SET status = 'em_andamento' WHERE id = proxima;
      ELSIF NOT EXISTS (SELECT 1 FROM public.onboarding_etapas
                        WHERE onboarding_id = NEW.onboarding_id AND status NOT IN ('concluida','pulada')) THEN
        UPDATE public.onboardings SET status = 'concluido', data_termino = current_date
          WHERE id = NEW.onboarding_id AND status = 'em_andamento';
      END IF;
    END IF;
  ELSIF OLD.status IN ('concluida','pulada') THEN
    UPDATE public.onboardings SET status = 'em_andamento', data_termino = NULL
      WHERE id = NEW.onboarding_id AND status = 'concluido';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER onboarding_etapas_fluxo AFTER UPDATE OF status ON public.onboarding_etapas
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.onboarding_etapas_fluxo();

CREATE OR REPLACE FUNCTION public.onboarding_checklist_marca() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.feito IS DISTINCT FROM OLD.feito THEN
    NEW.feito_em := CASE WHEN NEW.feito THEN now() END;
    NEW.feito_por := CASE WHEN NEW.feito THEN auth.uid() END;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER onboarding_checklist_marca BEFORE UPDATE ON public.onboarding_checklist
  FOR EACH ROW EXECUTE FUNCTION public.onboarding_checklist_marca();

-- Mantém clients.onboarding_completed_at: preenchido quando todos os onboardings do cliente terminam.
CREATE OR REPLACE FUNCTION public.onboardings_status_cliente() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fim timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.onboarding_eventos (onboarding_id, tipo, de, para, detalhe, user_id)
    VALUES (NEW.id, 'onboarding_status', OLD.status, NEW.status, NEW.motivo, auth.uid());
  END IF;
  SELECT CASE WHEN bool_and(status IN ('concluido','cancelado')) AND bool_or(status = 'concluido')
              THEN max(data_termino)::timestamptz END
    INTO fim FROM public.onboardings WHERE cliente_id = NEW.cliente_id;
  UPDATE public.clients SET onboarding_completed_at = fim
    WHERE id = NEW.cliente_id AND onboarding_completed_at IS DISTINCT FROM fim;
  RETURN NEW;
END; $$;
CREATE TRIGGER onboardings_status_cliente AFTER INSERT OR UPDATE OF status, data_termino ON public.onboardings
  FOR EACH ROW EXECUTE FUNCTION public.onboardings_status_cliente();

-- Operadores atualizam status/campos; estrutura e prazos do onboarding são do gestor.
CREATE OR REPLACE FUNCTION public.onboardings_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('postgres','service_role','supabase_admin') AND COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.gere_produto(OLD.produto_id) AND (
          NEW.produto_id IS DISTINCT FROM OLD.produto_id OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
       OR NEW.modelo_id IS DISTINCT FROM OLD.modelo_id OR NEW.modelo_versao IS DISTINCT FROM OLD.modelo_versao
       OR NEW.data_inicio IS DISTINCT FROM OLD.data_inicio OR NEW.previsao_termino IS DISTINCT FROM OLD.previsao_termino
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
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
CREATE TRIGGER onboardings_guard BEFORE UPDATE ON public.onboardings FOR EACH ROW EXECUTE FUNCTION public.onboardings_guard();

-- Log de auditoria imutável.
CREATE OR REPLACE FUNCTION public.onboarding_eventos_imutavel() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Só as ações em cascata das chaves estrangeiras (exclusão do onboarding/etapa) passam.
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF NEW.onboarding_etapa_id IS NULL AND (to_jsonb(NEW) - 'onboarding_etapa_id') = (to_jsonb(OLD) - 'onboarding_etapa_id') THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'O histórico de eventos não pode ser alterado';
END; $$;
CREATE TRIGGER onboarding_eventos_imutavel BEFORE UPDATE OR DELETE ON public.onboarding_eventos
  FOR EACH ROW EXECUTE FUNCTION public.onboarding_eventos_imutavel();

-- ---------- Criação do onboarding a partir do modelo -----------------
-- Uso interno (trigger da liberação e RPC iniciar_onboarding). Copia fases, etapas e checklist.
CREATE OR REPLACE FUNCTION public._criar_onboarding(_cliente_id uuid, _produto_id uuid, _data_inicio date DEFAULT current_date)
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
  IF EXISTS (SELECT 1 FROM public.onboardings WHERE cliente_id = _cliente_id AND produto_id = _produto_id AND status <> 'cancelado') THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(sum(sla_dias), 0) INTO total FROM public.modelo_etapas WHERE modelo_id = m.id;

  INSERT INTO public.onboardings (cliente_id, produto_id, modelo_id, modelo_versao, data_inicio, previsao_termino, created_by)
  VALUES (_cliente_id, _produto_id, m.id, m.versao, _data_inicio, public.somar_dias(_data_inicio, total, m.calendario), auth.uid())
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
  VALUES (onb, 'criado', 'em_andamento', 'Modelo ' || m.nome || ' v' || m.versao, auth.uid());

  IF primeira IS NOT NULL THEN
    UPDATE public.onboarding_etapas
       SET status = 'em_andamento', iniciada_em = _data_inicio::timestamptz,
           prazo_em = public.somar_dias(_data_inicio, sla_dias, m.calendario)
     WHERE id = primeira;
  END IF;
  RETURN onb;
END; $$;
REVOKE ALL ON FUNCTION public._criar_onboarding(uuid, uuid, date) FROM PUBLIC, anon, authenticated;

-- RPC para gestores iniciarem um onboarding manualmente (cliente já liberado).
CREATE OR REPLACE FUNCTION public.iniciar_onboarding(_cliente_id uuid, _produto_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.gere_produto(_produto_id) THEN RAISE EXCEPTION 'Sem permissão para iniciar onboarding deste produto'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = _cliente_id AND onboarding_released_at IS NOT NULL) THEN
    RAISE EXCEPTION 'O cliente precisa estar liberado (pago e contrato verificado)';
  END IF;
  RETURN public._criar_onboarding(_cliente_id, _produto_id, current_date);
END; $$;
REVOKE ALL ON FUNCTION public.iniciar_onboarding(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iniciar_onboarding(uuid, uuid) TO authenticated;

-- Passagem Contratos → Onboarding: ao liberar o cliente, cria um onboarding por produto contratado.
CREATE OR REPLACE FUNCTION public.clients_inicia_onboarding() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF NEW.onboarding_released_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.onboarding_released_at IS NULL) THEN
    FOR p IN SELECT id FROM public.produtos WHERE ativo AND nome = ANY (NEW.products) LOOP
      PERFORM public._criar_onboarding(NEW.id, p.id, current_date);
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER clients_inicia_onboarding AFTER INSERT OR UPDATE OF onboarding_released_at ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.clients_inicia_onboarding();

-- ---------- Visões de leitura com situação de SLA ---------------------
CREATE VIEW public.onboarding_etapas_situacao WITH (security_invoker = true) AS
SELECT e.*,
  x.dias_decorridos,
  CASE
    WHEN e.status = 'concluida' THEN 'concluido'
    WHEN e.status = 'pulada' THEN 'pulada'
    WHEN e.status = 'bloqueada' THEN 'bloqueado'
    WHEN e.status = 'aguardando_cliente' THEN 'aguardando_cliente'
    WHEN e.status = 'pendente' THEN 'pendente'
    WHEN e.prazo_em IS NOT NULL AND current_date > e.prazo_em THEN 'atrasado'
    WHEN e.sla_dias > 0 AND x.dias_decorridos * 100 >= e.sla_dias * COALESCE(m.limiar_risco_pct, 80) THEN 'em_risco'
    ELSE 'no_prazo'
  END AS situacao
FROM public.onboarding_etapas e
JOIN public.onboardings o ON o.id = e.onboarding_id
LEFT JOIN public.modelos m ON m.id = o.modelo_id
CROSS JOIN LATERAL (SELECT
  CASE WHEN e.iniciada_em IS NULL THEN 0 ELSE
    public.dias_entre(e.iniciada_em::date, COALESCE(e.concluida_em::date, current_date), COALESCE(m.calendario, 'uteis'))
    - e.dias_pausados
    - CASE WHEN e.pausada_desde IS NULL THEN 0
           ELSE public.dias_entre(e.pausada_desde::date, current_date, COALESCE(m.calendario, 'uteis')) END
  END AS dias_decorridos) x;

CREATE VIEW public.onboardings_resumo WITH (security_invoker = true) AS
SELECT o.*, c.clinic_name AS cliente_nome, p.nome AS produto_nome, p.cor AS produto_cor,
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

-- ---------- Grants e RLS ---------------------------------------------
GRANT SELECT ON public.papeis, public.produtos, public.produto_gestores, public.feriados, public.modelos,
  public.modelo_fases, public.modelo_etapas, public.modelo_checklist, public.produto_campos, public.onboardings,
  public.onboarding_responsaveis, public.onboarding_etapas, public.onboarding_checklist, public.onboarding_eventos,
  public.onboarding_notas, public.visoes, public.clientes, public.onboarding_etapas_situacao, public.onboardings_resumo
  TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.papeis, public.produtos, public.produto_gestores, public.feriados, public.modelos,
  public.modelo_fases, public.modelo_etapas, public.modelo_checklist, public.produto_campos, public.onboardings,
  public.onboarding_responsaveis, public.onboarding_etapas, public.onboarding_checklist, public.visoes
  TO authenticated;
GRANT INSERT ON public.onboarding_eventos, public.onboarding_notas TO authenticated;
GRANT ALL ON public.papeis, public.produtos, public.produto_gestores, public.feriados, public.modelos,
  public.modelo_fases, public.modelo_etapas, public.modelo_checklist, public.produto_campos, public.onboardings,
  public.onboarding_responsaveis, public.onboarding_etapas, public.onboarding_checklist, public.onboarding_eventos,
  public.onboarding_notas, public.visoes, public.clientes, public.onboarding_etapas_situacao, public.onboardings_resumo
  TO service_role;

ALTER TABLE public.papeis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_gestores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feriados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modelos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modelo_fases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modelo_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modelo_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_campos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboardings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_responsaveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_notas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visoes ENABLE ROW LEVEL SECURITY;

-- Cadastros: leitura da equipe, escrita do admin.
CREATE POLICY "Equipe lê papéis" ON public.papeis FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin gerencia papéis" ON public.papeis FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Equipe lê produtos" ON public.produtos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin gerencia produtos" ON public.produtos FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Equipe lê gestores" ON public.produto_gestores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin vincula gestores" ON public.produto_gestores FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Equipe lê feriados" ON public.feriados FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin gerencia feriados" ON public.feriados FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Modelos e campos: gestor do produto (ou admin).
CREATE POLICY "Equipe lê modelos" ON public.modelos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gestor edita modelos" ON public.modelos FOR ALL TO authenticated
  USING (public.gere_produto(produto_id)) WITH CHECK (public.gere_produto(produto_id));
CREATE POLICY "Equipe lê fases" ON public.modelo_fases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gestor edita fases" ON public.modelo_fases FOR ALL TO authenticated
  USING (public.gere_produto((SELECT produto_id FROM public.modelos WHERE id = modelo_id)))
  WITH CHECK (public.gere_produto((SELECT produto_id FROM public.modelos WHERE id = modelo_id)));
CREATE POLICY "Equipe lê etapas do modelo" ON public.modelo_etapas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gestor edita etapas do modelo" ON public.modelo_etapas FOR ALL TO authenticated
  USING (public.gere_produto((SELECT produto_id FROM public.modelos WHERE id = modelo_id)))
  WITH CHECK (public.gere_produto((SELECT produto_id FROM public.modelos WHERE id = modelo_id)));
CREATE POLICY "Equipe lê checklist do modelo" ON public.modelo_checklist FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gestor edita checklist do modelo" ON public.modelo_checklist FOR ALL TO authenticated
  USING (public.gere_produto((SELECT m.produto_id FROM public.modelo_etapas e JOIN public.modelos m ON m.id = e.modelo_id WHERE e.id = etapa_id)))
  WITH CHECK (public.gere_produto((SELECT m.produto_id FROM public.modelo_etapas e JOIN public.modelos m ON m.id = e.modelo_id WHERE e.id = etapa_id)));
CREATE POLICY "Equipe lê campos" ON public.produto_campos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gestor edita campos" ON public.produto_campos FOR ALL TO authenticated
  USING (public.gere_produto(produto_id)) WITH CHECK (public.gere_produto(produto_id));

-- Onboardings: equipe lê; gestor cria/edita/exclui; operadores atualizam (status/campos).
CREATE POLICY "Equipe lê onboardings" ON public.onboardings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gestor cria onboardings" ON public.onboardings FOR INSERT TO authenticated WITH CHECK (public.gere_produto(produto_id));
CREATE POLICY "Operação atualiza onboardings" ON public.onboardings FOR UPDATE TO authenticated
  USING (public.pode_operar()) WITH CHECK (public.pode_operar());
CREATE POLICY "Gestor exclui onboardings" ON public.onboardings FOR DELETE TO authenticated USING (public.gere_produto(produto_id));

CREATE POLICY "Equipe lê responsáveis" ON public.onboarding_responsaveis FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gestor define responsáveis" ON public.onboarding_responsaveis FOR ALL TO authenticated
  USING (public.gere_produto((SELECT produto_id FROM public.onboardings WHERE id = onboarding_id)))
  WITH CHECK (public.gere_produto((SELECT produto_id FROM public.onboardings WHERE id = onboarding_id)));

CREATE POLICY "Equipe lê etapas" ON public.onboarding_etapas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operação executa etapas" ON public.onboarding_etapas FOR UPDATE TO authenticated
  USING (public.pode_operar()) WITH CHECK (public.pode_operar());
CREATE POLICY "Gestor cria etapas extras" ON public.onboarding_etapas FOR INSERT TO authenticated
  WITH CHECK (public.gere_produto((SELECT produto_id FROM public.onboardings WHERE id = onboarding_id)));
CREATE POLICY "Gestor exclui etapas" ON public.onboarding_etapas FOR DELETE TO authenticated
  USING (public.gere_produto((SELECT produto_id FROM public.onboardings WHERE id = onboarding_id)));

CREATE POLICY "Equipe lê checklist" ON public.onboarding_checklist FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operação marca checklist" ON public.onboarding_checklist FOR UPDATE TO authenticated
  USING (public.pode_operar()) WITH CHECK (public.pode_operar());
CREATE POLICY "Gestor cria itens de checklist" ON public.onboarding_checklist FOR INSERT TO authenticated
  WITH CHECK (public.gere_produto((SELECT o.produto_id FROM public.onboarding_etapas e JOIN public.onboardings o ON o.id = e.onboarding_id WHERE e.id = onboarding_etapa_id)));
CREATE POLICY "Gestor exclui itens de checklist" ON public.onboarding_checklist FOR DELETE TO authenticated
  USING (public.gere_produto((SELECT o.produto_id FROM public.onboarding_etapas e JOIN public.onboardings o ON o.id = e.onboarding_id WHERE e.id = onboarding_etapa_id)));

CREATE POLICY "Equipe lê eventos" ON public.onboarding_eventos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operação registra eventos" ON public.onboarding_eventos FOR INSERT TO authenticated
  WITH CHECK (public.pode_operar() AND user_id = auth.uid());

CREATE POLICY "Equipe lê notas" ON public.onboarding_notas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operação anota" ON public.onboarding_notas FOR INSERT TO authenticated
  WITH CHECK (public.pode_operar() AND user_id = auth.uid());

CREATE POLICY "Lê visões públicas ou próprias" ON public.visoes FOR SELECT TO authenticated
  USING (publica OR dono_id = auth.uid());
CREATE POLICY "Cria visões" ON public.visoes FOR INSERT TO authenticated
  WITH CHECK (dono_id = auth.uid() AND (NOT (publica OR padrao_do_produto)
    OR public.is_admin() OR (produto_id IS NOT NULL AND public.gere_produto(produto_id))));
CREATE POLICY "Edita visões próprias" ON public.visoes FOR UPDATE TO authenticated
  USING (dono_id = auth.uid() OR public.is_admin())
  WITH CHECK ((dono_id = auth.uid() OR public.is_admin()) AND (NOT (publica OR padrao_do_produto)
    OR public.is_admin() OR (produto_id IS NOT NULL AND public.gere_produto(produto_id))));
CREATE POLICY "Exclui visões próprias" ON public.visoes FOR DELETE TO authenticated
  USING (dono_id = auth.uid() OR public.is_admin());
