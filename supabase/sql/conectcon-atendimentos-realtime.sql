-- Liga o tempo real nas mensagens dos atendimentos (idempotente)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='atendimentos_mensagem') then
    alter publication supabase_realtime add table public.atendimentos_mensagem;
  end if;
end $$;
create index if not exists idx_at_msg_atendimento on public.atendimentos_mensagem (atendimento_id, created_at);
