# Arrastar e soltar para reordenar tarefas

## O que muda para o usuário
- **Tarefas Padrão** (janela) e **tarefas do projeto**: cada linha ganha uma alça (seis pontinhos) para arrastar e soltar em outra posição.
- A nova ordem aparece na hora e é salva sozinha; ao reabrir, as tarefas continuam na ordem escolhida.
- **Importar Tarefas Padrão** cria as tarefas no projeto na mesma ordem do modelo.
- Arrastar só fica liberado para quem pode editar Projetos e enquanto a busca estiver vazia (com filtro, a ordem ficaria confusa).

## Detalhes técnicos
- Instalar `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.
- `src/lib/crud.ts`: `useTableRows(table, enabled, orderBy?)` — quando informado, aplica `.order(orderBy, { ascending: true })`. Usar `"ordem"` para `projetos_tarefas` (em `projetos.tsx`) e `projetos_tarefas_default` (no diálogo). Remover a ordenação por nome do diálogo.
- Novo helper `src/lib/reorder.ts`: `salvarOrdem(table, rows)` — recalcula `ordem` 0..n e dispara `update({ ordem })` em paralelo (`Promise.all`) apenas nas linhas cuja ordem mudou.
- Componente `SortableRow` reutilizável (dnd-kit `useSortable`) com alça; `DndContext` + `SortableContext` (verticalListSortingStrategy) na lista do diálogo (`<li>`) e na tabela de tarefas do projeto (`<TableRow>`).
- onDragEnd: `arrayMove` → `queryClient.setQueryData(["table", tabela], ...)` (otimista) → `salvarOrdem`; em erro, toast e `invalidateQueries` para voltar ao estado do banco.
- Projeto: a lista do projeto é um recorte da tabela inteira; o cache otimista substitui só as linhas daquele projeto, mantendo as demais.
- Novas tarefas (manual e Tarefas Padrão novas) recebem `ordem = maior + 1`.
- `importarPadrao`: buscar modelos com `.order('ordem')` e incluir `ordem: m["ordem"] ?? índice` no payload (passa por `filterPayload`).
