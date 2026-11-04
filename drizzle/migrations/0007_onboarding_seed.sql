-- Dados de exemplo da Central de Onboarding ICOM.
-- As datas dos onboardings são relativas ao dia em que a migration roda, para que
-- os casos "no prazo / em risco / atrasado" continuem fazendo sentido.

-- ---------- Feriados nacionais 2026 e 2027 ---------------------------
INSERT INTO public.feriados (data, nome) VALUES
 ('2026-01-01','Confraternização Universal'), ('2026-02-16','Carnaval (ponto facultativo)'),
 ('2026-02-17','Carnaval (ponto facultativo)'), ('2026-04-03','Sexta-feira Santa'),
 ('2026-04-21','Tiradentes'), ('2026-05-01','Dia do Trabalho'),
 ('2026-06-04','Corpus Christi (ponto facultativo)'), ('2026-09-07','Independência do Brasil'),
 ('2026-10-12','Nossa Senhora Aparecida'), ('2026-11-02','Finados'),
 ('2026-11-15','Proclamação da República'), ('2026-11-20','Dia Nacional de Zumbi e da Consciência Negra'),
 ('2026-12-25','Natal'),
 ('2027-01-01','Confraternização Universal'), ('2027-02-08','Carnaval (ponto facultativo)'),
 ('2027-02-09','Carnaval (ponto facultativo)'), ('2027-03-26','Sexta-feira Santa'),
 ('2027-04-21','Tiradentes'), ('2027-05-01','Dia do Trabalho'),
 ('2027-05-27','Corpus Christi (ponto facultativo)'), ('2027-09-07','Independência do Brasil'),
 ('2027-10-12','Nossa Senhora Aparecida'), ('2027-11-02','Finados'),
 ('2027-11-15','Proclamação da República'), ('2027-11-20','Dia Nacional de Zumbi e da Consciência Negra'),
 ('2027-12-25','Natal')
ON CONFLICT (data) DO NOTHING;

-- ---------- Papéis e produtos ----------------------------------------
INSERT INTO public.papeis (nome, cor) VALUES
 ('Atendimento','#0284C7'), ('Implantação','#7C3AED'), ('Produção','#DB2777'),
 ('Comercial','#B48E4B'), ('Cliente','#64748B')
ON CONFLICT (nome) DO NOTHING;

-- Os mesmos nomes da lista de produtos do cadastro de contratos.
INSERT INTO public.produtos (nome, cor) VALUES
 ('IA de Agendamento','#7C3AED'), ('IApro','#0284C7'), ('IA de Vídeo','#DB2777'),
 ('Black','#111827'), ('Redes','#F97316'), ('WhatsApp','#10B981'),
 ('Google','#EAB308'), ('Discador','#64748B'), ('AppCrc','#14B8A6')
ON CONFLICT (nome) DO NOTHING;

-- ---------- Modelos publicados ---------------------------------------
DO $$
DECLARE
  pap jsonb := (SELECT jsonb_object_agg(nome, id) FROM public.papeis);
  m uuid; f_impl uuid; f_atv uuid; f_acomp uuid; e uuid;
  item record;
  modelo record;
