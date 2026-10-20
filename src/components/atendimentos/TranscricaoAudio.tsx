import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileAudio, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { transcreverAudio } from "@/lib/transcricao.functions";

/** Botão "Transcrever áudio" e o texto transcrito logo abaixo do player. */
export function TranscricaoAudio({ mensagemId, url, salva }: { mensagemId: string; url: string; salva: string }) {
  const transcrever = useServerFn(transcreverAudio);
  const [texto, setTexto] = useState(salva);
  const [busy, setBusy] = useState(false);

  const rodar = async () => {
    setBusy(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const r = await transcrever({ data: { url, token: s.session?.access_token } });
      if (r.erro || !r.texto) { toast.error(r.erro ?? "Não foi possível transcrever."); return; }
      setTexto(r.texto);
      if (mensagemId) {
        const { error } = await supabase.from("atendimentos_mensagem").update({ transcricao: r.texto } as never).eq("id", mensagemId);
        if (error) toast.warning("Transcrito, mas não salvo: rode o script atendeai-campos-templates.sql.");
      }
    } catch {
      toast.error("Não foi possível transcrever o áudio.");
    } finally {
      setBusy(false);
    }
  };

  if (texto) return <p className="mb-1 whitespace-pre-wrap border-l-2 border-current/40 pl-2 text-xs italic opacity-90">“{texto}”</p>;
  return (
    <button type="button" onClick={rodar} disabled={busy} className="mb-1 flex items-center gap-1 text-xs underline opacity-80 hover:opacity-100 disabled:opacity-50">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileAudio className="h-3.5 w-3.5" />}
      {busy ? "Transcrevendo…" : "Transcrever áudio"}
    </button>
  );
}
