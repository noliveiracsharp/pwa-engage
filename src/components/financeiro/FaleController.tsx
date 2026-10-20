import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Calculator, Loader2, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { perguntarController } from "@/lib/controller.functions";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

const SUGESTOES = [
  "Com o fluxo de caixa atual, qual é a nossa estimativa de saldo para dezembro de 2026?",
  "Onde podemos cortar gastos nos próximos 60 dias sem travar a operação?",
  "Quais clientes mais impactam o caixa se atrasarem?",
  "Em qual mês corremos mais risco de faltar dinheiro?",
];

function Texto({ t }: { t: string }) {
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {t.split("\n").map((l, i) => {
        const s = l.trim();
        if (!s) return <div key={i} className="h-1" />;
        const parts = s.replace(/^#+\s*/, "").replace(/^[-*]\s/, "• ").split(/\*\*(.+?)\*\*/g);
        const node = parts.map((p, j) => (j % 2 ? <strong key={j}>{p}</strong> : p));
        return s.startsWith("#") ? <p key={i} className="pt-2 font-semibold">{node}</p> : <p key={i}>{node}</p>;
      })}
    </div>
  );
}

export function FaleController({ contexto }: { contexto: () => string }) {
  const perguntar = useServerFn(perguntarController);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { fim.current?.scrollIntoView({ block: "nearest" }); }, [msgs, carregando]);

  const enviar = async (q: string) => {
    const pergunta = q.trim();
    if (!pergunta || carregando) return;
    const nova = [...msgs, { role: "user" as const, content: pergunta }];
    setMsgs(nova);
    setTexto("");
    setCarregando(true);
    try {
      const { data: ses } = await supabase.auth.getSession();
      const token = ses.session?.access_token;
      if (!token) { toast.error("Sessão expirada. Entre novamente."); return; }
      const r = await perguntar({ data: { token, contexto: contexto(), mensagens: nova.slice(-20) } });
      if (r.erro) { toast.error(r.erro); setMsgs(msgs); setTexto(pergunta); }
      else setMsgs([...nova, { role: "assistant", content: r.texto }]);
    } catch {
      toast.error("Não foi possível responder agora.");
      setMsgs(msgs); setTexto(pergunta);
    } finally {
      setCarregando(false);
      campo.current?.focus();
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4 print:hidden">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground"><Calculator className="h-4 w-4" /></span>
          <div>
            <h2 className="font-semibold leading-tight">Fale com o Controller</h2>
            <p className="text-xs text-muted-foreground">Pergunte sobre caixa, despesas, recebimentos e projeções com os números do sistema.</p>
          </div>
        </div>
        {msgs.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setMsgs([])} disabled={carregando}><RotateCcw className="mr-1 h-4 w-4" />Nova conversa</Button>
        )}
      </div>

      {msgs.length === 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {SUGESTOES.map((s) => (
            <button key={s} type="button" onClick={() => enviar(s)} className="rounded-full border px-3 py-1.5 text-left text-xs hover:bg-muted">{s}</button>
          ))}
        </div>
      ) : (
        <div className="mb-3 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
          {msgs.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" && "justify-end")}>
              {m.role === "user"
                ? <div className="max-w-[85%] rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground">{m.content}</div>
                : <div className="max-w-[95%]"><Texto t={m.content} /></div>}
            </div>
          ))}
          {carregando && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />O Controller está analisando os números…</div>}
          <div ref={fim} />
        </div>
      )}

      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void enviar(texto); }}>
        <Textarea ref={campo} rows={2} value={texto} placeholder="Ex.: qual a estimativa de caixa para dezembro de 2026?"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(texto); } }} />
        <Button type="submit" size="icon" disabled={carregando || !texto.trim()} aria-label="Enviar pergunta">
          {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
      <p className="mt-2 text-[11px] text-muted-foreground">Respostas geradas por IA a partir dos lançamentos. Confira antes de decidir.</p>
    </div>
  );
}
