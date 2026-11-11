-- Reabrir (ou desfazer) uma etapa concluída/pulada: volta para "em andamento" e devolve para
-- "pendente" as etapas seguintes que o fluxo iniciou sozinho depois dela e ainda não tiveram andamento.

CREATE OR REPLACE FUNCTION public.reabrir_etapa(_etapa_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.onboarding_etapas%ROWTYPE;
  desde timestamptz;
BEGIN
  IF NOT public.pode_operar() THEN RAISE EXCEPTION 'Sem permissão para alterar etapas'; END IF;
  SELECT * INTO e FROM public.onboarding_etapas WHERE id = _etapa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Etapa não encontrada'; END IF;
  IF e.status NOT IN ('concluida','pulada') THEN
    RAISE EXCEPTION 'Só etapas concluídas ou puladas podem ser reabertas';
  END IF;
  IF EXISTS (SELECT 1 FROM public.onboardings WHERE id = e.onboarding_id AND status = 'cancelado') THEN
    RAISE EXCEPTION 'Onboarding cancelado não pode ser alterado';
  END IF;

  -- Momento em que a etapa foi concluída/pulada (último evento para o status atual).
  SELECT max(created_at) INTO desde FROM public.onboarding_eventos
   WHERE onboarding_etapa_id = e.id AND tipo = 'etapa_status' AND para = e.status;

  UPDATE public.onboarding_etapas s
     SET status = 'pendente', iniciada_em = NULL, prazo_em = NULL, pausada_desde = NULL, dias_pausados = 0
   WHERE s.onboarding_id = e.onboarding_id AND s.ordem > e.ordem AND s.status = 'em_andamento'
     AND desde IS NOT NULL AND s.iniciada_em >= desde
     AND NOT EXISTS (SELECT 1 FROM public.onboarding_checklist c WHERE c.onboarding_etapa_id = s.id AND c.feito)
     AND NOT EXISTS (SELECT 1 FROM public.onboarding_notas n WHERE n.onboarding_etapa_id = s.id AND n.created_at >= desde);

  UPDATE public.onboarding_etapas SET status = 'em_andamento' WHERE id = e.id;
END; $$;

REVOKE ALL ON FUNCTION public.reabrir_etapa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reabrir_etapa(uuid) TO authenticated;
