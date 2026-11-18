-- Assembleias: pautas de múltipla escolha (ex.: eleição do conselho, "escolha até 3").
-- Rode uma vez no SQL Editor do Supabase. Idempotente.

-- 1) Parâmetros por pauta
ALTER TABLE public.cond_assembleia_pautas
  ADD COLUMN IF NOT EXISTS multipla_escolha boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_escolhas integer NOT NULL DEFAULT 1;

-- 2) Unicidade: 1 voto por unidade POR OPÇÃO (antes era 1 por unidade na pauta)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname FROM pg_constraint c
     WHERE c.conrelid = 'public.cond_assembleia_votos'::regclass AND c.contype = 'u'
       AND (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM pg_attribute a
             WHERE a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)) = ARRAY['pauta_id','unidade_id']
  LOOP EXECUTE format('ALTER TABLE public.cond_assembleia_votos DROP CONSTRAINT %I', r.conname); END LOOP;
  FOR r IN
    SELECT i.indexrelid::regclass::text AS idx FROM pg_index i
     WHERE i.indrelid = 'public.cond_assembleia_votos'::regclass AND i.indisunique AND NOT i.indisprimary
       AND (SELECT array_agg(a.attname::text ORDER BY a.attname) FROM pg_attribute a
             WHERE a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)) = ARRAY['pauta_id','unidade_id']
  LOOP EXECUTE format('DROP INDEX %s', r.idx); END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS cond_assembleia_votos_pauta_unid_opcao_uk
  ON public.cond_assembleia_votos (pauta_id, unidade_id, opcao_id);

-- 3) Regras das pautas para o morador (somente leitura)
CREATE OR REPLACE FUNCTION public.cond_assembleia_pautas_regras(p_assembleia uuid)
RETURNS TABLE(id uuid, multipla_escolha boolean, max_escolhas integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.multipla_escolha, p.max_escolhas FROM public.cond_assembleia_pautas p WHERE p.assembleia_id = p_assembleia;
$$;
GRANT EXECUTE ON FUNCTION public.cond_assembleia_pautas_regras(uuid) TO authenticated;

-- 4) Voto múltiplo: o 1º usa cond_assembleia_votar (presença, direito, peso, IP, hash);
--    os demais copiam o registro trocando a opção e encadeando o hash.
CREATE OR REPLACE FUNCTION public.cond_assembleia_votar_multiplo(p_pauta uuid, p_opcoes uuid[], p_unidade uuid, p_user_agent text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_multi boolean; v_max integer; v_n integer; v_abst integer; v_base jsonb; v_hash text; v_op uuid; i integer;
BEGIN
  SELECT multipla_escolha, max_escolhas INTO v_multi, v_max FROM cond_assembleia_pautas WHERE id = p_pauta;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pauta não encontrada.'; END IF;
  v_n := coalesce(array_length(p_opcoes, 1), 0);
  IF v_n = 0 THEN RAISE EXCEPTION 'Selecione ao menos uma opção.'; END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_opcoes) x) <> v_n THEN RAISE EXCEPTION 'Opção repetida.'; END IF;
  IF (SELECT count(*) FROM cond_assembleia_opcoes_voto WHERE pauta_id = p_pauta AND id = ANY(p_opcoes)) <> v_n THEN RAISE EXCEPTION 'Opção inválida.'; END IF;
  SELECT count(*) INTO v_abst FROM cond_assembleia_opcoes_voto WHERE pauta_id = p_pauta AND id = ANY(p_opcoes) AND tipo = 'abstencao';
  IF v_abst > 0 AND v_n > 1 THEN RAISE EXCEPTION 'Abstenção não pode ser combinada com outras opções.'; END IF;
  IF NOT coalesce(v_multi, false) AND v_n > 1 THEN RAISE EXCEPTION 'Esta pauta aceita apenas uma opção.'; END IF;
  IF v_n > greatest(coalesce(v_max, 1), 1) THEN RAISE EXCEPTION 'Selecione no máximo % opções.', v_max; END IF;
  IF EXISTS (SELECT 1 FROM cond_assembleia_votos WHERE pauta_id = p_pauta AND unidade_id = p_unidade) THEN RAISE EXCEPTION 'Esta unidade já votou nesta pauta.'; END IF;

  PERFORM cond_assembleia_votar(p_pauta, p_opcoes[1], p_unidade, p_user_agent);
  SELECT to_jsonb(v) INTO v_base FROM cond_assembleia_votos v
   WHERE v.pauta_id = p_pauta AND v.unidade_id = p_unidade AND v.opcao_id = p_opcoes[1] LIMIT 1;
  v_hash := v_base->>'hash_auditoria';
  FOR i IN 2..v_n LOOP
    v_op := p_opcoes[i];
    v_hash := encode(sha256(convert_to(coalesce(v_hash, '') || '|' || v_op::text || '|' || clock_timestamp()::text, 'UTF8')), 'hex');
    INSERT INTO cond_assembleia_votos
      SELECT * FROM jsonb_populate_record(NULL::cond_assembleia_votos,
        (v_base - 'id') || jsonb_build_object('id', gen_random_uuid(), 'opcao_id', v_op, 'hash_auditoria', v_hash, 'created_at', clock_timestamp()));
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.cond_assembleia_votar_multiplo(uuid, uuid[], uuid, text) TO authenticated;
