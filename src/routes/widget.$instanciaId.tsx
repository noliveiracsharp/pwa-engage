import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Send, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/widget/$instanciaId")({
  head: () => ({
    meta: [
      { title: "Chat de atendimento — Atende.ai" },
      { name: "description", content: "Converse com nossa equipe de atendimento em tempo real." },
      { property: "og:title", content: "Chat de atendimento — Atende.ai" },
      { property: "og:description", content: "Converse com nossa equipe de atendimento em tempo real." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WidgetPage,
});

type Cfg = { titulo?: string; boas_vindas?: string; cor?: string; pedir_telefone?: boolean };
type Msg = { id: string; mensagem: string | null; from_me: boolean; created_at: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (fn: string, args: Record<string, unknown>) => (supabase.rpc as any)(fn, args);

function WidgetPage() {
  const { instanciaId } = Route.useParams();
  const chave = `atendeai-widget-${instanciaId}`;
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [erro, setErro] = useState("");
  const [sessao, setSessao] = useState("");
  const [atId, setAtId] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [texto, setTexto] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const salvo = JSON.parse(localStorage.getItem(chave) || "{}") as { sessao?: string; at?: string };
    const s = salvo.sessao || `${crypto.randomUUID()}-${crypto.randomUUID()}`;
    setSessao(s);
    if (salvo.at) setAtId(salvo.at);
    localStorage.setItem(chave, JSON.stringify({ ...salvo, sessao: s }));
    void rpc("widget_config_publica", { p_instancia: instanciaId }).then(({ data, error }: { data: { config: Cfg } | null; error: unknown }) => {
      if (error || !data) setErro("Chat indisponível no momento.");
      else setCfg(data.config ?? {});
    });
  }, [chave, instanciaId]);

  useEffect(() => {
    if (!atId || !sessao) return;
    let ativo = true;
    const carregar = async () => {
      const { data } = await rpc("widget_mensagens", { p_sessao: sessao, p_atendimento: atId });
      if (ativo && data) setMsgs(data as Msg[]);
    };
    void carregar();
    const t = setInterval(carregar, 3000);
    return () => { ativo = false; clearInterval(t); };
  }, [atId, sessao]);

  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  async function iniciar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || (cfg?.pedir_telefone && telefone.replace(/\D/g, "").length < 10)) {
      setErro("Preencha seu nome" + (cfg?.pedir_telefone ? " e telefone com DDD." : "."));
      return;
    }
    const { data, error } = await rpc("widget_iniciar", { p_instancia: instanciaId, p_sessao: sessao, p_nome: nome, p_telefone: telefone });
    if (error) { setErro("Não foi possível iniciar a conversa."); return; }
    setErro("");
    setAtId(data as string);
    localStorage.setItem(chave, JSON.stringify({ sessao, at: data }));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t) return;
    setTexto("");
    setMsgs((m) => [...m, { id: `tmp-${Date.now()}`, mensagem: t, from_me: false, created_at: new Date().toISOString() }]);
    await rpc("widget_enviar", { p_sessao: sessao, p_atendimento: atId, p_texto: t });
  }

  const cor = cfg?.cor || "hsl(var(--primary))";

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-4 py-3 text-primary-foreground" style={{ background: cor }}>
        <div>
          <p className="font-semibold">{cfg?.titulo || "Fale conosco"}</p>
          <p className="text-xs opacity-90">Respondemos o mais rápido possível</p>
        </div>
        <button aria-label="Fechar" onClick={() => window.parent.postMessage("atendeai-widget-fechar", "*")}>
          <X className="h-5 w-5" />
        </button>
      </header>

      {!cfg && !erro ? (
        <p className="m-auto text-sm text-muted-foreground">Carregando…</p>
      ) : !atId ? (
        <form onSubmit={iniciar} className="flex flex-1 flex-col gap-3 p-4">
          <p className="rounded-lg bg-muted p-3 text-sm">{cfg?.boas_vindas || "Olá! Como podemos ajudar?"}</p>
          <input className="rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Seu nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          {cfg?.pedir_telefone !== false && (
            <input className="rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="WhatsApp com DDD" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          )}
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          <button type="submit" className="rounded-md px-3 py-2 text-sm font-medium text-primary-foreground" style={{ background: cor }} disabled={!cfg}>
            Iniciar conversa
          </button>
        </form>
      ) : (
        <>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            <p className="max-w-[85%] rounded-lg bg-muted p-2 text-sm">{cfg?.boas_vindas || "Olá! Como podemos ajudar?"}</p>
            {msgs.map((m) => (
              <div key={m.id} className={`flex ${m.from_me ? "justify-start" : "justify-end"}`}>
                <p
                  className={`max-w-[85%] whitespace-pre-wrap rounded-lg p-2 text-sm ${m.from_me ? "bg-muted" : "text-primary-foreground"}`}
                  style={m.from_me ? undefined : { background: cor }}
                >
                  {m.mensagem}
                </p>
              </div>
            ))}
            <div ref={fim} />
          </div>
          <form onSubmit={enviar} className="flex gap-2 border-t border-border p-2">
            <input className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Digite sua mensagem…" value={texto} onChange={(e) => setTexto(e.target.value)} />
            <button type="submit" aria-label="Enviar" className="rounded-md px-3 text-primary-foreground" style={{ background: cor }}>
              <Send className="h-4 w-4" />
            </button>
          </form>
        </>
      )}
    </div>
  );
}
