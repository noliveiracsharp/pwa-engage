import { useEffect, useState } from "react";
import { Settings2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Resumo = { modo: "plataforma" | "propria"; provedor: string; modelo: string | null; tem_chave: boolean; final_chave: string | null };

/** Configuração de IA da empresa: IA do plano Atende.ai ou chave própria. */
export function IaConfigDialog() {
  const [aberto, setAberto] = useState(false);
  const [r, setR] = useState<Resumo | null>(null);
  const [propria, setPropria] = useState(false);
  const [provedor, setProvedor] = useState("openai");
  const [modelo, setModelo] = useState("");
  const [chave, setChave] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    void supabase.rpc("ia_config_resumo" as never).then(({ data, error }) => {
      if (error) { toast.error("Rode o script de IA por empresa no banco."); return; }
      const d = data as unknown as Resumo;
      setR(d); setPropria(d.modo === "propria"); setProvedor(d.provedor); setModelo(d.modelo ?? ""); setChave("");
    });
  }, [aberto]);

  const salvar = async () => {
    if (propria && !chave && !r?.tem_chave) { toast.error("Informe a chave de API."); return; }
    setSalvando(true);
    const { error } = await supabase.rpc("ia_config_salvar" as never, { _modo: propria ? "propria" : "plataforma", _provedor: provedor, _modelo: modelo, _chave: chave } as never);
    setSalvando(false);
    if (error) { toast.error("Não foi possível salvar."); return; }
    toast.success("Configuração de IA salva.");
    setAberto(false);
  };

  const remover = async () => {
    const { error } = await supabase.rpc("ia_config_remover_chave" as never);
    if (error) { toast.error("Não foi possível remover."); return; }
    toast.success("Chave removida. Voltando a usar a IA do plano.");
    setAberto(false);
  };

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" title="Configurações da IA"><Settings2 className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Configurações da IA</DialogTitle></DialogHeader>
        {!r ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Usar chave própria da empresa</p>
                <p className="text-xs text-muted-foreground">Desligado: usa a IA incluída no seu plano Atende.ai, com limite mensal.</p>
              </div>
              <Switch checked={propria} onCheckedChange={setPropria} />
            </div>
            {propria && (
              <>
                <div className="space-y-1">
                  <Label>Provedor</Label>
                  <Select value={provedor} onValueChange={setProvedor}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                      <SelectItem value="gemini">Google Gemini</SelectItem>
                      <SelectItem value="openai">OpenAI (ChatGPT)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Modelo (opcional)</Label>
                  <Input value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Deixe vazio para o padrão" />
                </div>
                <div className="space-y-1">
                  <Label>Chave de API</Label>
                  <Input type="password" autoComplete="off" value={chave} onChange={(e) => setChave(e.target.value)}
                    placeholder={r.tem_chave ? `Chave salva terminando em ${r.final_chave} — deixe vazio para manter` : "Cole a chave aqui"} />
                  <p className="text-xs text-muted-foreground">O consumo é cobrado direto na sua conta do provedor.</p>
                </div>
              </>
            )}
          </div>
        )}
        <DialogFooter className="gap-2">
          {r?.tem_chave && <Button variant="ghost" onClick={remover}>Remover chave</Button>}
          <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || !r}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
