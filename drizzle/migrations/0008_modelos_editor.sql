-- Cadastro de modelos de onboarding: rascunho editável, publicação versionada.
-- Modelo publicado ou arquivado não muda (os onboardings em andamento apontam para ele);
-- para alterar, cria-se uma nova versão em rascunho e publica-se.

-- ---------- Imutabilidade de modelos publicados/arquivados ---------------
CREATE OR REPLACE FUNCTION public.modelos_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'rascunho' THEN
      RAISE EXCEPTION 'Só modelos em rascunho podem ser excluídos';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'rascunho' THEN
    IF NOT (OLD.status = 'publicado' AND NEW.status = 'arquivado')
       OR (to_jsonb(NEW) - 'status' - 'updated_at') <> (to_jsonb(OLD) - 'status' - 'updated_at') THEN
      RAISE EXCEPTION 'Modelo publicado não pode ser editado: crie uma nova versão';
    END IF;
  END IF;
  IF NEW.produto_id IS DISTINCT FROM OLD.produto_id OR NEW.versao IS DISTINCT FROM OLD.versao THEN
    RAISE EXCEPTION 'Produto e versão do modelo não podem ser alterados';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
CREATE TRIGGER modelos_guard BEFORE UPDATE OR DELETE ON public.modelos
  FOR EACH ROW EXECUTE FUNCTION public.modelos_guard();

CREATE OR REPLACE FUNCTION public.modelo_filho_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  r record := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  st text;
BEGIN
  -- Ações em cascata (exclusão de etapa/fase/modelo) seguem a regra do pai.
  IF pg_trigger_depth() > 1 THEN RETURN r; END IF;
  IF TG_TABLE_NAME = 'modelo_checklist' THEN
    SELECT m.status INTO st FROM public.modelo_etapas e JOIN public.modelos m ON m.id = e.modelo_id WHERE e.id = r.etapa_id;
  ELSE
    SELECT status INTO st FROM public.modelos WHERE id = r.modelo_id;
  END IF;
  IF st IS DISTINCT FROM 'rascunho' THEN
    RAISE EXCEPTION 'Modelo publicado não pode ser editado: crie uma nova versão';
  END IF;
  RETURN r;
END; $$;
CREATE TRIGGER modelo_fases_guard BEFORE INSERT OR UPDATE OR DELETE ON public.modelo_fases
  FOR EACH ROW EXECUTE FUNCTION public.modelo_filho_guard();
CREATE TRIGGER modelo_etapas_guard BEFORE INSERT OR UPDATE OR DELETE ON public.modelo_etapas
  FOR EACH ROW EXECUTE FUNCTION public.modelo_filho_guard();
CREATE TRIGGER modelo_checklist_guard BEFORE INSERT OR UPDATE OR DELETE ON public.modelo_checklist
  FOR EACH ROW EXECUTE FUNCTION public.modelo_filho_guard();

