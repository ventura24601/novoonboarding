-- Vínculo produto vendido → onboardings. Ao liberar o cliente, cada produto contratado dispara os
-- onboardings vinculados (o modelo publicado de cada linha). Ex.: AppCrc → IA de Agendamento + IApro.

CREATE TABLE public.produto_onboardings (
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,            -- produto vendido
  onboarding_produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE, -- linha de onboarding (modelo)
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (produto_id, onboarding_produto_id)
);
CREATE INDEX produto_onboardings_onb ON public.produto_onboardings (onboarding_produto_id);

-- Comportamento atual preservado: cada produto que já tem modelo dispara o próprio onboarding.
INSERT INTO public.produto_onboardings (produto_id, onboarding_produto_id)
SELECT DISTINCT produto_id, produto_id FROM public.modelos WHERE status <> 'arquivado'
ON CONFLICT DO NOTHING;

GRANT SELECT ON public.produto_onboardings TO authenticated;
GRANT INSERT, DELETE ON public.produto_onboardings TO authenticated;
GRANT ALL ON public.produto_onboardings TO service_role;
ALTER TABLE public.produto_onboardings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe lê vínculos de onboarding" ON public.produto_onboardings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin vincula onboardings" ON public.produto_onboardings FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admin desvincula onboardings" ON public.produto_onboardings FOR DELETE TO authenticated USING (public.is_admin());

-- Linhas de onboarding que um cliente deve ter, pelos produtos contratados.
CREATE OR REPLACE FUNCTION public.onboardings_previstos(_produtos text[])
RETURNS TABLE (onboarding_produto_id uuid)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT DISTINCT po.onboarding_produto_id
    FROM public.produto_onboardings po
    JOIN public.produtos p ON p.id = po.produto_id
   WHERE p.ativo AND p.nome = ANY (_produtos)
$$;

-- Liberação: usa os vínculos (antes era só o próprio produto).
CREATE OR REPLACE FUNCTION public.clients_inicia_onboarding() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record;
BEGIN
  IF NEW.onboarding_released_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.onboarding_released_at IS NULL) THEN
    FOR p IN SELECT onboarding_produto_id FROM public.onboardings_previstos(NEW.products) LOOP
      PERFORM public._criar_onboarding(NEW.id, p.onboarding_produto_id, current_date);
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;

-- Cliente já liberado: cria os onboardings que faltam (produto novo, vínculo novo ou modelo publicado depois).
CREATE OR REPLACE FUNCTION public.iniciar_onboardings_pendentes(_cliente_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.clients%ROWTYPE; p record; criados int := 0; novo uuid;
BEGIN
  IF NOT public.usuario_ativo(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO c FROM public.clients WHERE id = _cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não encontrado'; END IF;
  IF c.onboarding_released_at IS NULL THEN
    RAISE EXCEPTION 'O cliente precisa estar liberado (pago e contrato verificado)';
  END IF;
  FOR p IN SELECT onboarding_produto_id FROM public.onboardings_previstos(c.products) LOOP
    novo := public._criar_onboarding(c.id, p.onboarding_produto_id, current_date);
    IF novo IS NOT NULL THEN criados := criados + 1; END IF;
  END LOOP;
  RETURN criados;
END; $$;
REVOKE ALL ON FUNCTION public.iniciar_onboardings_pendentes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iniciar_onboardings_pendentes(uuid) TO authenticated;

-- Novo modelo de um produto: o produto passa a disparar o próprio onboarding (pode ser desfeito na tela de vínculos).
CREATE OR REPLACE FUNCTION public.modelos_vinculo_padrao() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.modelos WHERE produto_id = NEW.produto_id AND id <> NEW.id) THEN
    INSERT INTO public.produto_onboardings (produto_id, onboarding_produto_id)
    VALUES (NEW.produto_id, NEW.produto_id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER modelos_vinculo_padrao AFTER INSERT ON public.modelos
  FOR EACH ROW EXECUTE FUNCTION public.modelos_vinculo_padrao();
