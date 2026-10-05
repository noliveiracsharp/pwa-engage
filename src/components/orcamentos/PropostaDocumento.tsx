import { formatCpfCnpj } from "@/lib/input-masks";
import { formatDate } from "@/lib/orcamentos";
import { aplicarTags, type Bloco } from "@/lib/propostas";
import { pick, type Row } from "@/lib/row";
import { OrcamentoDocumento } from "./OrcamentoDocumento";

type Props = {
  id?: string;
  blocos: Bloco[];
  orcamento: Row;
  linhas: Row[];
  empresa: Row | null | undefined;
  cliente: Row | undefined;
  vendedor: Row | undefined;
  itens: Row[];
  unidades: Row[];
  marcas: Row[];
};

const txt = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s === "null" || s === "undefined" ? "" : s;
};

/** Documento completo da proposta: capa, textos, tabela, contrato e certificado de assinatura. */
export function PropostaDocumento({ id, blocos, ...ctx }: Props) {
  const { orcamento, empresa, cliente, vendedor } = ctx;
  const t = (s: string) => aplicarTags(s, { orcamento, empresa, cliente, vendedor });
  const empresaNome =
    txt(pick(empresa ?? {}, ["nome_fantasia", "nome", "razao_social", "titulo"])) || "Empresa";
  const logo = txt(pick(empresa ?? {}, ["logo", "logo_url", "logotipo", "imagem"]));
  const assinado = txt(orcamento["assinado_em"]);

  return (
    <div id={id} className="prop-doc">
      {blocos
        .filter((b) => b.ativo)
        .map((b) => {
          if (b.tipo === "CAPA")
            return (
              <section key={b.tipo} className="prop-pagina prop-capa">
                {logo ? (
                  <img src={logo} alt={empresaNome} className="prop-capa-logo" />
                ) : (
                  <div className="prop-capa-marca">{empresaNome}</div>
                )}
                <div className="prop-capa-centro">
                  <span className="prop-capa-num">Proposta {txt(orcamento["numero"])}</span>
                  <h1>{t(b.titulo)}</h1>
                  <p className="prop-texto">{t(b.conteudo)}</p>
                </div>
                <div className="prop-capa-rodape">
                  <div>
                    <span>Emissão</span>
                    <strong>{formatDate(orcamento["dt_orcamento"])}</strong>
                  </div>
                  <div>
                    <span>Válida até</span>
                    <strong>{formatDate(orcamento["validade_orcamento"])}</strong>
                  </div>
                  <div>
                    <span>Consultor</span>
                    <strong>{txt(pick(vendedor ?? {}, ["nome", "email"])) || "—"}</strong>
                  </div>
                </div>
              </section>
            );
          if (b.tipo === "ORCAMENTO")
            return (
              <section key={b.tipo} className="prop-pagina prop-pagina-orc">
                <OrcamentoDocumento {...ctx} semAceite />
              </section>
            );
          return (
            <section key={b.tipo} className="prop-pagina">
              <h2 className="prop-titulo">{t(b.titulo)}</h2>
              <div className="prop-texto">{t(b.conteudo)}</div>
            </section>
          );
        })}

      {assinado && (
        <section className="prop-certificado">
          <h3>Certificado de assinatura eletrônica</h3>
          <dl>
            <dt>Signatário</dt>
            <dd>
              {txt(orcamento["assinado_nome"])} ·{" "}
              {formatCpfCnpj(txt(orcamento["assinado_documento"]))}
            </dd>
            <dt>Data/hora (UTC)</dt>
            <dd>{new Date(assinado).toISOString().replace("T", " ").slice(0, 19)}</dd>
            <dt>IP</dt>
            <dd>{txt(orcamento["assinado_ip"]) || "—"}</dd>
            <dt>Dispositivo</dt>
            <dd className="prop-quebra">{txt(orcamento["assinado_user_agent"]) || "—"}</dd>
            <dt>Hash SHA-256</dt>
            <dd className="prop-quebra">{txt(orcamento["assinado_hash"])}</dd>
          </dl>
          <p>Assinatura eletrônica nos termos do art. 10, § 2º, da MP 2.200-2/2001 e da Lei 14.063/2020.</p>
        </section>
      )}
    </div>
  );
}
