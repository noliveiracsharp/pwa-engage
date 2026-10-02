import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { text } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";

export function qrCodeUrl(inst: Row): string {
  const id = text(pick(inst, ["instance_id"]));
  const token = text(pick(inst, ["token"])) || text(pick(inst, ["client_token"]));
  return `https://api.z-api.io/instances/${id}/token/${token}/qr-code/image`;
}

export function QrCodeDialog({ instancia, onOpenChange }: { instancia: Row | null; onOpenChange: (o: boolean) => void }) {
  const [src, setSrc] = useState("");
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    if (!instancia) return;
    const url = `${qrCodeUrl(instancia)}?t=${Date.now()}`;
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      const ct = text(pick(instancia, ["client_token"]));
      if (ct) headers["Client-Token"] = ct;
      const r = await fetch(url, { headers });
      const type = r.headers.get("content-type") ?? "";
      if (type.includes("json")) {
        const j = (await r.json()) as { value?: string };
        setSrc(j.value ?? url);
      } else {
        setSrc(URL.createObjectURL(await r.blob()));
      }
    } catch {
      setSrc(url);
    } finally {
      setLoading(false);
    }
  }, [instancia]);

  useEffect(() => {
    if (instancia) void carregar();
    else setSrc("");
  }, [instancia, carregar]);

  return (
    <Dialog open={Boolean(instancia)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar WhatsApp</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-64 w-64 items-center justify-center rounded-md border bg-background p-2">
            {src ? <img src={src} alt="QR Code do WhatsApp" className="h-full w-full object-contain" /> : <span className="text-sm text-muted-foreground">Carregando…</span>}
          </div>
          <ol className="space-y-1 text-sm text-muted-foreground">
            <li>1. Abra o WhatsApp no seu celular.</li>
            <li>2. Toque em Aparelhos Conectados.</li>
            <li>3. Aponte a câmera para este QR Code.</li>
          </ol>
          <Button variant="outline" onClick={() => void carregar()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar QR Code
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
