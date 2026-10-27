import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Copy, Loader2, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sincronizarWebhooksZapi } from "@/lib/zapi.functions";

type Row = Record<string, unknown>;
type Evento = "update-webhook-received" | "update-webhook-message-status" | "update-webhook-disconnected" | "update-webhook-connected" | "update-webhook-chat-presence";

const EVENTOS: Array<{ id: Evento; nome: string; desc: string }> = [
  { id: "update-webhook-received", nome: "Ao receber mensagem", desc: "Cria o contato, abre o atendimento, grava a mensagem e aciona os fluxos." },
  { id: "update-webhook-message-status", nome: "Status da mensagem", desc: "Mostra os tracinhos: ✓ enviado, ✓✓ entregue e ✓✓ azul quando o cliente lê." },
  { id: "update-webhook-chat-presence", nome: "Digitando", desc: "Mostra quando o cliente está digitando ou gravando áudio." },
  { id: "update-webhook-connected", nome: "Ao conectar", desc: "Aviso de que o WhatsApp voltou a ficar online." },
  { id: "update-webhook-disconnected", nome: "Ao desconectar", desc: "Aviso de que o celular caiu ou foi desconectado." },
];

const EXEMPLOS: Record<string, object> = {
  texto: { type: "ReceivedCallback", phone: "5511999998888", fromMe: false, isGroup: false, senderName: "Maria Silva", messageId: "3EB0A1B2C3", senderPhoto: "https://...", text: { message: "Olá, gostaria de um orçamento" } },
  imagem: { type: "ReceivedCallback", phone: "5511999998888", fromMe: false, messageId: "3EB0D4E5F6", image: { imageUrl: "https://...", caption: "Foto do equipamento" } },
  audio: { type: "ReceivedCallback", phone: "5511999998888", fromMe: false, messageId: "3EB0G7H8I9", audio: { audioUrl: "https://..." } },
  status: { type: "MessageStatusCallback", status: "READ", ids: ["3EB0A1B2C3"], phone: "5511999998888" },
};

const s = (v: unknown) => (v == null ? "" : String(v));

export function WebhookDetalhesDialog({ instancia, onClose, onSincronizado }: { instancia: Row | null; onClose: () => void; onSincronizado?: () => void }) {
  const fn = useServerFn(sincronizarWebhooksZapi);
  const [carregando, setCarregando] = useState(false);
  const [res, setRes] = useState<Record<string, { ok: boolean; message?: string }>>({});
  const k = s(instancia?.["webhook_token"]);
  const url = k ? `https://atendeai.co/api/public/zapi-webhook?k=${k}` : "";
  const mascarada = k ? `https://atendeai.co/api/public/zapi-webhook?k=${k.slice(0, 6)}••••${k.slice(-4)}` : "";

  const copiar = (t: string) => void navigator.clipboard?.writeText(t).then(() => toast.success("Copiado."), () => toast.error("Não foi possível copiar."));

  const sincronizar = async () => {
    if (!instancia || !url) return;
    setCarregando(true);
    try {
      const clientToken = s(instancia["client_token"]);
      const token = s(instancia["token"]) || clientToken;
      const r = await fn({ data: { instanceId: s(instancia["instance_id"]), token, clientToken: clientToken || undefined, url, eventos: EVENTOS.map((e) => e.id) } });
      setRes(Object.fromEntries(r.resultados.map((x) => [x.evento, x])));
      const falhas = r.resultados.filter((x) => !x.ok).length;
      if (falhas === 0) toast.success("Todos os avisos foram configurados na Z-API.");
      else toast.warning(`${falhas} aviso(s) não foram aceitos pela Z-API.`);
      onSincronizado?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao sincronizar.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <Dialog open={!!instancia} onOpenChange={(o) => { if (!o) { setRes({}); onClose(); } }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Webhooks — {s(instancia?.["nome"]) || "WhatsApp"}</DialogTitle>
        </DialogHeader>

        <section className="space-y-2">
          <p className="text-sm font-medium">Endereço que a Z-API chama</p>
          {url ? (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-2">
              <code className="min-w-0 flex-1 truncate text-xs">{mascarada}</code>
              <Button size="sm" variant="outline" onClick={() => copiar(url)}><Copy className="mr-1 h-4 w-4" /> Copiar</Button>
            </div>
          ) : (
            <p className="text-sm text-destructive">Instância sem chave de recebimento. Rode o script atendeai-fluxos-motor.sql.</p>
          )}
          <p className="text-xs text-muted-foreground">O final do endereço é uma chave secreta que identifica esta empresa e esta instância. Não compartilhe.</p>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Avisos configurados na Z-API</p>
            <Button size="sm" onClick={() => void sincronizar()} disabled={!url || carregando}>
              {carregando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />} Sincronizar todos
            </Button>
          </div>
          <div className="divide-y divide-border rounded-md border border-border">
            {EVENTOS.map((e) => {
              const r = res[e.id];
              return (
                <div key={e.id} className="flex items-start gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{e.nome}</p>
                    <p className="text-xs text-muted-foreground">{e.desc}</p>
                    <code className="text-[11px] text-muted-foreground">PUT /{e.id}</code>
                    {r && !r.ok && <p className="mt-1 text-xs text-destructive">{r.message}</p>}
                  </div>
                  {r ? (r.ok ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> : <XCircle className="h-5 w-5 shrink-0 text-destructive" />) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-sm font-medium">Exemplos do que chega</p>
          <Tabs defaultValue="texto">
            <TabsList>
              <TabsTrigger value="texto">Texto</TabsTrigger>
              <TabsTrigger value="imagem">Imagem</TabsTrigger>
              <TabsTrigger value="audio">Áudio</TabsTrigger>
              <TabsTrigger value="status">Status</TabsTrigger>
            </TabsList>
            {Object.entries(EXEMPLOS).map(([k2, v]) => (
              <TabsContent key={k2} value={k2}>
                <pre className="max-h-60 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs">{JSON.stringify(v, null, 2)}</pre>
              </TabsContent>
            ))}
          </Tabs>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Confere a chave e descarta mensagens enviadas por nós, grupos e avisos de status.</li>
            <li>Encontra ou cadastra o contato pelo telefone e atualiza nome e foto.</li>
            <li>Abre ou continua o atendimento e grava a mensagem (sem duplicar).</li>
            <li>Aciona o robô/fluxo configurado.</li>
          </ol>
        </section>
      </DialogContent>
    </Dialog>
  );
}
