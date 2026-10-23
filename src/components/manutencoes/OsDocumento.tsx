import { PRIORIDADES, STATUS, TIPOS, meta, resumoChecklist, type Anexo, type ItemChecklist } from "@/lib/manutencoes";
import { formatCpfCnpj } from "@/lib/input-masks";
import type { Row } from "@/lib/row";

const txt = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s === "null" || s === "undefined" ? "" : s;
};
const dt = (v: unknown) => (v ? new Date(String(v)).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const ehImagem = (u: string) => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u);
const RESP: Record<string, string> = { C: "Conforme", NC: "Não conforme", NA: "Não se aplica" };

type Props = { id: string; os: Row; empresa: Row | null | undefined; cliente: string; tecnico: string };

/** Relatório da ordem de serviço: mesmo visual do PDF de laudos/ofertas, usado na tela e no link público. */
export function OsDocumento({ id, os, empresa, cliente, tecnico }: Props) {
  const checklist = Array.isArray(os["checklist"]) ? (os["checklist"] as ItemChecklist[]) : [];
  const anexos = Array.isArray(os["anexos"]) ? (os["anexos"] as Anexo[]) : [];
  const r = resumoChecklist(checklist);
  const empresaNome = txt(empresa?.["nome"]) || "Empresa";
  const logo = txt(empresa?.["logo"]);
  const numero = txt(os["numero"]) || "OS";
  const Fotos = ({ grupo, titulo }: { grupo: Anexo["grupo"]; titulo: string }) => {
    const l = anexos.filter((a) => a.grupo === grupo && ehImagem(a.url));
    if (!l.length) return null;
    return (
      <section className="orc-bloco"><h2>{titulo}</h2><div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {l.map((a) => <img key={a.url} src={a.url} alt={a.nome} data-zoom style={{ width: 160, height: 120, objectFit: "cover", borderRadius: 6, border: "1px solid #e2e8f0" }} />)}
        </div>
      </div></section>
    );
  };
  const docs = anexos.filter((a) => a.grupo === "documento" || !ehImagem(a.url));

  return (
    <div id={id} className="orc-doc">
      <header className="orc-top">
        <div className="orc-emitente">
          {logo ? <img src={logo} alt={empresaNome} className="orc-logo" /> : <div className="orc-logo-fallback">{empresaNome.slice(0, 2).toUpperCase()}</div>}
          <div>
            <strong>{txt(empresa?.["razao_social"]) || empresaNome}</strong>
            {txt(empresa?.["cnpj"]) && <div>CNPJ {formatCpfCnpj(txt(empresa?.["cnpj"]))}</div>}
          </div>
        </div>
        <div className="orc-identificacao">
          <span className="orc-rotulo">Manutenção {meta(TIPOS, os["tipo"]).label}</span>
          <span className="orc-numero">{numero}</span>
          <span className="orc-situacao">{meta(STATUS, os["status"]).label}</span>
          <div className="orc-datas">
            <div><span>Previsto</span><strong>{dt(os["data_prevista"])}</strong></div>
            {!!os["concluido_em"] && <div><span>Concluído</span><strong>{dt(os["concluido_em"])}</strong></div>}
          </div>
        </div>
      </header>

      <div className="orc-partes">
        <section className="orc-bloco"><h2>Cliente</h2><div>
          <strong>{cliente || "—"}</strong>
          {txt(os["local"]) && <div>Local: {txt(os["local"])}</div>}
          {txt(os["equipamento"]) && <div>Equipamento: {txt(os["equipamento"])}</div>}
        </div></section>
        <section className="orc-bloco"><h2>Atendimento</h2><div>
          <strong>{tecnico || "—"}</strong>
          <div>Prioridade: {meta(PRIORIDADES, os["prioridade"]).label}</div>
          {!!os["iniciado_em"] && <div>Início: {dt(os["iniciado_em"])}</div>}
        </div></section>
      </div>

      {txt(os["descricao"]) && (
        <section className="orc-bloco"><h2>Serviço / defeito relatado</h2><div><p className="orc-texto">{txt(os["descricao"])}</p></div></section>
      )}

      {checklist.length > 0 && (
        <table className="orc-tabela">
          <thead><tr><th className="orc-col-num">#</th><th>Item verificado ({r.respondidos}/{r.total})</th><th className="orc-right">Resultado</th></tr></thead>
          <tbody>
            {checklist.map((it, i) => (
              <tr key={i}>
                <td className="orc-col-num">{i + 1}</td>
                <td>{it.equipamento && <div className="orc-detalhe">{it.equipamento}</div>}<strong>{it.texto}</strong>{it.obs && <div className="orc-detalhe">{it.obs}</div>}</td>
                <td className="orc-right" style={it.resposta === "NC" ? { color: "#b91c1c", fontWeight: 600 } : undefined}>
                  {it.tipo === "numero" ? (txt(it.valor) ? `${it.valor} ${it.unidade ?? ""}` : "—") : (it.resposta ? RESP[it.resposta] : "—")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Fotos grupo="antes" titulo="Fotos — Antes" />
      <Fotos grupo="depois" titulo="Fotos — Depois" />

      {docs.length > 0 && (
        <section className="orc-bloco"><h2>Documentos</h2><div>
          {docs.map((a) => <div key={a.url}><a href={a.url} target="_blank" rel="noreferrer">{a.nome}</a></div>)}
        </div></section>
      )}

      {txt(os["observacoes"]) && (
        <section className="orc-bloco"><h2>Observações do técnico</h2><div><p className="orc-texto">{txt(os["observacoes"])}</p></div></section>
      )}

      <div className="orc-aceite">
        <div>
          {txt(os["assinatura_img"]) ? <img src={txt(os["assinatura_img"])} alt="Assinatura do cliente" data-no-zoom style={{ height: 70, margin: "0 auto" }} /> : <div className="orc-linha-assinatura" />}
          <span>{txt(os["assinado_nome"]) || cliente}</span>
          <small>
            {os["assinado_em"] ? `Assinado eletronicamente em ${dt(os["assinado_em"])}${txt(os["assinado_documento"]) ? ` · ${formatCpfCnpj(txt(os["assinado_documento"]))}` : ""}` : "Responsável no local"}
          </small>
        </div>
        <div><div className="orc-linha-assinatura" /><span>{tecnico || empresaNome}</span><small>Técnico responsável</small></div>
      </div>
      <footer className="orc-rodape">{empresaNome} · Ordem de manutenção {numero}</footer>
    </div>
  );
}
