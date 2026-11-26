-- Agente WhatsApp: (1) reuniões com colegas da equipe sem cadastrar cliente; (2) reembolso por foto da nota (OCR).
-- Rode no SQL Editor depois de conectcon-crm-agente-convite.sql. Idempotente.

-- Nomes dos colegas da empresa do colaborador (a IA usa para não confundir equipe com cliente).
CREATE OR REPLACE FUNCTION public.crm_agente_equipe(p_token text, p_telefone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id jsonb;
BEGIN
  v_id := public.crm_agente_identificar(p_token, p_telefone);
  IF v_id IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN coalesce((SELECT jsonb_agg(u.nome ORDER BY u.nome) FROM public.usuarios u
                    WHERE u.empresa_id = (v_id->>'empresa_id')::uuid AND coalesce(u.nome,'') <> ''), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.crm_agente_executar(p_token text, p_telefone text, p_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id jsonb; v_emp uuid; v_user uuid; v_cli uuid; v_cli_nome text; v_cli_email text; v_cli_fone text; v_novo boolean := false;
  v_nome text := left(trim(coalesce(p_dados->>'cliente','')), 160);
  v_tipo text := coalesce(nullif(p_dados->>'tipo',''), 'nota');
  v_inicio timestamptz; v_kanban uuid; v_etapa uuid; v_orc uuid; v_seq int; v_ano int := extract(year from now())::int;
  v_reuniao uuid; v_sala text; v_sala_tipo text; v_emails jsonb; v_fones jsonb; v_convidados jsonb; v_presencial boolean;
  v_equipe uuid[] := '{}'; v_equipe_nomes text[] := '{}'; v_n text; v_u record; v_titulo text;
BEGIN
  v_id := public.crm_agente_identificar(p_token, p_telefone);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  v_emp := (v_id->>'empresa_id')::uuid; v_user := (v_id->>'usuario_id')::uuid;

  -- 0. Colegas da equipe: viram participantes internos (agenda deles), nunca cliente.
  FOR v_n IN SELECT x FROM jsonb_array_elements_text(coalesce(p_dados->'equipe','[]'::jsonb)) x
             UNION ALL SELECT v_nome WHERE v_nome <> ''
  LOOP
    SELECT u.id, u.nome INTO v_u FROM public.usuarios u
     WHERE u.empresa_id = v_emp AND u.id <> v_user AND length(trim(v_n)) >= 3
       AND (u.nome ILIKE '%'||trim(v_n)||'%' OR trim(v_n) ILIKE '%'||u.nome||'%'
            OR (position(' ' in trim(v_n)) > 0 AND u.nome ILIKE split_part(trim(v_n),' ',1)||'% '||left(split_part(trim(v_n),' ',array_length(string_to_array(trim(v_n),' '),1)), 4)||'%'))
     ORDER BY (lower(u.nome) = lower(trim(v_n))) DESC, length(u.nome) LIMIT 1;
    IF v_u.id IS NOT NULL AND NOT v_u.id = ANY(v_equipe) THEN
      v_equipe := v_equipe || v_u.id; v_equipe_nomes := v_equipe_nomes || v_u.nome;
      IF lower(trim(v_n)) = lower(v_nome) THEN v_nome := ''; END IF;
    END IF;
    v_u := NULL;
  END LOOP;
  IF v_nome = '' AND cardinality(v_equipe) = 0 THEN RAISE EXCEPTION 'Cliente não informado'; END IF;

  v_emails := coalesce(p_dados->'convidados_email', '[]'::jsonb);
  v_fones := coalesce(p_dados->'convidados_telefone', '[]'::jsonb);
  -- E-mails da equipe vêm do cadastro (não do áudio): tira das listas de convidados externos.
  SELECT coalesce(jsonb_agg(e), '[]'::jsonb) INTO v_emails FROM jsonb_array_elements_text(v_emails) e
   WHERE NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = ANY(v_equipe) AND (lower(u.email) = lower(e) OR split_part(lower(u.email),'@',1) = split_part(lower(e),'@',1)));
  v_inicio := coalesce(nullif(p_dados->>'visita_em','')::timestamptz, nullif(p_dados->>'proxima_acao_em','')::timestamptz);

  IF v_nome <> '' THEN
    -- 1. Cliente em public.empresas (empresa_pai_id satisfaz o RLS isolamento_empresa)
    SELECT e.id, coalesce(e.nome, e.titulo), e.email, e.telefone1 INTO v_cli, v_cli_nome, v_cli_email, v_cli_fone
      FROM public.empresas e
     WHERE (e.empresa_pai_id = v_emp OR e.empresa_origem_id = v_emp) AND coalesce(e.is_tenant, false) = false
       AND (coalesce(e.nome,'') ILIKE '%'||v_nome||'%' OR coalesce(e.titulo,'') ILIKE '%'||v_nome||'%')
     ORDER BY length(coalesce(e.nome,'')) LIMIT 1;
    IF v_cli IS NULL THEN
      INSERT INTO public.empresas(nome, is_cliente, is_tenant, empresa_pai_id, empresa_origem_id, email)
      VALUES (v_nome, true, false, v_emp, v_emp, v_emails->>0) RETURNING id INTO v_cli;
      v_cli_nome := v_nome; v_cli_email := v_emails->>0; v_novo := true;
    ELSIF v_cli_email IS NULL AND v_emails->>0 IS NOT NULL THEN
      UPDATE public.empresas SET email = v_emails->>0 WHERE id = v_cli; v_cli_email := v_emails->>0;
    END IF;
    IF jsonb_array_length(v_emails) = 0 AND v_cli_email IS NOT NULL THEN v_emails := jsonb_build_array(v_cli_email); END IF;
    IF jsonb_array_length(v_fones) = 0 AND v_cli_fone IS NOT NULL THEN v_fones := jsonb_build_array(v_cli_fone); END IF;

    -- 2. Interação no CRM
    INSERT INTO public.crm_interacoes(empresa_id, cliente_id, usuario_id, tipo, texto, origem, proxima_acao_tipo, proxima_acao_em, ocorrido_em)
    VALUES (v_emp, v_cli, v_user, v_tipo, left(coalesce(p_dados->>'resumo',''), 4000), 'whatsapp_bot',
            nullif(p_dados->>'proxima_acao_tipo',''), v_inicio, now());

    -- 3. Lead novo vira card na etapa Lead do Kanban de Oferta
    IF v_novo THEN
      SELECT k.id, e.id INTO v_kanban, v_etapa
        FROM public.kanban_etapas e JOIN public.kanban_nome k ON k.id = e.kanban_nome_id
       WHERE (k.empresa_id = v_emp OR k.empresa_id IS NULL) AND k.nome ILIKE '%oferta%' AND e.descricao ILIKE 'lead%'
       ORDER BY (k.empresa_id = v_emp) DESC, e.ordem ASC LIMIT 1;
      IF v_etapa IS NOT NULL THEN
        SELECT coalesce(max(sequencia), 0) + 1 INTO v_seq FROM public.orcamentos WHERE empresa_id = v_emp AND ano = v_ano;
        INSERT INTO public.orcamentos(empresa_id, parceiro_id, usuario_id, criado_por, kanban_nome_id, kanban_etapa_id, ano, sequencia, numero,
          descricao, situacao, dt_orcamento, total_itens, total_liquido, modalidade, desconto_tipo, desconto_valor, faturamento_misto)
        VALUES (v_emp, v_cli, v_user, v_user, v_kanban, v_etapa, v_ano, v_seq, '#'||v_ano||'-'||lpad(v_seq::text, 4, '0'),
          'Lead: '||v_cli_nome, 'Lead', current_date, 0, 0, 'prazo', 'valor', 0, false)
        RETURNING id INTO v_orc;
      END IF;
    END IF;
  END IF;

  -- Reunião só com a equipe: e-mails ditos no áudio são dos colegas; vale o cadastro deles.
  IF v_cli IS NULL THEN v_emails := '[]'::jsonb; v_fones := '[]'::jsonb; END IF;

  -- 4. Compromisso com data/hora entra na grade do Planner (participantes = eu + equipe)
  IF v_inicio IS NOT NULL THEN
    v_presencial := v_tipo = 'visita' OR nullif(p_dados->>'visita_em','') IS NOT NULL;
    v_titulo := CASE WHEN v_cli_nome IS NULL THEN 'Reunião interna: '||array_to_string(v_equipe_nomes, ', ')
                     WHEN v_presencial THEN 'Visita: '||v_cli_nome ELSE 'Reunião online: '||v_cli_nome END;
    v_sala := 'atendeai-'||substr(md5(random()::text), 1, 6)||to_hex(extract(epoch from now())::bigint);
    SELECT coalesce(jsonb_agg(jsonb_build_object('nome', coalesce(p_dados->>'convidados_nome', v_cli_nome, ''), 'email', em, 'telefone', '')), '[]'::jsonb)
      INTO v_convidados FROM jsonb_array_elements_text(v_emails) em;
    IF jsonb_array_length(v_convidados) = 0 AND jsonb_array_length(v_fones) > 0 THEN
      v_convidados := jsonb_build_array(jsonb_build_object('nome', coalesce(p_dados->>'convidados_nome', v_cli_nome, ''), 'email', '', 'telefone', v_fones->>0));
    ELSIF jsonb_array_length(v_fones) > 0 THEN
      v_convidados := jsonb_set(v_convidados, '{0,telefone}', to_jsonb(v_fones->>0));
    END IF;
    INSERT INTO public.reunioes(empresa_id, criado_por, titulo, pauta, inicio, duracao_min, sala, video, convidados, cancelada, modalidade, local, agente_pendente)
    VALUES (v_emp, v_user, v_titulo, left(coalesce(p_dados->>'resumo',''), 1000), v_inicio, 60, v_sala, true, v_convidados, false,
      CASE WHEN v_presencial THEN 'presencial' ELSE 'online' END, CASE WHEN v_presencial THEN v_cli_nome END, true)
    RETURNING id INTO v_reuniao;
    SELECT udt_name INTO v_sala_tipo FROM information_schema.columns WHERE table_schema='public' AND table_name='reunioes' AND column_name='participantes';
    IF v_sala_tipo = 'jsonb' THEN
      UPDATE public.reunioes SET participantes = to_jsonb(ARRAY[v_user] || v_equipe) WHERE id = v_reuniao;
    ELSE
      EXECUTE format('UPDATE public.reunioes SET participantes = %L::%s[] WHERE id = %L', ARRAY[v_user] || v_equipe, ltrim(coalesce(v_sala_tipo,'_text'),'_'), v_reuniao);
    END IF;
  END IF;

  RETURN jsonb_build_object('cliente_id', v_cli, 'cliente', v_cli_nome, 'novo', v_novo, 'orcamento_id', v_orc,
    'reuniao_id', v_reuniao, 'titulo', v_titulo, 'sala', v_sala, 'inicio', v_inicio, 'presencial', coalesce(v_presencial, false),
    'emails', v_emails, 'telefones', v_fones, 'equipe', to_jsonb(v_equipe_nomes),
    'equipe_emails', coalesce((SELECT jsonb_agg(u.email) FROM public.usuarios u WHERE u.id = ANY(v_equipe) AND coalesce(u.email,'') <> ''), '[]'::jsonb));
END $$;

-- Reembolso por foto: grava a despesa pendente do colaborador com os dados lidos da nota.
CREATE OR REPLACE FUNCTION public.crm_agente_reembolso(p_token text, p_telefone text, p_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id jsonb; v_desp uuid; v_valor numeric := round(nullif(p_dados->>'valor','')::numeric, 2);
  v_cat text := coalesce(nullif(p_dados->>'categoria',''), 'outros');
BEGIN
  v_id := public.crm_agente_identificar(p_token, p_telefone);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  IF v_valor IS NULL OR v_valor <= 0 THEN RAISE EXCEPTION 'Valor não identificado'; END IF;
  IF v_cat NOT IN ('alimentacao','combustivel','pedagio','estacionamento','hospedagem','transporte','material','outros') THEN v_cat := 'outros'; END IF;
  INSERT INTO public.despesas_lancamentos(empresa_id, usuario_id, status, modalidade, data, estabelecimento, cnpj, categoria, valor, comprovante, observacao)
  VALUES ((v_id->>'empresa_id')::uuid, (v_id->>'usuario_id')::uuid, 'pendente', 'reembolso',
    coalesce(nullif(p_dados->>'data','')::date, current_date), left(nullif(p_dados->>'estabelecimento',''), 200),
    left(nullif(regexp_replace(coalesce(p_dados->>'cnpj',''),'\D','','g'),''), 14), v_cat, v_valor,
    left(nullif(p_dados->>'comprovante',''), 2000), left(nullif(p_dados->>'observacao',''), 1000))
  RETURNING id INTO v_desp;
  RETURN jsonb_build_object('id', v_desp, 'valor', v_valor);
END $$;

REVOKE ALL ON FUNCTION public.crm_agente_equipe(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_agente_executar(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_agente_reembolso(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_agente_equipe(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_agente_executar(text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_agente_reembolso(text, text, jsonb) TO anon, authenticated;
