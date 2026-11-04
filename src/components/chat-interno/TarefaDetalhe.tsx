import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { adicionarEvento, lerEventos, PRIORIDADES, textoRemarcacao } from "@/lib/planner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TextoRico } from "@/components/ui/texto-rico";

const tb = () => supabase.from("tarefas_usuarios" as never) as unknown as ReturnType<typeof supabase.from>;
const dataHora = (s: string) => new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", " às");
const ERRO_SCRIPT = "Rode o script atendeai-planner-comentarios.sql no banco.";

/** Grava um evento na linha do tempo da tarefa (lê a versão atual para não perder comentários de outros). */
export async function registrarEvento(id: string, autorId: string, texto: string, tipo: "comentario" | "sistema" = "sistema") {
  const { data, error } = await tb().select("comentarios").eq("id", id).maybeSingle();
  if (error) return error.message.includes("comentarios") ? ERRO_SCRIPT : error.message;
  const lista = adicionarEvento((data as Row | null)?.["comentarios"], { tipo, autor_id: autorId, texto, em: new Date().toISOString() });
  const r = await tb().update({ comentarios: lista } as never).eq("id", id);
  return r.error ? r.error.message : null;
}

export function TarefaDetalhe({ id, me, usuarios, onFechar, onAvisar }: {
  id: string | null; me: string; usuarios: Row[]; onFechar: () => void;
  onAvisar?: (usuarioId: string, texto: string) => Promise<void>;
}) {
  const qc = useQueryClient();
  const nomes = useMemo(() => new Map(usuarios.map((u) => [String(u["id"]), String(pick(u, ["nome"], "Usuário"))])), [usuarios]);
  const nome = (u: string) => (u === me ? "Você" : nomes.get(u) ?? "Usuário");
  const { data: t, isLoading } = useQuery({
    queryKey: ["tarefa-detalhe", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await tb().select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },
  });
  const [form, setForm] = useState<Record<string, string>>({});
  const [comentario, setComentario] = useState("");
  const [salvando, setSalvando] = useState(false);
  const v = (k: string) => form[k] ?? (t?.[k] == null ? "" : String(t[k]).slice(0, k.startsWith("data") ? 10 : undefined));
  const set = (k: string, val: string) => setForm((f) => ({ ...f, [k]: val }));
  const eventos = lerEventos(t?.["comentarios"]).slice().reverse();
  const editavel = !!t && (String(t["responsavel_id"]) === me || String(t["criado_por"]) === me);

  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: ["tarefa-detalhe", id] });
    void qc.invalidateQueries({ queryKey: ["planner"] });
    void qc.invalidateQueries({ queryKey: ["tarefas-usuarios"] });
  };
  const outraPonta = () => {
    if (!t) return null;
    const r = String(t["responsavel_id"]), c = String(t["criado_por"]);
    return me === r ? (c !== me ? c : null) : r;
  };

  const salvar = async () => {
    if (!t || !Object.keys(form).length) { onFechar(); return; }
    if (!v("titulo").trim()) { toast.error("Informe o título."); return; }
    setSalvando(true);
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(form)) patch[k] = k === "estimativa_min" ? (val ? Number(val) : null) : val || null;
    const mudou = Object.keys(form).filter((k) => form[k] !== (t[k] == null ? "" : String(t[k]).slice(0, k.startsWith("data") ? 10 : undefined)));
    let lista = t["comentarios"];
    const rotulos: Record<string, string> = { titulo: "título", descricao: "descrição", prioridade: "prioridade", data_entrega: "prazo", estimativa_min: "estimativa" };
    if ("data_planejada" in form && mudou.includes("data_planejada")) {
      const de = t["data_planejada"] ? String(t["data_planejada"]).slice(0, 10) : null;
      lista = adicionarEvento(lista, { tipo: "sistema", autor_id: me, texto: textoRemarcacao(de, form["data_planejada"] || null), em: new Date().toISOString() });
      if (de) patch["remarcacoes"] = Number(t["remarcacoes"] ?? 0) + 1;
    }
    const outros = mudou.filter((k) => rotulos[k]).map((k) => rotulos[k]);
    if (outros.length) lista = adicionarEvento(lista, { tipo: "sistema", autor_id: me, texto: `Alterou ${outros.join(", ")}.`, em: new Date().toISOString() });
    patch["comentarios"] = lista;
    const r = await tb().update(patch as never).eq("id", String(t["id"]));
    setSalvando(false);
    if (r.error) { toast.error(r.error.message.includes("comentarios") ? ERRO_SCRIPT : r.error.message); return; }
    toast.success("Tarefa atualizada.");
    setForm({});
    recarregar();
    onFechar();
  };

  const comentar = async () => {
    if (!t || !comentario.trim()) return;
    setSalvando(true);
    const erro = await registrarEvento(String(t["id"]), me, comentario, "comentario");
    setSalvando(false);
    if (erro) { toast.error(erro); return; }
    const alvo = outraPonta();
    if (alvo && onAvisar) await onAvisar(alvo, `💬 Comentário na tarefa "${String(t["titulo"])}": ${comentario.trim()}`).catch(() => undefined);
    setComentario("");
    recarregar();
  };

  return (
    <Sheet open={!!id} onOpenChange={(o) => { if (!o) { setForm({}); onFechar(); } }}>
      <SheetContent className="z-[90] flex w-full flex-col gap-0 p-0 sm:max-w-none lg:w-[60vw]">
        <SheetHeader className="border-b border-border px-5 py-4"><SheetTitle>Tarefa</SheetTitle></SheetHeader>
        {isLoading || !t ? <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-muted-foreground" /> : (
          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2"><Label>Título</Label><Input disabled={!editavel} value={v("titulo")} onChange={(e) => set("titulo", e.target.value)} /></div>
              <div className="space-y-1 md:col-span-2"><Label>Descrição</Label><TextoRico disabled={!editavel} minHeight={140} value={v("descricao")} onChange={(h) => set("descricao", h)} /></div>
              <div className="space-y-1"><Label>Prioridade</Label>
                <div className="grid grid-cols-3 rounded-md bg-muted p-0.5 text-xs">
                  {PRIORIDADES.map((p) => (
                    <button key={p.v} type="button" disabled={!editavel} onClick={() => set("prioridade", p.v)} className={cn("rounded px-2 py-1.5", (v("prioridade") || "media") === p.v && "bg-background font-semibold shadow-sm")}>{p.label}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1"><Label>Estimativa (minutos)</Label><Input disabled={!editavel} type="number" min={0} value={v("estimativa_min")} onChange={(e) => set("estimativa_min", e.target.value)} /></div>
              <div className="space-y-1"><Label>Planejada para (vazio = Backlog)</Label><Input disabled={!editavel} type="date" value={v("data_planejada")} onChange={(e) => set("data_planejada", e.target.value)} /></div>
              <div className="space-y-1"><Label>Prazo de entrega</Label><Input disabled={!editavel} type="date" value={v("data_entrega")} onChange={(e) => set("data_entrega", e.target.value)} /></div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">De {nome(String(t["criado_por"]))} para {nome(String(t["responsavel_id"]))} • Remarcações: {Number(t["remarcacoes"] ?? 0)}</p>

            <section className="mt-6">
              <h3 className="mb-2 flex items-center gap-2 font-semibold"><MessageSquare className="h-4 w-4" /> Linha do tempo ({eventos.length})</h3>
              <div className="flex gap-2">
                <Textarea rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Escreva um comentário, andamento ou orientação…" />
                <Button className="self-end" disabled={salvando || !comentario.trim()} onClick={() => void comentar()} aria-label="Comentar"><Send className="h-4 w-4" /></Button>
              </div>
              <ol className="mt-4 space-y-3 border-l border-border pl-4">
                {eventos.map((e) => (
                  <li key={e.id} className="relative">
                    <span className={cn("absolute -left-[21px] top-1 flex h-2.5 w-2.5 rounded-full", e.tipo === "sistema" ? "bg-muted-foreground" : "bg-primary")} />
                    <p className="text-[11px] text-muted-foreground">
                      {e.tipo === "sistema" && <Bot className="mr-1 inline h-3 w-3" />}
                      <b className="text-foreground">{nome(e.autor_id)}</b> • {dataHora(e.em)}
                    </p>
                    <p className={cn("mt-0.5 whitespace-pre-wrap text-sm", e.tipo === "sistema" && "text-muted-foreground italic")}>{e.texto}</p>
                  </li>
                ))}
                {eventos.length === 0 && <li className="text-sm text-muted-foreground">Nenhum comentário ainda.</li>}
              </ol>
            </section>
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={() => { setForm({}); onFechar(); }}>Cancelar</Button>
          <Button disabled={salvando || !editavel} onClick={() => void salvar()}>Salvar</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