-- ---------- Operações (rodam com as permissões de quem chama: RLS vale) ----------
-- Novo modelo em rascunho com as três fases padrão.
CREATE OR REPLACE FUNCTION public.criar_modelo(_produto_id uuid, _nome text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE novo uuid;
BEGIN
  IF NOT public.gere_produto(_produto_id) THEN RAISE EXCEPTION 'Sem permissão para este produto'; END IF;
  IF coalesce(btrim(_nome), '') = '' THEN RAISE EXCEPTION 'Informe o nome do modelo'; END IF;
  INSERT INTO public.modelos (produto_id, nome, versao, created_by)
  VALUES (_produto_id, btrim(_nome),
          coalesce((SELECT max(versao) FROM public.modelos WHERE produto_id = _produto_id), 0) + 1, auth.uid())
  RETURNING id INTO novo;
  INSERT INTO public.modelo_fases (modelo_id, nome, cor, ordem) VALUES
    (novo, 'Implantação', '#7C3AED', 1), (novo, 'Ativação', '#0284C7', 2), (novo, 'Acompanhamento', '#10B981', 3);
  RETURN novo;
END; $$;

-- Nova versão em rascunho copiando fases, etapas e checklist.
CREATE OR REPLACE FUNCTION public.duplicar_modelo(_modelo_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  m public.modelos%ROWTYPE;
  novo uuid;
  f record; e record;
  nova_fase uuid; nova_etapa uuid;
  mapa jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO m FROM public.modelos WHERE id = _modelo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Modelo não encontrado'; END IF;
  IF NOT public.gere_produto(m.produto_id) THEN RAISE EXCEPTION 'Sem permissão para este produto'; END IF;
  IF EXISTS (SELECT 1 FROM public.modelos WHERE produto_id = m.produto_id AND status = 'rascunho') THEN
    RAISE EXCEPTION 'Já existe um rascunho para este produto: edite-o ou exclua antes de criar outro';
  END IF;
  INSERT INTO public.modelos (produto_id, nome, versao, calendario, limiar_risco_pct, created_by)
  VALUES (m.produto_id, m.nome, (SELECT max(versao) FROM public.modelos WHERE produto_id = m.produto_id) + 1,
          m.calendario, m.limiar_risco_pct, auth.uid())
  RETURNING id INTO novo;
  FOR f IN SELECT * FROM public.modelo_fases WHERE modelo_id = m.id ORDER BY ordem LOOP
    INSERT INTO public.modelo_fases (modelo_id, nome, cor, ordem) VALUES (novo, f.nome, f.cor, f.ordem) RETURNING id INTO nova_fase;
    mapa := mapa || jsonb_build_object(f.id::text, nova_fase);
  END LOOP;
  FOR e IN SELECT * FROM public.modelo_etapas WHERE modelo_id = m.id ORDER BY ordem LOOP
    INSERT INTO public.modelo_etapas (modelo_id, fase_id, nome, descricao, ordem, papel_id, sla_dias, principal,
                                      obrigatoria, pausa_sla_aguardando_cliente, exige_checklist)
    VALUES (novo, (mapa ->> e.fase_id::text)::uuid, e.nome, e.descricao, e.ordem, e.papel_id, e.sla_dias, e.principal,
            e.obrigatoria, e.pausa_sla_aguardando_cliente, e.exige_checklist)
    RETURNING id INTO nova_etapa;
    INSERT INTO public.modelo_checklist (etapa_id, texto, obrigatorio, ordem)
    SELECT nova_etapa, texto, obrigatorio, ordem FROM public.modelo_checklist WHERE etapa_id = e.id;
  END LOOP;
  RETURN novo;
END; $$;

-- Publica o rascunho e arquiva o publicado anterior do mesmo produto.
CREATE OR REPLACE FUNCTION public.publicar_modelo(_modelo_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE m public.modelos%ROWTYPE;
BEGIN
  SELECT * INTO m FROM public.modelos WHERE id = _modelo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Modelo não encontrado'; END IF;
  IF NOT public.gere_produto(m.produto_id) THEN RAISE EXCEPTION 'Sem permissão para este produto'; END IF;
  IF m.status <> 'rascunho' THEN RAISE EXCEPTION 'Só rascunhos podem ser publicados'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.modelo_etapas WHERE modelo_id = m.id) THEN
    RAISE EXCEPTION 'Adicione ao menos uma etapa antes de publicar';
  END IF;
  IF EXISTS (SELECT 1 FROM public.modelo_etapas WHERE modelo_id = m.id AND fase_id IS NULL) THEN
    RAISE EXCEPTION 'Todas as etapas precisam estar em uma fase';
  END IF;
  UPDATE public.modelos SET status = 'arquivado' WHERE produto_id = m.produto_id AND status = 'publicado';
  UPDATE public.modelos SET status = 'publicado' WHERE id = m.id;
END; $$;

-- Reordena as etapas (e move entre fases) de uma vez: _etapas = [{"id":..., "fase_id":...}, ...] na ordem final.
CREATE OR REPLACE FUNCTION public.ordenar_etapas_modelo(_modelo_id uuid, _etapas jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  UPDATE public.modelo_etapas e
     SET ordem = x.pos, fase_id = x.fase_id
    FROM (SELECT (v ->> 'id')::uuid id, (v ->> 'fase_id')::uuid fase_id, ord::int pos
            FROM jsonb_array_elements(_etapas) WITH ORDINALITY AS t(v, ord)) x
   WHERE e.id = x.id AND e.modelo_id = _modelo_id
     AND (e.ordem IS DISTINCT FROM x.pos OR e.fase_id IS DISTINCT FROM x.fase_id);
END; $$;

REVOKE ALL ON FUNCTION public.criar_modelo(uuid, text), public.duplicar_modelo(uuid),
  public.publicar_modelo(uuid), public.ordenar_etapas_modelo(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_modelo(uuid, text), public.duplicar_modelo(uuid),
  public.publicar_modelo(uuid), public.ordenar_etapas_modelo(uuid, jsonb) TO authenticated;
