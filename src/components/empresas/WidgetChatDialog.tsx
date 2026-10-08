import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Row } from "@/lib/row";
import { WIDGET_ICONES, svgIcone } from "@/lib/widget-icones";

type Cfg = { titulo: string; boas_vindas: string; cor: string; posicao: "direita" | "esquerda"; pedir_telefone: boolean; icone: string; imagem: string };
const PADRAO: Cfg = { titulo: "Fale conosco", boas_vindas: "Olá! Como podemos ajudar?", cor: "#0ea5e9", posicao: "direita", pedir_telefone: true, icone: "chat", imagem: "" };
const fgDe = (hex: string) => {
  const h = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(h)) return "#ffffff";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return ((r ?? 0) * 299 + (g ?? 0) * 587 + (b ?? 0) * 114) / 1000 > 170 ? "#0f172a" : "#ffffff";
};

export function WidgetChatDialog({ instancia, onClose }: { instancia: Row | null; onClose: () => void }) {
  const [cfg, setCfg] = useState<Cfg>(PADRAO);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (instancia) setCfg({ ...PADRAO, ...((instancia["widget_config"] as Partial<Cfg>) ?? {}) });
  }, [instancia]);

  if (!instancia) return null;
  const id = String(instancia["id"]);
  const origem = typeof window !== "undefined" ? window.location.origin : "";
  const img = cfg.imagem.trim().replace(/"/g, "");
  const script = `<script src="${origem}/atendeai-widget.js" data-instancia="${id}" data-cor="${cfg.cor}" data-posicao="${cfg.posicao}" data-icone="${cfg.icone}"${img ? ` data-imagem="${img}"` : ""} async></script>`;
  const fg = fgDe(cfg.cor);

  async function salvar() {
    setSalvando(true);
    const { error } = await supabase.from("empresas_instancias").update({ widget_config: cfg } as never).eq("id", id as never);
    setSalvando(false);
    if (error) toast.error(`Não foi possível salvar: ${error.message}. Aplique o script atendeai-widget-chat.sql.`);
    else toast.success("Widget salvo.");
  }

  const set = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setCfg((c) => ({ ...c, [k]: v }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Widget de chat para site — {String(instancia["nome"] ?? "")}</DialogTitle></DialogHeader>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <div><Label>Título</Label><Input value={cfg.titulo} onChange={(e) => set("titulo", e.target.value)} /></div>
            <div><Label>Mensagem de boas-vindas</Label><Textarea value={cfg.boas_vindas} onChange={(e) => set("boas_vindas", e.target.value)} /></div>
            <div className="flex gap-3">
              <div><Label>Cor</Label><Input type="color" className="h-10 w-20 p-1" value={cfg.cor} onChange={(e) => set("cor", e.target.value)} /></div>
              <div className="flex-1"><Label>Posição</Label>
                <Select value={cfg.posicao} onValueChange={(v) => set("posicao", v as Cfg["posicao"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="direita">Canto direito</SelectItem><SelectItem value="esquerda">Canto esquerdo</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between"><Label>Pedir telefone do visitante</Label><Switch checked={cfg.pedir_telefone} onCheckedChange={(v) => set("pedir_telefone", v)} /></div>
            <div>
              <Label>Ícone do botão</Label>
              <div className="mt-1 grid grid-cols-6 gap-2">
                {Object.entries(WIDGET_ICONES).map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    title={v.nome}
                    aria-label={v.nome}
                    onClick={() => setCfg((c) => ({ ...c, icone: k, imagem: "" }))}
                    className={`flex h-11 items-center justify-center rounded-lg border-2 p-2 transition ${!img && cfg.icone === k ? "border-ring" : "border-transparent"}`}
                    style={{ background: cfg.cor }}
                    dangerouslySetInnerHTML={{ __html: svgIcone(k, fg, 22) }}
                  />
                ))}
              </div>
            </div>
            <div>
              <Label>Ou use sua logo/foto (endereço da imagem)</Label>
              <Input placeholder="https://seusite.com/logo.png" value={cfg.imagem} onChange={(e) => set("imagem", e.target.value)} />
            </div>
            <div>
              <Label>Script para colar antes de &lt;/body&gt; no site</Label>
              <Textarea readOnly rows={4} className="font-mono text-xs" value={script} />
              <Button variant="outline" size="sm" className="mt-2" onClick={() => { void navigator.clipboard.writeText(script); toast.success("Script copiado."); }}>
                <Copy className="mr-1 h-4 w-4" /> Copiar script
              </Button>
            </div>
            <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-semibold text-foreground">Usuário já logado no seu sistema?</p>
              <p>Inclua no script <code>data-nome</code>, <code>data-telefone</code> e <code>data-email</code>, ou chame depois do login:</p>
              <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 font-mono">{`window.AtendeAI.identify({ nome: "Carlos", telefone: "11999998888", email: "carlos@empresa.com" })`}</pre>
              <p className="mt-1">Com nome e telefone/e-mail o chat abre direto; sem dados, pede nome e e-mail.</p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-muted p-3">
            <p className="mb-2 text-xs text-muted-foreground">Pré-visualização</p>
            <div className="overflow-hidden rounded-xl border border-border bg-background shadow">
              <div className="px-3 py-2" style={{ background: cfg.cor, color: fg }}>
                <p className="text-sm font-semibold">{cfg.titulo}</p>
              </div>
              <div className="space-y-2 p-3">
                <p className="rounded-lg bg-muted p-2 text-sm">{cfg.boas_vindas}</p>
                <div className="rounded-md border border-input px-2 py-1 text-xs text-muted-foreground">Seu nome</div>
                <div className="rounded-md border border-input px-2 py-1 text-xs text-muted-foreground">Seu e-mail</div>
                {cfg.pedir_telefone && <div className="rounded-md border border-input px-2 py-1 text-xs text-muted-foreground">WhatsApp com DDD</div>}
              </div>
            </div>
            <div className={`mt-3 flex ${cfg.posicao === "esquerda" ? "justify-start" : "justify-end"}`}>
              {img ? (
                <img src={img} alt="Ícone do chat" className="h-12 w-12 rounded-full object-cover shadow" style={{ background: cfg.cor }} />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full shadow" style={{ background: cfg.cor }} dangerouslySetInnerHTML={{ __html: svgIcone(cfg.icone, fg, 24) }} />
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void salvar()} disabled={salvando}>Salvar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
