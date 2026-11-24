-- Retenção no formato real da API (cancelamentoServicos/listarExterno).
-- A API já tem status próprio: Pendente (formulário não preenchido), Não Iniciado (preenchido, aguardando o CS),
-- Em Andamento e Finalizado com tipo C (cancelou), D (downgrade) ou X (nenhum serviço cancelado = revertido).
-- O 1º contato vem da primeira anotação feita na gestão (ou de um contato registrado aqui).

ALTER TABLE public.retencao_casos
  ADD COLUMN status_api text,                 -- status da API já convertido (para detectar mudança)
  ADD COLUMN tipo_finalizacao text,
  ADD COLUMN data_preenchimento timestamptz,
  ADD COLUMN data_finalizacao timestamptz,
  ADD COLUMN solicitante text,
  ADD COLUMN criado_por_nome text,
  ADD COLUMN finalizado_por_nome text,
  ADD COLUMN motivo_detalhe text,
  ADD COLUMN servicos jsonb NOT NULL DEFAULT '[]',     -- [{nome, cancelado}]
  ADD COLUMN servicos_restantes text,
  ADD COLUMN anotacoes jsonb NOT NULL DEFAULT '[]',    -- [{nome, data, texto}]
  ADD COLUMN primeiro_contato_api timestamptz,
  ADD COLUMN link text;

-- Prazos: em andamento importado já assim começa na 1ª anotação (ou no preenchimento do formulário).
CREATE OR REPLACE FUNCTION public.retencao_casos_regras() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE inicio timestamptz;
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'em_andamento' AND NEW.em_andamento_desde IS NULL THEN
      inicio := coalesce(NEW.primeiro_contato_api, NEW.data_preenchimento, NEW.data_solicitacao);
      NEW.em_andamento_desde := inicio;
      NEW.prazo_resolucao := public.somar_dias(inicio::date, 5, 'uteis');
    END IF;
    IF NEW.status IN ('revertido','downgrade','finalizado') THEN
      NEW.encerrado_em := coalesce(NEW.data_finalizacao, now());
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'em_andamento' AND OLD.status IN ('nao_iniciado','pendente') THEN
      NEW.em_andamento_desde := now();
      NEW.prazo_resolucao := public.somar_dias(current_date, 5, 'uteis');
    END IF;
    IF NEW.status IN ('revertido','downgrade','finalizado') THEN
      NEW.encerrado_em := coalesce(NEW.data_finalizacao, now());
    ELSE
      NEW.encerrado_em := NULL;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- Campos da API continuam somente do sincronizador.
CREATE OR REPLACE FUNCTION public.retencao_casos_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  livres text[] := ARRAY['status','responsavel_id','tags','observacao','updated_at','em_andamento_desde','prazo_resolucao','encerrado_em'];
BEGIN
  IF current_user IN ('postgres','service_role','supabase_admin') OR COALESCE(auth.role(),'') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - livres) IS DISTINCT FROM (to_jsonb(OLD) - livres) THEN
    RAISE EXCEPTION 'Os dados vindos da API não podem ser alterados';
  END IF;
  RETURN NEW;
END; $$;

-- Leitura com prazos: 48h para o 1º contato contam a partir do preenchimento do formulário (status Não iniciado).
DROP VIEW public.retencao_casos_situacao;
CREATE VIEW public.retencao_casos_situacao WITH (security_invoker = true) AS
SELECT c.*,
  coalesce(c.primeiro_contato_em, c.primeiro_contato_api) AS contato_feito_em,
  coalesce(c.data_preenchimento, c.data_solicitacao) + interval '48 hours' AS prazo_contato,
  (c.status = 'nao_iniciado' AND coalesce(c.primeiro_contato_em, c.primeiro_contato_api) IS NULL
     AND now() > coalesce(c.data_preenchimento, c.data_solicitacao) + interval '48 hours') AS contato_atrasado,
  CASE WHEN c.status = 'em_andamento' AND c.prazo_resolucao IS NOT NULL
       THEN public.dias_entre(current_date, c.prazo_resolucao, 'uteis') END AS dias_uteis_restantes,
  (c.status = 'em_andamento' AND c.prazo_resolucao IS NOT NULL AND current_date > c.prazo_resolucao) AS prazo_atrasado
FROM public.retencao_casos c;
GRANT SELECT ON public.retencao_casos_situacao TO authenticated, service_role;
