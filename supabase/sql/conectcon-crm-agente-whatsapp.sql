-- CRM Etapa 2: Agente Comercial no WhatsApp (instância interna).
-- Rode no SQL Editor depois de conectcon-crm-cliente.sql. Idempotente.
-- Ative o agente na instância: UPDATE public.empresas_instancias SET agente_crm = true WHERE nome = 'Mensagens Internas';
ALTER TABLE public.empresas_instancias ADD COLUMN IF NOT EXISTS agente_crm boolean NOT NULL DEFAULT false;

-- Colaborador da empresa da instância (pelo telefone) quando o agente está ligado; senão NULL.
CREATE OR REPLACE FUNCTION public.crm_agente_identificar(p_token text, p_telefone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inst public.empresas_instancias%ROWTYPE; v_fone text; v_u record;
BEGIN
  IF length(coalesce(p_token,'')) < 20 THEN RETURN NULL; END IF;
  SELECT * INTO v_inst FROM public.empresas_instancias WHERE webhook_token = p_token AND agente_crm;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_fone := right(regexp_replace(coalesce(p_telefone,''),'\D','','g'), 10);
  IF length(v_fone) < 10 THEN RETURN NULL; END IF;
  SELECT u.id, coalesce(to_jsonb(u)->>'nome', to_jsonb(u)->>'email') AS nome INTO v_u FROM public.usuarios u
   WHERE u.empresa_id = v_inst.empresa_id
     AND right(regexp_replace(coalesce(to_jsonb(u)->>'telefone',''),'\D','','g'), 10) = v_fone
   LIMIT 1;
  IF v_u.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('usuario_id', v_u.id, 'nome', v_u.nome, 'empresa_id', v_inst.empresa_id,
    'instancia', jsonb_build_object('id', v_inst.id, 'tipo', v_inst.tipo, 'tipo_envio', to_jsonb(v_inst)->>'tipo_envio',
       'instance_id', v_inst.instance_id, 'token', v_inst.token, 'client_token', to_jsonb(v_inst)->>'client_token',
       'n8n_webhook_url', to_jsonb(v_inst)->>'n8n_webhook_url', 'nome', v_inst.nome));
END $$;

-- Executa o que a IA entendeu: acha (ou cadastra) o cliente, grava a interação e agenda a visita no Planner.
CREATE OR REPLACE FUNCTION public.crm_agente_executar(p_token text, p_telefone text, p_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id jsonb; v_emp uuid; v_user uuid; v_cli uuid; v_cli_nome text; v_novo boolean := false;
  v_nome text := left(trim(coalesce(p_dados->>'cliente','')), 160); v_tec uuid; v_tec_nome text; v_visita timestamptz;
BEGIN
  v_id := public.crm_agente_identificar(p_token, p_telefone);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  IF v_nome = '' THEN RAISE EXCEPTION 'Cliente não informado'; END IF;
  v_emp := (v_id->>'empresa_id')::uuid; v_user := (v_id->>'usuario_id')::uuid;

  SELECT e.id, coalesce(to_jsonb(e)->>'nome_fantasia', to_jsonb(e)->>'nome', to_jsonb(e)->>'razao_social') INTO v_cli, v_cli_nome
    FROM public.empresas e
   WHERE e.empresa_origem_id = v_emp AND coalesce(e.is_cliente, false)
     AND (coalesce(to_jsonb(e)->>'nome','') ILIKE '%'||v_nome||'%'
       OR coalesce(to_jsonb(e)->>'nome_fantasia','') ILIKE '%'||v_nome||'%'
       OR coalesce(to_jsonb(e)->>'razao_social','') ILIKE '%'||v_nome||'%')
   ORDER BY length(coalesce(to_jsonb(e)->>'nome','')) LIMIT 1;
  IF v_cli IS NULL THEN
    INSERT INTO public.empresas(nome, is_cliente, empresa_origem_id) VALUES (v_nome, true, v_emp) RETURNING id INTO v_cli;
    v_cli_nome := v_nome; v_novo := true;
  END IF;

  INSERT INTO public.crm_interacoes(empresa_id, cliente_id, usuario_id, tipo, texto, origem, proxima_acao_tipo, proxima_acao_em, ocorrido_em)
  VALUES (v_emp, v_cli, v_user, coalesce(p_dados->>'tipo','nota'), left(coalesce(p_dados->>'resumo',''), 4000), 'whatsapp_bot',
          nullif(p_dados->>'proxima_acao_tipo',''), nullif(p_dados->>'proxima_acao_em','')::timestamptz, now());

  v_visita := nullif(p_dados->>'visita_em','')::timestamptz;
  IF v_visita IS NOT NULL THEN
    IF coalesce(p_dados->>'tecnico','') <> '' THEN
      SELECT u.id, to_jsonb(u)->>'nome' INTO v_tec, v_tec_nome FROM public.usuarios u
       WHERE u.empresa_id = v_emp AND coalesce(to_jsonb(u)->>'nome','') ILIKE '%'||(p_dados->>'tecnico')||'%' LIMIT 1;
    END IF;
    v_tec := coalesce(v_tec, v_user); v_tec_nome := coalesce(v_tec_nome, v_id->>'nome');
    INSERT INTO public.tarefas_usuarios(empresa_id, criado_por, responsavel_id, titulo, descricao, data_solicitacao, data_entrega, data_planejada, status, prioridade, anexos)
    VALUES (v_emp, v_user, v_tec, 'Visita técnica: '||v_cli_nome,
            to_char(v_visita AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')||E'\nAgendada pelo WhatsApp por '||coalesce(v_id->>'nome','')||E'\n\n'||left(coalesce(p_dados->>'resumo',''),2000),
            current_date, (v_visita AT TIME ZONE 'America/Sao_Paulo')::date, CASE WHEN v_tec = v_user THEN (v_visita AT TIME ZONE 'America/Sao_Paulo')::date END,
            CASE WHEN v_tec = v_user THEN 'andamento' ELSE 'aguardando' END, 'media', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object('cliente_id', v_cli, 'cliente', v_cli_nome, 'novo', v_novo, 'visita', v_visita IS NOT NULL, 'tecnico', v_tec_nome);
END $$;

REVOKE ALL ON FUNCTION public.crm_agente_identificar(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_agente_executar(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_agente_identificar(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_agente_executar(text, text, jsonb) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
