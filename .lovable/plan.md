# Produtos e Serviços, Unidades de Medida e Centros de Custo

## O que será entregue
1. **/itens – Produtos e Serviços**
   - Tabela padrão (busca única, paginação 10/50/100, ordenação) com Código, Descrição, Tipo, Preço de Venda (R$) e Status.
   - Formulário: Tipo (Produto/Serviço), Código, Descrição, Unidade de Medida, Centro de Custo, Preço de Custo, Margem %, Imposto %, Preço de Venda, Status.
   - Cálculo automático: Venda = Custo / (1 − Margem/100 − Imposto/100). Se o Preço de Venda for editado à mão, a Margem é recalculada. Aviso quando Margem + Imposto chegarem a 100% ou mais.
   - Ao salvar, grava a empresa e o usuário que alterou (`empresa_id`, `alterado_por`).
2. **Cadastro rápido dentro do Item**
   - Botão "+" ao lado de Unidade e de Centro de Custo, abrindo uma pequena janela (Unidade: Descrição + Status; Centro: Código + Descrição + Status).
   - Ao salvar, a lista atualiza e o novo registro já fica selecionado.
   - O "+" só aparece com permissão de criar na tela correspondente.
3. **/unid_medida** e **/centro_custos**: tabelas padrão com adicionar, editar (Status deslizante) e excluir.
4. **Permissões** nas três telas, igual às demais: sem leitura → aviso "Você não tem acesso a esta página." e volta ao Dashboard; Adicionar, lápis e lixeira seguem criar/editar/apagar; somente leitura abre o formulário bloqueado (olho).
5. Listas filtradas pela empresa do usuário logado.

## Passo seu no Supabase
- Cadastrar em Funções os caminhos `/itens`, `/unid_medida`, `/centro_custos` e liberar ao perfil (posso fazer isso pela própria tela Funções).
- Rodar o bloco novo do script de permissões (itens, unidade_medida, centro_custo) que será adicionado ao arquivo SQL.

## Detalhes técnicos
- Novas rotas `src/routes/_authenticated/{itens,unid_medida,centro_custos}.tsx` usando `DataTable`, `RecordSheet` e `usePagePermissions(path)`; o bloqueio por URL já existe em `_authenticated/route.tsx`.
- `alterado_por` = `usuarios.id` do logado (FK para usuarios, conforme o modelo guardado); `empresa_id` do `useAuth().empresa`.
- Novo componente `QuickCreateSelect` (Select + botão "+" + Dialog) usado no formulário de itens; após insert, invalida `["table", tabela]` e seta o id retornado (`insert().select().single()`).
- Preços em campos numéricos com formatação BRL na tabela; cálculo feito em estado local do formulário (componente próprio de formulário de itens, pois exige campos interdependentes).
- Fallback do menu/rotas ganha os três novos caminhos; ícones Lucide (package, ruler, landmark).
- Bloco SQL idempotente (GRANT, RLS "auth_all", realtime) anexado a `/mnt/documents/atendeai-rls-policies.sql`.
