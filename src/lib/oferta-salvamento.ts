import { linhaFromRow, type Linha } from "@/lib/orcamentos";
import type { Row } from "@/lib/row";

/** Confirma o estado local somente após a persistência ter terminado com sucesso. */
export async function confirmarSalvamento<T>(salvar: () => Promise<T>, confirmar: (resultado: T) => void): Promise<void> {
  const resultado = await salvar();
  confirmar(resultado);
}

/** As linhas são devolvidas pelo banco na mesma ordem enviada; preserva as chaves visuais. */
export function reconciliarLinhasSalvas(rows: Row[], enviadas: Linha[]): Linha[] {
  return rows.map((row, index) => {
    const linha = linhaFromRow(row);
    return { ...linha, key: enviadas[index]?.key ?? linha.key };
  });
}