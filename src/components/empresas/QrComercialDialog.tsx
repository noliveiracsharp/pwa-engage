import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { text, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { linkAcessoKanban, tagDoKanban } from "@/lib/qr-direto";

/** QR Code de acesso: abre o WhatsApp com "#kanban" e a conversa pula o robô direto para o Kanban escolhido. */
export function QrComercialDialog({ instancia, onClose }: { instancia: Row | null; onClose: () => void }) {
  const { data: kanbans = [] } = useTableRows("kanban_nome");
  const opcoes = useMemo(
    () => kanbans
      .filter((k) => k["status"] !== false && text(k["nome"]))
      .map((k) => ({ id: text(k["id"]), nome: text(k["nome"]) }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [kanbans],
  );
  const [kanbanId, setKanbanId] = useState("");
  const kanban = opcoes.find((o) => o.id === kanbanId) ?? null;
  const [mensagem, setMensagem] = useState("Olá! Gostaria de atendimento.");
  const [img, setImg] = useState("");
  const telefone = instancia ? text(pick(instancia, ["telefone"])) : "";
  const link = useMemo(
    () => (telefone && kanban ? linkAcessoKanban(telefone, mensagem, kanban.nome) : ""),
    [telefone, mensagem, kanban],
  );

  useEffect(() => {
    if (!link) { setImg(""); return; }
    void QRCode.toDataURL(link, { width: 512, margin: 2 }).then(setImg).catch(() => setImg(""));
  }, [link]);

  const baixar = () => {
    const a = document.createElement("a");
    a.href = img;
    a.download = `qrcode-${kanban ? tagDoKanban(kanban.nome) : "acesso"}.png`;
    a.click();
  };

  return (
    <Dialog open={Boolean(instancia)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>QR Code de acesso</DialogTitle></DialogHeader>
        {!telefone ? (
          <p className="text-sm text-muted-foreground">Cadastre o telefone desta instância para gerar o QR Code.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="space-y-1">
              <Label>Kanban de destino</Label>
              <Select value={kanbanId} onValueChange={setKanbanId}>
                <SelectTrigger><SelectValue placeholder="Escolha o Kanban" /></SelectTrigger>
                <SelectContent>
                  {opcoes.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              {kanban && <p className="text-xs text-muted-foreground">Atalho: <b>#{tagDoKanban(kanban.nome)}</b> — o cliente também pode digitar isso na primeira mensagem.</p>}
            </div>
            <div className="space-y-1">
              <Label>Mensagem inicial do cliente</Label>
              <Input value={mensagem} maxLength={200} onChange={(e) => setMensagem(e.target.value)} />
            </div>
            <div className="mx-auto flex h-64 w-64 items-center justify-center rounded-md border bg-card p-2">
              {img ? <img src={img} alt="QR Code de acesso" className="h-full w-full object-contain" />
                : <span className="text-center text-xs text-muted-foreground">Escolha o Kanban para gerar</span>}
            </div>
            <p className="text-xs text-muted-foreground">
              Quem ler este QR Code entra direto no Kanban escolhido, pulando o menu inicial e seguindo o fluxo configurado.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={!link} onClick={() => { void navigator.clipboard.writeText(link); toast.success("Link copiado."); }}>
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
