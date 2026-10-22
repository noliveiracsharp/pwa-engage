import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { MODELOS, textoModelo, useModelosMensagem } from "@/lib/mensagens-modelos";

/** Tela para editar os textos que o WhatsApp envia automaticamente, por empresa. */
export function ModelosMensagemButton({ empresaId }: { empresaId: string | number | undefined }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: salvos = [] } = useModelosMensagem(empresaId);
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) setTextos(Object.fromEntries(MODELOS.map((m) => [m.chave, textoModelo(salvos, m.chave)])));
  }, [open, salvos]);

  const salvar = async () => {
    setSalvando(true);
    const payload = MODELOS.map((m) => ({ empresa_id: String(empresaId), chave: m.chave, texto: textos[m.chave] ?? m.padrao }));
    const { error } = await supabase.from("mensagens_modelos" as never).upsert(payload as never, { onConflict: "empresa_id,chave" });
    setSalvando(false);
    if (error) return void toast.error("Não foi possível salvar. Rode o script atendeai-cotacao-projeto-mensagens.sql no banco.");
    qc.invalidateQueries({ queryKey: ["mensagens_modelos"] });
    toast.success("Textos salvos.");
    setOpen(false);
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}><MessageSquareText className="mr-1 h-4 w-4" />Textos do WhatsApp</Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col gap-0 p-0">
          <SheetHeader className="border-b px-6 py-4"><SheetTitle>Textos enviados pelo WhatsApp</SheetTitle></SheetHeader>
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
            {MODELOS.map((m) => (
              <div key={m.chave} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>{m.nome}</Label>
                  <Button variant="ghost" size="sm" onClick={() => setTextos({ ...textos, [m.chave]: m.padrao })}>Restaurar padrão</Button>
                </div>
                <Textarea rows={14} value={textos[m.chave] ?? ""} onChange={(e) => setTextos({ ...textos, [m.chave]: e.target.value })} />
                <p className="text-muted-foreground text-xs">
                  Variáveis: {m.variaveis.map((v) => `{${v}}`).join(", ")}. Para negrito, use *texto*.
                </p>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 border-t px-6 py-3">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
