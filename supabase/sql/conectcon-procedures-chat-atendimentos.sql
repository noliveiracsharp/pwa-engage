-- CONECTCON HUB — Procedures e índices: Chat da equipe e mensagens de Atendimentos
CREATE INDEX IF NOT EXISTS idx_chat_interno_msg_canal_criado ON public.chat_interno_mensagens (canal_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_at_msg_atend_created ON public.atendimentos_mensagem (atendimento_id, created_at);

DROP FUNCTION IF EXISTS public.fn_chat_interno_mensagens(uuid, int);
CREATE OR REPLACE FUNCTION public.fn_chat_interno_mensagens(p_canal_id uuid, p_limite int DEFAULT 300)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.criado_em), '[]'::jsonb)
  FROM (SELECT m.* FROM public.chat_interno_mensagens m
        WHERE m.canal_id = p_canal_id
        ORDER BY m.criado_em DESC LIMIT LEAST(COALESCE(p_limite,300),500)) t;
$$;
GRANT EXECUTE ON FUNCTION public.fn_chat_interno_mensagens(uuid, int) TO authenticated;

DROP FUNCTION IF EXISTS public.fn_atendimentos_mensagens(uuid, int);
CREATE OR REPLACE FUNCTION public.fn_atendimentos_mensagens(p_atendimento_id uuid, p_limite int DEFAULT 600)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at), '[]'::jsonb)
  FROM (SELECT m.* FROM public.atendimentos_mensagem m
        WHERE m.atendimento_id = p_atendimento_id
          AND COALESCE(m.oculta_para_atendente,false) = false
        ORDER BY m.created_at DESC LIMIT LEAST(COALESCE(p_limite,600),1000)) t;
$$;
GRANT EXECUTE ON FUNCTION public.fn_atendimentos_mensagens(uuid, int) TO authenticated;

ANALYZE public.chat_interno_mensagens;
ANALYZE public.atendimentos_mensagem;
NOTIFY pgrst, 'reload schema';
