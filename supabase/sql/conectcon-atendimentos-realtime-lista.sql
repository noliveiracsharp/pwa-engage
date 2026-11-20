do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='atendimentos') then
    alter publication supabase_realtime add table public.atendimentos;
  end if;
end $$;
create index if not exists idx_atendimentos_kanban_resp on public.atendimentos (kanban_nome_id, usuario_responsavel_id);
