-- ConectCon HUB — Suporte e biblioteca oficial. Execute no SQL Editor.
-- Reaplicável: não altera históricos, configurações ou permissões existentes.
BEGIN;
ALTER TABLE public.atendimentos ADD COLUMN IF NOT EXISTS encerrado_em timestamptz;
CREATE OR REPLACE FUNCTION public.atendimento_esta_encerrado(a jsonb, e jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT nullif(a->>'encerrado_em','') IS NOT NULL
 OR coalesce((e->>'is_default_encerrado')::boolean,false)
 OR coalesce(e->>'descricao',e->>'nome','') ~* '(encerr|finaliz|fechad|conclu|resolvid)'
 OR coalesce(a->>'status_atendimento',a->>'situacao',a->>'status','') ~* '(encerr|finaliz|fechad|conclu|resolvid)'
$$;
GRANT EXECUTE ON FUNCTION public.atendimento_esta_encerrado(jsonb,jsonb) TO authenticated,anon,service_role;
CREATE OR REPLACE FUNCTION public.atendimento_sincronizar_fechamento()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE etapa jsonb;
BEGIN
 SELECT to_jsonb(e) INTO etapa FROM public.kanban_etapas e WHERE e.id=NEW.kanban_etapa_id;
 IF TG_OP='INSERT' OR NEW.kanban_etapa_id IS DISTINCT FROM OLD.kanban_etapa_id THEN
   IF public.atendimento_esta_encerrado('{}'::jsonb,etapa) THEN NEW.encerrado_em:=coalesce(NEW.encerrado_em,now());
   ELSE NEW.encerrado_em:=NULL; END IF;
 END IF;
 IF NEW.encerrado_em IS NOT NULL THEN NEW:=jsonb_populate_record(NEW,jsonb_build_object('sino_ativo',false)); END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS atendimento_sincronizar_fechamento ON public.atendimentos;
CREATE TRIGGER atendimento_sincronizar_fechamento BEFORE INSERT OR UPDATE ON public.atendimentos
 FOR EACH ROW EXECUTE FUNCTION public.atendimento_sincronizar_fechamento();
CREATE OR REPLACE FUNCTION public.atendimento_webhook_encerrar(p_token text,p_atendimento uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_inst public.empresas_instancias%ROWTYPE; v_etapa uuid;
BEGIN
 SELECT * INTO v_inst FROM public.empresas_instancias WHERE webhook_token=p_token AND length(p_token)>=20;
 IF NOT FOUND THEN RAISE EXCEPTION 'Instância inválida'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.atendimentos WHERE id=p_atendimento AND empresa_id=v_inst.empresa_id AND instancia_id=v_inst.id)
 THEN RAISE EXCEPTION 'Atendimento inválido'; END IF;
 SELECT e.id INTO v_etapa FROM public.kanban_etapas e JOIN public.atendimentos a ON a.kanban_nome_id=e.kanban_nome_id
 WHERE a.id=p_atendimento AND public.atendimento_esta_encerrado('{}',to_jsonb(e))
 ORDER BY e.is_default_encerrado DESC,e.ordem NULLS LAST LIMIT 1;
 UPDATE public.atendimentos SET kanban_etapa_id=coalesce(v_etapa,kanban_etapa_id),encerrado_em=now() WHERE id=p_atendimento;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.atendimento_webhook_encerrar(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atendimento_webhook_encerrar(text,uuid) TO anon,authenticated,service_role;
-- Adapta a definição instalada, sem sobrescrever sua versão de recebimento.
DO $patch$
DECLARE fonte text;
BEGIN
 SELECT pg_get_functiondef('public.fluxo_webhook_receber(text,text,text,text,text,text,text)'::regprocedure) INTO fonte;
 IF position('public.atendimento_esta_encerrado' in fonte)=0 THEN
   IF position('AND e.is_default_encerrado = true)' in fonte)=0 THEN
     RAISE EXCEPTION 'Versão do recebimento diferente: envie a definição de fluxo_webhook_receber para adaptar sem sobrescrever suas configurações';
   END IF;
   fonte:=replace(fonte,'AND e.is_default_encerrado = true)',
     'AND public.atendimento_esta_encerrado(to_jsonb(a),to_jsonb(e))) AND nullif(to_jsonb(a)->>''encerrado_em'','''') IS NULL');
   EXECUTE fonte;
 END IF;
END $patch$;

-- Quem chama o motor diretamente também usa o mesmo encerramento.
DO $patch$
DECLARE fonte text;
BEGIN
 IF to_regprocedure('public.fluxo_webhook_acao(text,uuid,text,jsonb)') IS NOT NULL THEN
   SELECT pg_get_functiondef('public.fluxo_webhook_acao(text,uuid,text,jsonb)'::regprocedure) INTO fonte;
   IF position('public.atendimento_webhook_encerrar' in fonte)=0 THEN
     IF position('ELSIF p_acao = ''encerrar'' THEN' in fonte)=0 THEN RAISE EXCEPTION 'Definição de fluxo_webhook_acao diferente; adapte antes de aplicar'; END IF;
     fonte:=replace(fonte,'ELSIF p_acao = ''encerrar'' THEN',
       'ELSIF p_acao = ''encerrar'' THEN RETURN public.atendimento_webhook_encerrar(p_token,p_atendimento);');
     EXECUTE fonte;
   END IF;
 END IF;
END $patch$;

-- Portal: conserva a autenticação instalada e muda somente a apresentação do encerramento.
DO $patch$
DECLARE fonte text;
BEGIN
 IF to_regprocedure('public.portal_chamados(text)') IS NOT NULL THEN
   SELECT pg_get_functiondef('public.portal_chamados(text)'::regprocedure) INTO fonte;
   IF position('public.atendimento_esta_encerrado' in fonte)=0 THEN
     IF position('''status'', a.status' in fonte)=0 THEN RAISE EXCEPTION 'Definição de portal_chamados diferente; adapte antes de aplicar'; END IF;
     fonte:=replace(fonte,'''status'', a.status',
       '''status'', CASE WHEN public.atendimento_esta_encerrado(to_jsonb(a),to_jsonb(e)) THEN ''Encerrado'' ELSE a.status::text END');
     fonte:=replace(fonte,'''etapa'', e.descricao',
       '''etapa'', CASE WHEN public.atendimento_esta_encerrado(to_jsonb(a),to_jsonb(e)) THEN ''Encerrado'' ELSE e.descricao END');
     EXECUTE fonte;
   END IF;
 END IF;
END $patch$;

create or replace function public.fn_atendimentos_ativos(p_empresa_id uuid default null)
returns setof jsonb language sql stable security invoker set search_path = public as $$
  select to_jsonb(a) || jsonb_build_object(
    '_pessoa', case when p.id is null then null else to_jsonb(p) end,
    '_ultima', (select to_jsonb(m) from public.atendimentos_mensagem m
                where m.atendimento_id = a.id
                  and coalesce((to_jsonb(m)->>'oculta_para_atendente')::boolean, false) = false
                order by m.created_at desc limit 1))
  from public.atendimentos a
  left join public.pessoas p on p.id = a.pessoas_id
  left join public.kanban_etapas e on e.id = a.kanban_etapa_id
  where NOT public.atendimento_esta_encerrado(to_jsonb(a),to_jsonb(e))
    and (p_empresa_id is null or a.empresa_id = p_empresa_id or a.empresa_id is null)
  order by a.created_at desc
  limit 500;
$$;

-- 2) Busca (Encerrados / Todos / Histórico): nome, telefone, protocolo e período
create or replace function public.fn_atendimentos_buscar(
  p_empresa_id uuid default null, p_termo text default null,
  p_de date default null, p_ate date default null,
  p_somente_encerrados boolean default false, p_usuario_id uuid default null,
  p_limite int default 100)
returns setof jsonb language sql stable security invoker set search_path = public as $$
  select to_jsonb(a) || jsonb_build_object(
    '_pessoa', case when p.id is null then null else to_jsonb(p) end,
    '_ultima', (select to_jsonb(m) from public.atendimentos_mensagem m
                where m.atendimento_id = a.id order by m.created_at desc limit 1))
  from public.atendimentos a
  left join public.pessoas p on p.id = a.pessoas_id
  left join public.kanban_etapas e on e.id = a.kanban_etapa_id
  where (p_empresa_id is null or a.empresa_id = p_empresa_id or a.empresa_id is null)
    and (not p_somente_encerrados or public.atendimento_esta_encerrado(to_jsonb(a),to_jsonb(e)))
    and (p_de is null or a.created_at >= p_de)
    and (p_ate is null or a.created_at < p_ate + 1)
    and (p_usuario_id is null or a.usuario_responsavel_id = p_usuario_id
         or exists (select 1 from public.atendimentos_participantes x where x.atendimento_id = a.id and x.usuario_id = p_usuario_id))
    and (p_termo is null
         or a.protocolo ilike '%' || p_termo || '%'
         or (to_jsonb(p)->>'nome') ilike '%' || p_termo || '%'
         or (length(regexp_replace(p_termo, '\D', '', 'g')) >= 3
             and regexp_replace(coalesce(to_jsonb(p)->>'telefone', ''), '\D', '', 'g') like '%' || regexp_replace(p_termo, '\D', '', 'g') || '%'))
  order by a.created_at desc
  limit least(coalesce(p_limite, 100), 300);
$$;

grant execute on function public.fn_atendimentos_ativos(uuid) to authenticated;
grant execute on function public.fn_atendimentos_buscar(uuid, text, date, date, boolean, uuid, int) to authenticated;
notify pgrst, 'reload schema';


-- v5: aceita etapas finais por vários nomes, permite reavaliar, cai no último atendimento do telefone e sempre devolve avaliado=true com dados de envio.
-- v4: procura em todos os cadastros com o mesmo telefone e sempre devolve o agradecimento.
-- v3: sem trava por outros chamados abertos; etapa por 'descricao'.
-- Avaliação 0 a 5: aceita nota 0, reconhece etapas encerradas por nome/status e funciona mesmo após trocar o número (instância).
CREATE OR REPLACE FUNCTION public.csat_webhook_avaliar_suporte(
  p_token text, p_telefone text, p_nota integer, p_texto text, p_externo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inst public.empresas_instancias%ROWTYPE; v_fone text; v_pessoas uuid[]; v_at uuid; v_msg text; v_mid uuid;
BEGIN
  IF length(coalesce(p_token,'')) < 20 OR p_nota NOT BETWEEN 0 AND 5 THEN RETURN jsonb_build_object('avaliado', false); END IF;
  SELECT * INTO v_inst FROM public.empresas_instancias WHERE webhook_token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('avaliado', false); END IF;
  IF p_externo IS NOT NULL AND EXISTS (SELECT 1 FROM public.atendimentos_mensagem WHERE externo_id = p_externo) THEN
    RETURN jsonb_build_object('avaliado', true, 'duplicada', true);
  END IF;

  v_fone := regexp_replace(coalesce(p_telefone,''),'\D','','g');
  IF length(v_fone) < 8 THEN RETURN jsonb_build_object('avaliado', false); END IF;
  SELECT array_agg(p.id) INTO v_pessoas FROM public.pessoas p
   WHERE p.empresa_id = v_inst.empresa_id AND EXISTS (
     SELECT 1 FROM unnest(ARRAY[to_jsonb(p)->>'telefone', to_jsonb(p)->>'celular', to_jsonb(p)->>'whatsapp']) f(v)
      WHERE length(regexp_replace(coalesce(f.v,''),'\D','','g')) >= 8
        AND right(regexp_replace(f.v,'\D','','g'), 10) = right(v_fone, 10));

  SELECT nullif(trim(csat_msg_agradecimento), '') INTO v_msg FROM public.empresas WHERE id = v_inst.empresa_id;
  v_msg := coalesce(v_msg, 'Muito obrigado pela sua avaliação! Registramos sua nota com sucesso. Se precisar de um novo atendimento, estamos à sua disposição. 👋');

  -- Números de menus não são avaliações enquanto houver atendimento aberto.
  SELECT a.id INTO v_at FROM public.atendimentos a LEFT JOIN public.kanban_etapas e ON e.id=a.kanban_etapa_id
   WHERE a.pessoas_id=ANY(coalesce(v_pessoas,'{}'::uuid[])) AND a.empresa_id=v_inst.empresa_id
     AND public.atendimento_esta_encerrado(to_jsonb(a),to_jsonb(e))
     AND coalesce(a.updated_at,a.created_at)>now()-interval '48 hours'
     AND NOT EXISTS(SELECT 1 FROM public.atendimentos ab LEFT JOIN public.kanban_etapas eb ON eb.id=ab.kanban_etapa_id
       WHERE ab.pessoas_id=ANY(coalesce(v_pessoas,'{}'::uuid[])) AND ab.empresa_id=v_inst.empresa_id
         AND NOT public.atendimento_esta_encerrado(to_jsonb(ab),to_jsonb(eb)))
   ORDER BY coalesce(a.updated_at,a.created_at) DESC LIMIT 1;
  IF v_at IS NULL THEN RETURN jsonb_build_object('avaliado',false); END IF;

  INSERT INTO public.atendimentos_mensagem(atendimento_id, mensagem, tipo_midia, remetente_tipo, empresa_id, instancia_id, externo_id)
  VALUES (v_at, left(coalesce(p_texto,''), 4000), 'texto', 'cliente', v_inst.empresa_id, v_inst.id, p_externo);
  UPDATE public.atendimentos SET nota = p_nota WHERE id = v_at;

  INSERT INTO public.atendimentos_mensagem(atendimento_id, mensagem, tipo_midia, remetente_tipo, empresa_id, instancia_id)
  VALUES (v_at, v_msg, 'texto', 'robo', v_inst.empresa_id, v_inst.id) RETURNING id INTO v_mid;

  RETURN jsonb_build_object('avaliado', true, 'atendimento_id', v_at, 'telefone', v_fone, 'mensagem', v_msg, 'mensagem_id', v_mid,
    'instancia', jsonb_build_object('id', v_inst.id, 'tipo', v_inst.tipo, 'tipo_envio', to_jsonb(v_inst)->>'tipo_envio',
       'instance_id', v_inst.instance_id, 'token', v_inst.token, 'client_token', to_jsonb(v_inst)->>'client_token',
       'n8n_webhook_url', to_jsonb(v_inst)->>'n8n_webhook_url', 'nome', v_inst.nome));
END $$;

REVOKE ALL ON FUNCTION public.csat_webhook_avaliar_suporte(text, text, integer, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.csat_webhook_avaliar_suporte(text, text, integer, text, text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';

-- Atende.ai — Cortesia após encerramento
-- "Igualmente", "obrigado", "tchau" enviados até 30 min após encerrar o chamado
-- ficam registrados no chamado encerrado e NÃO abrem novo atendimento nem o robô.
CREATE OR REPLACE FUNCTION public.atendimento_cortesia_pos_encerramento(
  p_token text, p_telefone text, p_texto text, p_externo text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inst public.empresas_instancias%ROWTYPE; v_fone text; v_at uuid; v_fechado boolean;
BEGIN
  IF length(coalesce(p_token,'')) < 20 THEN RETURN false; END IF;
  SELECT * INTO v_inst FROM public.empresas_instancias WHERE webhook_token = p_token;
  IF NOT FOUND THEN RETURN false; END IF;
  v_fone := regexp_replace(coalesce(p_telefone,''),'\D','','g');
  IF length(v_fone) < 8 THEN RETURN false; END IF;
  IF p_externo IS NOT NULL AND EXISTS (SELECT 1 FROM public.atendimentos_mensagem WHERE externo_id = p_externo) THEN RETURN true; END IF;

  -- Último atendimento deste telefone na empresa
  SELECT a.id,
         public.atendimento_esta_encerrado(to_jsonb(a),(SELECT to_jsonb(e) FROM public.kanban_etapas e WHERE e.id=a.kanban_etapa_id))
    INTO v_at, v_fechado
    FROM public.atendimentos a
    JOIN public.pessoas p ON p.id = coalesce(to_jsonb(a)->>'pessoas_id', to_jsonb(a)->>'pessoa_id')::uuid
   WHERE a.empresa_id = v_inst.empresa_id
     AND EXISTS (SELECT 1 FROM unnest(ARRAY[to_jsonb(p)->>'telefone', to_jsonb(p)->>'celular', to_jsonb(p)->>'whatsapp']) f(v)
                  WHERE length(regexp_replace(coalesce(f.v,''),'\D','','g')) >= 8
                    AND right(regexp_replace(f.v,'\D','','g'), 10) = right(v_fone, 10))
   ORDER BY coalesce(a.updated_at, a.created_at) DESC LIMIT 1;

  IF v_at IS NULL OR NOT v_fechado THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.atendimentos x WHERE x.id = v_at
                  AND coalesce(x.updated_at, x.created_at) > now() - interval '30 minutes') THEN RETURN false; END IF;

  INSERT INTO public.atendimentos_mensagem(atendimento_id, mensagem, tipo_midia, remetente_tipo, empresa_id, instancia_id, externo_id)
  VALUES (v_at, left(coalesce(p_texto,''), 4000), 'texto', 'cliente', v_inst.empresa_id, v_inst.id, p_externo);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.atendimento_cortesia_pos_encerramento(text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.atendimento_cortesia_pos_encerramento(text, text, text, text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';

CREATE OR REPLACE FUNCTION public.documentos_oficiais_permissao(acao text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH proprio AS (SELECT u.perfil_id FROM public.usuarios u
 WHERE u.id::text=auth.uid()::text OR to_jsonb(u)->>'auth_user_id'=auth.uid()::text OR lower(u.email)=lower(auth.jwt()->>'email')
 ORDER BY (u.id::text=auth.uid()::text) DESC LIMIT 1)
 SELECT auth.uid() IS NOT NULL AND (public.app_is_master() OR EXISTS(
 SELECT 1 FROM proprio u JOIN public.menu m ON m.perfil_id=u.perfil_id JOIN public.funcoes f ON f.id=m.funcoes_id
 WHERE f.status IS DISTINCT FROM false AND m.can_read IS TRUE
 AND ((acao='ler' AND f.path IN('/documentos','/atendimentos')) OR (f.path='/documentos' AND CASE acao
 WHEN 'criar' THEN m.can_create WHEN 'alterar' THEN m.can_update WHEN 'excluir' THEN m.can_delete ELSE false END IS TRUE))))
$$;
REVOKE ALL ON FUNCTION public.documentos_oficiais_permissao(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.documentos_oficiais_permissao(text) TO authenticated,service_role;
CREATE TABLE IF NOT EXISTS public.documentos_oficiais(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 titulo text NOT NULL CHECK(length(trim(titulo))>0), categoria text NOT NULL CHECK(length(trim(categoria))>0),
 arquivo_url text NOT NULL,nome_arquivo text NOT NULL,ativo boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.documentos_oficiais TO authenticated;
GRANT ALL ON public.documentos_oficiais TO service_role;
ALTER TABLE public.documentos_oficiais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS docs_oficiais_ler ON public.documentos_oficiais;
CREATE POLICY docs_oficiais_ler ON public.documentos_oficiais FOR SELECT TO authenticated
 USING((empresa_id=public.app_usuario_empresa_id() OR public.app_is_master()) AND public.documentos_oficiais_permissao('ler'));
DROP POLICY IF EXISTS docs_oficiais_criar ON public.documentos_oficiais;
CREATE POLICY docs_oficiais_criar ON public.documentos_oficiais FOR INSERT TO authenticated
 WITH CHECK((empresa_id=public.app_usuario_empresa_id() OR public.app_is_master()) AND public.documentos_oficiais_permissao('criar'));
DROP POLICY IF EXISTS docs_oficiais_alterar ON public.documentos_oficiais;
CREATE POLICY docs_oficiais_alterar ON public.documentos_oficiais FOR UPDATE TO authenticated
 USING((empresa_id=public.app_usuario_empresa_id() OR public.app_is_master()) AND public.documentos_oficiais_permissao('alterar')) WITH CHECK((empresa_id=public.app_usuario_empresa_id() OR public.app_is_master()) AND public.documentos_oficiais_permissao('alterar'));
DROP POLICY IF EXISTS docs_oficiais_excluir ON public.documentos_oficiais;
CREATE POLICY docs_oficiais_excluir ON public.documentos_oficiais FOR DELETE TO authenticated
 USING((empresa_id=public.app_usuario_empresa_id() OR public.app_is_master()) AND public.documentos_oficiais_permissao('excluir'));
CREATE INDEX IF NOT EXISTS documentos_oficiais_empresa ON public.documentos_oficiais(empresa_id,titulo);
COMMIT;
NOTIFY pgrst,'reload schema';
