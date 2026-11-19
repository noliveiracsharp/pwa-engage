-- Meu Condomínio → Dados & marca: síndico (por vínculo) ou gestão lê/grava os dados da empresa do condomínio.
CREATE OR REPLACE FUNCTION public.cond_dados_ler(p_condominio uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.cond_atend_eh_gestor(p_condominio) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT to_jsonb(e) INTO r FROM public.empresas e WHERE e.id = p_condominio;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.cond_dados_salvar(p_condominio uuid, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text; sets text[] := '{}'; trg text[];
  permitidos text[] := ARRAY['nome','titulo','cnpj_cpf','telefone1','numero','razao_social','nome_fantasia','cnpj','inscricao_estadual','email','telefone','cep','endereco','numero_endereco','complemento','bairro','cidade','uf','logo','logo_escuro','cor_primaria_claro','cor_primaria_escuro'];
BEGIN
  IF NOT public.cond_atend_eh_gestor(p_condominio) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_dados) LOOP
    IF k = ANY(permitidos) AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='empresas' AND column_name=k) THEN
      sets := sets || format('%I = NULLIF(%L, '''')', k, p_dados->>k);
    END IF;
  END LOOP;
  IF array_length(sets,1) IS NULL THEN RETURN; END IF;
  -- A trava genérica de permissão por perfil (trigger em empresas) não conhece o
  -- síndico por vínculo; o acesso já foi validado acima, então ela é suspensa só
  -- durante este UPDATE (dentro da mesma transação, invisível para os demais).
  SELECT array_agg(t.tgname) INTO trg FROM pg_trigger t JOIN pg_proc f ON f.oid = t.tgfoid
   WHERE t.tgrelid = 'public.empresas'::regclass AND NOT t.tgisinternal AND t.tgenabled <> 'D'
     AND f.prosrc ILIKE '%permiss%';
  IF trg IS NOT NULL THEN FOREACH k IN ARRAY trg LOOP
    EXECUTE format('ALTER TABLE public.empresas DISABLE TRIGGER %I', k); END LOOP; END IF;
  EXECUTE format('UPDATE public.empresas SET %s WHERE id = %L', array_to_string(sets, ', '), p_condominio);
  IF trg IS NOT NULL THEN FOREACH k IN ARRAY trg LOOP
    EXECUTE format('ALTER TABLE public.empresas ENABLE TRIGGER %I', k); END LOOP; END IF;
END $$;

-- Gestão & Terceiros: leitura/gravação do vínculo com administradora e facilities
CREATE OR REPLACE FUNCTION public.cond_gestao_ler(p_condominio uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.cond_atend_eh_gestor(p_condominio) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT to_jsonb(p) INTO r FROM public.parceiros p WHERE p.id = p_condominio;
  IF r IS NULL THEN RETURN '{}'::jsonb; END IF;
  RETURN r || jsonb_build_object(
    'administradora_nome', (SELECT coalesce(titulo, nome) FROM public.parceiros WHERE id::text = r->>'administradora_id'),
    'facilities_nome', (SELECT coalesce(titulo, nome) FROM public.parceiros WHERE id::text = r->>'facilities_id'));
END $$;

CREATE OR REPLACE FUNCTION public.cond_gestao_salvar(p_condominio uuid, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text; sets text[] := '{}';
  permitidos text[] := ARRAY['tipo_gestao','administradora_id','facilities_id','cond_contato_administradora','cond_contato_portaria','cond_portaria_modalidade'];
BEGIN
  IF NOT public.cond_atend_eh_gestor(p_condominio) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_dados) LOOP
    IF k = ANY(permitidos) AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='parceiros' AND column_name=k) THEN
      sets := sets || format('%I = NULLIF(%L, '''')', k, p_dados->>k);
    END IF;
  END LOOP;
  IF array_length(sets,1) IS NULL THEN RETURN; END IF;
  EXECUTE format('UPDATE public.parceiros SET %s WHERE id = %L', array_to_string(sets, ', '), p_condominio);
END $$;

GRANT EXECUTE ON FUNCTION public.cond_gestao_ler(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cond_gestao_salvar(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cond_dados_ler(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cond_dados_salvar(uuid, jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
