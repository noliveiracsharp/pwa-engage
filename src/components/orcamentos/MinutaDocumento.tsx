import { aplicarTags, gerarContratoModular, htmlSeguro, type AnexoContrato, type ModelosContrato } from "@/lib/propostas";
import type { Row } from "@/lib/row";

type Props = {
  id: string;
  orcamento: Row;
  empresa?: Row | null | undefined;
  cliente?: Row | null | undefined;
  vendedor?: Row | null | undefined;
  linhas: Row[];
  itens: Row[];
  anexos: AnexoContrato[];
  modelos?: ModelosContrato | null | undefined;
};

/** Minuta limpa (sem capa/escopo comercial): carimbo + condições gerais + anexos escolhidos, reindexados I, II… */
export function MinutaDocumento({ id, anexos, modelos, ...c }: Props) {
  const html = aplicarTags(gerarContratoModular({ ...c, anexos, modelos, reindexar: true }), c);
  return (
    <div id={id} className="prop-doc">
      <section className="prop-pagina">
        <p className="text-muted-foreground border-b pb-2 text-center text-xs font-semibold tracking-wide uppercase">
          Minuta contratual — para análise prévia | Ref. Oferta {String(c.orcamento["numero"] ?? "")}
        </p>
        <h2 className="prop-titulo">Minuta de Contrato de Prestação de Serviços e Tecnologia</h2>
        <div className="prop-texto prop-rich" dangerouslySetInnerHTML={{ __html: htmlSeguro(html) }} />
        <p className="text-muted-foreground mt-6 border-t pt-2 text-center text-[11px]">
          Documento em fase de validação, sem valor de contrato assinado.
        </p>
      </section>
    </div>
  );
}
