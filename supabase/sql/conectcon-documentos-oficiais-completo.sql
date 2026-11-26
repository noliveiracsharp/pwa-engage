-- Documentos oficiais: executar este arquivo completo no SQL Editor do banco próprio.
BEGIN;
CREATE OR REPLACE FUNCTION public.doc_oficial_categoria_chave(text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path=public AS $$
 SELECT lower(regexp_replace(translate(trim($1),'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ','aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),'\s+',' ','g'))
$$;
CREATE TABLE IF NOT EXISTS public.documentos_oficiais_categorias (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 nome text NOT NULL CHECK(length(trim(nome))>0),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.documentos_oficiais_categorias TO authenticated;
GRANT ALL ON public.documentos_oficiais_categorias TO service_role;
ALTER TABLE public.documentos_oficiais_categorias ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS docs_oficiais_categoria_unica ON public.documentos_oficiais_categorias(empresa_id,public.doc_oficial_categoria_chave(nome));
DROP POLICY IF EXISTS doc_cat_ler ON public.documentos_oficiais_categorias;
CREATE POLICY doc_cat_ler ON public.documentos_oficiais_categorias FOR SELECT TO authenticated USING((empresa_id=public.app_usuario_empresa_id() OR public.app_is_master()) AND public.documentos_oficiais_permissao('ler'));
DROP POLICY IF EXISTS doc_cat_criar ON public.documentos_oficiais_categorias;
CREATE POLICY doc_cat_criar ON public.documentos_oficiais_categorias FOR INSERT TO authenticated WITH CHECK((empresa_id=public.app_usuario_empresa_id() OR public.app_is_master()) AND public.documentos_oficiais_permissao('criar'));
DROP POLICY IF EXISTS doc_cat_alterar ON public.documentos_oficiais_categorias;
CREATE POLICY doc_cat_alterar ON public.documentos_oficiais_categorias FOR UPDATE TO authenticated USING((empresa_id=public.app_usuario_empresa_id() OR public.app_is_master()) AND public.documentos_oficiais_permissao('alterar')) WITH CHECK((empresa_id=public.app_usuario_empresa_id() OR public.app_is_master()) AND public.documentos_oficiais_permissao('alterar'));
DROP POLICY IF EXISTS doc_cat_excluir ON public.documentos_oficiais_categorias;
CREATE POLICY doc_cat_excluir ON public.documentos_oficiais_categorias FOR DELETE TO authenticated USING((empresa_id=public.app_usuario_empresa_id() OR public.app_is_master()) AND public.documentos_oficiais_permissao('excluir'));
ALTER TABLE public.documentos_oficiais
 ADD COLUMN IF NOT EXISTS categoria_id uuid REFERENCES public.documentos_oficiais_categorias(id) ON DELETE RESTRICT,
 ADD COLUMN IF NOT EXISTS descricao text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS data_documento date,
 ADD COLUMN IF NOT EXISTS data_vencimento date,
 ADD COLUMN IF NOT EXISTS emissor text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS numero_registro text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS arquivo_tipo text NOT NULL DEFAULT '';
INSERT INTO public.documentos_oficiais_categorias(empresa_id,nome)
 SELECT empresa_id,min(trim(categoria)) FROM public.documentos_oficiais
 GROUP BY empresa_id,public.doc_oficial_categoria_chave(categoria) ON CONFLICT DO NOTHING;
UPDATE public.documentos_oficiais d SET categoria_id=c.id,categoria=c.nome
 FROM public.documentos_oficiais_categorias c
 WHERE d.empresa_id=c.empresa_id AND public.doc_oficial_categoria_chave(d.categoria)=public.doc_oficial_categoria_chave(c.nome) AND d.categoria_id IS NULL;
CREATE OR REPLACE FUNCTION public.doc_oficial_validar_categoria() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE c public.documentos_oficiais_categorias;
BEGIN
 IF NEW.categoria_id IS NULL THEN
  SELECT * INTO c FROM public.documentos_oficiais_categorias WHERE empresa_id=NEW.empresa_id AND public.doc_oficial_categoria_chave(nome)=public.doc_oficial_categoria_chave(NEW.categoria);
 ELSE
  SELECT * INTO c FROM public.documentos_oficiais_categorias WHERE id=NEW.categoria_id AND empresa_id=NEW.empresa_id;
 END IF;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Selecione uma categoria cadastrada da empresa.'; END IF;
 NEW.categoria_id=c.id; NEW.categoria=c.nome;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS doc_oficial_validar_categoria ON public.documentos_oficiais;
CREATE TRIGGER doc_oficial_validar_categoria BEFORE INSERT OR UPDATE ON public.documentos_oficiais FOR EACH ROW EXECUTE FUNCTION public.doc_oficial_validar_categoria();
CREATE OR REPLACE FUNCTION public.doc_oficial_renomear_categoria() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 UPDATE public.documentos_oficiais SET categoria=NEW.nome WHERE categoria_id=NEW.id AND empresa_id=NEW.empresa_id;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS doc_oficial_renomear_categoria ON public.documentos_oficiais_categorias;
CREATE TRIGGER doc_oficial_renomear_categoria AFTER UPDATE OF nome ON public.documentos_oficiais_categorias FOR EACH ROW EXECUTE FUNCTION public.doc_oficial_renomear_categoria();
COMMIT;
NOTIFY pgrst,'reload schema';
