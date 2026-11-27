-- Atendimentos: demais leituras por procedure (rode uma vez no SQL Editor, antes de publicar).
-- SECURITY INVOKER: as permissões (RLS) atuais de cada tabela continuam valendo.
create index if not exists idx_at_msg_ultima on public.atendimentos_mensagem (atendimento_id, created_at desc);

-- Mensagens visíveis da conversa aberta (recria a versão anterior, igual).
drop function if exists public.fn_atendimentos_mensagens(uuid, int);
create function public.fn_atendimentos_mensagens(p_atendimento_id uuid, p_limite int default 600)
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(t.j order by t.c), '[]'::jsonb)
  from (select to_jsonb(m) j, m.created_at c from public.atendimentos_mensagem m
         where m.atendimento_id = p_atendimento_id and m.oculta_para_atendente is not true
         order by m.created_at desc limit least(coalesce(p_limite,600),1000)) t;
$$;
grant execute on function public.fn_atendimentos_mensagens(uuid, int) to authenticated;

-- Conversa completa para o relatório (inclui mensagens ocultas ao atendente).
create or replace function public.fn_atendimentos_conversa(p_atendimento_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(t.j order by t.c, t.i), '[]'::jsonb)
  from (select to_jsonb(m) j, m.created_at c, m.id::text i from public.atendimentos_mensagem m
         where m.atendimento_id = p_atendimento_id order by m.created_at limit 2000) t;
$$;
grant execute on function public.fn_atendimentos_conversa(uuid) to authenticated;

-- Dados para o aviso de nova mensagem: atendimento + nome do contato.
create or replace function public.fn_atendimentos_aviso(p_atendimento_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select to_jsonb(a) || jsonb_build_object('_pessoa', case when p.id is null then null else to_jsonb(p) end)
  from public.atendimentos a left join public.pessoas p on p.id = a.pessoas_id
  where a.id = p_atendimento_id;
$$;
grant execute on function public.fn_atendimentos_aviso(uuid) to authenticated;

-- Contatos bloqueados da empresa.
create or replace function public.fn_atendimentos_bloqueios(p_empresa_id uuid, p_limite int default 5000)
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(t.j order by t.c desc), '[]'::jsonb)
  from (select to_jsonb(b) j, b.created_at c from public.atendimentos_bloqueios b
         where b.empresa_id = p_empresa_id order by b.created_at desc limit least(coalesce(p_limite,5000),5000)) t;
$$;
grant execute on function public.fn_atendimentos_bloqueios(uuid, int) to authenticated;

-- Pesquisa de satisfação: canal, contato e mensagem de agradecimento da empresa.
create or replace function public.fn_atendimentos_pesquisa_contexto(p_atendimento_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'instancia', (select to_jsonb(i) from public.empresas_instancias i where i.id = a.instancia_id),
    'pessoa', (select to_jsonb(p) from public.pessoas p where p.id = a.pessoas_id),
    'csat_msg_agradecimento', (select e.csat_msg_agradecimento from public.empresas e where e.id = a.empresa_id))
  from public.atendimentos a where a.id = p_atendimento_id;
$$;
grant execute on function public.fn_atendimentos_pesquisa_contexto(uuid) to authenticated;

create or replace function public.fn_empresa_csat_agradecimento(p_empresa_id uuid)
returns text language sql stable security invoker set search_path = public as $$
  select e.csat_msg_agradecimento from public.empresas e where e.id = p_empresa_id;
$$;
grant execute on function public.fn_empresa_csat_agradecimento(uuid) to authenticated;

-- Checklists respondidos do atendimento.
create or replace function public.fn_atendimentos_checklists(p_atendimento_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from public.atendimentos_checklists c
  where c.atendimento_id = p_atendimento_id;
$$;
grant execute on function public.fn_atendimentos_checklists(uuid) to authenticated;

-- Oferta enviada pelo chat comercial (só o necessário para a mensagem).
create or replace function public.fn_atendimentos_oferta_envio(p_orcamento_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object('id', j->'id', 'numero', j->'numero', 'total_liquido', j->'total_liquido', 'token_publico', j->'token_publico')
  from (select to_jsonb(o) j from public.orcamentos o where o.id = p_orcamento_id) t;
$$;
grant execute on function public.fn_atendimentos_oferta_envio(uuid) to authenticated;

revoke all on function public.fn_atendimentos_conversa(uuid), public.fn_atendimentos_aviso(uuid),
  public.fn_atendimentos_bloqueios(uuid,int), public.fn_atendimentos_pesquisa_contexto(uuid),
  public.fn_empresa_csat_agradecimento(uuid), public.fn_atendimentos_checklists(uuid),
  public.fn_atendimentos_oferta_envio(uuid) from anon;
notify pgrst, 'reload schema';
