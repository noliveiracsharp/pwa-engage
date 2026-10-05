import { rowId } from "@/lib/crud";
import { formatCpfCnpj, formatPhoneDisplay } from "@/lib/input-masks";
import { formatBRL, formatDate, formatQtd, num, parcelasFromValue, situacaoOf } from "@/lib/orcamentos";
import { pick, type Row } from "@/lib/row";

export type OrcamentoDocumentoProps = {
  id?: string;
  orcamento: Row;
  linhas: Row[];
  empresa: Row | null | undefined;
  cliente: Row | undefined;
  vendedor: Row | undefined;
  itens: Row[];
  unidades: Row[];
  marcas: Row[];
  /** Oculta as linhas de assinatura manuais (usado na proposta digital). */
  semAceite?: boolean;
};

const txt = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s === "null" || s === "undefined" ? "" : s;
};

function enderecoDe(r: Row | undefined | null): string {
  if (!r) return "";
  const rua = [
    txt(pick(r, ["endereco", "logradouro"])),
    txt(pick(r, ["numero_endereco", "numero"])),
  ]
    .filter(Boolean)
    .join(", ");
  const local = [txt(pick(r, ["bairro"])), txt(pick(r, ["cidade", "municipio"]))]
    .filter(Boolean)
    .join(" - ");
  const uf = txt(pick(r, ["uf", "estado"]));
  const cep = txt(pick(r, ["cep"]));
  return [rua, local, uf, cep && `CEP ${cep}`].filter(Boolean).join(" · ");
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="orc-bloco">
      <h2>{titulo}</h2>
      <div>{children}</div>
    </section>
  );
}

