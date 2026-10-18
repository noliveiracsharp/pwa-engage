/**
 * Reajuste de ofertas quando o custo/preço de um item muda.
 * Regra fiscal/contábil: oferta travada (ativada, ganha ou aprovada) preserva o
 * valor de venda acordado com o cliente e só atualiza custo, lucro e margem.
 */
import { calcLinha, calcTotais, num, situacaoOf, type DescontoTipo, type Totais } from "@/lib/orcamentos";
import { situacaoAtivada, type EtapaRef } from "@/lib/oferta-ativacao";

export type ModoReajuste = "custo" | "custo_venda";

/** Oferta com contrato fechado: venda não pode mudar. */
export function vendaTravada(situacao: unknown, etapa?: EtapaRef): boolean {
  return situacaoAtivada(situacao, etapa) || situacaoOf(situacao) === "Aprovado";
}

/** Situações marcadas por padrão: tudo menos reprovadas. */
export function marcadaPorPadrao(situacao: unknown): boolean {
  return situacaoOf(situacao) !== "Reprovado";
}

export type LinhaBanco = {
  id: string;
  item_id: string | null;
  quantidade: unknown;
  valor_unitario: unknown;
  preco_custo: unknown;
  imposto_pct: unknown;
};

export type NovoPreco = { preco_custo: number; preco_venda: number | null; imposto: number };

export type ResultadoReajuste = {
  linhas: Array<{ id: string; patch: Record<string, number> }>;
  totais: Totais;
};

export function reajustarOferta(
  header: { desconto_tipo?: unknown; desconto?: unknown; frete?: unknown; valores_adicionais?: unknown },
  linhas: LinhaBanco[],
  itemId: string,
  novo: NovoPreco,
  modo: ModoReajuste,
  travada: boolean,
): ResultadoReajuste {
  const mudaVenda = modo === "custo_venda" && !travada && novo.preco_venda !== null;
  const alteradas: ResultadoReajuste["linhas"] = [];
  const calcs = linhas.map((l) => {
    const alvo = String(l.item_id ?? "") === itemId;
    const base = {
      quantidade: String(l.quantidade ?? "0"),
      valor_unitario: String(alvo && mudaVenda ? novo.preco_venda : num(l.valor_unitario)),
      preco_custo: alvo ? novo.preco_custo : num(l.preco_custo),
      imposto_pct: alvo && mudaVenda ? novo.imposto : num(l.imposto_pct),
    };
    const c = calcLinha(base);
    if (alvo) {
      alteradas.push({
        id: l.id,
        patch: {
          preco_custo: base.preco_custo,
          imposto_pct: base.imposto_pct,
          valor_unitario: c.valor_unitario,
          total_linha: c.total_linha,
          custo_total: c.custo_total,
          imposto_valor: c.imposto_valor,
          lucro: c.lucro,
          margem_pct: c.margem_pct,
        },
      });
    }
    return c;
  });
  const tipo: DescontoTipo = header.desconto_tipo === "percentual" ? "percentual" : "valor";
  const totais = calcTotais(calcs, {
    desconto_tipo: tipo,
    desconto: header.desconto,
    frete: header.frete,
    valores_adicionais: header.valores_adicionais,
  });
  return { linhas: alteradas, totais };
}
