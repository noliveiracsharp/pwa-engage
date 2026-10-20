import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAudit } from "@/lib/audit";
import { rowId, text } from "@/lib/crud";
import { formatBRL, formatDate, round2 } from "@/lib/orcamentos";
import { erroFinanceiro } from "@/lib/financeiro-db";
import { lerFaturaCartao } from "@/lib/fatura-importacao.functions";
import { lerTextoFatura, chaveItem, ehDespesa, limparDescricao, parcelasDaLinha, type ItemFaturaLido } from "@/lib/fatura-importacao";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";

type Linha = ItemFaturaLido & { id: number; marcado: boolean; cartao_id: string; categoria: string; parceiro_id: string; jaLancado: boolean };

const nomeP = (p: Row) => text(p["nome_fantasia"] || p["razao_social"]) || "—";
async function textoDoPdf(f: File): Promise<string> {
  const pdfjs = await (await import("@/lib/pdf-worker")).prepararPdfjs();
  const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    const rows = new Map<number, [number, string][]>();
    for (const it of c.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3);
      const r = rows.get(y) ?? []; r.push([it.transform[4], it.str]); rows.set(y, r);
    }
    [...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([, r]) => out.push(r.sort((a, b) => a[0] - b[0]).map((x) => x[1]).join(" ")));
  }
  return out.join("\n");
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

