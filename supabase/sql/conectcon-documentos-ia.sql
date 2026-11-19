-- Convenção e regimento lidos pela IA: artigos estruturados por documento.
create table if not exists public.cond_documentos_artigos (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.cond_documentos(id) on delete cascade,
  condominio_id uuid not null,
  origem text not null default 'regimento' check (origem in ('convencao','regimento','outro')),
  capitulo text,
  numero text,
  titulo text,
  tema text,
  texto text not null,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists cond_doc_art_doc_idx on public.cond_documentos_artigos(documento_id, ordem);
create index if not exists cond_doc_art_cond_idx on public.cond_documentos_artigos(condominio_id);

grant select, insert, update, delete on public.cond_documentos_artigos to authenticated;
grant all on public.cond_documentos_artigos to service_role;
alter table public.cond_documentos_artigos enable row level security;

-- Lê quem enxerga o documento (herda as regras de cond_documentos).
drop policy if exists cond_doc_art_ler on public.cond_documentos_artigos;
create policy cond_doc_art_ler on public.cond_documentos_artigos for select to authenticated
  using (exists (select 1 from public.cond_documentos d where d.id = documento_id));
-- Grava só a gestão do condomínio (inclui síndico/subsíndico por vínculo).
drop policy if exists cond_doc_art_gravar on public.cond_documentos_artigos;
create policy cond_doc_art_gravar on public.cond_documentos_artigos for all to authenticated
  using (public.cond_atend_eh_gestor(condominio_id))
  with check (public.cond_atend_eh_gestor(condominio_id));

notify pgrst, 'reload schema';
