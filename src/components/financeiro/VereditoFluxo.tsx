import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BrainCircuit, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { perguntarController } from "@/lib/controller.functions";
import { supabase } from "@/integrations/supabase/client";

const PERGUNTA =
  "Analise este fluxo de caixa como um controller experiente. Responda em markdown curto com: '## Veredito' (uma frase: saudável, atenção ou crítico, e por quê); '## Meses críticos' (meses com saldo acumulado baixo ou negativo e valores); '## Recomendações' (3 ações práticas e priorizadas).";

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

/** Card do Fluxo de Caixa: veredito do Controller (IA) sob demanda sobre a projeção exibida. */
export function VereditoFluxo({ contexto }: { contexto: () => string }) {
  const perguntar = useServerFn(perguntarController);
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(false);

  const gerar = async () => {
    setCarregando(true);
    try {
      const { data: ses } = await supabase.auth.getSession();
      const token = ses.session?.access_token;
      if (!token) return void toast.error("Sessão expirada. Entre novamente.");
      const r = await perguntar({ data: { token, contexto: contexto(), mensagens: [{ role: "user", content: PERGUNTA }] } });
      if (r.erro) toast.error(r.erro); else setTexto(r.texto);
    } catch {
      toast.error("Não foi possível gerar o veredito agora.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="bg-card rounded-lg border border-primary/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold"><BrainCircuit className="text-primary h-5 w-5" />Veredito do Controller (IA)</div>
        <Button size="sm" variant={texto ? "outline" : "default"} disabled={carregando} onClick={() => void gerar()}>
          {carregando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : texto ? <RotateCcw className="mr-1 h-4 w-4" /> : <BrainCircuit className="mr-1 h-4 w-4" />}
          {texto ? "Gerar novamente" : "Gerar veredito"}
        </Button>
      </div>
      {texto ? <div className="mt-2"><Texto t={texto} /></div> : <p className="text-muted-foreground mt-1 text-xs">Analisa a projeção do período escolhido e aponta meses críticos e o que fazer.</p>}
    </div>
  );
}
