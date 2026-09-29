<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

Centro de custo usa `buildTree` e o `DataTable` compartilhado com expansão por ID em `ApoioCrud`; isso mantém a árvore estável nas telas de gestão e na aba de Itens sem alterar as demais tabelas.

Orçamentos: toda a matemática (linha, totais, desconto R$/%, lucro = venda − custo − imposto) vive em `src/lib/orcamentos.ts` como funções puras e os valores calculados são gravados nas colunas de `orcamentos`/`orcamento_itens`; assim a listagem e futuros relatórios não recalculam nada e os números batem com o que o usuário viu ao salvar.

Orçamentos: gravação multi-tabela (cabeçalho + sincronização das linhas) fica em `src/hooks/useSaveOrcamento.ts`, fora de `useSaveRecord`; o número `#ano-seq` é gerado por gatilho no banco (`orcamentos_gerar_numero`, com lock por empresa/ano) e o hook só numera no cliente como fallback se o gatilho não devolver `numero`.

Selects com muitas opções (clientes, itens) usam `SearchSelect` (Popover + Command) em `src/components/data-table/`; o `Select` simples continua para listas curtas (vendedor, unidade, situação).

Cores semânticas `success` e `warning` existem em `src/styles.css` (claro/escuro) para estados como situação do orçamento; nunca usar classes de cor fixas (green-500 etc.).
