import { formatCpfCnpj } from "@/lib/input-masks";
import { aplicarTags, gerarContratoModular, htmlSeguro, type AnexoContrato, type ModelosContrato } from "@/lib/propostas";
import { pick, type Row } from "@/lib/row";

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
  /** Texto do carimbo superior (ex.: prévia do modelo). */
  carimbo?: string;
};

const txt = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s === "null" || s === "undefined" ? "" : s;
};

/** Minuta no padrão do documento da Oferta: cabeçalho da empresa + partes + condições gerais + anexos. */
export function MinutaDocumento({ id, anexos, modelos, carimbo, ...c }: Props) {
  const html = aplicarTags(gerarContratoModular({ ...c, anexos, modelos, reindexar: true }), c);
  const e = c.empresa ?? {};
  const cli = c.cliente ?? {};
  const empresaNome = txt(pick(e, ["razao_social", "nome", "nome_fantasia"])) || "Empresa";
  const logo = txt(pick(e, ["logo", "logo_url", "logotipo", "imagem"]));
  const doc = txt(pick(e, ["cnpj_cpf", "documento", "cnpj"]));
  const cliNome = txt(pick(cli, ["razao_social", "nome_fantasia", "nome"])) || "—";
  const cliDoc = txt(pick(cli, ["documento", "cnpj_cpf"]));
  const numero = txt(c.orcamento["numero"]);
  const hoje = new Date().toLocaleDateString("pt-BR");
  return (
    <div id={id} className="prop-doc">
      <section className="prop-pagina">
        <div className="orc-doc">
          <header className="orc-top">
            <div className="orc-emitente">
              {logo ? <img src={logo} alt={empresaNome} className="orc-logo" /> : null}
              <div>
                <strong>{empresaNome}</strong>
                {doc && <div>{formatCpfCnpj(doc)}</div>}
                {txt(pick(e, ["telefone1", "telefone"])) && <div>{txt(pick(e, ["telefone1", "telefone"]))}</div>}
                {txt(pick(e, ["email"])) && <div>{txt(pick(e, ["email"]))}</div>}
                {txt(pick(e, ["endereco"])) && <div>{txt(pick(e, ["endereco"]))}</div>}
              </div>
            </div>
            <div className="orc-identificacao">
              <span className="orc-rotulo">Minuta contratual</span>
              <span className="orc-numero">{numero || "—"}</span>
              <div className="orc-datas">
                <div><span>Emissão</span><strong>{hoje}</strong></div>
              </div>
            </div>
          </header>
          <p className="text-muted-foreground border-b pb-2 text-center text-xs font-semibold tracking-wide uppercase">
            {carimbo ?? `Minuta contratual — para análise prévia | Ref. Oferta ${numero}`}
          </p>
          <div className="orc-partes">
            <section className="orc-bloco"><h2>Contratada</h2><div><strong>{empresaNome}</strong>{doc && <div>{formatCpfCnpj(doc)}</div>}</div></section>
            <section className="orc-bloco"><h2>Contratante</h2><div><strong>{cliNome}</strong>{cliDoc && <div>{formatCpfCnpj(cliDoc)}</div>}</div></section>
          </div>
          <h2 className="prop-titulo">Contrato de Prestação de Serviços e Tecnologia</h2>
          <div className="prop-texto prop-rich" dangerouslySetInnerHTML={{ __html: htmlSeguro(html) }} />
          <p className="text-muted-foreground mt-6 border-t pt-2 text-center text-[11px]">
            Documento em fase de validação, sem valor de contrato assinado.
          </p>
        </div>
      </section>
    </div>
  );
}