BEGIN
  FOR modelo IN SELECT * FROM (VALUES
    ('IA de Agendamento', 'Onboarding IA de Agendamento'),
    ('IApro', 'Onboarding IApro'),
    ('IA de Vídeo', 'Onboarding IA de Vídeo')) v(produto, nome)
  LOOP
    INSERT INTO public.modelos (produto_id, nome, versao, status, calendario, limiar_risco_pct)
    SELECT id, modelo.nome, 1, 'publicado', 'uteis', 80 FROM public.produtos WHERE nome = modelo.produto
    RETURNING id INTO m;
    INSERT INTO public.modelo_fases (modelo_id, nome, cor, ordem) VALUES (m, 'Implantação', '#7C3AED', 1) RETURNING id INTO f_impl;
    INSERT INTO public.modelo_fases (modelo_id, nome, cor, ordem) VALUES (m, 'Ativação', '#0284C7', 2) RETURNING id INTO f_atv;
    INSERT INTO public.modelo_fases (modelo_id, nome, cor, ordem) VALUES (m, 'Acompanhamento', '#10B981', 3) RETURNING id INTO f_acomp;

    FOR item IN
      SELECT * FROM (VALUES
        -- produto, ordem, nome, papel, fase, sla, pausa_cliente, checklist (separado por |)
        ('IA de Agendamento',1,'Mensagem de saudação','Atendimento','impl',2,false,'Agendar onboarding com o cliente|Enviar mensagem de boas-vindas'),
        ('IA de Agendamento',2,'Onboarding','Atendimento','impl',5,true,'Realizar reunião de onboarding|Coletar acessos do software de gestão'),
        ('IA de Agendamento',3,'Configuração da IA','Implantação','impl',7,false,'Configurar fluxos de agendamento|Integrar com o software de gestão'),
        ('IA de Agendamento',4,'Testes e validação','Implantação','atv',3,true,'Teste com o cliente'),
        ('IA de Agendamento',5,'Envio da ata e materiais','Atendimento','atv',2,false,'Enviar ata da reunião|Enviar materiais de apoio'),
        ('IA de Agendamento',6,'Acompanhamento 30 dias','Atendimento','acomp',30,false,'Alinhamento mensal realizado'),
        ('IApro',1,'Mensagem de saudação','Atendimento','impl',2,false,'Agendar onboarding com o cliente|Enviar mensagem de boas-vindas'),
        ('IApro',2,'Onboarding','Atendimento','impl',5,true,'Realizar reunião de onboarding'),
        ('IApro',3,'Configuração','Implantação','impl',7,false,'Configurar o IApro para a clínica'),
        ('IApro',4,'Envio da ata e materiais','Atendimento','atv',2,false,'Enviar ata da reunião|Enviar materiais de apoio'),
        ('IA de Vídeo',1,'Formulário de briefing','Atendimento','impl',3,true,'Enviar formulário de briefing|Receber briefing preenchido'),
        ('IA de Vídeo',2,'Onboarding','Atendimento','impl',5,true,'Realizar reunião de onboarding'),
        ('IA de Vídeo',3,'Reunião de alinhamento','Atendimento','impl',5,true,'Alinhar roteiros e identidade visual'),
        ('IA de Vídeo',4,'Criação do avatar','Produção','atv',10,false,'Gravar material de referência|Aprovar avatar com o cliente'),
        ('IA de Vídeo',5,'Clonagem de voz','Produção','atv',7,true,'Receber áudio do cliente|Aprovar voz com o cliente'),
        ('IA de Vídeo',6,'Produção de vídeos','Produção','acomp',15,false,'Entregar vídeos ao cliente')
      ) v(produto, ordem, nome, papel, fase, sla, pausa, checklist)
      WHERE v.produto = modelo.produto
    LOOP
      INSERT INTO public.modelo_etapas (modelo_id, fase_id, nome, ordem, papel_id, sla_dias, principal, obrigatoria,
        pausa_sla_aguardando_cliente, exige_checklist)
      VALUES (m, CASE item.fase WHEN 'impl' THEN f_impl WHEN 'atv' THEN f_atv ELSE f_acomp END, item.nome, item.ordem,
        (pap ->> item.papel)::uuid, item.sla, item.nome NOT IN ('Mensagem de saudação','Envio da ata e materiais'),
        true, item.pausa, true)
      RETURNING id INTO e;
      INSERT INTO public.modelo_checklist (etapa_id, texto, obrigatorio, ordem)
      SELECT e, t, true, n FROM unnest(string_to_array(item.checklist, '|')) WITH ORDINALITY AS c(t, n);
    END LOOP;
  END LOOP;
END $$;

-- Remove a fase vazia (IApro não tem Acompanhamento).
DELETE FROM public.modelo_fases f WHERE NOT EXISTS (SELECT 1 FROM public.modelo_etapas e WHERE e.fase_id = f.id);

-- ---------- Campos personalizados ------------------------------------
INSERT INTO public.produto_campos (produto_id, chave, rotulo, tipo, opcoes, ordem)
SELECT p.id, v.chave, v.rotulo, v.tipo, v.opcoes::jsonb, v.ordem
FROM public.produtos p JOIN (VALUES
 ('IA de Agendamento','whatsapp_oficial','WhatsApp Oficial','sim_nao','[]',1),
 ('IA de Agendamento','software_gestao','Software de gestão','selecao',
   '[{"valor":"Controle Odonto","cor":"#7C3AED"},{"valor":"Clinicorp","cor":"#0284C7"},{"valor":"Outro","cor":"#64748B"}]',2),
 ('IA de Agendamento','funcionamento_ia','Funcionamento da IA','selecao',
   '[{"valor":"Total","cor":"#10B981"},{"valor":"Pausa comercial","cor":"#D97706"}]',3),
 ('IA de Vídeo','status_avatar','Status do avatar','selecao',
   '[{"valor":"Não solicitado","cor":"#64748B"},{"valor":"Solicitado","cor":"#0284C7"},{"valor":"Em produção","cor":"#7C3AED"},{"valor":"Aguardando aprovação","cor":"#D97706"},{"valor":"Aprovado","cor":"#10B981"},{"valor":"Reprovado","cor":"#EF4444"},{"valor":"Ajuste necessário","cor":"#B45309"}]',1),
 ('IA de Vídeo','status_voz','Status da voz','selecao',
   '[{"valor":"Aguardando áudio","cor":"#64748B"},{"valor":"Áudio recebido","cor":"#0284C7"},{"valor":"Em clonagem","cor":"#7C3AED"},{"valor":"Pronta","cor":"#D97706"},{"valor":"Aprovada","cor":"#10B981"},{"valor":"Reprovada","cor":"#EF4444"}]',2)
) v(produto, chave, rotulo, tipo, opcoes, ordem) ON v.produto = p.nome
ON CONFLICT (produto_id, chave) DO NOTHING;

