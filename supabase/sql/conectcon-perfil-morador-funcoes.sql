-- Perfil Morador: libera em Funções (somente Ler) as telas do portal do morador.
-- Assembleias fica DESLIGADA (ativo = false) — ligue em Funções quando quiser.
-- Idempotente: não altera linhas que já existem.
insert into public.menu (perfil_id, funcoes_id, can_read, can_create, can_update, can_delete, status)
select 'adb8980f-7bdb-4a20-9851-2c1ec763db41', f.id,
       f.path <> '/condominios/assembleias',
       f.path = '/condominios/atendimentos', false, false,
       f.path <> '/condominios/assembleias'
from public.funcoes f
where f.path in ('/condominios/meu','/condominios/interfone','/condominios/avisos','/condominios/assembleias',
                 '/condominios/atendimentos','/condominios/enquetes','/condominios/equipe','/condominios/obras','/condominios/documentos')
  and not exists (select 1 from public.menu m where m.perfil_id = 'adb8980f-7bdb-4a20-9851-2c1ec763db41' and m.funcoes_id = f.id);
