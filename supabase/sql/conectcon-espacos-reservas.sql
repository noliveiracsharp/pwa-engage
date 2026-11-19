-- ConectCon HUB · Espaços & Reservas (Etapa 1). Idempotente: rode inteiro no SQL Editor.
-- Gestão = cond_atend_eh_gestor(condomínio); morador lê espaços e regras do próprio condomínio.

-- 1) Regras do espaço
ALTER TABLE public.cond_espacos
  ADD COLUMN IF NOT EXISTS exige_aprovacao boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS imagem_principal text,
  ADD COLUMN IF NOT EXISTS imagem_secundaria text,
  ADD COLUMN IF NOT EXISTS inativo_inicio timestamptz,
  ADD COLUMN IF NOT EXISTS inativo_fim timestamptz,
  ADD COLUMN IF NOT EXISTS inativo_texto text,
  ADD COLUMN IF NOT EXISTS valor numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS texto_regimento text,
  ADD COLUMN IF NOT EXISTS texto_valor text,
  ADD COLUMN IF NOT EXISTS texto_cancelamento text,
  ADD COLUMN IF NOT EXISTS dias_min integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dias_max integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS antecipar_horas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_por_unidade integer,
  ADD COLUMN IF NOT EXISTS max_mesmo_dia integer,
  ADD COLUMN IF NOT EXISTS periodo_cota text NOT NULL DEFAULT 'pendente',   -- pendente|diaria|semanal|mensal|semestral|anual|dias
  ADD COLUMN IF NOT EXISTS periodo_cota_dias integer,
  ADD COLUMN IF NOT EXISTS horas_entre integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS horas_cancelamento integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hora_inicio time NOT NULL DEFAULT '07:00',
  ADD COLUMN IF NOT EXISTS hora_fim time NOT NULL DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS periodo_qtd integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS periodo_unidade text NOT NULL DEFAULT 'horas',   -- horas|minutos|livre
  ADD COLUMN IF NOT EXISTS horarios_seguidos integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS simultaneas integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS intervalo_min integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bloqueio_antes_h integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bloqueio_depois_h integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_convidados integer,
  ADD COLUMN IF NOT EXISTS avisar_lista_convidados boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bloquear_inadimplentes boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mostrar_unidade boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS morador_cancela_aprovada boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS minutos_no_show integer,
  ADD COLUMN IF NOT EXISTS horarios_bloqueados jsonb NOT NULL DEFAULT '[]'::jsonb; -- ["0-07","6-13", ...] dia(0=dom)-hora

-- 2) Datas específicas (feriados/comemorativas) por espaço
CREATE TABLE IF NOT EXISTS public.cond_espacos_bloqueios_datas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id uuid NOT NULL,
  espaco_id uuid NOT NULL REFERENCES public.cond_espacos(id) ON DELETE CASCADE,
  data date NOT NULL,
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (espaco_id, data)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cond_espacos_bloqueios_datas TO authenticated;
GRANT ALL ON public.cond_espacos_bloqueios_datas TO service_role;

-- 3) Unidades bloqueadas por espaço (sem datas = indefinido)
CREATE TABLE IF NOT EXISTS public.cond_espacos_bloqueios_unidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id uuid NOT NULL,
  espaco_id uuid NOT NULL REFERENCES public.cond_espacos(id) ON DELETE CASCADE,
  unidade_id uuid NOT NULL REFERENCES public.cond_unidades(id) ON DELETE CASCADE,
  data_inicio date,
  data_fim date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (espaco_id, unidade_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cond_espacos_bloqueios_unidades TO authenticated;
GRANT ALL ON public.cond_espacos_bloqueios_unidades TO service_role;

-- 4) Concorrência entre espaços no mesmo dia
CREATE TABLE IF NOT EXISTS public.cond_espacos_concorrencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id uuid NOT NULL,
  espaco_id uuid NOT NULL REFERENCES public.cond_espacos(id) ON DELETE CASCADE,
  outro_espaco_id uuid NOT NULL REFERENCES public.cond_espacos(id) ON DELETE CASCADE,
  modo text NOT NULL CHECK (modo IN ('habilitar','mesma_unidade','todas_unidades')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (espaco_id, outro_espaco_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cond_espacos_concorrencia TO authenticated;
GRANT ALL ON public.cond_espacos_concorrencia TO service_role;

-- 5) Reservas
CREATE TABLE IF NOT EXISTS public.cond_reservas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id uuid NOT NULL,
  espaco_id uuid NOT NULL REFERENCES public.cond_espacos(id) ON DELETE RESTRICT,
  unidade_id uuid REFERENCES public.cond_unidades(id) ON DELETE SET NULL,
  usuario_id uuid,
  criado_por uuid DEFAULT auth.uid(),
  inicio timestamptz NOT NULL,
  fim timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','reprovada','cancelada','realizada')),
  valor numeric(12,2) NOT NULL DEFAULT 0,
  aceite_regimento boolean NOT NULL DEFAULT false,
  convidados jsonb NOT NULL DEFAULT '[]'::jsonb,
  observacao text,
  motivo text,
  decidido_por uuid,
  decidido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fim > inicio)
);
CREATE INDEX IF NOT EXISTS cond_reservas_espaco_inicio ON public.cond_reservas (espaco_id, inicio);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cond_reservas TO authenticated;
GRANT ALL ON public.cond_reservas TO service_role;

