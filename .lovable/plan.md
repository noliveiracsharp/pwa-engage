# Abas de Produtos e Serviços vindas de /funcoes

## Causa
A tela Produtos e Serviços (/itens) tem as abas fixas no código (Produtos, Marcas, Unidades, Centros de Custo). Ela não consulta /funcoes, por isso a função filha "Estoque" (menu inativo) nunca aparece como aba, mesmo liberada ao Administrador.

## O que muda
- A aba "Produtos e Serviços" continua fixa (é a própria tela).
- As demais abas passam a vir das funções filhas de /itens com "Exibe no menu" desligado e status ativo, na ordem cadastrada, respeitando "Ler" do perfil (Master vê todas).
- Cada aba é ligada ao conteúdo pelo caminho da função: /marcas, /unid_medida, /centro_custos, /estoque. Caminho sem tela conhecida não aparece.
- Se /funcoes ainda não tiver filhas cadastradas, mantém as 3 abas atuais (sem quebrar quem não rodou o script).
- O conteúdo de Estoque é extraído da página /estoque para um componente reutilizável, usado tanto na rota quanto na aba.

## Detalhes técnicos
- `src/routes/_authenticated/itens.tsx`: usar `useSubmenuAbas("/itens")`; mapa path → componente.
- `src/routes/_authenticated/estoque.tsx`: mover corpo para `src/components/estoque/EstoquePanel.tsx`.
- Guard de rota: aba acessível via permissão da filha; nada muda no acesso direto por URL.
