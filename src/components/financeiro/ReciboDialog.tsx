import { useState } from "react";
import { Link2, Printer, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useAudit } from "@/lib/audit";
import { text } from "@/lib/crud";
import { formatCpfCnpj } from "@/lib/input-masks";
import { formatBRL, formatDate, num } from "@/lib/orcamentos";
import { linkAssinaturaDoc, novoTokenDoc } from "@/lib/documentos";
import { valorPorExtenso } from "@/lib/recibo";
import { imprimirDocumento } from "@/components/documentos/DocumentosPainel";
import type { Row } from "@/lib/row";

const db = supabase as any;

export function ReciboDialog({ tipo, titulo, parceiro, onClose }: { tipo: "pagar" | "receber"; titulo: Row; parceiro?: Row | undefined; onClose: () => void }) {
  const { empresa, usuario } = useAuth() as { empresa: Row | null; usuario: Row | null };
  const { stamp } = useAudit();
  const [link, setLink] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const valor = num(titulo["valor_pago"]) || num(titulo["valor"]);
  const nomeParc = text(parceiro?.["razao_social"] || parceiro?.["nome_fantasia"]) || "—";
  const docParc = parceiro?.["documento"] ? `, CPF/CNPJ ${formatCpfCnpj(text(parceiro["documento"]))}` : "";
  const nomeEmp = text(empresa?.["razao_social"] || empresa?.["nome"] || empresa?.["nome_fantasia"]) || "nossa empresa";
  const data = formatDate(titulo["pago_em"] || titulo["vencimento"]);
  const corpo = tipo === "receber"
    ? `Recebemos de ${nomeParc}${docParc} a importância de ${formatBRL(valor)} (${valorPorExtenso(valor)}), referente a ${text(titulo["descricao"])}.\n\nPara clareza, firmamos o presente recibo dando plena quitação do valor acima.\n\nData do pagamento: ${data}`
    : `Eu/Nós, ${nomeParc}${docParc}, declaro(amos) ter recebido de ${nomeEmp} a importância de ${formatBRL(valor)} (${valorPorExtenso(valor)}), referente a ${text(titulo["descricao"])}.\n\nPara clareza, firmo(amos) o presente recibo dando plena quitação do valor acima.\n\nData do pagamento: ${data}`;
  const doc: Row = {
    titulo: `Recibo — ${text(titulo["descricao"])}`, entidade_tipo: "parceiro", entidade_id: text(titulo["parceiro_id"]),
    entidade_nome: nomeParc, conteudo: corpo, status: "emitido", dt_emissao: new Date().toISOString().slice(0, 10),
  };

  const assinatura = async () => {
    if (!titulo["parceiro_id"]) return void toast.error("Este lançamento não tem cliente/fornecedor.");
    setSalvando(true);
    const token = novoTokenDoc();
    const { error } = await db.from("documentos").insert(stamp({ ...doc, status: "enviado", exige_assinatura_digital: true, token_publico: token }, true));
    setSalvando(false);
    if (error) return void toast.error("Não foi possível gerar o recibo", { description: error.message });
    setLink(linkAssinaturaDoc(window.location.origin, token));
    toast.success("Recibo salvo em Documentos e pronto para assinatura.");
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Recibo</DialogTitle></DialogHeader>
        <pre className="bg-muted max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg p-3 font-sans text-sm">{corpo}</pre>
        {link && (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">Link de assinatura eletrônica</p>
            <p className="text-muted-foreground break-all text-xs">{link}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(link); toast.success("Link copiado."); }}><Link2 className="mr-1 h-4 w-4" />Copiar link</Button>
              <Button size="sm" variant="outline" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Olá! Segue o recibo para assinatura eletrônica: ${link}`)}`, "_blank")}><Send className="mr-1 h-4 w-4" />Enviar por WhatsApp</Button>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => imprimirDocumento(doc, empresa, usuario)}><Printer className="mr-1 h-4 w-4" />Imprimir / PDF</Button>
          {!link && <Button disabled={salvando} onClick={() => void assinatura()}><Send className="mr-1 h-4 w-4" />{salvando ? "Gerando…" : "Enviar para assinatura"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
