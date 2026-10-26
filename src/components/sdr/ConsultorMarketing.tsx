import { useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { sugerirMarketing } from "@/lib/marketing-consultor.functions";

const TIPOS = [
  { value: "ads", label: "Anúncios (Google e Meta Ads)" },
  { value: "email", label: "E-mail marketing (4 pautas)" },
  { value: "social", label: "Redes sociais (2 semanas)" },
] as const;

export function ConsultorMarketing({ empresa }: { empresa: string }) {
  const [tipo, setTipo] = useState<"email" | "social" | "ads">("email");
  const [negocio, setNegocio] = useState("");
  const [publico, setPublico] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function gerar() {
    if (negocio.trim().length < 3 || publico.trim().length < 3) { toast.error("Descreva o que você vende e o público-alvo."); return; }
    setCarregando(true);
    const { data } = await supabase.auth.getSession();
    const r = await sugerirMarketing({ data: { tipo, empresa, negocio, publico, objetivo, token: data.session?.access_token ?? "" } });
    setCarregando(false);
    if (r.erro) { toast.error(r.erro); return; }
    setTexto(r.texto);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <Label>O que você vende</Label>
          <Textarea rows={2} placeholder="Ex.: CFTV, controle de acesso e portaria remota com contrato mensal" value={negocio} onChange={(e) => setNegocio(e.target.value)} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Público-alvo</Label>
          <Textarea rows={2} placeholder="Ex.: síndicos e administradoras de condomínios em Campinas" value={publico} onChange={(e) => setPublico(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Objetivo (opcional)</Label>
          <Input placeholder="Ex.: agendar visitas técnicas" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>O que sugerir</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2 flex justify-end">
          <Button onClick={gerar} disabled={carregando}>
            {carregando ? <Loader2 className="size-4 animate-spin" /> : <Megaphone className="size-4" />} {carregando ? "Gerando…" : "Gerar sugestões"}
          </Button>
        </div>
      </div>
      {texto && (
        <div className="space-y-1 rounded-lg border bg-card p-4 text-sm">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(texto); toast.success("Copiado."); }}><Copy className="size-4" /> Copiar</Button>
          </div>
          {texto.split("\n").map((l, i) =>
            /^#{1,3} /.test(l) ? <p key={i} className="pt-2 font-semibold text-foreground">{l.replace(/^#{1,3} /, "")}</p>
              : <p key={i} className="whitespace-pre-wrap text-muted-foreground">{l.replace(/\*\*(.+?)\*\*/g, "$1")}</p>,
          )}
        </div>
      )}
    </div>
  );
}
