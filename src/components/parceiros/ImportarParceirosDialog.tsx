import { useRef, useState } from "react";
import { Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { baixarArquivo } from "@/lib/laudos";
import { formatCpfCnpj, digitsOnly } from "@/lib/input-masks";
import { lerCsvParceiros, modeloCsvParceiros, type LinhaParceiro } from "@/lib/parceiros-importacao";
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

  const importar = async () => {
    const lote = linhas.filter((l) => sel.has(l.linha) && !l.erros.length)
      .map((l) => stamp({ ...l.valores, ...(empresaId ? { empresa_id: empresaId } : {}) }, true));
    if (!lote.length) return;
    setBusy(true);
    try {
      for (let i = 0; i < lote.length; i += 200) {
        const { error } = await supabase.from("parceiros").insert(lote.slice(i, i + 200) as never);
        if (error) throw error;
      }
      toast.success(`${lote.length} parceiro(s) importado(s).`);
      await qc.invalidateQueries();
      setLinhas([]); onOpenChange(false);
    } catch (e) {
      toast.error(`Falha ao importar: ${(e as Error).message}`);
    } finally { setBusy(false); }
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
        {linhas.length > 0 && (
          <>
            <p className="text-sm text-muted-foreground">{linhas.length} linha(s) lida(s) · {validos} válida(s) · {sel.size} selecionada(s)</p>
            <div className="max-h-[50vh] overflow-auto rounded border border-border">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-8" /><TableHead>Linha</TableHead><TableHead>Nome</TableHead><TableHead>Documento</TableHead>
                  <TableHead>Tipo</TableHead><TableHead>Cidade/UF</TableHead><TableHead>Situação</TableHead>
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