-- ---------- Clientes (já pagos, contrato verificado e liberados) ------
-- Gatilhos de liberação desligados só durante o seed: os onboardings abaixo
-- são montados à mão para cobrir cada situação de SLA.
ALTER TABLE public.clients DISABLE TRIGGER clients_release_guard;
ALTER TABLE public.clients DISABLE TRIGGER clients_inicia_onboarding;

INSERT INTO public.clients (clinic_name, codigo_externo, segmento, specialty, city, state, contato_nome, phone, whatsapp, email,
  products, value, paid, contract_signed, contract_signed_at, contract_verified_at, contract_verification_source,
  onboarding_released_at, started_at, client_type, legal_name)
SELECT v.nome, v.codigo, 'Odontologia', 'Odontologia', v.cidade, v.uf, v.contato, v.fone, v.fone, v.email,
  v.produtos, v.valor, true, true, now() - (v.dias || ' days')::interval, now() - (v.dias || ' days')::interval, 'seed',
  now() - (v.dias || ' days')::interval, now() - ((v.dias + 3) || ' days')::interval, 'nao_aluno', v.nome || ' Ltda'
FROM (VALUES
 ('Sorrir Mais Odontologia','ICOM-1001','São Paulo','SP','Mariana Lopes','(11) 98888-1001','contato@sorrirmais.com.br', ARRAY['IA de Agendamento','IA de Vídeo'], 4800, 40),
 ('Instituto Dental Prime','ICOM-1002','Campinas','SP','Ricardo Alves','(19) 97777-1002','recepcao@dentalprime.com.br', ARRAY['IA de Agendamento','IA de Vídeo'], 5200, 45),
 ('Clínica Sorriso Pleno','ICOM-1003','Belo Horizonte','MG','Fernanda Dias','(31) 96666-1003','adm@sorrisopleno.com.br', ARRAY['IA de Agendamento','IApro'], 3900, 30),
 ('OdontoVida Centro','ICOM-1004','Curitiba','PR','Paulo Henrique','(41) 95555-1004','contato@odontovida.com.br', ARRAY['IA de Agendamento','IA de Vídeo'], 6100, 60),
 ('Odonto Família Feliz','ICOM-1005','Goiânia','GO','Juliana Castro','(62) 94444-1005','ola@familiafeliz.com.br', ARRAY['IApro'], 2400, 8),
 ('Clínica Bem Estar Oral','ICOM-1006','Recife','PE','André Barros','(81) 93333-1006','contato@bemestaroral.com.br', ARRAY['IApro'], 2600, 35)
) v(nome, codigo, cidade, uf, contato, fone, email, produtos, valor, dias)
ON CONFLICT (codigo_externo) DO NOTHING;

ALTER TABLE public.clients ENABLE TRIGGER clients_release_guard;
ALTER TABLE public.clients ENABLE TRIGGER clients_inicia_onboarding;

-- ---------- Onboardings de exemplo -----------------------------------
ALTER TABLE public.onboarding_etapas DISABLE TRIGGER onboarding_etapas_regras;
ALTER TABLE public.onboarding_etapas DISABLE TRIGGER onboarding_etapas_fluxo;
ALTER TABLE public.onboarding_checklist DISABLE TRIGGER onboarding_checklist_marca;

DO $$
DECLARE
  s record; onb uuid; cli uuid; prod uuid; cal text := 'uteis';
  e record; ini date; fim date; inicio_atual date; data_inicio date;
