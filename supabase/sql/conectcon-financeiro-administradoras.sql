-- Execute no SQL Editor do banco próprio. Não duplica empresas, CNPJ ou lançamentos.
-- Requer a fundação condominial, Funções e o módulo financeiro já instalados.
BEGIN;

CREATE OR REPLACE FUNCTION public.cond_financeiro_classificado(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE ancestrais AS (
    SELECT c.id, c.classifica_pai_id, c.descricao, ARRAY[c.id] AS vistos
    FROM public.parceiros p JOIN public.parceiros_classifica c ON c.id = p.classificacao_id
    WHERE p.id = p_id
    UNION ALL
    SELECT c.id, c.classifica_pai_id, c.descricao, a.vistos || c.id
    FROM ancestrais a JOIN public.parceiros_classifica c ON c.id = a.classifica_pai_id
    WHERE NOT c.id = ANY(a.vistos)
  ) SELECT EXISTS (SELECT 1 FROM ancestrais WHERE descricao ILIKE '%condom%')
$$;

-- Usa um usuário determinístico e herda a raiz somente quando
-- a função filha não existe (mesma regra do useSecoes).
CREATE OR REPLACE FUNCTION public.cond_financeiro_permissao(p_acao text, p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH proprio AS (
    SELECT u.perfil_id FROM public.usuarios u
    WHERE u.id::text = auth.uid()::text
       OR (to_jsonb(u)->>'auth_user_id') = auth.uid()::text
       OR lower(u.email) = lower(auth.jwt()->>'email')
    ORDER BY (u.id::text = auth.uid()::text) DESC LIMIT 1
  ), alvo AS (
    SELECT f.id FROM public.funcoes f
    WHERE f.path = CASE WHEN EXISTS (SELECT 1 FROM public.funcoes x WHERE x.path = p_path)
      THEN p_path ELSE '/financeiro' END AND f.status IS DISTINCT FROM false
  )
  SELECT auth.uid() IS NOT NULL AND (public.app_is_master() OR EXISTS (
    SELECT 1 FROM proprio u JOIN public.menu m ON m.perfil_id = u.perfil_id
    JOIN alvo f ON f.id = m.funcoes_id
    WHERE m.can_read IS TRUE AND CASE p_acao
      WHEN 'ler' THEN m.can_read WHEN 'criar' THEN m.can_create
      WHEN 'alterar' THEN m.can_update WHEN 'excluir' THEN m.can_delete ELSE false END IS TRUE
  ))
$$;

CREATE OR REPLACE FUNCTION public.cond_financeiro_pode(p_empresa uuid, p_acao text, p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (public.app_is_master() OR (
    public.cond_financeiro_permissao(p_acao, p_path) AND EXISTS (
      SELECT 1 FROM public.parceiros p JOIN public.empresas e ON e.id = p.id
      WHERE p.id = p_empresa AND p.empresa_id = public.app_usuario_empresa_id()
        AND public.cond_financeiro_classificado(p.id)
    )
  ))
$$;

CREATE OR REPLACE FUNCTION public.cond_financeiro_contextos(p_empresa_id uuid)
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR (NOT public.app_is_master() AND p_empresa_id IS DISTINCT FROM public.app_usuario_empresa_id()) THEN
    RAISE EXCEPTION 'Empresa não autorizada.';
  END IF;
  IF NOT (public.cond_financeiro_permissao('ler','/financeiro')
    OR public.cond_financeiro_permissao('ler','/financeiro/receber')
    OR public.cond_financeiro_permissao('ler','/financeiro/pagar')) THEN
    RAISE EXCEPTION 'Perfil sem leitura no financeiro.';
  END IF;
  RETURN QUERY
    SELECT jsonb_build_object('id', e.id, 'nome', coalesce(to_jsonb(e)->>'titulo',to_jsonb(e)->>'nome_fantasia',to_jsonb(e)->>'nome','Empresa'),
      'documento',coalesce(to_jsonb(e)->>'cnpj_cpf',''), 'tipo','administradora',
      'empresa', jsonb_build_object('id',e.id,'titulo',coalesce(to_jsonb(e)->>'titulo',to_jsonb(e)->>'nome'),
        'nome',to_jsonb(e)->>'nome','cnpj_cpf',to_jsonb(e)->>'cnpj_cpf','logo',to_jsonb(e)->>'logo','site_url',to_jsonb(e)->>'site_url'))
    FROM public.empresas e WHERE e.id = p_empresa_id
    UNION ALL
    SELECT jsonb_build_object('id',e.id,'nome',coalesce(p.nome_fantasia,p.razao_social,'Condomínio'),
      'documento',coalesce(p.documento,''),'tipo','condominio',
      'empresa',jsonb_build_object('id',e.id,'titulo',coalesce(p.nome_fantasia,p.razao_social),
        'nome',p.razao_social,'cnpj_cpf',p.documento,'logo',to_jsonb(e)->>'logo','site_url',to_jsonb(e)->>'site_url','is_tenant',false))
    FROM public.parceiros p JOIN public.empresas e ON e.id = p.id
    WHERE p.empresa_id = p_empresa_id AND p.id <> p_empresa_id
      AND p.status IS DISTINCT FROM false AND public.cond_financeiro_classificado(p.id);
END $$;

-- Funções privadas não podem ser chamadas por visitantes anônimos.
REVOKE ALL ON FUNCTION public.cond_financeiro_classificado(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cond_financeiro_permissao(text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cond_financeiro_pode(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cond_financeiro_contextos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cond_financeiro_classificado(uuid),
  public.cond_financeiro_permissao(text,text), public.cond_financeiro_pode(uuid,text,text),
  public.cond_financeiro_contextos(uuid) TO authenticated;

-- Somente as tabelas deste escopo. Preserva as políticas de outros módulos e
-- as políticas existentes; amplia apenas o guardião conhecido isolamento_empresa.
DO $$
DECLARE r record; acao text; comando text; caminho text; condicao text; guardiao text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('financeiro_titulos','titulos'), ('financeiro_titulos_itens','titulos'),
    ('financeiro_contas_bancarias','bancos'), ('despesas_cartoes','bancos'),
    ('financeiro_categorias','titulos'), ('financeiro_dda','pagar'),
    ('plano_contas','plano'), ('centro_custo','centros')
  ) AS x(tabela,secao) LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=r.tabela AND table_type='BASE TABLE') THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=r.tabela AND column_name='empresa_id') THEN RAISE EXCEPTION 'Tabela % sem empresa_id: revisar antes de ativar.',r.tabela; END IF;
    caminho := CASE WHEN r.tabela IN ('financeiro_titulos','financeiro_categorias') THEN
      'CASE WHEN tipo = ''pagar'' THEN ''/financeiro/pagar'' ELSE ''/financeiro/receber'' END'
      WHEN r.tabela = 'financeiro_titulos_itens' THEN
      '(SELECT CASE WHEN t.tipo = ''pagar'' THEN ''/financeiro/pagar'' ELSE ''/financeiro/receber'' END FROM public.financeiro_titulos t WHERE t.id = titulo_id AND t.empresa_id = financeiro_titulos_itens.empresa_id)'
      ELSE quote_literal('/financeiro/' || r.secao) END;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',r.tabela);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',r.tabela);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',r.tabela);
    EXECUTE format('DROP POLICY IF EXISTS isolamento_empresa ON public.%I',r.tabela);
    FOREACH acao IN ARRAY ARRAY['ler','criar','alterar','excluir'] LOOP
      comando := CASE acao WHEN 'ler' THEN 'SELECT' WHEN 'criar' THEN 'INSERT' WHEN 'alterar' THEN 'UPDATE' ELSE 'DELETE' END;
      condicao := format('public.cond_financeiro_pode(empresa_id,%L,%s)',acao,caminho);
      guardiao := format('(public.app_is_master() OR empresa_id::text = public.app_usuario_empresa_id()::text OR %s)',condicao);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','cond_fin_'||acao,r.tabela);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','cond_fin_guard_'||acao,r.tabela);
      IF comando = 'INSERT' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)','cond_fin_'||acao,r.tabela,condicao);
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (%s)','cond_fin_guard_'||acao,r.tabela,guardiao);
      ELSIF comando = 'UPDATE' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)','cond_fin_'||acao,r.tabela,condicao,condicao);
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)','cond_fin_guard_'||acao,r.tabela,guardiao,guardiao);
      ELSE
        EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO authenticated USING (%s)','cond_fin_'||acao,r.tabela,comando,condicao);
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO authenticated USING (%s)','cond_fin_guard_'||acao,r.tabela,comando,guardiao);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- A troca de administradora muda a carteira, jamais a entidade do lançamento.
-- Impede também vínculos com banco/cartão/rateio de outro CNPJ por chamadas diretas.
CREATE OR REPLACE FUNCTION public.cond_financeiro_integridade()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_id uuid; v_empresa uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
    RAISE EXCEPTION 'Não é permitido transferir lançamentos entre entidades financeiras.';
  END IF;
  FOR r IN SELECT * FROM (VALUES ('conta_bancaria_id','financeiro_contas_bancarias'),
    ('cartao_id','despesas_cartoes'),('titulo_id','financeiro_titulos'),
    ('plano_contas_id','plano_contas'),('centro_custo_id','centro_custo')) AS x(campo,tabela) LOOP
    v_id := nullif(to_jsonb(NEW)->>r.campo,'')::uuid;
    IF v_id IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT empresa_id FROM public.%I WHERE id=$1',r.tabela) INTO v_empresa USING v_id;
    IF v_empresa IS DISTINCT FROM NEW.empresa_id THEN
      RAISE EXCEPTION 'Banco, cartão, plano, centro de custo e título devem pertencer à mesma entidade financeira.';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.cond_financeiro_integridade() FROM PUBLIC, anon;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['financeiro_titulos','financeiro_titulos_itens','financeiro_contas_bancarias',
    'despesas_cartoes','financeiro_categorias','financeiro_dda','plano_contas','centro_custo'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t AND table_type='BASE TABLE') THEN CONTINUE; END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS cond_fin_integridade ON public.%I',t);
    EXECUTE format('CREATE TRIGGER cond_fin_integridade BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.cond_financeiro_integridade()',t);
  END LOOP;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';

-- Diagnóstico: condomínio sem empresas.id correspondente NÃO pode receber
-- lançamentos por causa das FKs. Não cria/mescla cadastros automaticamente.
SELECT p.id,p.nome_fantasia,p.documento,p.empresa_id AS administradora_id,
  CASE WHEN e.id IS NULL THEN 'Requer revisão do cadastro financeiro' ELSE 'Pronto' END AS situacao
FROM public.parceiros p LEFT JOIN public.empresas e ON e.id=p.id
WHERE public.cond_financeiro_classificado(p.id);