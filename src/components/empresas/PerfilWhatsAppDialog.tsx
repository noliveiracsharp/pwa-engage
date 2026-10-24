import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { atualizarPerfilZapi } from "@/lib/zapi.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhotoUpload } from "@/components/data-table/PhotoUpload";
import { text } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";

/** Edita o nome, o recado e a foto do WhatsApp conectado (Z-API). */
export function PerfilWhatsAppDialog({ instancia, onClose }: { instancia: Row | null; onClose: () => void }) {
  const [nome, setNome] = useState("");
  const [recado, setRecado] = useState("");
  const [foto, setFoto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const atualizar = useServerFn(atualizarPerfilZapi);

  useEffect(() => {
    setNome(instancia ? text(pick(instancia, ["nome"])).slice(0, 25) : "");
    setRecado("");
    setFoto("");
  }, [instancia]);

  const salvar = async () => {
    if (!instancia) return;
    if (!nome.trim() && !recado.trim() && !foto) {
      toast.error("Preencha ao menos um campo.");
      return;
    }
    const clientToken = text(pick(instancia, ["client_token"]));
    const token = text(pick(instancia, ["token"])) || clientToken;
    setSalvando(true);
    try {
      const r = await atualizar({
        data: {
          instanceId: text(pick(instancia, ["instance_id"])),
          token,
          clientToken: clientToken || undefined,
          nome: nome.trim() || undefined,
          recado: recado.trim() || undefined,
          fotoUrl: foto || undefined,
        },
      });
      if (r.ok) {
        toast.success("Perfil do WhatsApp atualizado.");
        onClose();
      } else toast.error(`A Z-API recusou: ${r.falhas.join(" · ")}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar o perfil.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={Boolean(instancia)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Perfil do WhatsApp</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Foto do perfil</Label>
            <PhotoUpload value={foto} onChange={setFoto} alt="Foto do WhatsApp" />
          </div>
          <div className="space-y-1">
            <Label>Nome de exibição (até 25 caracteres)</Label>
            <Input value={nome} maxLength={25} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Recado (até 139 caracteres)</Label>
            <Input value={recado} maxLength={139} onChange={(e) => setRecado(e.target.value)} placeholder="Ex.: Atendimento de seg. a sex., 8h às 18h" />
          </div>
          <p className="text-xs text-muted-foreground">Somente os campos preenchidos são alterados. Nome de exibição só pode ser trocado em contas WhatsApp Business.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
