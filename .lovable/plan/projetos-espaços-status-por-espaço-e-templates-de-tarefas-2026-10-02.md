# Projetos: Espaços, Status por Espaço e Templates de Tarefas

## O que muda para o usuário
- **Barra lateral de Espaços** dentro de Projetos: árvore com Espaços e Subespaços em quantos níveis quiser, expansível. Botão "+ Novo Espaço" no topo; ao passar o mouse num item aparecem "+ Subespaço" e "Editar". Janela com Nome, Ícone (seletor de ícones já existente) e Cor.
- **Espaço ativo:** clicar num espaço filtra os projetos dele (lista e kanban). Opção "Todos os projetos" no topo para ver tudo.
- **Gerenciar Status por espaço:** a engrenagem atual passa a cadastrar status do espaço ativo, com Nome, Cor e Tipo (A fazer, Em progresso, Concluído, Erro), ordenáveis arrastando. Lista e kanban mostram as colunas desse espaço. Se o espaço não tiver status próprio, usa os do espaço pai (e, por fim, os status sem espaço, para não quebrar os projetos existentes).
- **Nova página Templates** (`/projetos/templates`, botão "Templates" na tela de Projetos): criar templates e, dentro de cada um, as tarefas padrão com Nome, Descrição, Estimativa de horas, Prioridade e ordem por arraste. Substitui a janela "Tarefas Padrão" atual.
- **Novo projeto:** campo opcional "Aplicar Template de Tarefas". Ao salvar, o projeto é criado no espaço ativo e todas as tarefas do template entram nele na ordem do template. O botão "Importar Tarefas Padrão" dentro do projeto passa a pedir qual template importar.
- **Master:** tudo usa a empresa escolhida em "Contexto da Empresa" no topo (espaços, status, templates, gravação).

## Banco de dados (script para rodar no SQL Editor)
Entrego um script idempotente em Files que:
- cria `projetos_espacos` (id, empresa_id, nome, icone, cor, espaco_pai_id, ordem, status, alterado_por, datas) se não existir;
- adiciona `espaco_id` e `tipo` em `projetos_status`; `espaco_id` em `projetos`;
- cria `projetos_templates` (id, empresa_id, nome, descricao, status, ...);
- adiciona `template_id` e `horas_estimadas` em `projetos_tarefas_default`; cria um template "Padrão" por empresa e liga as tarefas padrão existentes a ele;
- GRANTs, RLS e políticas no mesmo padrão das demais tabelas.

Antes de codar, confiro quais dessas tabelas/colunas já existem no seu banco e ajusto os nomes aos reais.

## Detalhes técnicos
- `src/lib/projetos.ts`: colunas candidatas para espaço/tipo/template; helper `statusDoEspaco` (herança pai → raiz → globais).
- Árvore reaproveita `buildTree`/`descendantIds` de `src/lib/hierarchy.ts` (pai `espaco_pai_id`); impede escolher descendente como pai.
- Novos componentes: `projetos/EspacosSidebar.tsx`, `projetos/EspacoDialog.tsx`; `StatusDialog.tsx` recebe `espacoId` e campo Tipo; `TarefasPadraoDialog` vira editor de tarefas do template usado pela rota nova `src/routes/_authenticated/projetos.templates.tsx` (com head próprio). Como `/projetos` passa a ter filho, `projetos.tsx` vira layout com `<Outlet />` e o conteúdo atual vai para `projetos.index.tsx`.
- Espaço ativo guardado na URL (`?espaco=`) para manter ao recarregar.
- Consultas por empresa usam `useAudit().empresaId` (contexto do Master), só filtrando quando definido; chaves de cache incluem a empresa e o invalidate usa o mesmo prefixo.
- Payloads passam por `filterPayload` com colunas reais, tolerando colunas ausentes.
- Permissões continuam por `usePagePermissions` da rota `/projetos`.