-- 6) Lista de espera
CREATE TABLE IF NOT EXISTS public.cond_reservas_espera (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  condominio_id uuid NOT NULL,
  espaco_id uuid NOT NULL REFERENCES public.cond_espacos(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES public.cond_unidades(id) ON DELETE CASCADE,
  usuario_id uuid DEFAULT auth.uid(),
  inicio timestamptz NOT NULL,
  fim timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando','avisado','cancelado')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cond_reservas_espera TO authenticated;
GRANT ALL ON public.cond_reservas_espera TO service_role;

-- Morador do condomínio (vínculo ativo)
CREATE OR REPLACE FUNCTION public.cond_eh_morador(p_cond uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cond_unidades_vinculos v
      JOIN public.cond_unidades un ON un.id = v.cond_unidade_id
      JOIN public.usuarios us ON us.id = v.usuario_id
     WHERE un.condominio_id = p_cond
       AND (us.id = auth.uid() OR lower(us.email) = lower(auth.jwt() ->> 'email'))
       AND NOT COALESCE((to_jsonb(v)->>'arquivado')::boolean, false))
$$;
CREATE OR REPLACE FUNCTION public.cond_minha_unidade(p_unid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cond_unidades_vinculos v JOIN public.usuarios us ON us.id = v.usuario_id
     WHERE v.cond_unidade_id = p_unid
       AND (us.id = auth.uid() OR lower(us.email) = lower(auth.jwt() ->> 'email'))
       AND NOT COALESCE((to_jsonb(v)->>'arquivado')::boolean, false))
$$;
GRANT EXECUTE ON FUNCTION public.cond_eh_morador(uuid), public.cond_minha_unidade(uuid) TO authenticated;

-- RLS
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['cond_espacos_bloqueios_datas','cond_espacos_bloqueios_unidades','cond_espacos_concorrencia'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_ler', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.cond_atend_eh_gestor(condominio_id) OR public.cond_eh_morador(condominio_id))', t||'_ler', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_gestao', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.cond_atend_eh_gestor(condominio_id)) WITH CHECK (public.cond_atend_eh_gestor(condominio_id))', t||'_gestao', t);
  END LOOP;
END $$;

ALTER TABLE public.cond_reservas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cond_reservas_ler ON public.cond_reservas;
CREATE POLICY cond_reservas_ler ON public.cond_reservas FOR SELECT TO authenticated
  USING (public.cond_atend_eh_gestor(condominio_id) OR public.cond_eh_morador(condominio_id)); -- moradores veem ocupação; a tela oculta a unidade conforme mostrar_unidade
DROP POLICY IF EXISTS cond_reservas_gestao ON public.cond_reservas;
CREATE POLICY cond_reservas_gestao ON public.cond_reservas FOR ALL TO authenticated
  USING (public.cond_atend_eh_gestor(condominio_id)) WITH CHECK (public.cond_atend_eh_gestor(condominio_id));
DROP POLICY IF EXISTS cond_reservas_morador_criar ON public.cond_reservas;
CREATE POLICY cond_reservas_morador_criar ON public.cond_reservas FOR INSERT TO authenticated
  WITH CHECK (public.cond_minha_unidade(unidade_id) AND status = 'pendente' AND aceite_regimento);
DROP POLICY IF EXISTS cond_reservas_morador_cancelar ON public.cond_reservas;
CREATE POLICY cond_reservas_morador_cancelar ON public.cond_reservas FOR UPDATE TO authenticated
  USING (public.cond_minha_unidade(unidade_id)) WITH CHECK (public.cond_minha_unidade(unidade_id) AND status IN ('pendente','aprovada','cancelada'));

ALTER TABLE public.cond_reservas_espera ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cond_espera_acesso ON public.cond_reservas_espera;
CREATE POLICY cond_espera_acesso ON public.cond_reservas_espera FOR ALL TO authenticated
  USING (public.cond_atend_eh_gestor(condominio_id) OR public.cond_minha_unidade(unidade_id))
  WITH CHECK (public.cond_atend_eh_gestor(condominio_id) OR public.cond_minha_unidade(unidade_id));

-- Trava "campos amarelos": não altera estrutura de horário com reservas futuras ativas
CREATE OR REPLACE FUNCTION public.cond_espacos_trava_estrutura()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.hora_inicio, NEW.hora_fim, NEW.periodo_qtd, NEW.periodo_unidade, NEW.horarios_seguidos, NEW.simultaneas,
      NEW.intervalo_min, NEW.bloqueio_antes_h, NEW.bloqueio_depois_h)
     IS DISTINCT FROM
     (OLD.hora_inicio, OLD.hora_fim, OLD.periodo_qtd, OLD.periodo_unidade, OLD.horarios_seguidos, OLD.simultaneas,
      OLD.intervalo_min, OLD.bloqueio_antes_h, OLD.bloqueio_depois_h)
   AND EXISTS (SELECT 1 FROM public.cond_reservas r WHERE r.espaco_id = NEW.id
               AND r.status IN ('pendente','aprovada') AND r.fim > now()) THEN
    RAISE EXCEPTION 'Existem agendamentos ativos neste espaço. Cancele-os antes de alterar horários e períodos.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cond_espacos_trava_estrutura ON public.cond_espacos;
CREATE TRIGGER cond_espacos_trava_estrutura BEFORE UPDATE ON public.cond_espacos
  FOR EACH ROW EXECUTE FUNCTION public.cond_espacos_trava_estrutura();

NOTIFY pgrst, 'reload schema';