export function ImportarFaturaDialog({ cartoes, parceiros, categorias, onClose, onSaved }: {
  cartoes: Row[]; parceiros: Row[]; categorias: string[]; onClose: () => void; onSaved: () => void;
}) {
  const ler = useServerFn(lerFaturaCartao);
  const { isMaster, empresa } = useAuth();
  const { empresaId } = useAudit();
  const [etapa, setEtapa] = useState<"arquivo" | "lendo" | "revisar">("arquivo");
  const [venc, setVenc] = useState("");
  const [totalPdf, setTotalPdf] = useState<number | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [fornPadrao, setFornPadrao] = useState("");
  const [incluirAnt, setIncluirAnt] = useState(true);
  const [statusAnt, setStatusAnt] = useState<"pago" | "aberto">("pago");
  const [salvando, setSalvando] = useState(false);

  const fornecedores = useMemo(() => parceiros.filter((p) => p["is_fornecedor"] === true)
    .map((p) => ({ value: text(rowId(p)), label: nomeP(p), keywords: [text(p["documento"])] }))
    .sort((a, b) => a.label.localeCompare(b.label)), [parceiros]);
  const cartaoOpts = cartoes.map((c) => ({ value: text(rowId(c)), label: `${text(c["descricao"])}${c["final4"] ? ` • final ${text(c["final4"])}` : ""}` }));

  const acharFornecedor = (desc: string) => {
    const d = norm(limparDescricao(desc));
    if (d.length < 4) return "";
    const p = parceiros.find((x) => x["is_fornecedor"] === true && [x["nome_fantasia"], x["razao_social"]].some((n) => {
      const k = norm(text(n)); return k.length >= 4 && (d.includes(k) || k.includes(d.slice(0, 8)));
    }));
    return p ? text(rowId(p)) : "";
  };

  const enviar = async (file: File) => {
    if (file.type !== "application/pdf") return void toast.error("Envie o arquivo PDF da fatura.");
    if (file.size > 15 * 1024 * 1024) return void toast.error("PDF muito grande (máx. 15 MB).");
    setEtapa("lendo");
    try {
      let r: { vencimento: string | null; total: number | null; itens: ItemFaturaLido[]; erro?: string } = lerTextoFatura(await textoDoPdf(file));
      if (!r.itens.length) {
        // Layout desconhecido: tenta a leitura por IA.
        const path = `faturas/${crypto.randomUUID()}.pdf`;
        const { error } = await supabase.storage.from("chat_media").upload(path, file, { contentType: "application/pdf" });
        if (error) throw error;
        const url = supabase.storage.from("chat_media").getPublicUrl(path).data.publicUrl;
        r = await ler({ data: { url } });
      }
      if (r.erro || !r.itens.length) { setEtapa("arquivo"); return void toast.error(r.erro ? "Não reconhecemos o formato desta fatura." : "Nenhuma compra encontrada no PDF."); }
      const vencimento = r.vencimento ?? "";
      // Compras já lançadas nesta fatura (mesmo vencimento) não entram de novo.
      const ids = cartoes.map((c) => text(rowId(c)));
      const { data: existentes } = vencimento && ids.length
        ? await supabase.from("financeiro_titulos").select("cartao_id, descricao, valor, parcela_n").in("cartao_id", ids).eq("vencimento", vencimento)
        : { data: [] as Row[] };
      const ja = new Set(((existentes ?? []) as Row[]).map((t) => `${text(t["cartao_id"])}|${chaveItem(text(t["descricao"]).replace(/\s*\(\d+\/\d+\)\s*$/, ""), Number(t["valor"]), Number(t["parcela_n"]) || 1)}`));
      setVenc(vencimento); setTotalPdf(r.total);
      setLinhas(r.itens.map((i, id) => {
        const c = cartoes.find((x) => i.final4 && text(x["final4"]) === i.final4) ?? (cartoes.length === 1 ? cartoes[0] : undefined);
        const cartao_id = c ? text(rowId(c)) : "";
        const jaLancado = ja.has(`${cartao_id}|${chaveItem(i.descricao, i.valor, i.parcela ?? 1)}`);
        return { ...i, id, cartao_id, categoria: "", parceiro_id: acharFornecedor(i.descricao), jaLancado, marcado: ehDespesa(i) && !jaLancado };
      }));
      setEtapa("revisar");
    } catch (e) { setEtapa("arquivo"); toast.error(erroFinanceiro(e)); }
  };

  const up = (id: number, p: Partial<Linha>) => setLinhas((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const marcadas = linhas.filter((l) => l.marcado);
  const somaMarcadas = round2(marcadas.reduce((s, l) => s + l.valor, 0));
  const somaDespesas = round2(linhas.filter((l) => ehDespesa(l)).reduce((s, l) => s + l.valor, 0));
  const conciliada = totalPdf !== null && Math.abs(somaDespesas - totalPdf) < 0.05;
  const semCartao = marcadas.filter((l) => !l.cartao_id).length;

  const salvar = async () => {
    if (!venc) return void toast.error("Informe o vencimento da fatura.");
    if (!marcadas.length) return void toast.error("Marque ao menos uma compra.");
    if (semCartao) return void toast.error(`${semCartao} compra(s) sem cartão. Cadastre o cartão em Bancos ou escolha na linha.`);
    if (marcadas.some((l) => !(l.parceiro_id || fornPadrao))) return void toast.error("Escolha o fornecedor padrão ou o fornecedor de cada compra.");
    setSalvando(true);
    const emp = isMaster && empresa ? rowId(empresa) : empresaId;
    const lote = marcadas.flatMap((l) => {
      const desc = limparDescricao(l.descricao);
      const serie = (l.de ?? 1) > 1 ? crypto.randomUUID() : null;
      const cartao = cartoes.find((c) => text(rowId(c)) === l.cartao_id);
      return parcelasDaLinha(l, venc, incluirAnt).map((p) => ({
        tipo: "pagar", empresa_id: emp, origem_tipo: "manual", origem_id: serie, parcela_n: p.n,
        descricao: p.total > 1 ? `${desc} (${p.n}/${p.total})` : desc,
        parceiro_id: l.parceiro_id || fornPadrao, categoria: l.categoria || null,
        conta_bancaria_id: cartao?.["conta_bancaria_id"] ?? null, cartao_id: l.cartao_id, forma_pagamento: "Cartão de crédito",
        data_compra: l.data ?? venc, data_competencia: l.data ?? venc, vencimento: p.vencimento, valor: p.valor,
        ...(p.anterior && statusAnt === "pago" ? { status: "pago", pago_em: p.vencimento, valor_pago: p.valor } : { status: "aberto" }),
      }));
    });
    const { error } = await supabase.from("financeiro_titulos").insert(lote as never);
    setSalvando(false);
    if (error) return void toast.error(erroFinanceiro(error));
    toast.success(`${marcadas.length} compras importadas (${lote.length} parcelas lançadas).`);
    onSaved(); onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !salvando && onClose()}>
      <DialogContent className="max-w-6xl">
        <DialogHeader><DialogTitle>Importar fatura do cartão (PDF)</DialogTitle></DialogHeader>
        {etapa !== "revisar" ? (
          <label className={cn("flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-10 text-center", etapa === "lendo" && "pointer-events-none opacity-70")}>
            {etapa === "lendo" ? <Loader2 className="text-primary h-10 w-10 animate-spin" /> : <FileUp className="text-primary h-10 w-10" />}
            <p className="font-medium">{etapa === "lendo" ? "Lendo a fatura… pode levar até 1 minuto." : "Clique para escolher o PDF da fatura"}</p>
            <p className="text-muted-foreground text-sm">Funciona com faturas de qualquer banco. Você confere tudo antes de lançar.</p>
            <input type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviar(f); }} />
          </label>
        ) : (<>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1"><Label>Vencimento da fatura</Label><Input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>Fornecedor padrão (quando a linha não tiver)</Label>
              <SearchSelect value={fornPadrao} options={fornecedores} placeholder="Escolha o fornecedor" onChange={setFornPadrao} /></div>
            <div className={cn("rounded-lg border p-2 text-sm", conciliada ? "border-success/40 bg-success/10" : "border-warning/40 bg-warning/10")}>
              <p>PDF: <strong className="tabular-nums">{totalPdf !== null ? formatBRL(totalPdf) : "—"}</strong></p>
              <p>Lido: <strong className="tabular-nums">{formatBRL(somaDespesas)}</strong></p>
              <p className="text-xs font-semibold">{conciliada ? "Fatura 100% conciliada" : "Diferença — confira as linhas"}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border p-2 text-sm">
            <Switch checked={incluirAnt} onCheckedChange={setIncluirAnt} id="imp-ant" />
            <Label htmlFor="imp-ant" className="flex-1">Criar histórico das parcelas anteriores (ex.: 1 a 11 de uma compra 12/12)</Label>
            {incluirAnt && <Select value={statusAnt} onValueChange={(x) => setStatusAnt(x as "pago" | "aberto")}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="aberto">Em aberto</SelectItem><SelectItem value="pago">Pago</SelectItem></SelectContent></Select>}
          </div>
          <div className="max-h-[50vh] overflow-auto rounded border">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0 z-10"><tr className="text-left">
                <th className="p-2"><Checkbox checked={linhas.length > 0 && linhas.every((l) => l.marcado || !ehDespesa(l) || l.jaLancado)}
                  onCheckedChange={(x) => setLinhas((l) => l.map((i) => ({ ...i, marcado: !!x && ehDespesa(i) && !i.jaLancado })))} aria-label="Marcar todas" /></th>
                <th className="p-2">Compra</th><th className="p-2">Descrição</th><th className="p-2">Parcela</th><th className="p-2">Cartão</th>
                <th className="p-2">Fornecedor</th><th className="p-2">Categoria</th><th className="p-2 text-right">Valor</th></tr></thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} className={cn("border-t", !l.marcado && "opacity-60")}>
                    <td className="p-2"><Checkbox checked={l.marcado} onCheckedChange={(x) => up(l.id, { marcado: !!x })} aria-label="Lançar" /></td>
                    <td className="p-2 whitespace-nowrap tabular-nums">{formatDate(l.data) || "—"}</td>
                    <td className="p-2">{limparDescricao(l.descricao)}
                      {l.credito && <span className="ml-1 rounded bg-muted px-1.5 text-[10px]">crédito</span>}
                      {l.jaLancado && <span className="bg-primary/10 text-primary ml-1 rounded px-1.5 text-[10px]">já lançada</span>}</td>
                    <td className="p-2 whitespace-nowrap">{l.de ? `${l.parcela}/${l.de}` : "à vista"}</td>
                    <td className="min-w-40 p-2"><SearchSelect value={l.cartao_id} options={cartaoOpts} placeholder={l.final4 ? `final ${l.final4}?` : "Cartão"} onChange={(x) => up(l.id, { cartao_id: x })} /></td>
                    <td className="min-w-44 p-2"><SearchSelect value={l.parceiro_id} options={fornecedores} placeholder="Padrão" onChange={(x) => up(l.id, { parceiro_id: x })} /></td>
                    <td className="min-w-36 p-2"><Select value={l.categoria} onValueChange={(x) => up(l.id, { categoria: x })}>
                      <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                      <SelectContent>{[...categorias].sort((a, b) => a.localeCompare(b)).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></td>
                    <td className="p-2 text-right font-medium whitespace-nowrap tabular-nums">{l.credito ? "+ " : ""}{formatBRL(l.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)}
        <DialogFooter className="items-center gap-2">
          {etapa === "revisar" && <p className="mr-auto text-sm">{marcadas.length} compra(s) • <strong className="tabular-nums">{formatBRL(somaMarcadas)}</strong> nesta fatura</p>}
          <Button variant="outline" disabled={salvando} onClick={onClose}>Cancelar</Button>
          {etapa === "revisar" && <Button disabled={salvando} onClick={() => void salvar()}>{salvando ? "Lançando…" : `Lançar ${marcadas.length} compras`}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
