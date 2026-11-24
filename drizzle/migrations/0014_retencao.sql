-- Retenção: pedidos de cancelamento coletados da API de gestão (2x por dia) e trabalhados pelo CS.
-- Status: nao_iniciado (nasce assim) → pendente / em_andamento → revertido | downgrade | finalizado.
-- Prazos: primeiro contato em até 48h da solicitação; em andamento resolve em até 5 dias úteis.

CREATE TABLE public.retencao_casos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem_id text NOT NULL UNIQUE,              -- id do pedido na API (ou chave derivada)
  id_appcrc text,
  cliente_nome text,
  telefone text,
  email text,
  motivo_api text,
  data_solicitacao timestamptz NOT NULL,
  formulario_preenchido boolean,
  dados jsonb NOT NULL DEFAULT '{}',           -- registro original da API
  status text NOT NULL DEFAULT 'nao_iniciado'
    CHECK (status IN ('nao_iniciado','pendente','em_andamento','revertido','downgrade','finalizado')),
  responsavel_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  tags text[] NOT NULL DEFAULT '{}',
  observacao text,
  primeiro_contato_em timestamptz,
  em_andamento_desde timestamptz,
  prazo_resolucao date,
  encerrado_em timestamptz,
  sincronizado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX retencao_casos_status ON public.retencao_casos (status, data_solicitacao DESC);
CREATE INDEX retencao_casos_appcrc ON public.retencao_casos (id_appcrc);

-- Contatos, mudanças de status e notas (histórico imutável).
CREATE TABLE public.retencao_atividades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caso_id uuid NOT NULL REFERENCES public.retencao_casos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('contato','status','nota')),
  canal text,                                  -- whatsapp, ligacao, email, outro
  resultado text,                              -- como foi o contato
  de text,
  para text,
  texto text CHECK (texto IS NULL OR length(texto) <= 2000),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX retencao_atividades_caso ON public.retencao_atividades (caso_id, created_at DESC);

CREATE TABLE public.retencao_sincronizacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL,
  recebidos int NOT NULL DEFAULT 0,
  novos int NOT NULL DEFAULT 0,
  atualizados int NOT NULL DEFAULT 0,
  erro text,
  origem text NOT NULL DEFAULT 'agendado'      -- agendado | manual
);

-- Regras: datas de controle, prazos e histórico de status.
CREATE OR REPLACE FUNCTION public.retencao_casos_regras() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'em_andamento' AND OLD.status IN ('nao_iniciado','pendente') THEN
      NEW.em_andamento_desde := now();
      NEW.prazo_resolucao := public.somar_dias(current_date, 5, 'uteis');
    END IF;
    IF NEW.status IN ('revertido','downgrade','finalizado') THEN
      NEW.encerrado_em := now();
    ELSE
      NEW.encerrado_em := NULL;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER retencao_casos_regras BEFORE INSERT OR UPDATE ON public.retencao_casos
  FOR EACH ROW EXECUTE FUNCTION public.retencao_casos_regras();

CREATE OR REPLACE FUNCTION public.retencao_casos_historico() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.retencao_atividades (caso_id, tipo, de, para, user_id)
    VALUES (NEW.id, 'status', OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER retencao_casos_historico AFTER UPDATE OF status ON public.retencao_casos
  FOR EACH ROW EXECUTE FUNCTION public.retencao_casos_historico();

-- Primeiro contato registrado marca o caso (controle das 48h).
CREATE OR REPLACE FUNCTION public.retencao_atividades_contato() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tipo = 'contato' THEN
    UPDATE public.retencao_casos SET primeiro_contato_em = NEW.created_at
     WHERE id = NEW.caso_id AND primeiro_contato_em IS NULL;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER retencao_atividades_contato AFTER INSERT ON public.retencao_atividades
  FOR EACH ROW EXECUTE FUNCTION public.retencao_atividades_contato();

CREATE OR REPLACE FUNCTION public.retencao_atividades_imutavel() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() > 1 AND TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'O histórico da retenção não pode ser alterado';
END; $$;
CREATE TRIGGER retencao_atividades_imutavel BEFORE UPDATE OR DELETE ON public.retencao_atividades
  FOR EACH ROW EXECUTE FUNCTION public.retencao_atividades_imutavel();

-- Leitura com os prazos calculados.
CREATE VIEW public.retencao_casos_situacao WITH (security_invoker = true) AS
SELECT c.*,
  c.data_solicitacao + interval '48 hours' AS prazo_contato,
  (c.primeiro_contato_em IS NULL AND c.status IN ('nao_iniciado','pendente') AND now() > c.data_solicitacao + interval '48 hours') AS contato_atrasado,
  CASE WHEN c.status = 'em_andamento' AND c.prazo_resolucao IS NOT NULL
       THEN public.dias_entre(current_date, c.prazo_resolucao, 'uteis') END AS dias_uteis_restantes,
  (c.status = 'em_andamento' AND c.prazo_resolucao IS NOT NULL AND current_date > c.prazo_resolucao) AS prazo_atrasado
FROM public.retencao_casos c;

-- Quem trabalha a retenção: operação (admin, gestor, operador, CS).
GRANT SELECT, UPDATE ON public.retencao_casos TO authenticated;
GRANT SELECT, INSERT ON public.retencao_atividades TO authenticated;
GRANT SELECT ON public.retencao_sincronizacoes, public.retencao_casos_situacao TO authenticated;
GRANT ALL ON public.retencao_casos, public.retencao_atividades, public.retencao_sincronizacoes TO service_role;
ALTER TABLE public.retencao_casos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retencao_atividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retencao_sincronizacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Operação lê retenção" ON public.retencao_casos FOR SELECT TO authenticated USING (public.pode_operar());
CREATE POLICY "Operação trabalha retenção" ON public.retencao_casos FOR UPDATE TO authenticated
  USING (public.pode_operar()) WITH CHECK (public.pode_operar());
CREATE POLICY "Operação lê atividades" ON public.retencao_atividades FOR SELECT TO authenticated USING (public.pode_operar());
CREATE POLICY "Operação registra atividades" ON public.retencao_atividades FOR INSERT TO authenticated
  WITH CHECK (public.pode_operar() AND user_id = auth.uid() AND tipo IN ('contato','nota'));
CREATE POLICY "Operação lê sincronizações" ON public.retencao_sincronizacoes FOR SELECT TO authenticated USING (public.pode_operar());

-- Usuário só muda o trabalho do CS; os dados vindos da API são do sincronizador.
CREATE OR REPLACE FUNCTION public.retencao_casos_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('postgres','service_role','supabase_admin') OR COALESCE(auth.role(),'') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.origem_id IS DISTINCT FROM OLD.origem_id OR NEW.id_appcrc IS DISTINCT FROM OLD.id_appcrc
     OR NEW.cliente_nome IS DISTINCT FROM OLD.cliente_nome OR NEW.telefone IS DISTINCT FROM OLD.telefone
     OR NEW.email IS DISTINCT FROM OLD.email OR NEW.data_solicitacao IS DISTINCT FROM OLD.data_solicitacao
     OR NEW.dados IS DISTINCT FROM OLD.dados OR NEW.motivo_api IS DISTINCT FROM OLD.motivo_api
     OR NEW.primeiro_contato_em IS DISTINCT FROM OLD.primeiro_contato_em THEN
    RAISE EXCEPTION 'Os dados vindos da API não podem ser alterados';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER retencao_casos_guard BEFORE UPDATE ON public.retencao_casos
  FOR EACH ROW EXECUTE FUNCTION public.retencao_casos_guard();
