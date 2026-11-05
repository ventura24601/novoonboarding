-- Integração DocuSign Connect: envelopes recebidos pelo webhook (assinatura HMAC verificada no servidor),
-- vínculo automático com o cliente quando os dados batem e vínculo manual pela tela de Assinaturas.
-- Envelope concluído e vinculado = contrato assinado e verificado (origem "docusign").

CREATE TABLE public.docusign_envelopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id text NOT NULL UNIQUE,
  status text NOT NULL,                       -- sent, delivered, completed, declined, voided
  assunto text,
  remetente_email text,
  signatarios jsonb NOT NULL DEFAULT '[]',    -- [{nome, email, status, assinado_em}]
  campos jsonb NOT NULL DEFAULT '{}',         -- campos personalizados e campos preenchidos (rótulo → valor)
  documentos text[] NOT NULL DEFAULT '{}',    -- CPF/CNPJ encontrados nos campos (só dígitos)
  enviado_em timestamptz,
  concluido_em timestamptz,
  evento_em timestamptz,                      -- generatedDateTime do último evento aplicado
  cliente_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  vinculo text CHECK (vinculo IN ('automatico','manual')),
  vinculo_motivo text,
  vinculado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  vinculado_em timestamptz,
  ignorado boolean NOT NULL DEFAULT false,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX docusign_envelopes_cliente ON public.docusign_envelopes (cliente_id);
CREATE INDEX docusign_envelopes_pendentes ON public.docusign_envelopes (concluido_em DESC) WHERE cliente_id IS NULL AND NOT ignorado;

-- Só dígitos (CPF/CNPJ).
CREATE OR REPLACE FUNCTION public.so_digitos(_t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT nullif(regexp_replace(coalesce(_t, ''), '\D', '', 'g'), '') $$;

-- Candidatos com evidência forte, em ordem: id do cliente em campo personalizado, código externo,
-- CPF/CNPJ igual e e-mail de signatário igual ao do cliente.
CREATE OR REPLACE FUNCTION public.docusign_candidatos(_envelope public.docusign_envelopes)
RETURNS TABLE (cliente_id uuid, motivo text)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH campos AS (SELECT lower(key) k, value v FROM jsonb_each_text(_envelope.campos)),
  emails AS (SELECT DISTINCT lower(s ->> 'email') e FROM jsonb_array_elements(_envelope.signatarios) s WHERE s ->> 'email' IS NOT NULL)
  SELECT c.id, 'ID do cliente no envelope' FROM public.clients c
    WHERE c.id::text IN (SELECT v FROM campos WHERE k IN ('cliente_id','client_id','id_cliente'))
  UNION ALL
  SELECT c.id, 'Código do cliente no envelope' FROM public.clients c
    WHERE c.codigo_externo IS NOT NULL AND c.codigo_externo IN (SELECT v FROM campos WHERE k IN ('codigo_cliente','codigo_externo','codigo'))
  UNION ALL
  SELECT c.id, 'CPF/CNPJ igual' FROM public.clients c
    WHERE public.so_digitos(c.document) IS NOT NULL AND public.so_digitos(c.document) = ANY (_envelope.documentos)
  UNION ALL
  SELECT c.id, 'E-mail do signatário igual' FROM public.clients c
    WHERE c.email IS NOT NULL AND lower(btrim(c.email)) IN (SELECT e FROM emails)
$$;

-- Vínculo automático: só quando exatamente um cliente aparece entre os candidatos do critério mais forte.
CREATE OR REPLACE FUNCTION public.docusign_auto_vincular() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  m text; ids uuid[];
BEGIN
  NEW.updated_at := now();
  -- Não religa o que alguém desvinculou à mão (vinculo = 'manual' com cliente vazio).
  IF NEW.cliente_id IS NOT NULL OR NEW.ignorado OR NEW.vinculo = 'manual' THEN RETURN NEW; END IF;
  FOREACH m IN ARRAY ARRAY['ID do cliente no envelope','Código do cliente no envelope','CPF/CNPJ igual','E-mail do signatário igual'] LOOP
    SELECT array_agg(DISTINCT c.cliente_id) INTO ids FROM public.docusign_candidatos(NEW) c WHERE c.motivo = m;
    IF cardinality(ids) = 1 THEN
      NEW.cliente_id := ids[1]; NEW.vinculo := 'automatico'; NEW.vinculo_motivo := m; NEW.vinculado_em := now();
      RETURN NEW;
    ELSIF cardinality(ids) > 1 THEN
      RETURN NEW; -- ambíguo: fica para o vínculo manual
    END IF;
  END LOOP;
  RETURN NEW;
END; $$;
CREATE TRIGGER docusign_auto_vincular BEFORE INSERT OR UPDATE ON public.docusign_envelopes
  FOR EACH ROW EXECUTE FUNCTION public.docusign_auto_vincular();

-- Envelope concluído + vinculado → contrato assinado e verificado no cliente.
CREATE OR REPLACE FUNCTION public.docusign_aplica_cliente() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.cliente_id IS NOT NULL AND NEW.status = 'completed'
     AND (TG_OP = 'INSERT' OR OLD.cliente_id IS DISTINCT FROM NEW.cliente_id OR OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE public.clients SET
      contract_signed = true,
      contract_signed_at = coalesce(contract_signed_at, NEW.concluido_em, now()),
      contract_verified_at = coalesce(contract_verified_at, now()),
      contract_verification_source = coalesce(contract_verification_source, 'docusign'),
      contract_verified_by = CASE WHEN contract_verified_at IS NULL THEN NEW.vinculado_por ELSE contract_verified_by END
    WHERE id = NEW.cliente_id;
  END IF;
  -- Desvínculo: desfaz a verificação que veio deste envelope, se o cliente ainda não foi liberado.
  IF TG_OP = 'UPDATE' AND OLD.cliente_id IS NOT NULL AND NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN
    IF EXISTS (SELECT 1 FROM public.clients WHERE id = OLD.cliente_id AND onboarding_released_at IS NOT NULL) THEN
      RAISE EXCEPTION 'O cliente já foi liberado para o onboarding: o vínculo não pode ser desfeito';
    END IF;
    UPDATE public.clients SET contract_verified_at = NULL, contract_verified_by = NULL, contract_verification_source = NULL
    WHERE id = OLD.cliente_id AND contract_verification_source = 'docusign'
      AND NOT EXISTS (SELECT 1 FROM public.docusign_envelopes e WHERE e.cliente_id = OLD.cliente_id AND e.id <> NEW.id AND e.status = 'completed');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER docusign_aplica_cliente AFTER INSERT OR UPDATE ON public.docusign_envelopes
  FOR EACH ROW EXECUTE FUNCTION public.docusign_aplica_cliente();

-- Leitura para admin e gestor; escrita só pelo servidor (webhook e funções de vínculo com service role).
GRANT SELECT ON public.docusign_envelopes TO authenticated;
GRANT ALL ON public.docusign_envelopes TO service_role;
ALTER TABLE public.docusign_envelopes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin e gestor leem envelopes" ON public.docusign_envelopes FOR SELECT TO authenticated
  USING (public.is_admin() OR public.has_role(auth.uid(), 'gestor'));

REVOKE ALL ON FUNCTION public.docusign_candidatos(public.docusign_envelopes) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.docusign_candidatos(public.docusign_envelopes) TO authenticated, service_role;
