-- Arquivar casos de retenção: saem das listas e das métricas, mas continuam no banco (dá para desarquivar).
-- A coleta da API não mexe nesses campos.

ALTER TABLE public.retencao_casos
  ADD COLUMN arquivado boolean NOT NULL DEFAULT false,
  ADD COLUMN arquivado_motivo text,
  ADD COLUMN arquivado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN arquivado_em timestamptz;
CREATE INDEX retencao_casos_arquivado ON public.retencao_casos (arquivado);

-- Quem arquivou e quando são preenchidos pelo banco; arquivar exige motivo.
CREATE OR REPLACE FUNCTION public.retencao_casos_arquivo() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.arquivado IS DISTINCT FROM OLD.arquivado THEN
    IF NEW.arquivado THEN
      IF coalesce(btrim(NEW.arquivado_motivo), '') = '' THEN
        RAISE EXCEPTION 'Informe o motivo para arquivar';
      END IF;
      NEW.arquivado_por := auth.uid();
      NEW.arquivado_em := now();
    ELSE
      NEW.arquivado_motivo := NULL; NEW.arquivado_por := NULL; NEW.arquivado_em := NULL;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER retencao_casos_arquivo BEFORE UPDATE OF arquivado ON public.retencao_casos
  FOR EACH ROW EXECUTE FUNCTION public.retencao_casos_arquivo();

-- Histórico do arquivamento.
CREATE OR REPLACE FUNCTION public.retencao_casos_arquivo_hist() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.arquivado IS DISTINCT FROM OLD.arquivado THEN
    INSERT INTO public.retencao_atividades (caso_id, tipo, texto, user_id)
    VALUES (NEW.id, 'nota', CASE WHEN NEW.arquivado THEN 'Arquivado: ' || NEW.arquivado_motivo ELSE 'Desarquivado' END, auth.uid());
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER retencao_casos_arquivo_hist AFTER UPDATE OF arquivado ON public.retencao_casos
  FOR EACH ROW EXECUTE FUNCTION public.retencao_casos_arquivo_hist();

-- Campos que o CS pode mudar (o resto vem da API).
CREATE OR REPLACE FUNCTION public.retencao_casos_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  livres text[] := ARRAY['status','responsavel_id','tags','observacao','updated_at','em_andamento_desde','prazo_resolucao',
                         'encerrado_em','arquivado','arquivado_motivo','arquivado_por','arquivado_em'];
BEGIN
  IF current_user IN ('postgres','service_role','supabase_admin') OR COALESCE(auth.role(),'') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - livres) IS DISTINCT FROM (to_jsonb(OLD) - livres) THEN
    RAISE EXCEPTION 'Os dados vindos da API não podem ser alterados';
  END IF;
  RETURN NEW;
END; $$;

-- A view expande c.* na criação: recriar para incluir os campos novos.
DROP VIEW public.retencao_casos_situacao;
CREATE VIEW public.retencao_casos_situacao WITH (security_invoker = true) AS
SELECT c.*,
  coalesce(c.primeiro_contato_em, c.primeiro_contato_api) AS contato_feito_em,
  coalesce(c.data_preenchimento, c.data_solicitacao) + interval '48 hours' AS prazo_contato,
  (NOT c.arquivado AND c.status = 'nao_iniciado' AND coalesce(c.primeiro_contato_em, c.primeiro_contato_api) IS NULL
     AND now() > coalesce(c.data_preenchimento, c.data_solicitacao) + interval '48 hours') AS contato_atrasado,
  CASE WHEN c.status = 'em_andamento' AND c.prazo_resolucao IS NOT NULL
       THEN public.dias_entre(current_date, c.prazo_resolucao, 'uteis') END AS dias_uteis_restantes,
  (NOT c.arquivado AND c.status = 'em_andamento' AND c.prazo_resolucao IS NOT NULL AND current_date > c.prazo_resolucao) AS prazo_atrasado
FROM public.retencao_casos c;
GRANT SELECT ON public.retencao_casos_situacao TO authenticated, service_role;
