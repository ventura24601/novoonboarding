-- Comentários por etapa do onboarding (onboarding_notas com etapa opcional; sem etapa = comentário geral).

ALTER TABLE public.onboarding_notas
  ADD COLUMN onboarding_etapa_id uuid REFERENCES public.onboarding_etapas(id) ON DELETE CASCADE;
CREATE INDEX onboarding_notas_etapa_idx ON public.onboarding_notas (onboarding_etapa_id, created_at);
CREATE INDEX onboarding_notas_onb_idx ON public.onboarding_notas (onboarding_id, created_at);

-- A etapa define o onboarding do comentário (evita comentário apontando para etapa de outro onboarding).
-- Texto do comentário não muda depois de gravado; quem escreveu (ou admin) pode excluir.
CREATE OR REPLACE FUNCTION public.onboarding_notas_regras() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Comentários não podem ser editados; exclua e escreva de novo';
  END IF;
  NEW.texto := btrim(NEW.texto);
  IF NEW.onboarding_etapa_id IS NOT NULL THEN
    SELECT onboarding_id INTO NEW.onboarding_id FROM public.onboarding_etapas WHERE id = NEW.onboarding_etapa_id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER onboarding_notas_regras BEFORE INSERT OR UPDATE ON public.onboarding_notas
  FOR EACH ROW EXECUTE FUNCTION public.onboarding_notas_regras();

GRANT DELETE ON public.onboarding_notas TO authenticated;
CREATE POLICY "Autor ou admin exclui nota" ON public.onboarding_notas FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