/** Folha comercial do orçamento (reutilizada no PDF clássico e na proposta digital). */
export function OrcamentoDocumento({ id, orcamento, linhas, empresa, cliente, vendedor, itens, unidades, marcas, semAceite }: OrcamentoDocumentoProps) {
  const itemById = new Map(itens.map((i) => [String(rowId(i) ?? ""), i]));
  const unidadeById = new Map(unidades.map((u) => [String(rowId(u) ?? ""), u]));
  const marcaById = new Map(marcas.map((m) => [String(rowId(m) ?? ""), m]));

  const numero = txt(orcamento["numero"]) || "Orçamento";
  const situacao = situacaoOf(orcamento["situacao"]);
  const parcelas = parcelasFromValue(orcamento["parcelas"]);
  const totalItens = num(orcamento["total_itens"]);
  const descontoValor = num(orcamento["desconto_valor"]);
  const frete = num(orcamento["frete"]);
  const adicionais = num(orcamento["valores_adicionais"]);
  const totalLiquido = num(orcamento["total_liquido"]);

  const empresaNome =
    txt(pick(empresa ?? {}, ["nome", "razao_social", "nome_fantasia", "titulo"])) ||
    "Minha empresa";
  const empresaLogo = txt(pick(empresa ?? {}, ["logo", "logo_url", "logotipo", "imagem"]));
  const clienteNome = txt(pick(cliente ?? {}, ["razao_social", "nome_fantasia", "nome"])) || "—";

  const linhasOrdenadas = [...linhas].sort(
    (a, b) => Number(a["ordem"] ?? 0) - Number(b["ordem"] ?? 0),
  );

  return (
        <div id={id} className="orc-doc">
          {/* ----------------------- cabeçalho ----------------------- */}
          <header className="orc-top">
            <div className="orc-emitente">
              {empresaLogo ? (
                <img src={empresaLogo} alt={empresaNome} className="orc-logo" />
              ) : (
                <div className="orc-logo-fallback">{empresaNome.slice(0, 2).toUpperCase()}</div>
              )}
              <div>
                <strong>{empresaNome}</strong>
                {txt(pick(empresa ?? {}, ["razao_social"])) &&
                  txt(pick(empresa ?? {}, ["razao_social"])) !== empresaNome && (
                    <div>{txt(pick(empresa ?? {}, ["razao_social"]))}</div>
                  )}
                {txt(pick(empresa ?? {}, ["cnpj_cpf", "cnpj", "documento"])) && (
                  <div>CNPJ {formatCpfCnpj(txt(pick(empresa ?? {}, ["cnpj_cpf", "cnpj", "documento"])))}</div>
                )}
                {txt(pick(empresa ?? {}, ["telefone1", "telefone", "fone", "celular"])) && (
                  <div>{formatPhoneDisplay(txt(pick(empresa ?? {}, ["telefone1", "telefone", "fone", "celular"])))}</div>
                )}
                {txt(pick(empresa ?? {}, ["email"])) && (
                  <div>{txt(pick(empresa ?? {}, ["email"]))}</div>
                )}
                {enderecoDe(empresa) && <div>{enderecoDe(empresa)}</div>}
              </div>
            </div>

            <div className="orc-identificacao">
              <span className="orc-rotulo">Orçamento</span>
              <span className="orc-numero">{numero}</span>
              <span
                className={`orc-situacao orc-situacao-${situacao.replace(/\s+/g, "-").toLowerCase()}`}
              >
                {situacao}
              </span>
              <div className="orc-datas">
                <div>
                  <span>Emissão</span>
                  <strong>{formatDate(orcamento["dt_orcamento"])}</strong>
                </div>
                <div>
                  <span>Válido até</span>
                  <strong>{formatDate(orcamento["validade_orcamento"])}</strong>
                </div>
              </div>
            </div>
          </header>

          {/* ------------------------- cliente ------------------------- */}
          <div className="orc-partes">
            <Bloco titulo="Cliente">
              <strong>{clienteNome}</strong>
              {txt(pick(cliente ?? {}, ["nome_fantasia"])) &&
                txt(pick(cliente ?? {}, ["nome_fantasia"])) !== clienteNome && (
                  <div>{txt(pick(cliente ?? {}, ["nome_fantasia"]))}</div>
                )}
              {txt(pick(cliente ?? {}, ["documento"])) && (
                <div>{formatCpfCnpj(txt(pick(cliente ?? {}, ["documento"])))}</div>
              )}
              {txt(pick(cliente ?? {}, ["telefone", "celular"])) && (
                <div>{txt(pick(cliente ?? {}, ["telefone", "celular"]))}</div>
              )}
              {txt(pick(cliente ?? {}, ["email"])) && (
                <div>{txt(pick(cliente ?? {}, ["email"]))}</div>
              )}
              {enderecoDe(cliente) && <div>{enderecoDe(cliente)}</div>}
            </Bloco>

            <Bloco titulo="Atendimento">
              <div>
                <span className="orc-label">Consultor</span>
                <strong>{txt(pick(vendedor ?? {}, ["nome", "email"])) || "—"}</strong>
              </div>
              {txt(pick(vendedor ?? {}, ["email"])) && (
                <div>{txt(pick(vendedor ?? {}, ["email"]))}</div>
              )}
              {txt(pick(vendedor ?? {}, ["telefone", "celular"])) && (
                <div>{txt(pick(vendedor ?? {}, ["telefone", "celular"]))}</div>
              )}
            </Bloco>
          </div>

          {txt(orcamento["descricao"]) && (
            <Bloco titulo="Objeto do orçamento">
              <p className="orc-texto">{txt(orcamento["descricao"])}</p>
            </Bloco>
          )}

          {/* -------------------------- itens -------------------------- */}
          <table className="orc-tabela">
            <thead>
              <tr>
                <th className="orc-col-num">#</th>
                <th>Descrição</th>
                <th className="orc-right">Qtd.</th>
                <th>Un.</th>
                <th className="orc-right">Valor unit.</th>
                <th className="orc-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {linhasOrdenadas.map((l, i) => {
                const item = itemById.get(String(pick(l, ["item_id"]) ?? ""));
                const marca = marcaById.get(String(pick(item ?? {}, ["itens_marcas_id"]) ?? ""));
                const nomeMarca = txt(pick(marca ?? {}, ["descricao"]));
                const unidade = unidadeById.get(String(pick(l, ["unidade_medida_id"]) ?? ""));
                const descricao =
                  txt(pick(item ?? {}, ["descricao"])) || txt(l["detalhe"]) || "Item";
                const detalhe = txt(l["detalhe"]);
                return (
                  <tr key={String(rowId(l) ?? i)}>
                    <td className="orc-col-num">{i + 1}</td>
                    <td>
                      <strong>{descricao}</strong>
                       {nomeMarca && <div className="orc-detalhe">Marca: {nomeMarca}</div>}
                      {detalhe && detalhe !== descricao && (
                        <div className="orc-detalhe">{detalhe}</div>
                      )}
                    </td>
                    <td className="orc-right">{formatQtd(l["quantidade"])}</td>
                    <td>{txt(pick(unidade ?? {}, ["sigla", "descricao"])) || "—"}</td>
                    <td className="orc-right">{formatBRL(l["valor_unitario"])}</td>
                    <td className="orc-right">{formatBRL(l["total_linha"])}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* ------------------------- totais -------------------------- */}
          <div className="orc-fechamento">
            <div className="orc-condicoes">
              {(txt(orcamento["forma_pagamento"]) || parcelas.length > 0) && (
                <Bloco titulo="Condições de pagamento">
                  {txt(orcamento["forma_pagamento"]) && (
                    <div>
                      <strong>{txt(orcamento["forma_pagamento"])}</strong>
                      {parcelas.length > 1 && <> · {parcelas.length}x</>}
                    </div>
                  )}
                  {txt(orcamento["forma_pagamento_obs"]) && (
                    <p className="orc-texto">{txt(orcamento["forma_pagamento_obs"])}</p>
                  )}
                  {parcelas.length > 0 && (
                    <table className="orc-parcelas">
                      <thead>
                        <tr>
                          <th>Parcela</th>
                          <th>Vencimento</th>
                          <th className="orc-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parcelas.map((p) => (
                          <tr key={p.numero}>
                            <td>
                              {p.numero}/{parcelas.length}
                            </td>
                            <td>{formatDate(p.vencimento)}</td>
                            <td className="orc-right">{formatBRL(p.valor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Bloco>
              )}
            </div>

            <div className="orc-totais">
              <div>
                <span>Subtotal dos itens</span>
                <span>{formatBRL(totalItens)}</span>
              </div>
              {descontoValor > 0 && (
                <div>
                  <span>Desconto</span>
                  <span>− {formatBRL(descontoValor)}</span>
                </div>
              )}
              {frete > 0 && (
                <div>
                  <span>Frete</span>
                  <span>{formatBRL(frete)}</span>
                </div>
              )}
              {adicionais > 0 && (
                <div>
                  <span>Valores adicionais</span>
                  <span>{formatBRL(adicionais)}</span>
                </div>
              )}
              <div className="orc-total-final">
                <span>Total</span>
                <span>{formatBRL(totalLiquido)}</span>
              </div>
            </div>
          </div>

          {txt(orcamento["obs_nota_fiscal"]) && (
            <Bloco titulo="Observações complementares">
              <p className="orc-texto">{txt(orcamento["obs_nota_fiscal"])}</p>
            </Bloco>
          )}

          {/* ------------------------- aceite -------------------------- */}
          {!semAceite && (<div className="orc-aceite">
            <div>
              <div className="orc-linha-assinatura" />
              <span>{clienteNome}</span>
              <small>Aprovação do cliente</small>
            </div>
            <div>
              <div className="orc-linha-assinatura" />
              <span>{empresaNome}</span>
              <small>{txt(pick(vendedor ?? {}, ["nome"])) || "Responsável comercial"}</small>
            </div>
          </div>

          <footer className="orc-rodape">
            {empresaNome} · Proposta {numero} · Válida até{" "}
            {formatDate(orcamento["validade_orcamento"])}
          </footer>
        </div>
  );
}
