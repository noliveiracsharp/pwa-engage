import { num, round2 } from "@/lib/orcamentos";
import type { Row } from "@/lib/row";

export type TipoNota = "nfe" | "nfse";
export type ItemNota = { item_id: string | null; descricao: string; quantidade: number; valor_unitario: number; total: number; ncm?: string | undefined; cfop?: string | undefined; lc116?: string | undefined };
export type RascunhoNota = { tipo: TipoNota; parceiro_id: string | null; valor: number; itens: ItemNota[] };

export const STATUS_NOTA: Record<string, { label: string; badge: string }> = {
  rascunho: { label: "Rascunho", badge: "bg-muted text-muted-foreground" },
  processando: { label: "Processando", badge: "bg-accent text-accent-foreground" },
  autorizada: { label: "Autorizada", badge: "bg-primary/15 text-primary" },
  erro: { label: "Erro", badge: "bg-destructive/15 text-destructive" },
  cancelada: { label: "Cancelada", badge: "bg-muted text-muted-foreground line-through" },
};
export const statusNota = (s: unknown) => STATUS_NOTA[String(s ?? "rascunho")] ?? STATUS_NOTA["rascunho"]!;

/** Regra fiscal: produto → NF-e; serviço (avulso ou recorrente) → NFS-e. Nunca misturar na mesma nota. */
export function tipoDoItem(natureza: unknown): TipoNota {
  return String(natureza ?? "").toLowerCase() === "produto" ? "nfe" : "nfse";
}

/**
 * Separa os itens de uma Oferta em notas por tipo e por pagador (faturar_para_id).
 * Recorrência nunca entra junto com implantação: se `incluirRecorrentes` for falso, itens recorrentes ficam de fora.
 */
export function notasDaOferta(orc: Row, linhas: Row[], catalogo: Map<string, Row>, incluirRecorrentes = false): RascunhoNota[] {
  const cliente = (orc["parceiro_id"] ?? orc["parceiros_id"] ?? null) as string | null;
  const grupos = new Map<string, RascunhoNota>();
  for (const l of linhas) {
    const natureza = String(l["natureza"] ?? "produto");
    if (natureza === "recorrente" && !incluirRecorrentes) continue;
    if (natureza !== "recorrente" && incluirRecorrentes) continue;
    const qtd = num(l["quantidade"]) || 1;
    const unit = num(l["valor_unitario"]);
    const total = round2(qtd * unit);
    if (total <= 0) continue;
    const tipo = tipoDoItem(natureza);
    const pagador = (l["faturar_para_id"] as string | null) || cliente;
    const chave = `${tipo}:${pagador ?? ""}`;
    const cat = catalogo.get(String(l["item_id"] ?? ""));
    const g = grupos.get(chave) ?? { tipo, parceiro_id: pagador, valor: 0, itens: [] };
    g.itens.push({
      item_id: (l["item_id"] as string) ?? null,
      descricao: String(l["detalhe"] || cat?.["descricao"] || "Item"),
      quantidade: qtd, valor_unitario: unit, total,
      ncm: String(cat?.["ncm"] ?? "") || undefined,
      cfop: String(cat?.["cfop_padrao"] ?? "") || undefined,
      lc116: String(cat?.["lc116"] ?? "") || undefined,
    });
    g.valor = round2(g.valor + total);
    grupos.set(chave, g);
  }
  return [...grupos.values()].sort((a, b) => a.tipo.localeCompare(b.tipo));
}

/** Pendências que impedem a emissão (mostradas antes de enviar à prefeitura/SEFAZ). */
export function pendenciasNota(n: { tipo: TipoNota; parceiro_id: string | null; valor: number; itens: ItemNota[] }, tomadorDoc: string): string[] {
  const out: string[] = [];
  if (!n.parceiro_id) out.push("Informe o cliente (tomador/destinatário).");
  const doc = tomadorDoc.replace(/\D/g, "");
  if (doc.length !== 11 && doc.length !== 14) out.push("Cliente sem CPF/CNPJ válido.");
  if (n.valor <= 0) out.push("Valor da nota deve ser maior que zero.");
  if (n.tipo === "nfe") n.itens.forEach((i) => { if (!/^\d{8}$/.test(i.ncm ?? "")) out.push(`NCM ausente: ${i.descricao}`); });
  return out;
}
