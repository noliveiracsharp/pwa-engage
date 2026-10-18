import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2, LogOut, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/portal")({
  staticData: { sitemap: true },
  ssr: false,
  head: () => ({
    meta: [
      { title: "Portal do Cliente — Atende.ai" },
      { name: "description", content: "Acompanhe seus chamados e o histórico das suas conversas." },
      { property: "og:title", content: "Portal do Cliente — Atende.ai" },
      { property: "og:description", content: "Acompanhe seus chamados e o histórico das suas conversas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Portal,
});

type Cliente = { id: string; nome: string | null; telefone: string };
type Chamado = { id: string; status: string | null; dt_ultimo_whatsapp: string | null; etapa: string | null };
type Msg = {
  id: string; mensagem: string | null; remetente_tipo: string | null;
  url_midia: string | null; tipo_midia: string | null; nome_arquivo: string | null; created_at: string | null;
};

const KEY = "atendeai-portal";
const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const dataHora = (v: string | null) => (v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

function Portal() {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  useEffect(() => {
    const s = sessionStorage.getItem(KEY);
    if (s) setCliente(JSON.parse(s) as Cliente);
  }, []);
  const entrar = (c: Cliente) => { sessionStorage.setItem(KEY, JSON.stringify(c)); setCliente(c); };
  const sair = () => { sessionStorage.removeItem(KEY); setCliente(null); };

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <span className="font-semibold text-primary">Atende.ai · Portal do Cliente</span>
          {cliente && <Button variant="ghost" size="sm" onClick={sair}><LogOut className="mr-1 h-4 w-4" /> Sair</Button>}
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        {cliente ? <Painel cliente={cliente} /> : <Login onEntrar={entrar} />}
      </main>
    </div>
  );
}

function Login({ onEntrar }: { onEntrar: (c: Cliente) => void }) {
  const [tel, setTel] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  // Link enviado pelo atendente: /portal?tel=11999999999 já entra direto.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tel");
    if (t) { setTel(t); void entrarCom(t); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    await entrarCom(tel);
  }
  async function entrarCom(tel: string) {
    setErro("");
    if (tel.replace(/\D/g, "").length < 10) { setErro("Informe o telefone com DDD."); return; }
    setCarregando(true);
    const { data, error } = await rpc("portal_login", { p_telefone: tel });
    setCarregando(false);
    if (error) { setErro("Não foi possível entrar agora. Tente novamente."); return; }
    const p = data as { id: string; nome: string | null } | null;
    if (!p?.id) { setErro("Telefone não encontrado."); return; }
    onEntrar({ id: String(p.id), nome: p.nome, telefone: tel });
  }
  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader><h1 className="text-2xl font-semibold leading-none tracking-tight text-foreground">Acompanhe seus chamados</h1></CardHeader>
      <CardContent>
        <form onSubmit={enviar} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="tel">Telefone (com DDD)</Label>
            <Input id="tel" inputMode="tel" placeholder="(11) 99999-9999" value={tel} onChange={(e) => setTel(e.target.value)} />
          </div>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          <Button type="submit" className="w-full" disabled={carregando}>
            {carregando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Entrar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Painel({ cliente }: { cliente: Cliente }) {
  const [aberto, setAberto] = useState<Chamado | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["portal-chamados", cliente.id],
    queryFn: async () => {
      const r = await rpc("portal_chamados", { p_telefone: cliente.telefone });
      if (r.error) throw new Error(r.error.message);
      return (r.data ?? []) as Chamado[];
    },
  });
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Meus Chamados</h1>
        {cliente.nome && <p className="text-sm text-muted-foreground">Olá, {cliente.nome}</p>}
      </div>
      {isLoading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
      {error && <p className="text-sm text-destructive">Não foi possível carregar seus chamados.</p>}
      {data && data.length === 0 && <p className="text-muted-foreground">Você ainda não tem chamados.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {data?.map((c) => (
          <button key={c.id} type="button" onClick={() => setAberto(c)} className="text-left">
            <Card className="transition-colors hover:border-primary">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline">{c.status || "Sem status"}</Badge>
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="font-medium text-foreground">{c.etapa || "Etapa não definida"}</p>
                <p className="text-xs text-muted-foreground">Último contato: {dataHora(c.dt_ultimo_whatsapp)}</p>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
      <Historico chamado={aberto} telefone={cliente.telefone} onClose={() => setAberto(null)} />
    </div>
  );
}

function Historico({ chamado, telefone, onClose }: { chamado: Chamado | null; telefone: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["portal-msgs", chamado?.id],
    enabled: !!chamado,
    queryFn: async () => {
      const r = await rpc("portal_mensagens", { p_telefone: telefone, p_atendimento: chamado!.id });
      if (r.error) throw new Error(r.error.message);
      return (r.data ?? []) as Msg[];
    },
  });
  return (
    <Dialog open={!!chamado} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{chamado?.etapa || "Histórico do chamado"}</DialogTitle></DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {isLoading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
          {data?.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma mensagem.</p>}
          {data?.map((m) => {
            const cli = (m.remetente_tipo ?? "").toLowerCase() === "cliente";
            const url = m.url_midia;
            return (
              <div key={m.id} className={cn("flex", cli ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[80%] rounded-lg px-3 py-2 text-sm", cli ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
                  {url && m.tipo_midia === "imagem" && <img src={url} alt={m.nome_arquivo ? `Imagem enviada: ${m.nome_arquivo}` : "Imagem enviada na conversa do chamado"} className="mb-1 max-h-60 rounded" />}
                  {url && m.tipo_midia === "audio" && <audio controls src={url} className="mb-1 max-w-full" />}
                  {url && m.tipo_midia === "video" && <video controls src={url} className="mb-1 max-h-60 rounded" />}
                  {url && m.tipo_midia === "documento" && (
                    <a href={url} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-1 underline">
                      <FileText className="h-4 w-4" /> {m.nome_arquivo || "Documento"}
                    </a>
                  )}
                  {m.mensagem && !(url && m.mensagem === m.nome_arquivo) && <p className="whitespace-pre-wrap break-words">{m.mensagem}</p>}
                  <p className="mt-1 text-right text-[10px] opacity-70">{dataHora(m.created_at)}</p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-center text-xs text-muted-foreground">Somente leitura.</p>
      </DialogContent>
    </Dialog>
  );
}
