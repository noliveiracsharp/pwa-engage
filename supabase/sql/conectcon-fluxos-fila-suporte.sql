-- Execute uma vez no SQL Editor antes de publicar a aplicação.
-- Preserva fluxo_webhook_acao e todas as correções anteriores.
BEGIN;

CREATE OR REPLACE FUNCTION public.fluxo_webhook_fila(p_token text, p_atendimento uuid, p_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inst public.empresas_instancias%ROWTYPE;
  v_at public.atendimentos%ROWTYPE;
  v_etapa public.kanban_etapas%ROWTYPE;
  v_quadro uuid;
  v_destino uuid;
  v_patch jsonb;
BEGIN
  SELECT * INTO v_inst FROM public.empresas_instancias
   WHERE webhook_token = p_token AND length(p_token) >= 20;
  IF NOT FOUND THEN RAISE EXCEPTION 'Instância não encontrada'; END IF;
  SELECT * INTO v_at FROM public.atendimentos
   WHERE id = p_atendimento AND empresa_id = v_inst.empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Atendimento não encontrado'; END IF;

  v_quadro := nullif(p_dados->>'quadro_id','')::uuid;
  v_destino := nullif(p_dados->>'etapa_id','')::uuid;
  IF v_destino IS NOT NULL THEN
    SELECT e.* INTO v_etapa FROM public.kanban_etapas e
      JOIN public.kanban_nome k ON k.id = e.kanban_nome_id
     WHERE e.id = v_destino AND k.empresa_id = v_inst.empresa_id
       AND (v_quadro IS NULL OR e.kanban_nome_id = v_quadro);
    IF NOT FOUND THEN RAISE EXCEPTION 'Etapa fora do departamento autorizado'; END IF;
    v_quadro := v_etapa.kanban_nome_id;
  ELSE
    v_quadro := coalesce(v_quadro, v_at.kanban_nome_id,
      nullif(to_jsonb(v_inst)->>'kanban_nome_id','')::uuid);
    -- Sem destino configurado, só inferir quando a empresa possui um único quadro.
    IF v_quadro IS NULL THEN
      SELECT k.id INTO v_quadro FROM public.kanban_nome k
       WHERE k.empresa_id = v_inst.empresa_id
         AND (SELECT count(*) FROM public.kanban_nome WHERE empresa_id = v_inst.empresa_id) = 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.kanban_nome WHERE id = v_quadro AND empresa_id = v_inst.empresa_id) THEN
      RAISE EXCEPTION 'Configure o departamento de atendimento humano no fluxo';
    END IF;
    SELECT e.* INTO v_etapa FROM public.kanban_etapas e
     WHERE e.kanban_nome_id = v_quadro
       AND coalesce(to_jsonb(e)->>'status','true') <> 'false'
       AND coalesce(e.is_default_encerrado,false) = false
       AND coalesce(to_jsonb(e)->>'descricao',to_jsonb(e)->>'nome','') !~* 'encerr|finaliz|conclu|fechad|resolvid'
       AND coalesce(to_jsonb(e)->>'descricao',to_jsonb(e)->>'nome','') !~* '(^|[[:space:]])(ia|bot|rob[oô])([[:space:]]|$)|triagem'
     ORDER BY (e.is_default_humano IS TRUE) DESC,
       (coalesce(to_jsonb(e)->>'descricao',to_jsonb(e)->>'nome','') ~* '(n[ií]vel|nivel)[[:space:]]*2') DESC,
       e.ordem NULLS LAST, e.id LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Configure uma etapa de atendimento humano no departamento'; END IF;
  END IF;
  IF coalesce(v_etapa.is_default_encerrado,false)
     OR coalesce(to_jsonb(v_etapa)->>'status','true') = 'false'
     OR coalesce(to_jsonb(v_etapa)->>'descricao',to_jsonb(v_etapa)->>'nome','') ~* 'encerr|finaliz|conclu|fechad|resolvid' THEN
    RAISE EXCEPTION 'A fila humana não pode ser uma etapa encerrada ou desativada';
  END IF;

  v_patch := jsonb_build_object('kanban_nome_id',v_quadro,
    'kanban_etapa_id',v_etapa.id,'kanban_etapas_id',v_etapa.id,
    'modo_atendimento','Humano','modo','Humano',
    'usuario_responsavel_id',null,'encerrado_em',null,
    'status',coalesce(to_jsonb(v_etapa)->>'descricao',to_jsonb(v_etapa)->>'nome'),
    'status_atendimento',coalesce(to_jsonb(v_etapa)->>'descricao',to_jsonb(v_etapa)->>'nome'),
    'updated_at',now());
  IF nullif(p_dados->>'prioridade','') IS NOT NULL THEN
    v_patch := v_patch || jsonb_build_object('prioridade',p_dados->>'prioridade');
  END IF;
  PERFORM public._fluxo_upd('atendimentos',v_at.id,v_patch);
  RETURN jsonb_build_object('ok',true,'quadro_id',v_quadro,'etapa_id',v_etapa.id);
END $$;
REVOKE ALL ON FUNCTION public.fluxo_webhook_fila(text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fluxo_webhook_fila(text,uuid,jsonb) TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fluxo_webhook_campos(p_token text, p_atendimento uuid, p_campos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inst public.empresas_instancias%ROWTYPE; v_at public.atendimentos%ROWTYPE; v_pessoa uuid;
BEGIN
  SELECT * INTO v_inst FROM public.empresas_instancias
   WHERE webhook_token = p_token AND length(p_token) >= 20;
  IF NOT FOUND THEN RAISE EXCEPTION 'Instância não encontrada'; END IF;
  SELECT * INTO v_at FROM public.atendimentos
   WHERE id = p_atendimento AND empresa_id = v_inst.empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Atendimento não encontrado'; END IF;
  IF jsonb_typeof(p_campos) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Campos inválidos'; END IF;
  IF (SELECT count(*) FROM jsonb_each(p_campos)) > 200 THEN RAISE EXCEPTION 'Limite de campos excedido'; END IF;
  v_pessoa := v_at.pessoas_id;
  IF v_pessoa IS NULL OR NOT EXISTS (SELECT 1 FROM public.pessoas WHERE id = v_pessoa AND empresa_id = v_inst.empresa_id) THEN
    RAISE EXCEPTION 'Contato não encontrado na empresa';
  END IF;
  -- Serializa gravações de campos deste contato, inclusive entre atendimentos diferentes.
  PERFORM 1 FROM public.pessoas WHERE id = v_pessoa FOR UPDATE;
  UPDATE public.pessoas_camposperson c SET valor = x.value
    FROM jsonb_each_text(p_campos) x WHERE c.pessoa_id = v_pessoa AND c.chave = x.key AND x.key <> '';
  INSERT INTO public.pessoas_camposperson(pessoa_id,chave,valor,ordem)
    SELECT v_pessoa,x.key,x.value,
      coalesce((SELECT ordem FROM public.empresas_camposperson
        WHERE empresa_id = v_inst.empresa_id AND chave = x.key LIMIT 1),0)
    FROM jsonb_each_text(p_campos) x WHERE x.key <> ''
      AND NOT EXISTS (SELECT 1 FROM public.pessoas_camposperson c WHERE c.pessoa_id = v_pessoa AND c.chave = x.key);
  RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.fluxo_webhook_campos(text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fluxo_webhook_campos(text,uuid,jsonb) TO anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;