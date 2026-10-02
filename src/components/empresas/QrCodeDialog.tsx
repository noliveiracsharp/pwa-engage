import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { buscarQrCode } from "@/lib/zapi.functions";
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

export function QrCodeDialog({
  instancia,
  onOpenChange,
  onConnected,
}: {
  instancia: Row | null;
  onOpenChange: (o: boolean) => void;
  onConnected?: (inst: Row) => void | Promise<void>;
}) {
  const [src, setSrc] = useState("");
  const [aviso, setAviso] = useState("");
  const [loading, setLoading] = useState(false);
  const buscar = useServerFn(buscarQrCode);

  const carregar = useCallback(async (silencioso = false) => {
    if (!instancia) return;
    const instanceId = text(pick(instancia, ["instance_id"]));
    const clientToken = text(pick(instancia, ["client_token"]));
    const token = text(pick(instancia, ["token"])) || clientToken;
    if (!silencioso) {
      setLoading(true);
      setAviso("");
    }
    try {
      const r = await buscar({ data: { instanceId, token, clientToken: clientToken || undefined } });
      if (r.status === "qr") setSrc(r.image);
      else if (r.status === "connected") {
        setSrc("");
        setAviso("Esta instância já está conectada ao WhatsApp!");
        await onConnected?.(instancia);
      } else if (!silencioso) {
        setSrc("");
        setAviso(`Não foi possível gerar o QR Code: ${r.message}. Verifique o ID e o Token da instância.`);
      }
    } catch (e) {
      if (!silencioso) {
        setSrc("");
        setAviso(e instanceof Error ? e.message : "Erro ao buscar o QR Code.");
      }
    } finally {
      if (!silencioso) setLoading(false);
    }
  }, [instancia, buscar, onConnected]);

  useEffect(() => {
    if (instancia) void carregar();
    else {
      setSrc("");
      setAviso("");
    }
  }, [instancia, carregar]);

  // Enquanto o QR estiver na tela, verifica a cada 5s se o celular já conectou.
  useEffect(() => {
    if (!instancia || !src) return;
    const t = window.setInterval(() => void carregar(true), 5000);
    return () => window.clearInterval(t);
  }, [instancia, src, carregar]);

  return (
    <Dialog open={Boolean(instancia)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar WhatsApp</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-64 w-64 items-center justify-center rounded-md border bg-background p-2 text-center">
            {loading ? (
              <span className="text-sm text-muted-foreground">Carregando…</span>
            ) : src ? (
              <img src={src} alt="QR Code do WhatsApp" className="h-full w-full object-contain" />
            ) : (
              <span className="text-sm text-muted-foreground">{aviso}</span>
            )}
          </div>
          <ol className="space-y-1 text-sm text-muted-foreground">
            <li>1. Abra o WhatsApp.</li>
            <li>2. Aparelhos Conectados.</li>
            <li>3. Aponte a câmera para este QR Code.</li>
          </ol>
          <Button variant="outline" onClick={() => void carregar(false)} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar QR Code
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
