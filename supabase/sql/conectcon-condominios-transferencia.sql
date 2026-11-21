-- ConectCon: transferência de gestão de condomínio entre administradoras.
-- O condomínio é a linha em public.parceiros; todos os dados cond_* ficam presos ao id dele,
-- então transferir = trocar a empresa dona (empresa_id) e a administradora_id. Nada é copiado nem apagado.

CREATE TABLE IF NOT EXISTS public.cond_transferencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id uuid NOT NULL,
  cnpj text NOT NULL,
  empresa_origem_id uuid,
  empresa_destino_id uuid NOT NULL,
  solicitado_por uuid DEFAULT auth.uid(),
  motivo text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','recusada','cancelada')),
  resposta text,
  respondido_por uuid,
  respondido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cond_transf_pendente ON public.cond_transferencias(condominio_id) WHERE status = 'pendente';
GRANT SELECT ON public.cond_transferencias TO authenticated;
GRANT ALL ON public.cond_transferencias TO service_role;
ALTER TABLE public.cond_transferencias ENABLE ROW LEVEL SECURITY;

-- Empresa do usuário logado.
CREATE OR REPLACE FUNCTION public.cond_minha_empresa() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT us.empresa_id FROM public.usuarios us
   WHERE us.id = auth.uid() OR lower(us.email) = lower(auth.jwt() ->> 'email')
   ORDER BY (us.id = auth.uid()) DESC LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.cond_minha_empresa() TO authenticated;

DROP POLICY IF EXISTS cond_transf_ler ON public.cond_transferencias;
CREATE POLICY cond_transf_ler ON public.cond_transferencias FOR SELECT TO authenticated
  USING (public.cond_minha_empresa() IN (empresa_origem_id, empresa_destino_id));

-- Consulta CNPJ: diz se é livre, se já é meu, ou de outra administradora (sem expor dados internos).
CREATE OR REPLACE FUNCTION public.cond_cnpj_situacao(p_cnpj text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc text := regexp_replace(coalesce(p_cnpj,''), '\D', '', 'g'); v_me uuid := public.cond_minha_empresa(); r record;
BEGIN
  IF length(v_doc) <> 14 THEN RETURN jsonb_build_object('situacao','invalido'); END IF;
  SELECT p.id, p.empresa_id, coalesce(p.nome_fantasia, p.razao_social) AS nome,
         coalesce(e.nome_fantasia, e.razao_social) AS dona
    INTO r FROM public.parceiros p LEFT JOIN public.empresas e ON e.id = p.empresa_id
   WHERE regexp_replace(coalesce(p.documento,''), '\D', '', 'g') = v_doc
   ORDER BY p.created_at LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('situacao','livre'); END IF;
  IF r.empresa_id = v_me THEN RETURN jsonb_build_object('situacao','meu','condominio_id',r.id,'nome',r.nome); END IF;
  RETURN jsonb_build_object('situacao','outra','condominio_id',r.id,'nome',r.nome,'administradora',r.dona,
    'pendente', EXISTS(SELECT 1 FROM public.cond_transferencias t WHERE t.condominio_id = r.id AND t.status='pendente'));
END $$;
GRANT EXECUTE ON FUNCTION public.cond_cnpj_situacao(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cond_transf_solicitar(p_cnpj text, p_motivo text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc text := regexp_replace(coalesce(p_cnpj,''), '\D', '', 'g'); v_me uuid := public.cond_minha_empresa(); v_cond uuid; v_dona uuid; v_id uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Usuário sem empresa vinculada.'; END IF;
  SELECT id, empresa_id INTO v_cond, v_dona FROM public.parceiros
   WHERE regexp_replace(coalesce(documento,''), '\D', '', 'g') = v_doc ORDER BY created_at LIMIT 1;
  IF v_cond IS NULL THEN RAISE EXCEPTION 'CNPJ não encontrado. Cadastre o condomínio normalmente.'; END IF;
  IF v_dona = v_me THEN RAISE EXCEPTION 'Este condomínio já está na sua carteira.'; END IF;
  INSERT INTO public.cond_transferencias(condominio_id, cnpj, empresa_origem_id, empresa_destino_id, motivo)
  VALUES (v_cond, v_doc, v_dona, v_me, nullif(trim(p_motivo),'')) RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Já existe uma solicitação pendente para este condomínio.';
END $$;
GRANT EXECUTE ON FUNCTION public.cond_transf_solicitar(text, text) TO authenticated;

-- Responder: a administradora de origem aprova/recusa; quem pediu pode cancelar.
CREATE OR REPLACE FUNCTION public.cond_transf_responder(p_id uuid, p_acao text, p_resposta text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := public.cond_minha_empresa(); t public.cond_transferencias;
BEGIN
  SELECT * INTO t FROM public.cond_transferencias WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR t.status <> 'pendente' THEN RAISE EXCEPTION 'Solicitação não está mais pendente.'; END IF;
  IF p_acao = 'cancelar' THEN
    IF v_me <> t.empresa_destino_id THEN RAISE EXCEPTION 'Só quem pediu pode cancelar.'; END IF;
  ELSIF p_acao IN ('aprovar','recusar') THEN
    IF v_me IS DISTINCT FROM t.empresa_origem_id THEN RAISE EXCEPTION 'Só a administradora atual pode responder.'; END IF;
  ELSE RAISE EXCEPTION 'Ação inválida.'; END IF;

  UPDATE public.cond_transferencias SET
    status = CASE p_acao WHEN 'aprovar' THEN 'aprovada' WHEN 'recusar' THEN 'recusada' ELSE 'cancelada' END,
    resposta = nullif(trim(p_resposta),''), respondido_por = auth.uid(), respondido_em = now()
  WHERE id = p_id;

  IF p_acao = 'aprovar' THEN
    -- Move o condomínio (e com ele unidades, moradores, avisos, finanças do prédio…) para a nova administradora.
    UPDATE public.parceiros SET empresa_id = t.empresa_destino_id, administradora_id = t.empresa_destino_id,
           tipo_gestao = 'administradora'
     WHERE id = t.condominio_id;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.cond_transf_responder(uuid, text, text) TO authenticated;