BEGIN
  FOR s IN SELECT * FROM (VALUES
    -- cliente, produto, etapa atual (0 = concluído), dias úteis na etapa atual, status da etapa, motivo, campos
    ('Sorrir Mais Odontologia','IA de Agendamento',3,2,'em_andamento',NULL,'{"whatsapp_oficial":true,"software_gestao":"Controle Odonto","funcionamento_ia":"Total"}'),
    ('Instituto Dental Prime','IA de Agendamento',2,4,'em_andamento',NULL,'{"whatsapp_oficial":false,"software_gestao":"Clinicorp"}'),
    ('Clínica Sorriso Pleno','IA de Agendamento',3,5,'bloqueada','Aguardando acesso do software','{"whatsapp_oficial":true,"software_gestao":"Outro"}'),
    ('OdontoVida Centro','IA de Agendamento',4,2,'aguardando_cliente','Cliente vai agendar o teste com a recepção','{"whatsapp_oficial":true,"software_gestao":"Clinicorp","funcionamento_ia":"Pausa comercial"}'),
    ('Odonto Família Feliz','IApro',1,4,'em_andamento',NULL,'{}'),
    ('Clínica Bem Estar Oral','IApro',0,0,'concluida',NULL,'{}'),
    ('Sorrir Mais Odontologia','IA de Vídeo',4,3,'em_andamento',NULL,'{"status_avatar":"Em produção","status_voz":"Aguardando áudio"}'),
    ('Instituto Dental Prime','IA de Vídeo',5,9,'em_andamento',NULL,'{"status_avatar":"Aprovado","status_voz":"Em clonagem"}'),
    ('Clínica Sorriso Pleno','IApro',3,6,'em_andamento',NULL,'{}'),
    ('OdontoVida Centro','IA de Vídeo',0,0,'concluida',NULL,'{"status_avatar":"Aprovado","status_voz":"Aprovada"}')
  ) v(cliente, produto, atual, dias, status, motivo, campos)
  LOOP
    SELECT id INTO cli FROM public.clients WHERE clinic_name = s.cliente;
    SELECT id INTO prod FROM public.produtos WHERE nome = s.produto;
    CONTINUE WHEN cli IS NULL OR prod IS NULL OR EXISTS (
      SELECT 1 FROM public.onboardings WHERE cliente_id = cli AND produto_id = prod);

    -- Volta no calendário: etapa atual começou há "dias" dias úteis; as anteriores
    -- levaram (SLA - 1) dias cada. Concluídos terminaram há 3 dias úteis.
    inicio_atual := public.somar_dias(current_date, -CASE WHEN s.atual = 0 THEN 3 ELSE s.dias END, cal);
    data_inicio := inicio_atual;
    FOR e IN SELECT me.sla_dias FROM public.modelo_etapas me JOIN public.modelos m ON m.id = me.modelo_id
             WHERE m.produto_id = prod AND m.status = 'publicado' AND (s.atual = 0 OR me.ordem < s.atual) LOOP
      data_inicio := public.somar_dias(data_inicio, -GREATEST(e.sla_dias - 1, 1), cal);
    END LOOP;

    onb := public._criar_onboarding(cli, prod, data_inicio);
    UPDATE public.onboardings SET campos = s.campos::jsonb WHERE id = onb;

    ini := data_inicio;
    FOR e IN SELECT id, ordem, sla_dias FROM public.onboarding_etapas WHERE onboarding_id = onb ORDER BY ordem LOOP
      IF s.atual = 0 OR e.ordem < s.atual THEN
        fim := public.somar_dias(ini, GREATEST(e.sla_dias - 1, 1), cal);
        UPDATE public.onboarding_etapas SET status = 'concluida', iniciada_em = ini + time '09:00', prazo_em = public.somar_dias(ini, sla_dias, cal),
          concluida_em = fim + time '17:00' WHERE id = e.id;
        UPDATE public.onboarding_checklist SET feito = true, feito_em = fim + time '16:00' WHERE onboarding_etapa_id = e.id;
        ini := fim;
      ELSIF e.ordem = s.atual THEN
        UPDATE public.onboarding_etapas SET status = s.status, motivo = s.motivo, iniciada_em = inicio_atual + time '09:00',
          prazo_em = public.somar_dias(inicio_atual, sla_dias, cal),
          pausada_desde = CASE WHEN s.status = 'aguardando_cliente' THEN (current_date - 1) + time '10:00' END
          WHERE id = e.id;
        UPDATE public.onboarding_checklist SET feito = true, feito_em = inicio_atual + time '15:00'
          WHERE onboarding_etapa_id = e.id AND ordem = 1 AND s.dias >= 2;
      ELSE
        UPDATE public.onboarding_etapas SET status = 'pendente', iniciada_em = NULL, prazo_em = NULL WHERE id = e.id;
      END IF;
    END LOOP;

    IF s.atual = 0 THEN
      UPDATE public.onboardings SET status = 'concluido', data_termino = ini WHERE id = onb;
    END IF;

    INSERT INTO public.onboarding_eventos (onboarding_id, tipo, detalhe, created_at)
    VALUES (onb, 'seed', 'Dados de exemplo', now());
    IF s.motivo IS NOT NULL THEN
      INSERT INTO public.onboarding_notas (onboarding_id, texto, user_id) VALUES (onb, s.motivo, NULL);
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.onboarding_etapas ENABLE TRIGGER onboarding_etapas_regras;
ALTER TABLE public.onboarding_etapas ENABLE TRIGGER onboarding_etapas_fluxo;
ALTER TABLE public.onboarding_checklist ENABLE TRIGGER onboarding_checklist_marca;
