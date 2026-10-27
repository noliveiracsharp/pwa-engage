import { useMemo } from "react";
import { useTableRows } from "@/lib/crud";
import type { CategoriaCadastrada } from "@/lib/itens-classificacao";

/** Categorias de fábrica (usadas enquanto a empresa não cadastrar as próprias). */
export const CATEGORIAS_ITENS = [
  "Automação & Motores",
  "Controle de Acesso & Portaria",
  "Ferramentas, Insumos & EPIs",
  "Informática & TI",
  "Licenças & Software",
  "Limpeza & Conservação",
  "Material Elétrico & Iluminação",
  "Material Hidráulico & Predial",
  "Móveis & Utensílios",
  "Papelaria & Escritório",
  "Prevenção e Combate a Incêndio",
  "Redes & Telecom",
  "Segurança Eletrônica & CFTV",
  "Serviços de Mão de Obra Avulsa",
  "Serviços Recorrentes (Mensais)",
].sort((a, b) => a.localeCompare(b, "pt-BR"));

/** Categorias da empresa ativa: as cadastradas (ativas) ou, se nenhuma, as de fábrica. */
export function useCategoriasItens() {
  const { data: rows = [] } = useTableRows("itens_categorias");
  return useMemo(() => {
    const cadastradas: CategoriaCadastrada[] = rows
      .filter((r) => r["status"] !== false && String(r["descricao"] ?? "").trim())
      .map((r) => ({
        descricao: String(r["descricao"]),
        centro_custo_id: (r["centro_custo_id"] as string) || null,
        plano_contas_id: (r["plano_contas_id"] as string) || null,
        cfop_padrao: (r["cfop_padrao"] as string) || null,
        csosn_cst: (r["csosn_cst"] as string) || null,
        origem: r["origem"] == null ? null : String(r["origem"]),
      }));
    const nomes = cadastradas.length
      ? cadastradas.map((c) => c.descricao).sort((a, b) => a.localeCompare(b, "pt-BR"))
      : CATEGORIAS_ITENS;
    return { nomes, cadastradas };
  }, [rows]);
}
