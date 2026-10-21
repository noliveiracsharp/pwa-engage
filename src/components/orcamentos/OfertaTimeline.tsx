import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Clock, MessageSquare, Phone, Send, StickyNote, Users, MapPin, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { useAudit } from "@/lib/audit";
import type { Row } from "@/lib/row";

const TIPOS = [
  { value: "email", label: "E-mail", icon: Send },
  { value: "ligacao", label: "Ligação", icon: Phone },
  { value: "nota", label: "Nota", icon: StickyNote },
  { value: "reuniao", label: "Reunião", icon: Users },
  { value: "visita", label: "Visita", icon: MapPin },
  { value: "whatsapp", label: "WhatsApp", icon: MessageSquare },
];
const AUTO = new Set(["etapa", "situacao", "sistema"]);

/** Linha do tempo da Oferta: anotações do vendedor + mudanças registradas pelo banco. */
export function OfertaTimeline({ orcamentoId, empresaId, readOnly }: { orcamentoId: string; empresaId?: unknown; readOnly?: boolean }) {
  const qc = useQueryClient();
  const { usuarioId } = useAudit();
  const [tipo, setTipo] = useState("nota");
  const [texto, setTexto] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editTipo, setEditTipo] = useState("nota");
  const [editTexto, setEditTexto] = useState("");
  const key = ["orcamento_interacoes", orcamentoId];

  const { data = [], error } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from("orcamento_interacoes" as never).select("*")
        .eq("orcamento_id", orcamentoId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("orcamento_interacoes" as never).insert({
        orcamento_id: orcamentoId, tipo, descricao: texto.trim(),
        empresa_id: empresaId ?? null, usuario_id: usuarioId ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { setTexto(""); void qc.invalidateQueries({ queryKey: key }); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Não foi possível registrar."),
  });

  const edit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("orcamento_interacoes" as never)
        .update({ tipo: editTipo, descricao: editTexto.trim() } as never).eq("id", editId as string);
      if (error) throw error;
    },
    onSuccess: () => { setEditId(null); void qc.invalidateQueries({ queryKey: key }); toast.success("Registro atualizado."); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Não foi possível atualizar."),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("orcamento_interacoes" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });

  if (error) {
    return <p className="text-sm text-muted-foreground">Linha do tempo indisponível: rode o script atendeai-crm-timeline.sql.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Linha do tempo</p>
      {!readOnly && (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
            <SearchSelect value={tipo} onChange={(v) => setTipo(v || "nota")} allowClear={false}
              options={TIPOS.map((t) => ({ value: t.value, label: t.label }))} searchPlaceholder="Pesquisar…" />
            <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="O que aconteceu? (ex.: cliente pediu desconto de 5%)" />
          </div>
          <div className="flex justify-end">
            <Button type="button" size="sm" disabled={!texto.trim() || add.isPending} onClick={() => add.mutate()}>Registrar</Button>
          </div>
        </div>
      )}
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma interação registrada ainda.</p>
      ) : (
        <ol className="space-y-2 border-l border-border pl-4">
          {data.map((r) => {
            const t = String(r["tipo"] ?? "nota");
            const Icon = AUTO.has(t) ? ArrowRightLeft : TIPOS.find((x) => x.value === t)?.icon ?? Clock;
            return (
              <li key={String(r["id"])} className="relative">
                <span className="absolute -left-[1.4rem] top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background">
                  <Icon className="h-3 w-3 text-muted-foreground" />
                </span>
                <div className="flex items-start justify-between gap-2">
                  {editId === String(r["id"]) ? (
                    <div className="min-w-0 flex-1 space-y-2">
                      <SearchSelect value={editTipo} onChange={(v) => setEditTipo(v || "nota")} allowClear={false}
                        options={TIPOS.map((x) => ({ value: x.value, label: x.label }))} searchPlaceholder="Pesquisar…" />
                      <Textarea value={editTexto} onChange={(e) => setEditTexto(e.target.value)} rows={3} />
                      <div className="flex justify-end gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditId(null)}>Cancelar</Button>
                        <Button type="button" size="sm" disabled={!editTexto.trim() || edit.isPending} onClick={() => edit.mutate()}>Salvar</Button>
                      </div>
                    </div>
                  ) : (
                  <div className="min-w-0">
                    <p className={AUTO.has(t) ? "text-xs text-muted-foreground" : "text-sm text-foreground whitespace-pre-wrap"}>{String(r["descricao"] ?? "")}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {AUTO.has(t) ? "Automático" : TIPOS.find((x) => x.value === t)?.label} · {new Date(String(r["created_at"])).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  )}
                  {!readOnly && !AUTO.has(t) && editId !== String(r["id"]) && (
                    <div className="flex shrink-0">
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label="Editar"
                      onClick={() => { setEditId(String(r["id"])); setEditTipo(t); setEditTexto(String(r["descricao"] ?? "")); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label="Apagar"
                      onClick={async () => { if (await confirmar({ title: "Apagar registro?", description: "Essa anotação será removida." })) del.mutate(String(r["id"])); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
