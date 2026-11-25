-- ConectCon HUB — Novas conversas com robô entram em TRIAGEM (sem departamento).
-- Antes: caíam no primeiro quadro em ordem alfabética (ex.: Financeiro) antes do cliente escolher.
-- Rode no SQL Editor (idempotente).
ALTER TABLE public.atendimentos ALTER COLUMN kanban_nome_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.fluxo_webhook_receber(
  p_token text, p_telefone text, p_nome text, p_texto text,
  p_tipo text DEFAULT 'texto', p_midia text DEFAULT NULL, p_externo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inst public.empresas_instancias%ROWTYPE; v_pessoa uuid; v_at public.atendimentos%ROWTYPE; v_novo boolean := false;
  v_kanban uuid; v_etapa uuid; v_fone text; v_exec public.fluxos_execucoes%ROWTYPE; v_fluxo public.fluxos_atendimento%ROWTYPE; v_txt text; v_humano boolean := false;
BEGIN
  IF length(coalesce(p_token,'')) < 20 THEN RAISE EXCEPTION 'Token inválido'; END IF;
  SELECT * INTO v_inst FROM public.empresas_instancias WHERE webhook_token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Instância não encontrada'; END IF;

  IF p_externo IS NOT NULL AND EXISTS (SELECT 1 FROM public.atendimentos_mensagem WHERE externo_id = p_externo) THEN
    RETURN jsonb_build_object('duplicada', true);
  END IF;

  v_fone := regexp_replace(coalesce(p_telefone,''),'\D','','g');
  IF length(v_fone) < 8 THEN RAISE EXCEPTION 'Telefone inválido'; END IF;

  -- Respostas às mensagens do sistema (credenciais, projetos): telefone de usuário interno não abre atendimento nem robô
  IF coalesce((to_jsonb(v_inst)->>'permitir_colaboradores')::boolean, true) = false AND EXISTS (SELECT 1 FROM public.usuarios u
              WHERE length(regexp_replace(coalesce(to_jsonb(u)->>'telefone',''),'\D','','g')) >= 10
                AND right(regexp_replace(coalesce(to_jsonb(u)->>'telefone',''),'\D','','g'), 10) = right(v_fone, 10)) THEN
    RETURN jsonb_build_object('interno', true);
  END IF;

  SELECT id INTO v_pessoa FROM public.pessoas
   WHERE empresa_id = v_inst.empresa_id
     AND right(regexp_replace(coalesce(telefone,''),'\D','','g'), 10) = right(v_fone, 10)
   LIMIT 1;
  IF v_pessoa IS NULL THEN
    INSERT INTO public.pessoas(nome, telefone, empresa_id, status)
    VALUES (left(coalesce(nullif(trim(p_nome),''), v_fone), 120), v_fone, v_inst.empresa_id, true)
    RETURNING id INTO v_pessoa;
    v_novo := true;
  END IF;

  -- Último atendimento aberto desta pessoa nesta instância
  SELECT a.* INTO v_at FROM public.atendimentos a
   WHERE a.pessoas_id = v_pessoa AND a.instancia_id = v_inst.id
     AND NOT EXISTS (SELECT 1 FROM public.kanban_etapas e
                      WHERE e.id = (to_jsonb(a)->>'kanban_etapa_id')::uuid AND e.is_default_encerrado = true)
   ORDER BY a.dt_ultimo_whatsapp DESC NULLS LAST, a.created_at DESC NULLS LAST LIMIT 1;

  IF v_at.id IS NULL THEN
    -- Com robô ativo, a conversa nasce em Triagem (sem departamento); o menu define o quadro.
    IF EXISTS (SELECT 1 FROM public.fluxos_atendimento f
                WHERE f.empresa_id = v_inst.empresa_id AND f.ativo
                  AND (f.instancia_id IS NULL OR f.instancia_id = v_inst.id)
                  AND f.gatilho IN ('mensagem_recebida','novo_contato','palavra_chave')) THEN
      INSERT INTO public.atendimentos(pessoas_id, instancia_id, empresa_id, kanban_nome_id, modo_atendimento, canal)
      VALUES (v_pessoa, v_inst.id, v_inst.empresa_id, NULL, 'IA', 'whatsapp')
      RETURNING * INTO v_at;
      v_novo := true;
    END IF;
  END IF;

  IF v_at.id IS NULL THEN
    -- Quadro de entrada: o marcado como entrada; senão um que não seja Oferta/Compras/Cotações.
    SELECT id INTO v_kanban FROM public.kanban_nome k WHERE k.empresa_id = v_inst.empresa_id
     ORDER BY coalesce((to_jsonb(k)->>'quadro_entrada')::boolean, false) DESC,
              (lower(coalesce(k.nome,'')) ~ '(oferta|orcamento|orçamento|compra|cota)') ASC,
              k.nome LIMIT 1;
    SELECT id INTO v_etapa FROM public.kanban_etapas WHERE kanban_nome_id = v_kanban
     ORDER BY (is_default_humano IS TRUE) DESC, ordem NULLS LAST LIMIT 1;
    INSERT INTO public.atendimentos(pessoas_id, instancia_id, empresa_id, kanban_nome_id, modo_atendimento, canal)
    VALUES (v_pessoa, v_inst.id, v_inst.empresa_id, v_kanban, 'Humano', 'whatsapp')
    RETURNING * INTO v_at;
    IF v_etapa IS NOT NULL THEN
      PERFORM public._fluxo_upd('atendimentos', v_at.id, jsonb_build_object('kanban_etapa_id', v_etapa));
    END IF;
    v_novo := true;
  END IF;

  v_txt := left(coalesce(p_texto,''), 4000);
  INSERT INTO public.atendimentos_mensagem(atendimento_id, mensagem, tipo_midia, remetente_tipo, empresa_id, instancia_id, midia_url, externo_id)
  VALUES (v_at.id, v_txt, coalesce(p_tipo,'texto'), 'cliente', v_inst.empresa_id, v_inst.id, p_midia, p_externo);
  PERFORM public._fluxo_upd('atendimentos', v_at.id, jsonb_build_object('dt_ultimo_whatsapp', now(), 'updated_at', now()));

  -- Atendente humano já respondeu e a conversa não foi devolvida à IA: robô fica desligado
  v_humano := coalesce(to_jsonb(v_at)->>'modo_atendimento','') <> 'IA' AND EXISTS (
    SELECT 1 FROM public.atendimentos_mensagem m
     WHERE m.atendimento_id = v_at.id AND (to_jsonb(m)->>'usuario_id') IS NOT NULL
       AND coalesce((to_jsonb(m)->>'msg_interna')::boolean, false) = false);

  -- Fluxo em andamento?
  SELECT * INTO v_exec FROM public.fluxos_execucoes
   WHERE atendimento_id = v_at.id ORDER BY created_at DESC LIMIT 1;

  -- #inicio / #menu devolve a conversa ao robô mesmo depois que um atendente assumiu.
  IF (v_humano OR v_exec.status IN ('transbordo','finalizado')) AND lower(trim(v_txt)) ~ '(^|\s)#?(inicio|início|menu|comecar|começar|reiniciar|voltar)(\s|$)'
     AND (position('#' in v_txt) > 0 OR lower(trim(v_txt)) ~ '^#?(inicio|início|menu|comecar|começar|reiniciar|voltar)$') THEN
    v_humano := false;
    PERFORM public._fluxo_upd('atendimentos', v_at.id, jsonb_build_object('modo_atendimento', 'IA'));
    UPDATE public.fluxos_execucoes SET status = 'finalizado' WHERE atendimento_id = v_at.id AND status IN ('ativo','aguardando');
    v_exec := NULL;
  END IF;

  IF v_humano THEN
    v_exec := NULL;
  ELSIF v_exec.id IS NOT NULL AND v_exec.status IN ('ativo','aguardando') THEN
    SELECT * INTO v_fluxo FROM public.fluxos_atendimento WHERE id = v_exec.fluxo_id AND ativo;
  ELSIF v_exec.id IS NULL THEN
    -- Primeiro contato desta conversa: escolhe o fluxo ativo que combina
    SELECT f.* INTO v_fluxo FROM public.fluxos_atendimento f
     WHERE f.empresa_id = v_inst.empresa_id AND f.ativo
       AND (f.instancia_id IS NULL OR f.instancia_id = v_inst.id)
       AND (
         f.gatilho = 'mensagem_recebida'
         OR (f.gatilho = 'novo_contato' AND v_novo)
         OR (f.gatilho = 'palavra_chave' AND EXISTS (
               SELECT 1 FROM unnest(string_to_array(coalesce(f.palavras_chave,''), ',')) k
                WHERE trim(k) <> '' AND lower(v_txt) LIKE '%' || lower(trim(k)) || '%'))
       )
     ORDER BY (f.instancia_id IS NOT NULL) DESC, (f.gatilho = 'palavra_chave') DESC, f.updated_at DESC
     LIMIT 1;
    v_exec := NULL;
  END IF;

  RETURN jsonb_build_object(
    'atendimento_id', v_at.id,
    'empresa_id', v_inst.empresa_id,
    'telefone', v_fone,
    'novo', v_novo,
    'protocolo', (SELECT a.protocolo FROM public.atendimentos a WHERE a.id = v_at.id),
    'modo', coalesce(to_jsonb(v_at)->>'modo_atendimento', ''),
    'instancia', jsonb_build_object('id', v_inst.id, 'tipo', v_inst.tipo, 'tipo_envio', to_jsonb(v_inst)->>'tipo_envio',
       'instance_id', v_inst.instance_id, 'token', v_inst.token, 'client_token', to_jsonb(v_inst)->>'client_token',
       'n8n_webhook_url', to_jsonb(v_inst)->>'n8n_webhook_url', 'nome', v_inst.nome),
    'fluxo', CASE WHEN v_fluxo.id IS NULL THEN NULL ELSE jsonb_build_object('id', v_fluxo.id, 'nos', v_fluxo.nos, 'conexoes', v_fluxo.conexoes) END,
    'execucao', CASE WHEN v_exec.id IS NULL OR v_fluxo.id IS NULL THEN NULL
       ELSE jsonb_build_object('id', v_exec.id, 'no_atual', v_exec.no_atual, 'variaveis', v_exec.variaveis, 'status', v_exec.status) END
  );
END $$;

GRANT EXECUTE ON FUNCTION public.fluxo_webhook_receber(text, text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fluxo_webhook_receber(text, text, text, text, text, text, text) TO anon, authenticated;

-- Corrige conversas abertas que ainda estão no robô e nunca passaram por um bloco de quadro.
UPDATE public.atendimentos a SET kanban_nome_id = NULL
 WHERE a.modo_atendimento = 'IA' AND a.usuario_responsavel_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.atendimentos_mensagem m WHERE m.atendimento_id = a.id AND m.usuario_id IS NOT NULL)
   AND EXISTS (SELECT 1 FROM public.fluxos_execucoes x WHERE x.atendimento_id = a.id AND x.status = 'aguardando')
   AND a.created_at >= now() - interval '1 day';

NOTIFY pgrst, 'reload schema';
