# Módulo Financeiro — Contas a Receber e Contas a Pagar

## Objetivo
Novo item de menu **Financeiro** com duas abas, alimentadas automaticamente pelo que já existe (Ofertas, Pedidos de Compra, Despesas e Comissões), com baixa de pagamento e comparação **Projetado × Realizado** no fluxo de caixa.

## Estrutura no menu
```text
Financeiro (/financeiro)
 ├─ Contas a Receber   (aba)
 ├─ Contas a Pagar     (aba)
 └─ Fluxo de Caixa     (aba: realizado × projetado)
```
Configurado em /funcoes como as demais páginas, com permissões can_read/create/update/delete por perfil.

## 1. Lançamentos (títulos)
Uma única lista de títulos, cada um com: tipo (receber/pagar), descrição, parceiro (cliente ou fornecedor), categoria, vencimento, valor, situação (Aberto, Pago/Recebido, Atrasado, Cancelado), data e valor pagos, forma de pagamento, juros/multa/desconto, observação, comprovante (anexo com compressão e zoom) e origem (Oferta, Pedido, Despesa, Comissão ou Manual).

## 2. Geração automática
- **Oferta aprovada (etapa ganha do Kanban)** → botão "Gerar contas a receber": cria um título por parcela do cliente (entrada + parcelas, com as datas já definidas).
- **Pedido de compra** → botão "Gerar contas a pagar": cria títulos conforme a condição de pagamento ao fornecedor (espelhar cliente, à vista ou parcelado).
- **Despesas operacionais da Oferta** → títulos a pagar por categoria.
- **Comissões liberadas** (por parcela recebida) → título a pagar ao beneficiário.
- Sem duplicar: se a origem já gerou títulos, o botão avisa e oferece "Regerar apenas os em aberto".
- Lançamento **manual** para qualquer conta avulsa (aluguel, energia, etc.).

## 3. Telas
- Cards no topo: A vencer, Vencidos, Pago/Recebido no mês, Saldo previsto — clicáveis para filtrar.
- Lista com busca única, filtro por período/situação/categoria, cor por situação (success/warning/destructive).
- Ação rápida **Baixar** (data, valor pago, juros/desconto, forma, comprovante) e **Estornar baixa**.
- Formulário em painel lateral (60% desktop / 100% celular), botões Cancelar/Salvar fixos no fim.
- Exportar CSV e PDF.

## 4. Fluxo de Caixa realizado
- Mês a mês: Entradas e Saídas **realizadas** (baixas) ao lado das **projetadas** (relatório atual), saldo do mês e acumulado, destaque para meses negativos.
- Saldo inicial configurável por empresa.

## 5. Recebimentos de comissão
- A baixa de um título a receber vindo de Oferta passa a ser a fonte do "valor recebido" usado na liberação de comissões por parcela.

## Detalhes técnicos
- Tabela `financeiro_titulos` (empresa_id, filial respeitando isolamento, origem_tipo/origem_id, parcela_n) com GRANTs e RLS via `app_empresas_leitura()` (`= ANY(...)`); categorias em `financeiro_categorias`.
- Cálculo puro em `src/lib/financeiro.ts` (gerar títulos a partir de parcelas/pedidos, situação atrasada, totais, realizado por mês) com testes vitest.
- Rota `src/routes/_authenticated/financeiro.tsx` + abas registradas em `src/lib/submenu-registry.tsx`.
- Botões de geração no menu de ações da Oferta e nos Pedidos (Cotações).
- Script `atendeai-financeiro.sql` em Files (tabelas, índices, menu/funções e permissões para Master/Admin).

## Ordem de entrega
1. Tabelas + Contas a Receber/Pagar manuais com baixa.
2. Geração automática a partir de Oferta, Pedido, Despesas e Comissões.
3. Fluxo de Caixa realizado × projetado.
