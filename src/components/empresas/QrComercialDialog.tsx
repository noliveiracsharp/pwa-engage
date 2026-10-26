import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { text } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { linkDiretoComercial } from "@/lib/qr-direto";

/** Gera o QR Code que abre o WhatsApp e leva a conversa direto ao Comercial (sem robô). */
export function QrComercialDialog({ instancia, onClose }: { instancia: Row | null; onClose: () => void }) {
  const [mensagem, setMensagem] = useState("Olá! Gostaria de falar com o time Comercial.");
  const [img, setImg] = useState("");
  const telefone = instancia ? text(pick(instancia, ["telefone"])) : "";
  const link = useMemo(() => (telefone ? linkDiretoComercial(telefone, mensagem) : ""), [telefone, mensagem]);

  useEffect(() => {
    if (!link) { setImg(""); return; }
    void QRCode.toDataURL(link, { width: 512, margin: 2 }).then(setImg).catch(() => setImg(""));
  }, [link]);

  const baixar = () => {
    const a = document.createElement("a");
    a.href = img;
    a.download = "qrcode-comercial.png";
    a.click();
  };

  return (
    <Dialog open={Boolean(instancia)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>QR Code direto para o Comercial</DialogTitle></DialogHeader>
        {!telefone ? (
          <p className="text-sm text-muted-foreground">Cadastre o telefone desta instância para gerar o QR Code.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="space-y-1">
              <Label>Mensagem inicial do cliente</Label>
              <Input value={mensagem} maxLength={200} onChange={(e) => setMensagem(e.target.value)} />
            </div>
            <div className="mx-auto flex h-64 w-64 items-center justify-center rounded-md border bg-card p-2">
              {img && <img src={img} alt="QR Code para o Comercial" className="h-full w-full object-contain" />}
            </div>
            <p className="text-xs text-muted-foreground">
              Quem ler este QR Code fala direto com a equipe: o robô não responde e a conversa já entra como atendimento humano.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(link); toast.success("Link copiado."); }}>
                <Copy className="mr-2 h-4 w-4" /> Copiar link
              </Button>
              <Button onClick={baixar} disabled={!img}><Download className="mr-2 h-4 w-4" /> Baixar PNG</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
