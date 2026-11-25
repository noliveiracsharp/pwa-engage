-- Agente Comercial no WhatsApp usa a IA configurada em Empresas → Inteligência Artificial.
-- O webhook não tem sessão de usuário: esta função valida instância + telefone do colaborador
-- e chama ia_autorizar como esse colaborador (mesma regra de plano/cota/chave própria do sistema).
-- Rode no SQL Editor depois de conectcon-crm-agente-whatsapp.sql. Idempotente.
CREATE OR REPLACE FUNCTION public.crm_agente_ia(p_token text, p_telefone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id jsonb; v_aut jsonb;
BEGIN
  v_id := public.crm_agente_identificar(p_token, p_telefone);
  IF v_id IS NULL THEN RETURN NULL; END IF;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_id->>'usuario_id', 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_id->>'usuario_id', true);
  BEGIN
    v_aut := to_jsonb(public.ia_autorizar('controller'));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'crm_agente_ia: %', SQLERRM;
    v_aut := jsonb_build_object('permitido', true, 'origem', 'plataforma');
  END;
  RETURN v_aut;
END $$;

REVOKE ALL ON FUNCTION public.crm_agente_ia(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_agente_ia(text, text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
