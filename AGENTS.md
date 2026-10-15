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

Orçamentos: toda a matemática (linha, totais, desconto R$/%, lucro = venda − custo − imposto) vive em `src/lib/orcamentos.ts` como funções puras e os valores calculados são gravados nas colunas de `orcamentos`/`orcamento_itens`; relatórios leem esses valores sem recalcular.

Orçamentos: gravação multi-tabela (cabeçalho + sincronização das linhas) fica em `src/hooks/useSaveOrcamento.ts`, fora de `useSaveRecord`; o número `#ano-seq` é gerado por gatilho no banco (`orcamentos_gerar_numero`, com lock por empresa/ano) e o hook só numera no cliente como fallback se o gatilho não devolver `numero`.

Selects com muitas opções (clientes, itens) usam `SearchSelect` (Popover + Command) em `src/components/data-table/`; o `Select` simples continua para listas curtas (vendedor, unidade, situação).

Cores semânticas `success` e `warning` existem em `src/styles.css` (claro/escuro) para estados como situação do orçamento; nunca usar classes de cor fixas (green-500 etc.).

Laudos/Cotações: helpers (numeração PREFIXO-AAAA-NNN, CSV, upload de fotos) ficam em `src/lib/laudos.ts`; a aprovação da cotação cria o orçamento via `useSaveOrcamento` para reaproveitar numeração e sincronização de linhas.

Stage-Gate de etapas: toda mudança manual de etapa de atendimento passa por `useChecklistGate` (`src/components/kanban/ChecklistGate.tsx`) antes do fluxo de CSAT; isso garante a mesma regra no Kanban, no painel do contato e no "Mover".

Menu/Funções: `useMenu` monta árvore por `funcoes_pai_id` — filha com `menu_ativo=true` vira submenu retrátil na Sidebar; filha com `menu_ativo=false` vira aba da página pai, descoberta por `useSubmenuAbas(pathPai)` respeitando `can_read`; assim a organização do menu é toda configurada em /funcoes.

Projetos: hierarquia Projeto → Tarefa → Atividade → Checklist; atividades em `projetos_atividades` (checklist/anexos via `atividade_id`, dependências em `projetos_atividades_dependencias`) e o progresso da tarefa é gravado como média das atividades por `sincronizarTarefa` (src/lib/projetos.ts), para que listagens, impressão e visão do cliente leiam um único número.

Comissões: cálculo puro em `src/lib/comissoes.ts` (líquido = venda − compra − imposto − outros; comissão por papel e natureza), config por empresa em `comissao_parametros`/`comissao_papeis` e foto registrada em `orcamento_comissoes` para o extrato `/comissoes`; papéis são linhas configuráveis para não fixar Vendas/Compras/Integrador no código.
- Abas de página (filhas de /funcoes com menu oculto) são renderizadas só por SubmenuTabs no layout autenticado, com a tela ligada pelo path em src/lib/submenu-registry.tsx; telas não fixam abas próprias para menu e abas nunca divergirem.
- Right/left Sheet dimensions are centralized using data-panel-side in global CSS, excluding data-sidebar overlays, so form widths stay consistent across modules.
- Kanban stage colors persist as semantic keys in kanban_etapas.cor and resolve via kanban-cores.ts (EtapaCorPicker, offer badges/selectors), so boards and statuses match across themes.
- Fluxos de atendimento: o grafo do construtor (React Flow) é salvo como jsonb (`nos`/`conexoes`) em `fluxos_atendimento`, com catálogo de blocos e saídas em `src/lib/fluxos.ts`; assim o futuro motor de execução lê o mesmo formato que a tela edita.
- Recebimento WhatsApp: a Z-API chama /api/public/zapi-webhook?k=<webhook_token da instância>; a gravação passa por RPCs SECURITY DEFINER (fluxo_webhook_receber/fluxo_webhook_acao) limitadas à empresa da instância, porque o banco é próprio e não há chave de serviço no servidor. O motor (src/lib/fluxos-motor.ts) é puro e só devolve ações.
- Fluxos: blocos que precisam de rede ou código (http, codigo) não rodam no motor puro; ele pausa devolvendo `externo` e o webhook executa via src/lib/fluxos-externo.ts (JavaScript no interpretador Sval, pois o servidor não permite eval) e retoma pelo próximo bloco.
- Fluxos/IA: o bloco "ia" chama o Lovable AI Gateway em src/lib/fluxos-ia.server.ts (OpenAI via Responses, Gemini via chat compatível) com a base montada na hora (texto, sites lidos no servidor, texto de PDF extraído no navegador e salvo no próprio bloco), para não exigir tabelas nem chave de serviço no banco próprio.
- Imagens: toda compressão passa por `comprimirImagem(file, perfil)` em src/lib/image-compress.ts e o (i) por `UploadInfo`; perfis num só lugar mantêm limites e explicação iguais.
- DRE de Ofertas (/relatorios/dre-ofertas): cálculo puro em src/lib/dre-ofertas.ts sobre os valores gravados, para bater com a memória de cálculo.
- Financeiro: títulos em `financeiro_titulos` (receber/pagar, origem_tipo/origem_id), cálculo puro em src/lib/financeiro.ts; Oferta e Pedidos geram via `inserirTitulos`, para baixa e caixa lerem uma só tabela.

Manutenções: OS em `manutencao_os` com checklist e anexos em jsonb (respostas C/NC/NA ou valor medido), modelos em `manutencao_modelos`; regras puras em src/lib/manutencoes.ts e o formulário único `ManutencaoSheet` é reutilizado em /manutencoes e no Atendimento, para que a OS nasça igual pelos dois caminhos.
