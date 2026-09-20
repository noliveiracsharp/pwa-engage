# Etapa 2 — Cadastros: Empresas, Clientes, Usuários e Funções

## Objetivo
Criar as quatro telas de listagem com o mesmo padrão visual e de uso, mais os formulários de cadastro/edição.

## Padrão comum de tabela
Um componente de tabela reutilizável usado pelas quatro telas:
- Barra superior com filtros próprios de cada tela e botão "+ Adicionar".
- Ordenação ao clicar no título da coluna (crescente/decrescente).
- Paginação com opção de 10, 50 ou 100 linhas por página.
- Ícone de lápis em cada linha para abrir a edição.
- Mensagens de "nenhum registro" e carregando.
- Em telas estreitas a tabela rola na horizontal.

Os formulários abrem em painel lateral (drawer), salvando direto na base e atualizando a lista.

## Telas

### Empresas
Lista com nome, documento, status e data de criação.
Formulário em três abas:
1. Dados da empresa (nome, documento, contato, logo, título usados na personalização).
2. Instâncias vinculadas (`empresas_instancias`) — adicionar, editar e remover.
3. Campos personalizados (`empresas_camposperson`) — nome do campo, tipo e ordem.

### Clientes
Filtros: telefone, nome, e-mail, CPF, status e nota (estrelas).
Formulário com dados de contato, observações, status e nota.

### Usuários
Filtros: nome, e-mail, telefone, CPF, status e perfil/função.
Formulário com dados pessoais, empresa, função e status. Criação de acesso (e-mail/senha) fica para uma etapa posterior.

### Funções
Filtros: descrição, menu ativo e status.
Formulário com descrição, status e seleção dos menus liberados para a função.

## Detalhes técnicos
- Rotas novas em `src/routes/_authenticated/`: `empresas.tsx`, `clientes.tsx`, `usuarios.tsx`, `funcoes.tsx` (os caminhos já existem no menu lateral).
- Componentes novos em `src/components/data-table/`: `DataTable.tsx` (ordenação, paginação, coluna de ações), `DataTableToolbar.tsx`, tipos de coluna.
- Leitura/escrita via cliente Supabase do navegador com TanStack Query (`useQuery`/`useMutation` + invalidação), mantendo o padrão tolerante a schema do `src/lib/row.ts` (`pick`) para nomes de coluna variáveis.
- Filtros e paginação guardados em search params da rota, para o link poder ser compartilhado.
- Formulários com react-hook-form + zod, dentro de `Sheet` do shadcn; feedback via sonner.
- Empresas: abas com `Tabs`; instâncias e campos personalizados gravados nas tabelas filhas após salvar a empresa.
- Todas as rotas ganham `head()` próprio com título e descrição.

## Observação
Ainda não recebi a estrutura das colunas. As telas vão tentar os nomes mais comuns (nome, descricao, email, telefone, cpf, status, empresa_id...). Se alguma coluna não bater, envie o desenho das tabelas que eu ajusto sem refazer as telas.
