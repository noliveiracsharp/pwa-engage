import { useEffect, useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { useAudit } from "@/lib/audit";

/** Mostra o endereço para sites e anúncios enviarem leads direto para as Ofertas. */
export function CaptacaoLeadsDialog({ open, onOpenChange, canEdit }: { open: boolean; onOpenChange: (o: boolean) => void; canEdit: boolean }) {
  const { empresaId } = useAudit();
  const [chave, setChave] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!open || !empresaId) return;
    void supabase.from("empresas").select("leads_chave").eq("id", String(empresaId)).maybeSingle()
      .then(({ data }) => setChave(((data as Record<string, unknown> | null)?.["leads_chave"] as string) ?? null));
  }, [open, empresaId]);

  const url = chave && typeof window !== "undefined" ? `${window.location.origin}/api/public/leads?k=${chave}` : "";
  const exemplo = url
    ? `<form action="${url}" method="POST">\n  <input name="nome" required>\n  <input name="email" type="email">\n  <input name="telefone">\n  <input type="hidden" name="origem" value="Site">\n  <textarea name="mensagem"></textarea>\n  <button>Enviar</button>\n</form>`
    : "";

  const gerar = async () => {
    if (chave && !(await confirmar({ title: "Trocar a chave?", description: "Formulários com o endereço antigo deixam de funcionar." }))) return;
    setCarregando(true);
    const { data, error } = await supabase.rpc("crm_gerar_chave_leads" as never, { p_empresa_id: empresaId } as never);
    setCarregando(false);
    if (error) { toast.error("Rode o script atendeai-crm-captacao-leads.sql antes."); return; }
    setChave(String(data));
    toast.success("Endereço gerado.");
  };

  const copiar = (t: string) => { void navigator.clipboard.writeText(t); toast.success("Copiado."); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Captação de leads</DialogTitle>
          <DialogDescription>
            Cada lead enviado pelo site, formulário ou anúncio vira uma Oferta "Em andamento", com o cliente cadastrado,
            um vendedor sorteado (roleta) e uma ligação agendada para 1 hora depois.
          </DialogDescription>
        </DialogHeader>
        {url ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input readOnly value={url} />
              <Button variant="outline" onClick={() => copiar(url)} aria-label="Copiar endereço"><Copy className="h-4 w-4" /></Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Campos aceitos: nome (obrigatório), email ou telefone, empresa, origem e mensagem. Funciona com formulário comum,
              Elementor, Typeform, RD Station, Zapier/Make ou JSON.
            </p>
            <Textarea readOnly rows={8} value={exemplo} className="font-mono text-xs" />
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => copiar(exemplo)}><Copy className="mr-2 h-4 w-4" />Copiar exemplo</Button>
              {canEdit && <Button variant="ghost" onClick={gerar} disabled={carregando}><KeyRound className="mr-2 h-4 w-4" />Trocar chave</Button>}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Ainda não há um endereço de captação para esta empresa.</p>
            {canEdit && <Button onClick={gerar} disabled={carregando}><KeyRound className="mr-2 h-4 w-4" />Gerar endereço</Button>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
