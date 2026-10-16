import { useMemo, useState } from "react";
import { Copy, Download, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { pick, type Row } from "@/lib/row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { baixarArquivo, CAMPOS_FISCAIS, gerarCsvFiscal, type ItemFiscal } from "@/lib/itens-fiscal";

const semFiscal = (r: Row) => String(r["tipo"] ?? "").startsWith("Serviço") ? !r["lc116"] : !r["ncm"] || !r["cfop_padrao"];

/** Gera link público (ou CSV) para o contador preencher os dados fiscais. */
export function FiscalContadorDialog({ open, onOpenChange, itens }: { open: boolean; onOpenChange: (o: boolean) => void; itens: Row[] }) {
  const { usuario } = useAuth();
  const empresaId = String(pick(usuario, ["empresa_id", "id_empresa"]) ?? "");
  const [soPendentes, setSoPendentes] = useState(true);
  const [link, setLink] = useState("");
  const [gerando, setGerando] = useState(false);
  const lista = useMemo(() => itens.filter((r) => r["status"] !== false && (!soPendentes || semFiscal(r))), [itens, soPendentes]);

  const gerar = async () => {
    if (!lista.length) { toast.error("Nenhum item para enviar."); return; }
    setGerando(true);
    const { data, error } = await (supabase.from("itens_fiscal_links" as never) as unknown as ReturnType<typeof supabase.from>)
      .insert({ empresa_id: empresaId, itens: lista.map((r) => String(r["id"])) } as never).select("token").single();
    setGerando(false);
    if (error) { toast.error(error.message); return; }
    setLink(`${window.location.origin}/fiscal/${String((data as Row)["token"])}`);
  };

  const csv = () => {
    const linhas = lista.map((r) => ({
      id: String(r["id"]), codigo: String(r["codigo"] ?? ""), descricao: String(r["descricao"] ?? ""), tipo: String(r["tipo"] ?? ""),
      ...Object.fromEntries(CAMPOS_FISCAIS.map((c) => [c.key, r[c.key] == null ? "" : String(r[c.key])])),
    }) as ItemFiscal);
    baixarArquivo("itens-fiscal.csv", gerarCsvFiscal(linhas));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setLink(""); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Dados fiscais pelo contador</DialogTitle>
          <DialogDescription>Envie um link para o contador preencher NCM, CEST, CFOP e demais dados direto no sistema. Vale por 30 dias.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <Label htmlFor="so-pend">Só itens sem dados fiscais</Label>
          <Switch id="so-pend" checked={soPendentes} onCheckedChange={(v) => { setSoPendentes(v); setLink(""); }} />
        </div>
        <p className="text-sm text-muted-foreground">{lista.length} item(ns) serão incluídos.</p>
        {link ? (
          <div className="flex gap-2">
            <Input readOnly value={link} onFocus={(e) => e.target.select()} />
            <Button size="icon" variant="outline" aria-label="Copiar link" onClick={() => { void navigator.clipboard.writeText(link); toast.success("Link copiado."); }}><Copy className="h-4 w-4" /></Button>
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={csv} disabled={!lista.length}><Download className="mr-1 h-4 w-4" /> Baixar CSV</Button>
          <Button onClick={() => void gerar()} disabled={gerando || !lista.length}>{gerando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Link2 className="mr-1 h-4 w-4" />} Gerar link</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
