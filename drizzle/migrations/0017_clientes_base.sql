-- Base total de clientes (API de gestão: cliente/listarServicosExterno), coletada 1x por dia.
-- A API só traz a foto de hoje (sem datas), então guardamos:
--   clientes_base          → estado atual de cada cliente (produtos ativos, contexto/carteira)
--   clientes_base_fotos    → foto diária dos clientes ativos (base para o churn de cada período)
--   clientes_base_eventos  → produto que entrou/saiu de um cliente entre uma coleta e outra

CREATE TABLE public.clientes_base (
  id_cliente text PRIMARY KEY,                 -- mesmo id do AppCRC (id_appcrc da retenção)
  nome text,
  contexto text,                               -- carteira: Select, Select Club, Infinity Clinic…
  sucessodonto boolean NOT NULL DEFAULT false,
  produtos text[] NOT NULL DEFAULT '{}',       -- produtos ativos hoje
  ativo boolean GENERATED ALWAYS AS (cardinality(produtos) > 0) STORED,
  primeira_coleta date NOT NULL DEFAULT current_date,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clientes_base_ativo ON public.clientes_base (ativo);

CREATE TABLE public.clientes_base_fotos (
  data date NOT NULL,
  id_cliente text NOT NULL,
  contexto text,
  produtos text[] NOT NULL,
  PRIMARY KEY (data, id_cliente)
);

CREATE TABLE public.clientes_base_eventos (
  id bigserial PRIMARY KEY,
  id_cliente text NOT NULL,
  produto text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('entrou','saiu')),
  em date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clientes_base_eventos_em ON public.clientes_base_eventos (em, tipo);

CREATE TABLE public.clientes_base_sincronizacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL,
  recebidos int NOT NULL DEFAULT 0,
  ativos int NOT NULL DEFAULT 0,
  entradas int NOT NULL DEFAULT 0,
  saidas int NOT NULL DEFAULT 0,
  erro text,
  origem text NOT NULL DEFAULT 'agendado'
);

