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
DECLARE k text; sets text[] := '{}';
  permitidos text[] := ARRAY['razao_social','nome_fantasia','cnpj','inscricao_estadual','email','telefone','cep','endereco','numero_endereco','complemento','bairro','cidade','uf','logo','logo_escuro','cor_primaria_claro','cor_primaria_escuro'];
BEGIN
  IF NOT public.cond_atend_eh_gestor(p_condominio) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_dados) LOOP
    IF k = ANY(permitidos) AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='empresas' AND column_name=k) THEN
      sets := sets || format('%I = NULLIF(%L, '''')', k, p_dados->>k);
    END IF;
  END LOOP;
  IF array_length(sets,1) IS NULL THEN RETURN; END IF;
  EXECUTE format('UPDATE public.empresas SET %s WHERE id = %L', array_to_string(sets, ', '), p_condominio);
END $$;

GRANT EXECUTE ON FUNCTION public.cond_dados_ler(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cond_dados_salvar(uuid, jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
