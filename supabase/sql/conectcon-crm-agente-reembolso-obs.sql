-- Agente WhatsApp: texto/áudio enviado até 15 min após uma nota sem legenda vira a observação do reembolso.
-- Idempotente. Rode no SQL Editor.
CREATE OR REPLACE FUNCTION public.crm_agente_reembolso_obs(p_token text, p_telefone text, p_texto text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id jsonb; v_d record;
BEGIN
  IF length(trim(coalesce(p_texto,''))) < 3 THEN RETURN NULL; END IF;
  v_id := public.crm_agente_identificar(p_token, p_telefone);
  IF v_id IS NULL THEN RETURN NULL; END IF;
  SELECT id, valor INTO v_d FROM public.despesas_lancamentos
   WHERE usuario_id = (v_id->>'usuario_id')::uuid AND empresa_id = (v_id->>'empresa_id')::uuid
     AND status = 'pendente' AND coalesce(observacao,'') = '' AND created_at > now() - interval '15 minutes'
   ORDER BY created_at DESC LIMIT 1;
  IF v_d.id IS NULL THEN RETURN NULL; END IF;
  UPDATE public.despesas_lancamentos SET observacao = left(trim(p_texto), 1000) WHERE id = v_d.id;
  RETURN jsonb_build_object('id', v_d.id, 'valor', v_d.valor);
END $$;
REVOKE ALL ON FUNCTION public.crm_agente_reembolso_obs(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_agente_reembolso_obs(text, text, text) TO anon, authenticated;
