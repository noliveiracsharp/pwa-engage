import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, Loader2, Trash2, Trophy, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { supabase } from "@/integrations/supabase/client";
import { rowId } from "@/lib/crud";
import { baixarArquivo, cotacaoStatusMeta, parseCsv, toCsv } from "@/lib/laudos";
import { formatBRL, formatQtd, num, round2 } from "@/lib/orcamentos";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cotacao: Row | null;
  itensCot: Row[];
  fornCot: Row[];
  precos: Row[];
  parceiros: Row[];
  itens: Row[];
  canUpdate: boolean;
  aprovando: boolean;
  onAprovar: (melhores: Array<{ cotacaoItem: Row; preco: number; fornecedorId: string }>) => void;
};

const nomeParc = (p: Row | undefined) => String(pick(p ?? {}, ["nome_fantasia", "razao_social"]) ?? "—");

export function CotacaoSheet({ open, onOpenChange, cotacao, itensCot, fornCot, precos, parceiros, itens, canUpdate, aprovando, onAprovar }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [novoForn, setNovoForn] = useState("");
  const [novoItem, setNovoItem] = useState("");
  const [busy, setBusy] = useState(false);
  const cid = cotacao ? String(rowId(cotacao)) : "";
  const aprovada = cotacao?.["status"] === "aprovado";
  const editavel = canUpdate && !aprovada;

  const parceiroById = useMemo(() => new Map(parceiros.map((p) => [String(rowId(p)), p])), [parceiros]);
  const itemById = useMemo(() => new Map(itens.map((i) => [String(rowId(i)), i])), [itens]);
  const fornecedoresOpts = useMemo(() => {
    const f = parceiros.filter((p) => p["is_fornecedor"] === true);
    const usados = new Set(fornCot.map((x) => String(x["fornecedor_id"])));
    return (f.length ? f : parceiros)
      .filter((p) => !usados.has(String(rowId(p))))
      .map((p) => ({ value: String(rowId(p)), label: nomeParc(p), keywords: [String(p["razao_social"] ?? "")] }));
  }, [parceiros, fornCot]);

  const itemOpts = useMemo(
    () => itens.map((i) => ({ value: String(rowId(i)), label: String(i["descricao"] ?? "Item"), hint: i["codigo"] ? String(i["codigo"]) : undefined, keywords: [String(i["codigo"] ?? "")] })),
    [itens],
  );

  const invalidar = () => {
    for (const t of ["cotacoes", "cotacoes_itens", "cotacoes_fornecedores", "cotacoes_precos"]) qc.invalidateQueries({ queryKey: ["table", t] });
  };
  const precoDe = (itemCotId: string, fornId: string) =>
    precos.find((p) => String(p["cotacao_item_id"]) === itemCotId && String(p["fornecedor_id"]) === fornId);

  /* ---- comparativo ---- */
  const analise = useMemo(() => {
    const totais = new Map<string, { total: number; completo: boolean }>();
    for (const f of fornCot) totais.set(String(f["fornecedor_id"]), { total: 0, completo: true });
    const melhores: Array<{ cotacaoItem: Row; preco: number; fornecedorId: string }> = [];
    for (const it of itensCot) {
      const qtd = num(it["quantidade"]);
      let best: { preco: number; fornecedorId: string } | null = null;
      for (const f of fornCot) {
        const fid = String(f["fornecedor_id"]);
        const p = precoDe(String(it["id"]), fid);
        const v = num(p?.["preco_unitario"]);
        const t = totais.get(fid)!;
        if (!p || p["disponivel"] === false || v <= 0) { t.completo = false; continue; }
        t.total += v * qtd;
        if (!best || v < best.preco) best = { preco: v, fornecedorId: fid };
      }
      if (best) melhores.push({ cotacaoItem: it, ...best });
    }
    const split = melhores.reduce((s, m) => s + m.preco * num(m.cotacaoItem["quantidade"]), 0);
    let vencedor: string | null = null;
    for (const [fid, t] of totais) if (t.completo && t.total > 0 && (!vencedor || t.total < totais.get(vencedor)!.total)) vencedor = fid;
    return { totais, melhores, split: round2(split), vencedor };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itensCot, fornCot, precos]);

  if (!cotacao) return null;

  const addFornecedor = async (fid: string) => {
    if (!fid) return;
    const codigo = `${String(cotacao["numero"] ?? "COT")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { error } = await supabase.from("cotacoes_fornecedores").insert({ cotacao_id: cid, fornecedor_id: fid, codigo_envio: codigo });
    if (error) return void toast.error(error.message);
    if (cotacao["status"] === "pendente") await supabase.from("cotacoes").update({ status: "em_cotacao" }).eq("id", cid);
    setNovoForn("");
    invalidar();
  };

  const addItem = async (itemId: string) => {
    if (!itemId) return;
    setNovoItem("");
    const { error } = await supabase.from("cotacoes_itens").insert({ cotacao_id: cid, item_id: itemId, quantidade: 1 });
    if (error) return void toast.error(error.message);
    invalidar();
  };
  const salvarQtd = async (it: Row, valor: string) => {
    const q = num(valor);
    if (q <= 0 || q === num(it["quantidade"])) return;
    const { error } = await supabase.from("cotacoes_itens").update({ quantidade: q }).eq("id", String(it["id"]));
    if (error) return void toast.error(error.message);
    invalidar();
  };
  const removerItem = async (it: Row) => {
    const { error } = await supabase.from("cotacoes_itens").delete().eq("id", String(it["id"]));
    if (error) return void toast.error(error.message);
    invalidar();
  };

  const removerForn = async (f: Row) => {
    await supabase.from("cotacoes_precos").delete().eq("cotacao_id", cid).eq("fornecedor_id", String(f["fornecedor_id"]));
    const { error } = await supabase.from("cotacoes_fornecedores").delete().eq("id", String(f["id"]));
    if (error) return void toast.error(error.message);
    invalidar();
  };

  const exportar = (f: Row) => {
    const linhas: Array<Array<string | number>> = [
      ["codigo_envio", "fornecedor", "cotacao_item_id", "codigo_item", "descricao", "quantidade", "preco_unitario", "prazo_dias", "observacao"],
      ...itensCot.map((it) => {
        const item = itemById.get(String(it["item_id"]));
        return [String(f["codigo_envio"]), nomeParc(parceiroById.get(String(f["fornecedor_id"]))), String(it["id"]), String(item?.["codigo"] ?? ""), String(item?.["descricao"] ?? ""), formatQtd(it["quantidade"]), "", "", ""];
      }),
    ];
    baixarArquivo(`cotacao-${cotacao["numero"] ?? cid}-${f["codigo_envio"]}.csv`, toCsv(linhas));
  };

  const importar = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const rows = parseCsv(await file.text());
      const head = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
      const col = (n: string) => head.indexOf(n);
      const [cCod, cItem, cPreco, cPrazo, cObs] = ["codigo_envio", "cotacao_item_id", "preco_unitario", "prazo_dias", "observacao"].map(col);
      if (cCod! < 0 || cItem! < 0 || cPreco! < 0) throw new Error("Arquivo fora do modelo: use o CSV exportado pela cotação.");
      const codigo = rows[1]?.[cCod!]?.trim();
      const forn = fornCot.find((f) => String(f["codigo_envio"]) === codigo);
      if (!forn) throw new Error("O código do fornecedor no arquivo não pertence a esta cotação.");
      const idsValidos = new Set(itensCot.map((i) => String(i["id"])));
      const payload = rows.slice(1).filter((r) => idsValidos.has(r[cItem!]?.trim() ?? "")).map((r) => {
        const preco = num(r[cPreco!]);
        return {
          cotacao_id: cid,
          cotacao_item_id: r[cItem!]!.trim(),
          fornecedor_id: String(forn["fornecedor_id"]),
          preco_unitario: preco,
          prazo_dias: cPrazo! >= 0 ? Math.floor(num(r[cPrazo!])) : 0,
          disponivel: preco > 0,
          observacao: cObs! >= 0 ? r[cObs!]?.trim() || null : null,
        };
      });
      if (!payload.length) throw new Error("Nenhum item reconhecido no arquivo.");
      const { error } = await supabase.from("cotacoes_precos").upsert(payload, { onConflict: "cotacao_item_id,fornecedor_id" });
      if (error) throw error;
      const total = payload.reduce((s, p) => s + p.preco_unitario * num(itensCot.find((i) => String(i["id"]) === p.cotacao_item_id)?.["quantidade"]), 0);
      await supabase.from("cotacoes_fornecedores").update({ respondido: true, data_resposta: new Date().toISOString(), total_cotado: round2(total) }).eq("id", String(forn["id"]));
      toast.success(`Preços de ${nomeParc(parceiroById.get(String(forn["fornecedor_id"])))} importados (${payload.length} itens).`);
      invalidar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao importar o arquivo.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const salvarPreco = async (it: Row, f: Row, valor: string) => {
    const preco = num(valor);
    const atual = precoDe(String(it["id"]), String(f["fornecedor_id"]));
    if (num(atual?.["preco_unitario"]) === preco) return;
    const { error } = await supabase.from("cotacoes_precos").upsert(
      { cotacao_id: cid, cotacao_item_id: String(it["id"]), fornecedor_id: String(f["fornecedor_id"]), preco_unitario: preco, disponivel: preco > 0 },
      { onConflict: "cotacao_item_id,fornecedor_id" },
    );
    if (error) return void toast.error(error.message);
    invalidar();
  };

  const st = cotacaoStatusMeta(cotacao["status"]);
  const vencedorNome = analise.vencedor ? nomeParc(parceiroById.get(analise.vencedor)) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-5xl">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="flex flex-wrap items-center gap-2">
            Cotação {String(cotacao["numero"] ?? "")}
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", st.badge)}>{st.label}</span>
          </SheetTitle>
          <p className="text-muted-foreground text-sm">{String(cotacao["titulo"] ?? "")}</p>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Fornecedores participantes</h3>
              {editavel && (
                <Button variant="outline" size="sm" disabled={busy || !fornCot.length} onClick={() => fileRef.current?.click()}>
                  {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />} Importar CSV respondido
                </Button>
              )}
              <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => importar(e.target.files?.[0])} />
            </div>
            {editavel && <SearchSelect value={novoForn} onChange={addFornecedor} options={fornecedoresOpts} placeholder="Adicionar fornecedor" />}
            {fornCot.length === 0 && <p className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">Adicione fornecedores para gerar os arquivos de cotação.</p>}
            <div className="grid gap-2 md:grid-cols-2">
              {fornCot.map((f) => (
                <div key={String(f["id"])} className="flex items-center gap-2 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{nomeParc(parceiroById.get(String(f["fornecedor_id"])))}</div>
                    <div className="text-muted-foreground text-xs">
                      Código {String(f["codigo_envio"] ?? "—")} · {f["respondido"] ? <span className="text-success font-medium">respondido</span> : "aguardando"}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => exportar(f)}><Download className="mr-1 h-4 w-4" />CSV</Button>
                  {editavel && <Button size="icon" variant="ghost" aria-label="Remover fornecedor" onClick={() => removerForn(f)}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-semibold">Comparativo de preços</h3>
            {editavel && <SearchSelect value={novoItem} onChange={addItem} options={itemOpts} placeholder="Adicionar item à cotação" />}
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-right">Qtd.</th>
                    {fornCot.map((f) => (
                      <th key={String(f["id"])} className="min-w-32 px-3 py-2 text-right">
                        {nomeParc(parceiroById.get(String(f["fornecedor_id"])))}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itensCot.map((it) => {
                    const item = itemById.get(String(it["item_id"]));
                    const best = analise.melhores.find((m) => m.cotacaoItem === it);
                    return (
                      <tr key={String(it["id"])} className="border-t">
                        <td className="px-3 py-2">
                          <div className="font-medium">{String(item?.["descricao"] ?? "Item")}</div>
                          {item?.["codigo"] ? <div className="text-muted-foreground text-xs">{String(item["codigo"])}</div> : null}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {editavel ? (
                            <div className="flex items-center justify-end gap-1">
                              <Input key={String(it["quantidade"])} defaultValue={formatQtd(it["quantidade"])} inputMode="decimal" aria-label="Quantidade" className="h-8 w-20 text-right" onBlur={(e) => salvarQtd(it, e.target.value)} />
                              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Remover item" onClick={() => removerItem(it)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          ) : formatQtd(it["quantidade"])}
                        </td>
                        {fornCot.map((f) => {
                          const fid = String(f["fornecedor_id"]);
                          const p = precoDe(String(it["id"]), fid);
                          const melhor = best?.fornecedorId === fid;
                          return (
                            <td key={fid} className={cn("px-2 py-1.5 text-right", melhor && "bg-success/15")}>
                              {editavel ? (
                                <Input
                                  key={String(p?.["preco_unitario"] ?? "")}
                                  defaultValue={p && num(p["preco_unitario"]) > 0 ? String(p["preco_unitario"]).replace(".", ",") : ""}
                                  placeholder="—"
                                  inputMode="decimal"
                                  aria-label="Preço unitário"
                                  className={cn("h-8 text-right tabular-nums", melhor && "border-success font-semibold")}
                                  onBlur={(e) => salvarPreco(it, f, e.target.value)}
                                />
                              ) : (
                                <span className={cn("tabular-nums", melhor && "text-success font-semibold")}>
                                  {p && num(p["preco_unitario"]) > 0 ? formatBRL(p["preco_unitario"]) : "—"}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
                {fornCot.length > 0 && (
                  <tfoot className="bg-muted/30 border-t font-semibold">
                    <tr>
                      <td className="px-3 py-2" colSpan={2}>Total por fornecedor</td>
                      {fornCot.map((f) => {
                        const fid = String(f["fornecedor_id"]);
                        const t = analise.totais.get(fid);
                        return (
                          <td key={fid} className={cn("px-3 py-2 text-right tabular-nums", analise.vencedor === fid && "text-success")}>
                            {t && t.total > 0 ? formatBRL(t.total) : "—"}
                            {t && !t.completo && t.total > 0 && <div className="text-warning text-xs font-normal">incompleto</div>}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border p-4">
                <div className="text-muted-foreground flex items-center gap-1 text-xs uppercase"><Trophy className="h-4 w-4" />Fornecedor único mais barato</div>
                <div className="mt-1 text-lg font-bold">{vencedorNome ?? "—"}</div>
                <div className="text-muted-foreground text-sm">{analise.vencedor ? formatBRL(analise.totais.get(analise.vencedor)!.total) : "Nenhum fornecedor cotou todos os itens"}</div>
              </div>
              <div className="border-success/50 bg-success/10 rounded-lg border p-4">
                <div className="text-muted-foreground text-xs uppercase">Melhor preço item a item</div>
                <div className="mt-1 text-lg font-bold">{formatBRL(analise.split)}</div>
                <div className="text-muted-foreground text-sm">
                  {analise.vencedor && analise.split < analise.totais.get(analise.vencedor)!.total
                    ? `Economia de ${formatBRL(analise.totais.get(analise.vencedor)!.total - analise.split)} dividindo a compra`
                    : `${analise.melhores.length} de ${itensCot.length} itens com preço`}
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          {editavel && (
            <Button
              disabled={aprovando || analise.melhores.length === 0}
              onClick={() => {
                if (analise.melhores.length < itensCot.length && !confirm("Alguns itens estão sem preço e ficarão sem custo no orçamento. Aprovar mesmo assim?")) return;
                onAprovar(analise.melhores);
              }}
            >
              {aprovando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Aprovar e gerar orçamento
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
