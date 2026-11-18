-- ConectCon HUB · Atendimentos: síndico/subsíndico definido na unidade atua como gestão do próprio condomínio,
-- mesmo com perfil de acesso "Morador". Morador comum continua vendo só os próprios chamados.
-- Idempotente. Rode inteiro no SQL Editor.
CREATE OR REPLACE FUNCTION public.cond_atend_eh_gestor(p_cond uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.app_is_master()
    OR EXISTS (
      SELECT 1 FROM public.cond_unidades_vinculos v
        JOIN public.cond_unidades un ON un.id = v.cond_unidade_id
        JOIN public.usuarios us ON us.id = v.usuario_id
       WHERE un.condominio_id = p_cond
         AND (us.id = auth.uid() OR lower(us.email) = lower(auth.jwt() ->> 'email'))
         AND v.funcao_condominio IN ('sindico','subsindico')
         AND COALESCE(to_jsonb(v)->>'status_conexao', 'ativo') = 'ativo'
         AND NOT COALESCE((to_jsonb(v)->>'arquivado')::boolean, false)
         AND (v.data_fim IS NULL OR v.data_fim >= CURRENT_DATE))
    OR (
      p_cond IN (SELECT public.cond_empresas_visiveis())
      AND NOT EXISTS (
        SELECT 1 FROM public.usuarios u JOIN public.perfil p ON p.id = u.perfil_id
         WHERE u.id = auth.uid() AND lower(p.descricao) = 'morador'
      )
    )
$$;
NOTIFY pgrst, 'reload schema';
