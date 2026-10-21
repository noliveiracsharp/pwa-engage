import { num, round2 } from "@/lib/orcamentos";
import type { Row } from "@/lib/row";

/**
 * Valor que o lançamento a receber deveria ter segundo a Oferta vinculada.
 * - Mensalidade (gerada pela Oferta ou série manual vinculada): mensalidade da Oferta.
 * - Lançamento manual vinculado a Oferta só de implantação: total líquido.
 * - Parcelas de implantação geradas pela própria Oferta: null (seguem o parcelamento).
 */
export function valorEsperadoDoTitulo(titulo: Row, oferta: Row): number | null {
  // Faturamento misto: cada pagador tem sua parte, não o total da Oferta.
  if (oferta["faturamento_misto"] === true || titulo["cliente_atendido_id"]) return null;
  const mensal = round2(num(oferta["total_recorrente"]));
  const liquido = round2(num(oferta["total_liquido"]));
  const geradoPelaOferta = titulo["origem_tipo"] === "oferta";
  const ehMensalidade = /mensalidade/i.test(String(titulo["descricao"] ?? "")) || titulo["categoria"] === "Mensalidade de contrato";
  if (geradoPelaOferta) return ehMensalidade && mensal > 0 ? mensal : null;
  if (mensal > 0) return mensal;
  return liquido > 0 ? liquido : null;
}
