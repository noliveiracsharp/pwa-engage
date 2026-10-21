import { useMemo, useRef, useState } from "react";
import { Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { baixarArquivo } from "@/lib/laudos";
import { formatCpfCnpj, digitsOnly } from "@/lib/input-masks";
import { COLUNAS_AUXILIARES, contatosDaLinha, lerCsvParceiros, modeloCsvParceiros, vinculoMatriz, type LinhaParceiro } from "@/lib/parceiros-importacao";
import type { Row } from "@/lib/row";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existentes: Row[];
  empresaId: unknown;
  stamp: (v: Row, novo: boolean) => Row;
};

export function ImportarParceirosDialog({ open, onOpenChange, existentes, empresaId, stamp }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [linhas, setLinhas] = useState<LinhaParceiro[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  const ler = async (f: File) => {
    const docs = new Set(existentes.map((r) => digitsOnly(String(r["documento"] ?? ""))).filter(Boolean));
    const ls = lerCsvParceiros(await f.text(), docs);
    if (!ls.length) { toast.error("Arquivo vazio ou fora do modelo."); return; }
    setLinhas(ls);
    setSel(new Set(ls.filter((l) => !l.erros.length).map((l) => l.linha)));
  };

  const idPorDoc = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of existentes) { const d = digitsOnly(String(r["documento"] ?? "")); if (d) m.set(d, String(r["id"])); }
    return m;
  }, [existentes]);
  const matrizes = useMemo(() => [...existentes]
    .filter((r) => r["is_cliente"] !== false || r["tipo_hierarquia"] === "matriz")
    .sort((a, b) => String(a["razao_social"] ?? "").localeCompare(String(b["razao_social"] ?? ""), "pt-BR")), [existentes]);
  const [matrizLote, setMatrizLote] = useState("");
  const [buscaMatriz, setBuscaMatriz] = useState("");
  const matrizesFiltradas = matrizes.filter((m) => !buscaMatriz || `${m["razao_social"] ?? ""} ${m["nome_fantasia"] ?? ""}`.toLowerCase().includes(buscaMatriz.toLowerCase())).slice(0, 50);

  const importar = async () => {
    const escolhidas = linhas.filter((l) => sel.has(l.linha) && !l.erros.length);
    const preparadas = escolhidas.map((l) => {
      const vin = vinculoMatriz(l.valores, idPorDoc, matrizLote || null);
      const base: Row = {};
      for (const [k, v] of Object.entries(l.valores)) if (!(COLUNAS_AUXILIARES as readonly string[]).includes(k)) base[k] = v;
      return { l, vin, row: stamp({ ...base, parceiro_pai_id: vin.parceiro_pai_id, tipo_hierarquia: vin.tipo_hierarquia, ...(empresaId ? { empresa_id: empresaId } : {}) }, true) };
    });
    const falhas = preparadas.filter((p) => p.vin.erro);
    if (falhas.length) { toast.error(`Linha(s) ${falhas.map((f) => f.l.linha).join(", ")}: administradora não encontrada.`); return; }
    if (!preparadas.length) return;
    setBusy(true);
    try {
      let semContatos = false;
      for (let i = 0; i < preparadas.length; i += 200) {
        const fatia = preparadas.slice(i, i + 200);
        const { data, error } = await supabase.from("parceiros").insert(fatia.map((p) => p.row) as never).select("id");
        if (error) throw error;
        const ids = (data ?? []) as { id: string }[];
        const contatos = fatia.flatMap((p, j) => ids[j] ? contatosDaLinha(p.l.valores).map((c) => ({ ...c, entidade: "parceiro", entidade_id: ids[j]!.id })) : []);
        if (contatos.length) {
          const { error: e2 } = await supabase.from("cadastro_contatos" as never).insert(contatos as never);
          if (e2) semContatos = true;
        }
      }
      toast.success(`${preparadas.length} parceiro(s) importado(s).`);
      if (semContatos) toast.warning("Alguns contatos não foram gravados na lista de contatos.");
      await qc.invalidateQueries();
      setLinhas([]); onOpenChange(false);
    } catch (e) {
      toast.error(`Falha ao importar: ${(e as Error).message}`);
    } finally { setBusy(false); }
  };

  const nomeMatriz = (l: LinhaParceiro) => {
    const vin = vinculoMatriz(l.valores, idPorDoc, matrizLote || null);
    if (vin.erro) return <Badge variant="destructive">{vin.erro}</Badge>;
    if (!vin.parceiro_pai_id) return "—";
    const m = existentes.find((r) => String(r["id"]) === vin.parceiro_pai_id);
    return String(m?.["nome_fantasia"] || m?.["razao_social"] || "—");
  };

  const validos = linhas.filter((l) => !l.erros.length).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setLinhas([]); onOpenChange(v); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Importar clientes e fornecedores (CSV)</DialogTitle>
          <DialogDescription>Baixe o modelo, preencha no Excel e salve como CSV. CNPJ/CPF já cadastrados são ignorados.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => baixarArquivo("modelo-parceiros.csv", modeloCsvParceiros())}><Download className="mr-1 h-4 w-4" />Baixar modelo</Button>
          <Button onClick={() => fileRef.current?.click()}><Upload className="mr-1 h-4 w-4" />Escolher arquivo CSV</Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void ler(f); e.target.value = ""; }} />
        </div>
        <div className="space-y-1 rounded border border-border p-3">
          <p className="text-sm font-medium">Vincular este lote a uma administradora / matriz (opcional)</p>
          <p className="text-xs text-muted-foreground">Ex.: escolha a GK para que todos os condomínios do arquivo entrem como clientes dela. A coluna "CNPJ da administradora / matriz" do arquivo, quando preenchida, vale mais que esta escolha.</p>
          <div className="flex flex-wrap gap-2">
            <Input className="max-w-xs" placeholder="Pesquisar administradora…" value={buscaMatriz} onChange={(e) => setBuscaMatriz(e.target.value)} />
            <Select value={matrizLote || "none"} onValueChange={(v) => setMatrizLote(v === "none" ? "" : v)}>
              <SelectTrigger className="max-w-sm"><SelectValue placeholder="Sem vínculo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem vínculo</SelectItem>
                {matrizLote && !matrizesFiltradas.some((m) => String(m["id"]) === matrizLote) && (
                  <SelectItem value={matrizLote}>{String(existentes.find((r) => String(r["id"]) === matrizLote)?.["razao_social"] ?? "—")}</SelectItem>
                )}
                {matrizesFiltradas.map((m) => <SelectItem key={String(m["id"])} value={String(m["id"])}>{String(m["razao_social"] ?? "—")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        {linhas.length > 0 && (
          <>
            <p className="text-sm text-muted-foreground">{linhas.length} linha(s) lida(s) · {validos} válida(s) · {sel.size} selecionada(s)</p>
            <div className="max-h-[50vh] overflow-auto rounded border border-border">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-8" /><TableHead>Linha</TableHead><TableHead>Nome</TableHead><TableHead>Documento</TableHead>
                  <TableHead>Tipo</TableHead><TableHead>Administradora</TableHead><TableHead>Cidade/UF</TableHead><TableHead>Situação</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {linhas.map((l) => (
                    <TableRow key={l.linha}>
                      <TableCell>
                        <Checkbox disabled={!!l.erros.length} checked={sel.has(l.linha)} onCheckedChange={(c) => {
                          const n = new Set(sel); if (c) n.add(l.linha); else n.delete(l.linha); setSel(n);
                        }} />
                      </TableCell>
                      <TableCell>{l.linha}</TableCell>
                      <TableCell>{String(l.valores["razao_social"] ?? "—")}</TableCell>
                      <TableCell>{formatCpfCnpj(String(l.valores["documento"] ?? "")) || "—"}</TableCell>
                      <TableCell>{[l.valores["is_cliente"] && "Cliente", l.valores["is_fornecedor"] && "Fornecedor"].filter(Boolean).join(" / ")}</TableCell>
                      <TableCell>{nomeMatriz(l)}</TableCell>
                      <TableCell>{[l.valores["cidade"], l.valores["uf"]].filter(Boolean).join("/") || "—"}</TableCell>
                      <TableCell>
                        {l.erros.length ? <Badge variant="destructive">{l.erros.join(", ")}</Badge>
                          : <Badge variant="outline">{l.avisos.length ? l.avisos.join(", ") : "OK"}</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={busy || !sel.size} onClick={importar}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Importar {sel.size} parceiro(s)</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
