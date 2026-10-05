import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Circle, Paperclip } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { rowId, text, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";

export const checklistsKey = (atId: string) => ["table", "atendimentos_checklists", "at", atId];

/** Checklists preenchidos de um atendimento, do mais recente ao mais antigo. */
export function useChecklistsAtendimento(atId: string) {
  return useQuery({
    queryKey: checklistsKey(atId),
    enabled: !!atId,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.from("atendimentos_checklists").select("*").eq("atendimento_id", atId);
      if (error) return [];
      return ((data ?? []) as Row[]).sort((a, b) => dataChecklist(b).getTime() - dataChecklist(a).getTime());
    },
  });
}

export const dataChecklist = (c: Row) => new Date(String(c["dt_preenchimento"] ?? c["created_at"] ?? 0));

function useNomes() {
  const { data: etapas = [] } = useTableRows("kanban_etapas");
  const { data: usuarios = [] } = useTableRows("usuarios");
  const { data: templates = [] } = useTableRows("checklists_templates");
  const mapa = (rows: Row[], campos: string[]) => new Map(rows.map((r) => [text(rowId(r)), text(pick(r, campos))]));
  return {
    etapa: mapa(etapas, ["descricao", "nome"]),
    usuario: mapa(usuarios, ["primeiro_nome", "nome", "nome_completo", "email"]),
    template: mapa(templates, ["nome"]),
  };
}

const fmt = (d: Date) => d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

type Resp = { descricao?: string; tipo?: string; valor?: unknown };

function Respostas({ c }: { c: Row }) {
  const respostas = Object.values((c["respostas"] ?? {}) as Record<string, Resp>);
  return (
    <div className="space-y-2">
      {c["ignorado"] === true && (
        <div className="rounded-md border border-warning/50 bg-warning/10 p-2 text-sm">
          <p className="flex items-center gap-1 font-medium"><AlertTriangle className="h-4 w-4 text-warning" /> Transferido sem checklist</p>
          <p className="mt-1 text-muted-foreground">{text(c["justificativa"]) || "Sem justificativa."}</p>
        </div>
      )}
      {respostas.length === 0 && <p className="text-sm text-muted-foreground">Sem itens registrados.</p>}
      {respostas.map((r, i) => {
        const tipo = r.tipo ?? "checkbox";
        if (tipo === "checkbox") {
          const ok = r.valor === true;
          return (
            <div key={i} className="flex items-start gap-2 text-sm">
              {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
              <span className={ok ? "" : "text-muted-foreground"}>{r.descricao}</span>
            </div>
          );
        }
        const valor = text(r.valor);
        return (
          <div key={i} className="text-sm">
            <p className="text-xs font-medium text-muted-foreground">{r.descricao}</p>
            {tipo === "anexo" ? (
              valor ? (
                <a href={valor} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                  <Paperclip className="h-3.5 w-3.5" /> Abrir anexo
                </a>
              ) : <p className="text-muted-foreground">—</p>
            ) : (
              <p className="whitespace-pre-wrap rounded bg-muted px-2 py-1">{valor || "—"}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ChecklistRespostasDialog({ c, open, onOpenChange }: { c: Row | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const nomes = useNomes();
  return (
    <Dialog open={open && !!c} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {c && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-primary" /> Checklist de passagem</DialogTitle>
              <DialogDescription>
                {nomes.template.get(text(c["template_id"])) || "Checklist"} · Entrada em{" "}
                <strong>{nomes.etapa.get(text(c["etapa_destino_id"])) || "etapa"}</strong>
                <br />
                Por {nomes.usuario.get(text(c["preenchido_por"])) || "usuário"} em {fmt(dataChecklist(c))}
              </DialogDescription>
            </DialogHeader>
            <Respostas c={c} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Card exibido na linha do tempo do chat. */
export function ChecklistEventoCard({ c }: { c: Row }) {
  const nomes = useNomes();
  const [aberto, setAberto] = useState(false);
  return (
    <div className="flex justify-center">
      <div className="w-full max-w-md rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
        <p className="flex items-center gap-1.5 font-medium text-foreground">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          Checklist de passagem — {nomes.etapa.get(text(c["etapa_destino_id"])) || "etapa"}
          {c["ignorado"] === true && <Badge variant="outline" className="ml-1 h-5 border-warning/60 px-1.5 text-[10px]">Ignorado</Badge>}
        </p>
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{nomes.usuario.get(text(c["preenchido_por"])) || "Usuário"} · {fmt(dataChecklist(c))}</span>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setAberto(true)}>Ver respostas</Button>
        </div>
      </div>
      <ChecklistRespostasDialog c={c} open={aberto} onOpenChange={setAberto} />
    </div>
  );
}

/** Seção do painel lateral com todos os checklists do atendimento. */
export function ChecklistsPainel({ atId }: { atId: string }) {
  const { data: lista = [] } = useChecklistsAtendimento(atId);
  const nomes = useNomes();
  const [abertoId, setAbertoId] = useState<string | null>(null);
  if (lista.length === 0) return null;
  return (
    <section className="space-y-2">
      <p className="text-xs font-medium uppercase text-muted-foreground">Checklists de etapa ({lista.length})</p>
      {lista.map((c) => {
        const id = text(rowId(c));
        const aberto = abertoId === id;
        return (
          <div key={id} className="rounded-md border border-border">
            <button type="button" className="flex w-full items-start gap-2 p-2 text-left" onClick={() => setAbertoId(aberto ? null : id)}>
              <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{nomes.etapa.get(text(c["etapa_destino_id"])) || "Etapa"}</span>
                <span className="block text-xs text-muted-foreground">
                  {nomes.usuario.get(text(c["preenchido_por"])) || "Usuário"} · {fmt(dataChecklist(c))}
                </span>
              </span>
              {c["ignorado"] === true && <Badge variant="outline" className="h-5 border-warning/60 px-1.5 text-[10px]">Ignorado</Badge>}
            </button>
            {aberto && <div className="border-t border-border p-2"><Respostas c={c} /></div>}
          </div>
        );
      })}
    </section>
  );
}