-- Grava a coleta inteira de uma vez: atualiza os clientes, registra entradas/saídas de produto e tira a foto do dia.
-- Na 1ª coleta não há eventos (é a linha de base). Protege contra resposta incompleta da API.
CREATE OR REPLACE FUNCTION public.sincronizar_clientes_base(clientes jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  primeira boolean := NOT EXISTS (SELECT 1 FROM clientes_base);
  n_api int; n_antes int; n_ent int := 0; n_sai int := 0; n_ativos int;
BEGIN
  IF jsonb_typeof(clientes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Esperava uma lista de clientes';
  END IF;

  CREATE TEMP TABLE _novo ON COMMIT DROP AS
  SELECT DISTINCT ON (id_cliente) * FROM (
    SELECT btrim(x->>'id_cliente') AS id_cliente,
           nullif(btrim(x->>'nome'), '') AS nome,
           nullif(btrim(x->>'contexto'), '') AS contexto,
           coalesce((x->>'sucessodonto')::boolean, false) AS sucessodonto,
           coalesce((SELECT array_agg(DISTINCT btrim(p) ORDER BY btrim(p))
                     FROM jsonb_array_elements_text(
                       CASE WHEN jsonb_typeof(x->'produtos') = 'array' THEN x->'produtos' ELSE '[]'::jsonb END) p
                     WHERE btrim(p) <> ''), '{}') AS produtos
    FROM jsonb_array_elements(clientes) x
    WHERE coalesce(btrim(x->>'id_cliente'), '') <> ''
  ) t ORDER BY id_cliente;

  SELECT count(*) INTO n_api FROM _novo;
  SELECT count(*) INTO n_antes FROM clientes_base WHERE ativo;
  IF NOT primeira AND (SELECT count(*) FROM _novo WHERE cardinality(produtos) > 0) < n_antes * 0.7 THEN
    RAISE EXCEPTION 'A API trouxe bem menos clientes ativos que a última coleta (% de %); coleta ignorada',
      (SELECT count(*) FROM _novo WHERE cardinality(produtos) > 0), n_antes;
  END IF;

  IF NOT primeira THEN
    INSERT INTO clientes_base_eventos (id_cliente, produto, tipo, em)
    SELECT n.id_cliente, p, 'entrou', hoje
    FROM _novo n LEFT JOIN clientes_base c USING (id_cliente), unnest(n.produtos) p
    WHERE NOT (p = ANY (coalesce(c.produtos, '{}')));
    GET DIAGNOSTICS n_ent = ROW_COUNT;

    INSERT INTO clientes_base_eventos (id_cliente, produto, tipo, em)
    SELECT c.id_cliente, p, 'saiu', hoje
    FROM clientes_base c LEFT JOIN _novo n USING (id_cliente), unnest(c.produtos) p
    WHERE NOT (p = ANY (coalesce(n.produtos, '{}')));
    GET DIAGNOSTICS n_sai = ROW_COUNT;
  END IF;

  INSERT INTO clientes_base (id_cliente, nome, contexto, sucessodonto, produtos, primeira_coleta, atualizado_em)
  SELECT id_cliente, nome, contexto, sucessodonto, produtos, hoje, now() FROM _novo
  ON CONFLICT (id_cliente) DO UPDATE SET
    nome = excluded.nome, contexto = excluded.contexto, sucessodonto = excluded.sucessodonto,
    produtos = excluded.produtos, atualizado_em = now();
  -- Quem sumiu da API fica sem produtos ativos.
  UPDATE clientes_base c SET produtos = '{}', atualizado_em = now()
  WHERE cardinality(c.produtos) > 0 AND NOT EXISTS (SELECT 1 FROM _novo n WHERE n.id_cliente = c.id_cliente);

  DELETE FROM clientes_base_fotos WHERE data = hoje;
  INSERT INTO clientes_base_fotos (data, id_cliente, contexto, produtos)
  SELECT hoje, id_cliente, contexto, produtos FROM clientes_base WHERE ativo;
  GET DIAGNOSTICS n_ativos = ROW_COUNT;

  DROP TABLE _novo;
  RETURN jsonb_build_object('recebidos', n_api, 'ativos', n_ativos, 'entradas', n_ent, 'saidas', n_sai,
                            'primeira', primeira);
END; $$;

-- Dados para o churn da carteira, numa resposta só (evita o limite de linhas da API REST):
-- foto da base no início do período (ou a mais antiga, se o período começa antes do histórico),
-- carteira dos clientes que aparecem na retenção e saídas registradas desde o início.
CREATE OR REPLACE FUNCTION public.churn_carteira_dados(inicio date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d date;
BEGIN
  IF NOT public.pode_operar() THEN
    RAISE EXCEPTION 'Sem acesso';
  END IF;
  SELECT coalesce(
           (SELECT min(data) FROM clientes_base_fotos WHERE inicio IS NOT NULL AND data >= inicio),
           (SELECT max(data) FROM clientes_base_fotos WHERE inicio IS NOT NULL AND data < inicio),
           (SELECT min(data) FROM clientes_base_fotos))
    INTO d;
  RETURN jsonb_build_object(
    'foto_data', d,
    'primeira_foto', (SELECT min(data) FROM clientes_base_fotos),
    'ultima_foto', (SELECT max(data) FROM clientes_base_fotos),
    'base', coalesce((SELECT jsonb_agg(jsonb_build_array(id_cliente, contexto, produtos))
                      FROM clientes_base_fotos WHERE data = d), '[]'),
    'atual', coalesce((SELECT jsonb_agg(jsonb_build_array(id_cliente, contexto, produtos))
                       FROM clientes_base WHERE ativo), '[]'),
    'contextos', coalesce((SELECT jsonb_object_agg(c.id_cliente, c.contexto)
                           FROM clientes_base c
                           WHERE c.contexto IS NOT NULL
                             AND c.id_cliente IN (SELECT id_appcrc FROM retencao_casos WHERE id_appcrc IS NOT NULL)), '{}'),
    'saidas', coalesce((SELECT jsonb_agg(jsonb_build_array(id_cliente, produto, em))
                        FROM clientes_base_eventos
                        WHERE tipo = 'saiu' AND (inicio IS NULL OR em >= inicio)), '[]')
  );
END; $$;

REVOKE ALL ON FUNCTION public.sincronizar_clientes_base(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sincronizar_clientes_base(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.churn_carteira_dados(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.churn_carteira_dados(date) TO authenticated, service_role;

GRANT SELECT ON public.clientes_base, public.clientes_base_sincronizacoes TO authenticated;
GRANT ALL ON public.clientes_base, public.clientes_base_fotos, public.clientes_base_eventos,
  public.clientes_base_sincronizacoes TO service_role;
GRANT USAGE ON SEQUENCE public.clientes_base_eventos_id_seq TO service_role;
ALTER TABLE public.clientes_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes_base_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes_base_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes_base_sincronizacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Operação lê a base" ON public.clientes_base FOR SELECT TO authenticated USING (public.pode_operar());
CREATE POLICY "Operação lê coletas da base" ON public.clientes_base_sincronizacoes FOR SELECT TO authenticated
  USING (public.pode_operar());
