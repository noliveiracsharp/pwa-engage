-- ConectCon · Espaços: aprovadores por espaço + capacidade como limite único de convidados. Idempotente.
ALTER TABLE public.cond_espacos ADD COLUMN IF NOT EXISTS aprovadores jsonb NOT NULL DEFAULT '[]'::jsonb;
UPDATE public.cond_espacos SET max_convidados = capacidade_pessoas WHERE capacidade_pessoas IS NOT NULL AND max_convidados IS DISTINCT FROM capacidade_pessoas;
