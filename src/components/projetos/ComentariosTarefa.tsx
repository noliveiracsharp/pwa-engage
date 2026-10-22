import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { Row } from "@/lib/row";

const T = "projetos_tarefas_comentarios";

/** Conversa da tarefa com o cliente (o que ele envia pelo link público + respostas da equipe). */
export function ComentariosTarefa({ tarefaId, autorNome, usuarioId, readOnly }: { tarefaId: string; autorNome: string; usuarioId?: string | null; readOnly: boolean }) {
  const qc = useQueryClient();
  const key = [T, tarefaId];
  const { data = [], error } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from(T as never).select("*").eq("tarefa_id", tarefaId as never).order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const [txt, setTxt] = useState("");
  async function enviar() {
    if (!txt.trim()) return;
    const { error } = await supabase.from(T as never).insert({ tarefa_id: tarefaId, autor_nome: autorNome || "Equipe", texto: txt.trim(), origem: "equipe", criado_por: usuarioId ?? null } as never);
    if (error) { toast.error(error.message); return; }
    setTxt(""); qc.invalidateQueries({ queryKey: key });
  }
  if (error) return <p className="text-xs text-muted-foreground">Rode o script de comentários do cliente para usar esta área.</p>;
  return (
    <section className="space-y-2">
      <h3 className="font-semibold text-foreground">Comentários com o cliente</h3>
      {data.length === 0 && <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>}
      <ul className="space-y-2">
        {data.map((c) => (
          <li key={String(c["id"])} className={`rounded-md border border-border p-2 text-sm ${c["origem"] === "cliente" ? "bg-muted/40" : ""}`}>
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{String(c["autor_nome"] ?? "")}</span>
              <Badge variant={c["origem"] === "cliente" ? "default" : "secondary"} className="h-4 px-1.5 text-[10px]">{c["origem"] === "cliente" ? "Cliente" : "Equipe"}</Badge>
              <span>{new Date(String(c["created_at"])).toLocaleString("pt-BR")}</span>
            </div>
            <p className="whitespace-pre-wrap break-words">{String(c["texto"] ?? "")}</p>
          </li>
        ))}
      </ul>
      {!readOnly && (
        <div className="flex gap-2">
          <Textarea rows={2} placeholder="Responder ao cliente…" value={txt} onChange={(e) => setTxt(e.target.value)} />
          <Button onClick={enviar} aria-label="Enviar"><Send className="h-4 w-4" /></Button>
        </div>
      )}
    </section>
  );
}
