-- ConectCon HUB — Conversa não para mais dentro de um fluxo chamado por "Executar outro fluxo".
-- Causa: ao receber a resposta do cliente, o banco só retomava a conversa se o fluxo em
-- andamento estivesse ATIVO. Fluxos usados como subfluxo (ex.: Suporte) normalmente ficam
-- inativos para não disparar sozinhos, então a resposta (ex.: escolha da unidade) era ignorada.
-- Agora a conversa é retomada quando o fluxo está ativo OU é chamado por outro fluxo da empresa.
-- Rode no SQL Editor (idempotente; não sobrescreve suas outras personalizações).

CREATE OR REPLACE FUNCTION public.fluxo_pode_retomar(p_fluxo uuid, p_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fluxos_atendimento f
     WHERE f.id = p_fluxo AND f.empresa_id = p_empresa
       AND (f.ativo OR EXISTS (
         SELECT 1 FROM public.fluxos_atendimento p
         CROSS JOIN LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(to_jsonb(p.nos)) = 'array' THEN to_jsonb(p.nos) ELSE '[]'::jsonb END) n
          WHERE p.empresa_id = p_empresa AND p.id <> f.id
            AND n->'data'->>'fluxo_id' = f.id::text)));
$$;
REVOKE ALL ON FUNCTION public.fluxo_pode_retomar(uuid, uuid) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE fonte text; nova text;
BEGIN
  SELECT pg_get_functiondef('public.fluxo_webhook_receber(text,text,text,text,text,text,text)'::regprocedure) INTO fonte;
  IF position('fluxo_pode_retomar' in fonte) > 0 THEN
    RAISE NOTICE 'Recebimento já ajustado.';
    RETURN;
  END IF;
  nova := regexp_replace(fonte,
    'WHERE\s+id\s*=\s*v_exec\.fluxo_id\s+AND\s+ativo\s*;',
    'WHERE id = v_exec.fluxo_id AND public.fluxo_pode_retomar(id, v_inst.empresa_id);');
  IF nova = fonte THEN
    RAISE EXCEPTION 'Versão do recebimento diferente: envie a definição de fluxo_webhook_receber para adaptar sem sobrescrever suas configurações';
  END IF;
  EXECUTE nova;
END $$;

NOTIFY pgrst, 'reload schema';

-- Conferência (opcional): últimas execuções do telefone de teste e se cada uma pode ser retomada.
-- SELECT x.created_at, x.status, x.no_atual, f.nome, f.ativo, public.fluxo_pode_retomar(f.id, f.empresa_id) AS retoma
--   FROM public.fluxos_execucoes x JOIN public.fluxos_atendimento f ON f.id = x.fluxo_id
--   JOIN public.atendimentos a ON a.id = x.atendimento_id JOIN public.pessoas p ON p.id = a.pessoas_id
--  WHERE right(regexp_replace(coalesce(p.telefone,''),'\D','','g'),10) = '1997440832'
--  ORDER BY x.created_at DESC LIMIT 10;
