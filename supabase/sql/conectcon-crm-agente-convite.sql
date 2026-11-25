-- CRM Agente: reunião na grade do Planner (tabela reunioes) + convite por e-mail/WhatsApp pedido no próprio WhatsApp.
-- Rode no SQL Editor depois de conectcon-crm-agente-whatsapp.sql. Idempotente.
ALTER TABLE public.reunioes ADD COLUMN IF NOT EXISTS convite_enviado_em timestamptz;
ALTER TABLE public.reunioes ADD COLUMN IF NOT EXISTS agente_pendente boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.crm_agente_executar(p_token text, p_telefone text, p_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id jsonb; v_emp uuid; v_user uuid; v_cli uuid; v_cli_nome text; v_cli_email text; v_cli_fone text; v_novo boolean := false;
  v_nome text := left(trim(coalesce(p_dados->>'cliente','')), 160);
  v_tipo text := coalesce(nullif(p_dados->>'tipo',''), 'nota');
  v_inicio timestamptz; v_kanban uuid; v_etapa uuid; v_orc uuid; v_seq int; v_ano int := extract(year from now())::int;
  v_reuniao uuid; v_sala text; v_sala_tipo text; v_emails jsonb; v_fones jsonb; v_convidados jsonb; v_presencial boolean;
BEGIN
  v_id := public.crm_agente_identificar(p_token, p_telefone);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  IF v_nome = '' THEN RAISE EXCEPTION 'Cliente não informado'; END IF;
  v_emp := (v_id->>'empresa_id')::uuid; v_user := (v_id->>'usuario_id')::uuid;

  -- 1. Cliente em public.empresas (empresa_pai_id satisfaz o RLS isolamento_empresa)
  SELECT e.id, coalesce(e.nome_fantasia, e.nome, e.razao_social), e.email, e.telefone1
    INTO v_cli, v_cli_nome, v_cli_email, v_cli_fone
    FROM public.empresas e
   WHERE (e.empresa_pai_id = v_emp OR e.empresa_origem_id = v_emp) AND coalesce(e.is_tenant, false) = false
     AND (coalesce(e.nome,'') ILIKE '%'||v_nome||'%' OR coalesce(e.nome_fantasia,'') ILIKE '%'||v_nome||'%' OR coalesce(e.razao_social,'') ILIKE '%'||v_nome||'%')
   ORDER BY length(coalesce(e.nome,'')) LIMIT 1;

  v_emails := coalesce(p_dados->'convidados_email', '[]'::jsonb);
  v_fones := coalesce(p_dados->'convidados_telefone', '[]'::jsonb);

  IF v_cli IS NULL THEN
    INSERT INTO public.empresas(nome, razao_social, nome_fantasia, is_cliente, is_tenant, empresa_pai_id, empresa_origem_id, email)
    VALUES (v_nome, v_nome, v_nome, true, false, v_emp, v_emp, v_emails->>0)
    RETURNING id INTO v_cli;
    v_cli_nome := v_nome; v_cli_email := v_emails->>0; v_novo := true;
  ELSIF v_cli_email IS NULL AND v_emails->>0 IS NOT NULL THEN
    UPDATE public.empresas SET email = v_emails->>0 WHERE id = v_cli; v_cli_email := v_emails->>0;
  END IF;
  IF jsonb_array_length(v_emails) = 0 AND v_cli_email IS NOT NULL THEN v_emails := jsonb_build_array(v_cli_email); END IF;
  IF jsonb_array_length(v_fones) = 0 AND v_cli_fone IS NOT NULL THEN v_fones := jsonb_build_array(v_cli_fone); END IF;

  -- 2. Interação no CRM
  v_inicio := coalesce(nullif(p_dados->>'visita_em','')::timestamptz, nullif(p_dados->>'proxima_acao_em','')::timestamptz);
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

  -- 4. Compromisso com data/hora entra na grade do Planner como reunião (online ou presencial)
  IF v_inicio IS NOT NULL THEN
    v_presencial := v_tipo = 'visita' OR nullif(p_dados->>'visita_em','') IS NOT NULL;
    v_sala := 'atendeai-'||substr(md5(random()::text), 1, 6)||to_hex(extract(epoch from now())::bigint);
    SELECT coalesce(jsonb_agg(jsonb_build_object('nome', coalesce(p_dados->>'convidados_nome', v_cli_nome), 'email', em, 'telefone', '')), '[]'::jsonb)
      INTO v_convidados FROM jsonb_array_elements_text(v_emails) em;
    IF jsonb_array_length(v_convidados) = 0 AND jsonb_array_length(v_fones) > 0 THEN
      v_convidados := jsonb_build_array(jsonb_build_object('nome', coalesce(p_dados->>'convidados_nome', v_cli_nome), 'email', '', 'telefone', v_fones->>0));
    ELSIF jsonb_array_length(v_fones) > 0 THEN
      v_convidados := jsonb_set(v_convidados, '{0,telefone}', to_jsonb(v_fones->>0));
    END IF;
    INSERT INTO public.reunioes(empresa_id, criado_por, titulo, pauta, inicio, duracao_min, sala, video, participantes, convidados, cancelada, modalidade, local, agente_pendente)
    VALUES (v_emp, v_user,
      CASE WHEN v_presencial THEN 'Visita: ' ELSE 'Reunião online: ' END || v_cli_nome,
      left(coalesce(p_dados->>'resumo',''), 1000), v_inicio, 60, v_sala, true,
      DEFAULT, v_convidados, false,
      CASE WHEN v_presencial THEN 'presencial' ELSE 'online' END,
      CASE WHEN v_presencial THEN v_cli_nome END, true)
    RETURNING id INTO v_reuniao;
    -- participantes pode ser uuid[], text[] ou jsonb conforme a instalação
    SELECT udt_name INTO v_sala_tipo FROM information_schema.columns WHERE table_schema='public' AND table_name='reunioes' AND column_name='participantes';
    IF v_sala_tipo = 'jsonb' THEN
      UPDATE public.reunioes SET participantes = jsonb_build_array(v_user) WHERE id = v_reuniao;
    ELSE
      EXECUTE format('UPDATE public.reunioes SET participantes = ARRAY[%L]::%s[] WHERE id = %L', v_user, ltrim(coalesce(v_sala_tipo,'_text'),'_'), v_reuniao);
    END IF;
  END IF;

  RETURN jsonb_build_object('cliente_id', v_cli, 'cliente', v_cli_nome, 'novo', v_novo, 'orcamento_id', v_orc,
    'reuniao_id', v_reuniao, 'sala', v_sala, 'inicio', v_inicio, 'presencial', coalesce(v_presencial, false),
    'emails', v_emails, 'telefones', v_fones);
END $$;

-- Última reunião do colaborador aguardando decisão sobre o convite (respostas 1/2/3 no WhatsApp).
CREATE OR REPLACE FUNCTION public.crm_agente_reuniao_pendente(p_token text, p_telefone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id jsonb; v_r public.reunioes%ROWTYPE;
BEGIN
  v_id := public.crm_agente_identificar(p_token, p_telefone);
  IF v_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_r FROM public.reunioes
   WHERE empresa_id = (v_id->>'empresa_id')::uuid AND criado_por = (v_id->>'usuario_id')::uuid
     AND agente_pendente AND NOT cancelada AND created_at > now() - interval '24 hours'
   ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('id', v_r.id, 'titulo', v_r.titulo, 'inicio', v_r.inicio, 'sala', v_r.sala, 'video', v_r.video,
    'modalidade', v_r.modalidade, 'local', v_r.local, 'pauta', v_r.pauta, 'duracao_min', v_r.duracao_min, 'convidados', v_r.convidados);
END $$;

-- Fecha a pendência; p_enviado marca o convite como enviado.
CREATE OR REPLACE FUNCTION public.crm_agente_reuniao_concluir(p_token text, p_telefone text, p_reuniao uuid, p_enviado boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id jsonb;
BEGIN
  v_id := public.crm_agente_identificar(p_token, p_telefone);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  UPDATE public.reunioes SET agente_pendente = false, convite_enviado_em = CASE WHEN p_enviado THEN now() ELSE convite_enviado_em END
   WHERE id = p_reuniao AND empresa_id = (v_id->>'empresa_id')::uuid AND criado_por = (v_id->>'usuario_id')::uuid;
END $$;

REVOKE ALL ON FUNCTION public.crm_agente_executar(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_agente_reuniao_pendente(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_agente_reuniao_concluir(text, text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_agente_executar(text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_agente_reuniao_pendente(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_agente_reuniao_concluir(text, text, uuid, boolean) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
