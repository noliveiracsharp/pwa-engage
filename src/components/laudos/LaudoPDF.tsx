import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCpfCnpj } from "@/lib/input-masks";
import { classificacaoMeta, isInspecao, objetivoLabel } from "@/lib/laudos";
import { formatDate, formatQtd } from "@/lib/orcamentos";
import { pick, type Row } from "@/lib/row";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  laudo: Row | null;
  linhas: Row[];
  fotos: Row[];
  empresa: Row | null | undefined;
  cliente: Row | undefined;
  tecnico: Row | undefined;
};

const txt = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s === "null" || s === "undefined" ? "" : s;
};

/** Relatório do laudo no mesmo padrão visual do orçamento (imprimir / salvar PDF). */
export function LaudoPDF({ open, onOpenChange, laudo, linhas, fotos, empresa, cliente, tecnico }: Props) {
  if (!laudo) return null;
  const inspecao = isInspecao(laudo["objetivo"]);
  const numero = txt(laudo["numero"]) || "Laudo";
  const cls = classificacaoMeta(laudo["classificacao"]);
  const empresaNome = txt(pick(empresa ?? {}, ["nome", "razao_social", "nome_fantasia"])) || "Minha empresa";
  const empresaLogo = txt(pick(empresa ?? {}, ["logo", "logo_url", "logotipo", "imagem"]));
  const clienteNome = txt(pick(cliente ?? {}, ["razao_social", "nome_fantasia", "nome"])) || "—";
  const ordenadas = [...linhas].sort((a, b) => Number(a["ordem"] ?? 0) - Number(b["ordem"] ?? 0));
  const fotosItem = (id: unknown) => fotos.filter((f) => String(f["laudo_item_id"]) === String(id));
  const gerais = fotos.filter((f) => !f["laudo_item_id"]);

  const imprimir = () => {
    const src = document.getElementById("laudo-print");
    if (!src) return;
    const host = document.createElement("div");
    host.className = "orc-print-host";
    host.style.display = "none";
    host.appendChild(src.cloneNode(true));
    document.body.appendChild(host);
    document.documentElement.classList.add("orc-printing");
    const limpar = () => {
      document.documentElement.classList.remove("orc-printing");
      host.remove();
      window.removeEventListener("afterprint", limpar);
    };
    window.addEventListener("afterprint", limpar);
    const imgs = Array.from(host.querySelectorAll("img"));
    Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))))
      .then(() => setTimeout(() => window.print(), 50));
  };

  const Fotos = ({ list }: { list: Row[] }) =>
    list.length ? (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
        {list.map((f) => (
          <img key={String(f["id"])} src={txt(f["url_foto"])} alt="Evidência" style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 6, border: "1px solid #e2e8f0" }} />
        ))}
      </div>
    ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[96vw] max-w-4xl overflow-y-auto p-0">
        <DialogHeader className="bg-background sticky top-0 z-20 flex-row items-center justify-between gap-3 space-y-0 border-b px-6 py-4">
          <DialogTitle>Visualizar laudo {numero}</DialogTitle>
          <div className="flex items-center gap-2">
            <Button onClick={imprimir}><Printer className="mr-2 h-4 w-4" />Imprimir / Salvar PDF</Button>
            <DialogClose asChild><Button variant="ghost" size="icon" aria-label="Fechar"><X className="h-5 w-5" /></Button></DialogClose>
          </div>
        </DialogHeader>

        <div id="laudo-print" className="orc-doc">
          <header className="orc-top">
            <div className="orc-emitente">
              {empresaLogo ? <img src={empresaLogo} alt={empresaNome} className="orc-logo" /> : <div className="orc-logo-fallback">{empresaNome.slice(0, 2).toUpperCase()}</div>}
              <div>
                <strong>{empresaNome}</strong>
                {txt(pick(empresa ?? {}, ["cnpj_cpf", "cnpj"])) && <div>CNPJ {formatCpfCnpj(txt(pick(empresa ?? {}, ["cnpj_cpf", "cnpj"])))}</div>}
                {txt(pick(empresa ?? {}, ["email"])) && <div>{txt(pick(empresa ?? {}, ["email"]))}</div>}
              </div>
            </div>
            <div className="orc-identificacao">
              <span className="orc-rotulo">{objetivoLabel(laudo["objetivo"])}</span>
              <span className="orc-numero">{numero}</span>
              {cls && <span className={`orc-situacao orc-situacao-${cls.pdf}`}>{cls.label}</span>}
              <div className="orc-datas">
                <div><span>Data da visita</span><strong>{formatDate(laudo["data_visita"])}</strong></div>
              </div>
            </div>
          </header>

          <div className="orc-partes">
            <section className="orc-bloco"><h2>Cliente</h2><div>
              <strong>{clienteNome}</strong>
              {txt(cliente?.["documento"]) && <div>{formatCpfCnpj(txt(cliente?.["documento"]))}</div>}
              {txt(pick(cliente ?? {}, ["endereco", "logradouro"])) && <div>{txt(pick(cliente ?? {}, ["endereco", "logradouro"]))} {txt(cliente?.["cidade"])}</div>}
            </div></section>
            <section className="orc-bloco"><h2>Responsável técnico</h2><div>
              <strong>{txt(pick(tecnico ?? {}, ["nome", "email"])) || "—"}</strong>
              {txt(tecnico?.["email"]) && <div>{txt(tecnico?.["email"])}</div>}
            </div></section>
          </div>

          <table className="orc-tabela">
            <thead>
              <tr>
                <th className="orc-col-num">#</th>
                <th>{inspecao ? "Item verificado" : "Item"}</th>
                <th className="orc-right">{inspecao ? "Situação" : "Qtd."}</th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((l, i) => (
                <tr key={String(l["id"])}>
                  <td className="orc-col-num">{i + 1}</td>
                  <td>
                    <strong>{txt(l["descricao_item"])}</strong>
                    {txt(l["observacao"]) && <div className="orc-detalhe">{txt(l["observacao"])}</div>}
                    <Fotos list={fotosItem(l["id"])} />
                  </td>
                  <td className="orc-right">
                    {inspecao ? (l["conforme"] === false ? "Não conforme" : "Conforme") : formatQtd(l["quantidade"])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {(txt(laudo["observacoes_gerais"]) || gerais.length > 0) && (
            <section className="orc-bloco"><h2>Observações gerais</h2><div>
              {txt(laudo["observacoes_gerais"]) && <p className="orc-texto">{txt(laudo["observacoes_gerais"])}</p>}
              <Fotos list={gerais} />
            </div></section>
          )}

          {inspecao && txt(laudo["laudo_final"]) && (
            <section className="orc-bloco"><h2>Parecer final</h2><div><p className="orc-texto">{txt(laudo["laudo_final"])}</p></div></section>
          )}

          <div className="orc-aceite">
            <div><div className="orc-linha-assinatura" /><span>{clienteNome}</span><small>Ciência do cliente</small></div>
            <div><div className="orc-linha-assinatura" /><span>{txt(pick(tecnico ?? {}, ["nome"])) || empresaNome}</span><small>Responsável técnico</small></div>
          </div>
          <footer className="orc-rodape">{empresaNome} · {objetivoLabel(laudo["objetivo"])} {numero}</footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}
