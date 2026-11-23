-- Garante que o p_empresa_id só seja aceito se o usuário puder ver aquela empresa.
CREATE OR REPLACE FUNCTION public.fin_rpc_empresa(p_empresa_id uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_own uuid := public.app_usuario_empresa_id();
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  IF p_empresa_id IS NULL OR p_empresa_id = v_own THEN RETURN v_own; END IF;
  IF public.app_is_master() OR public.cond_financeiro_pode(p_empresa_id, 'ler', '/financeiro') THEN RETURN p_empresa_id; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.fin_rpc_empresa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_rpc_empresa(uuid) TO authenticated;
