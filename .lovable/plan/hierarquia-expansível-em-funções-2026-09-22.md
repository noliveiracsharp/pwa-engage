# Hierarquia expansível em Funções

## Objetivo
Exibir funções filhas imediatamente abaixo da função pai, com recuo visual e controle para expandir ou recolher os descendentes.

## Alterações
- Organizar os registros de Funções como uma árvore usando `funcoes_pai_id`, preservando a ordem de cada nível.
- Adicionar um controle de drilldown na coluna Descrição somente para linhas que possuem filhos.
- Recuar visualmente cada nível filho e ocultar seus descendentes quando o pai estiver recolhido.
- Manter filtros, edição, paginação e a ordenação manual já existentes.
- Durante uma busca, mostrar os resultados encontrados junto de seus pais para preservar o contexto hierárquico.

## Detalhes técnicos
- Ampliar a tabela reutilizável com propriedades opcionais de profundidade, existência de filhos e expansão, sem alterar as outras telas.
- Montar e achatar a árvore em `/funcoes`, protegendo contra vínculos órfãos ou ciclos.
- Validar compilação e comportamento visual na página de Funções.
