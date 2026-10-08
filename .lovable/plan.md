# Abas de todas as telas vindas de /funcoes

## Causa
Várias telas têm abas fixas no código e ignoram /funcoes. Exemplo: Produtos e Serviços mostra sempre Marcas, Unidades e Centros de Custo, e a função filha "Estoque" (Exibe no menu desligado) nunca aparece, mesmo liberada ao Administrador. Hoje só Usuários e Pessoas/Empresas leem as filhas de /funcoes.

## Regra única para o sistema
Em qualquer tela pai, as abas serão:
1. A própria tela (primeira aba, com o nome da função pai).
2. Cada função filha com "Exibe no menu" desligado e status ativo, na ordem cadastrada, somente se o perfil tiver "Ler" (Master vê todas).

Cadastrar, remover, renomear ou reordenar em /funcoes muda as abas na hora, sem mexer em código. Se a tela não tiver filhas ocultas, não aparece barra de abas.

## Como cada aba sabe o que mostrar
Uma lista central liga o caminho da função à tela correspondente. Caminho sem tela conhecida é ignorado. Telas cobertas:
- /itens: /marcas, /unid_medida, /centro_custos, /estoque
- /orcamentos: /comissoes
- /projetos: /projetos/templates
- /usuarios: /perfil (passa a usar a mesma regra)
- /empresas, /pessoas, /admin/*: qualquer filha que aponte para uma tela já existente

As abas internas dos formulários (Dados, Instâncias, Campos, Etiquetas) continuam como hoje.

## Ajustes
- Telas de Estoque, Comissões e Templates viram blocos reutilizáveis, usados tanto na própria rota quanto como aba.
- A aba ativa fica na URL (?aba=estoque) para recarregar e compartilhar link.
- Abrir /estoque direto continua funcionando conforme permissão.

## Detalhes técnicos
- Novo `src/components/layout/SubmenuTabs.tsx` usando `useSubmenuAbas(pathPai)` + registro `src/lib/submenu-registry.tsx` (path → componente lazy).
- Remover TabsList fixa de `itens.tsx` e `usuarios.tsx`; extrair corpos de `estoque.tsx`, `comissoes.tsx`, `projetos_.templates.tsx` para `src/components/...Panel.tsx`.
- Registrar em AGENTS.md: abas de página vêm só de /funcoes via registro central.
