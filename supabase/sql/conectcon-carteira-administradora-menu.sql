-- Requer public.cond_minha_empresa() (script conectcon-condominios-transferencia.sql).
-- 1) Administradora enxerga os condomínios que administra (administradora_id),
--    sem tirar o condomínio da carteira de clientes da empresa que o cadastrou.
drop policy if exists empresas_select_administradora on public.empresas;
create policy empresas_select_administradora on public.empresas
  for select to authenticated
  using (
    administradora_id is not null
    and administradora_id = public.cond_minha_empresa()
  );

-- 2) Menu principal: Condomínios logo após Clientes e Fornecedores.
update public.funcoes set ordem = 5
 where path = '/condominios' and funcoes_pai_id is null;
