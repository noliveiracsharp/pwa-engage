import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Send, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/widget/$instanciaId")({
  staticData: { sitemap: false },
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

  const cor = cfg?.cor || "#0ea5e9";
  const corTexto = textoContraste(cor);
  const marca = { background: cor, color: corTexto };
  const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const campo = "w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30";

  return (
    <div className="flex h-screen flex-col bg-background text-foreground antialiased">
      <header className="flex items-center gap-3 px-4 py-3.5 shadow-sm" style={marca}>
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold" style={{ background: "rgba(255,255,255,.22)" }}>
          {(cfg?.titulo || "F").charAt(0).toUpperCase()}
          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 bg-success" style={{ borderColor: cor }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold leading-tight">{cfg?.titulo || "Fale conosco"}</p>
          <p className="text-xs" style={{ opacity: 0.85 }}>Online · respondemos o mais rápido possível</p>
        </div>
        <button aria-label="Fechar" className="rounded-full p-1.5 transition hover:bg-black/10" onClick={() => window.parent.postMessage("atendeai-widget-fechar", "*")}>
          <X className="h-5 w-5" />
        </button>
      </header>

      {!cfg && !erro ? (
        <p className="m-auto text-sm text-muted-foreground">Carregando…</p>
      ) : !atId ? (
        <form onSubmit={iniciar} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          <div className="rounded-2xl rounded-tl-sm border border-border bg-card p-3.5 text-sm text-card-foreground shadow-sm">
            {cfg?.boas_vindas || "Olá! Como podemos ajudar?"}
          </div>
          <p className="mt-2 text-xs font-medium text-muted-foreground">Para começar, informe seus dados:</p>
          <input className={campo} placeholder="Seu nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          {cfg?.pedir_telefone !== false && (
            <input className={campo} inputMode="tel" placeholder="WhatsApp com DDD" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          )}
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          <button type="submit" className="mt-1 rounded-xl px-3 py-2.5 text-sm font-semibold shadow-sm transition hover:opacity-90 disabled:opacity-50" style={marca} disabled={!cfg}>
            Iniciar conversa
          </button>
        </form>
      ) : (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto bg-muted/40 p-4">
            <div className="flex justify-start">
              <p className="max-w-[80%] rounded-2xl rounded-tl-sm border border-border bg-card px-3.5 py-2.5 text-sm text-card-foreground shadow-sm">
                {cfg?.boas_vindas || "Olá! Como podemos ajudar?"}
              </p>
            </div>
            {msgs.map((m) => (
              <div key={m.id} className={`flex flex-col ${m.from_me ? "items-start" : "items-end"}`}>
                <p
                  className={`max-w-[80%] whitespace-pre-wrap break-words px-3.5 py-2.5 text-sm shadow-sm ${m.from_me ? "rounded-2xl rounded-tl-sm border border-border bg-card text-card-foreground" : "rounded-2xl rounded-tr-sm"}`}
                  style={m.from_me ? undefined : marca}
                >
                  {m.mensagem}
                </p>
                <span className="mt-1 px-1 text-[10px] text-muted-foreground">{hora(m.created_at)}</span>
              </div>
            ))}
            <div ref={fim} />
          </div>
          <form onSubmit={enviar} className="flex items-center gap-2 border-t border-border bg-background p-3">
            <input className={`${campo} rounded-full`} placeholder="Digite sua mensagem…" value={texto} onChange={(e) => setTexto(e.target.value)} />
            <button type="submit" aria-label="Enviar" disabled={!texto.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm transition hover:opacity-90 disabled:opacity-40" style={marca}>
              <Send className="h-4 w-4" />
            </button>
          </form>
        </>
      )}
    </div>
  );
}

/** Retorna texto claro ou escuro conforme a luminância da cor da marca. */
function textoContraste(hex: string) {
  const h = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(h)) return "#ffffff";
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? "#0f172a" : "#ffffff";
}
