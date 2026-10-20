import { useMemo, useState } from "react";
import { FileUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAudit } from "@/lib/audit";
import { rowId, text } from "@/lib/crud";
import { formatBRL, round2 } from "@/lib/orcamentos";
import { erroFinanceiro } from "@/lib/financeiro-db";
import { lerTextoConta, lerXmlNfe, type ContaLida } from "@/lib/conta-importacao";
import type { Row } from "@/lib/row";

async function textoDoPdf(f: File): Promise<string> {
  const pdfjs = await (await import("@/lib/pdf-worker")).prepararPdfjs();
  const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
  const out: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 5); i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    out.push(c.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  return out.join("\n");
}

const ORIGEM = { boleto: "Boleto", consumo: "Conta de consumo", nfe: "Nota fiscal (XML)", pdf: "Documento PDF" } as const;
const nomeP = (p: Row) => text(p["nome_fantasia"] || p["razao_social"]) || "—";

export function ImportarContaDialog({ parceiros, categorias, onClose, onSaved }: {
  parceiros: Row[]; categorias: string[]; onClose: () => void; onSaved: () => void;
}) {
  const { isMaster, empresa } = useAuth();
  const { empresaId } = useAudit();
  const [lendo, setLendo] = useState(false);
  const [lida, setLida] = useState<ContaLida | null>(null);
  const [descricao, setDescricao] = useState("");
  const [parceiro, setParceiro] = useState("");
  const [categoria, setCategoria] = useState("");
  const [linha, setLinha] = useState("");
  const [parcelas, setParcelas] = useState<{ vencimento: string; valor: string }[]>([]);
  const [salvando, setSalvando] = useState(false);

  const fornecedores = useMemo(() => parceiros.filter((p) => p["is_fornecedor"] === true)
    .map((p) => ({ value: text(rowId(p)), label: nomeP(p), keywords: [text(p["documento"])] }))
    .sort((a, b) => a.label.localeCompare(b.label)), [parceiros]);
  const catOpts = [...categorias].sort((a, b) => a.localeCompare(b)).map((c) => ({ value: c, label: c }));

  const enviar = async (f: File) => {
    if (f.size > 15 * 1024 * 1024) return void toast.error("Arquivo muito grande (máx. 15 MB).");
    setLendo(true);
    try {
      const xml = /\.xml$/i.test(f.name) || f.type.includes("xml");
      const r = xml ? lerXmlNfe(await f.text()) : lerTextoConta(await textoDoPdf(f));
      if (!r) return void toast.error("Este XML não é de uma NF-e.");
      const doc = r.cnpj ?? "";
      const p = doc ? parceiros.find((x) => text(x["documento"]).replace(/\D/g, "") === doc) : undefined;
      setLida(r);
      setParceiro(p ? text(rowId(p)) : "");
      setLinha(r.linhaDigitavel ?? "");
      setDescricao(r.origem === "nfe" ? `NF ${r.numero ?? ""} - ${r.fornecedor ?? ""}`.trim() : p ? `${ORIGEM[r.origem]} - ${nomeP(p)}` : ORIGEM[r.origem]);
      setParcelas(r.parcelas.length ? r.parcelas.map((x) => ({ vencimento: x.vencimento, valor: x.valor.toFixed(2) })) : [{ vencimento: "", valor: r.total ? r.total.toFixed(2) : "" }]);
      if (!r.parcelas.length) toast.warning("Não achamos vencimento/valor. Preencha manualmente.");
      if (doc && !p) toast.info(`Fornecedor ${r.fornecedor ?? doc} não está cadastrado. Cadastre em Parceiros ou escolha um.`);
    } catch (e) { toast.error(erroFinanceiro(e)); } finally { setLendo(false); }
  };

  const total = round2(parcelas.reduce((s, p) => s + (Number(p.valor) || 0), 0));
  const up = (i: number, k: "vencimento" | "valor", v: string) => setParcelas((l) => l.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  const salvar = async () => {
    if (!parceiro) return void toast.error("Escolha o fornecedor.");
    if (!descricao.trim()) return void toast.error("Informe a descrição.");
    if (parcelas.some((p) => !p.vencimento || !(Number(p.valor) > 0))) return void toast.error("Preencha vencimento e valor de todas as parcelas.");
    setSalvando(true);
    const emp = isMaster && empresa ? rowId(empresa) : empresaId;
    const serie = parcelas.length > 1 ? crypto.randomUUID() : null;
    const n = parcelas.length;
    const lote = parcelas.map((p, i) => ({
      tipo: "pagar", empresa_id: emp, origem_tipo: "manual", origem_id: serie, parcela_n: i + 1,
      descricao: n > 1 ? `${descricao.trim()} (${i + 1}/${n})` : descricao.trim(),
      parceiro_id: parceiro, categoria: categoria || null, status: "aberto",
      forma_pagamento: lida?.origem === "nfe" ? null : "Boleto",
      linha_digitavel: i === 0 && linha ? linha : null,
      data_competencia: lida?.emissao ?? p.vencimento, vencimento: p.vencimento, valor: Number(p.valor),
    }));
    const { error } = await supabase.from("financeiro_titulos").insert(lote as never);
    setSalvando(false);
    if (error) return void toast.error(erroFinanceiro(error));
    toast.success(`${n} conta(s) lançada(s).`);
    onSaved(); onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !salvando && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Importar boleto, conta ou nota fiscal</DialogTitle></DialogHeader>
        {!lida ? (
          <label className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-10 text-center">
            {lendo ? <Loader2 className="text-primary h-10 w-10 animate-spin" /> : <FileUp className="text-primary h-10 w-10" />}
            <p className="font-medium">{lendo ? "Lendo o arquivo…" : "Clique para escolher o PDF do boleto/conta ou o XML da NF-e"}</p>
            <p className="text-muted-foreground text-sm">Boletos e contas de luz, água, telefone (PDF) e notas fiscais (XML). Você confere antes de lançar.</p>
            <input type="file" accept="application/pdf,.xml,text/xml,application/xml" className="hidden" disabled={lendo}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviar(f); }} />
          </label>
        ) : (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">Tipo identificado: <strong className="text-foreground">{ORIGEM[lida.origem]}</strong>
              {lida.cnpj && <> • CNPJ/CPF {lida.cnpj}</>}{lida.total ? <> • Total {formatBRL(lida.total)}</> : null}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2"><Label>Descrição</Label><Input value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
              <div className="space-y-1"><Label>Fornecedor</Label><SearchSelect value={parceiro} options={fornecedores} placeholder="Escolha o fornecedor" onChange={setParceiro} /></div>
              <div className="space-y-1"><Label>Categoria</Label><SearchSelect value={categoria} options={catOpts} placeholder="Categoria" onChange={setCategoria} /></div>
              {lida.origem !== "nfe" && <div className="space-y-1 sm:col-span-2"><Label>Linha digitável</Label>
                <Input className="font-mono text-xs" value={linha} onChange={(e) => setLinha(e.target.value)} /></div>}
            </div>
            <div className="rounded border">
              <table className="w-full text-sm">
                <thead className="bg-muted"><tr className="text-left"><th className="p-2">Parcela</th><th className="p-2">Vencimento</th><th className="p-2">Valor (R$)</th><th /></tr></thead>
                <tbody>{parcelas.map((p, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{i + 1}/{parcelas.length}</td>
                    <td className="p-2"><Input type="date" value={p.vencimento} onChange={(e) => up(i, "vencimento", e.target.value)} /></td>
                    <td className="p-2"><Input type="number" step="0.01" value={p.valor} onChange={(e) => up(i, "valor", e.target.value)} /></td>
                    <td className="p-2">{parcelas.length > 1 && <Button size="icon" variant="ghost" aria-label="Remover parcela"
                      onClick={() => setParcelas((l) => l.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>}</td>
                  </tr>))}</tbody>
              </table>
              <div className="flex items-center justify-between border-t p-2">
                <Button size="sm" variant="outline" onClick={() => setParcelas((l) => [...l, { vencimento: "", valor: "" }])}><Plus className="mr-1 h-4 w-4" />Parcela</Button>
                <span className="text-sm">Total: <strong className="tabular-nums">{formatBRL(total)}</strong></span>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          {lida && <Button variant="ghost" className="mr-auto" disabled={salvando} onClick={() => setLida(null)}>Outro arquivo</Button>}
          <Button variant="outline" disabled={salvando} onClick={onClose}>Cancelar</Button>
          {lida && <Button disabled={salvando} onClick={() => void salvar()}>{salvando ? "Lançando…" : "Lançar"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
