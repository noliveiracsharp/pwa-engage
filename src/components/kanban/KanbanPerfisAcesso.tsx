import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { Row } from "@/lib/row";

export function KanbanPerfisAcesso({ kanbanId, empresaId }: { kanbanId: string; empresaId: unknown }) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  const { data: perfis = [] } = useQuery({
    queryKey: ["perfis-kanban-lista", String(empresaId ?? "")],
    queryFn: async () => {
      const { data, error } = await supabase.from("perfil").select("*");
      if (error) throw error;
      return ((data ?? []) as Row[])
        .filter((p) => Number(p["ordem"] ?? 1) !== 0)
        .filter((p) => !p["empresa_id"] || empresaId == null || String(p["empresa_id"]) === String(empresaId))
        .sort((a, b) => String(a["descricao"] ?? "").localeCompare(String(b["descricao"] ?? ""), "pt-BR"));
    },
  });

  const { data: atuais, error: erroTabela } = useQuery({
    queryKey: ["perfil_kanban", kanbanId],
    enabled: !!kanbanId,
    queryFn: async () => {
      const { data, error } = await supabase.from("perfil_kanban" as never).select("perfil_id").eq("kanban_nome_id", kanbanId);
      if (error) throw error;
      return ((data ?? []) as Row[]).map((r) => String(r["perfil_id"]));
    },
  });

  useEffect(() => {
    if (atuais) setSel(new Set(atuais));
  }, [atuais]);

  const lista = useMemo(
    () => perfis.filter((p) => String(p["descricao"] ?? "").toLowerCase().includes(busca.toLowerCase())),
    [perfis, busca],
  );

  const salvar = async () => {
    setSalvando(true);
    try {
      const { error: e1 } = await supabase.from("perfil_kanban" as never).delete().eq("kanban_nome_id", kanbanId);
      if (e1) throw e1;
      if (sel.size) {
        const rows = [...sel].map((perfil_id) => ({ kanban_nome_id: kanbanId, perfil_id, empresa_id: empresaId }));
        const { error: e2 } = await supabase.from("perfil_kanban" as never).insert(rows as never);
        if (e2) throw e2;
      }
      toast.success("Perfis de acesso salvos.");
      qc.invalidateQueries({ queryKey: ["perfil_kanban"] });
      qc.invalidateQueries({ queryKey: ["table", "perfil_kanban"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  if (erroTabela) {
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        Rode o script <b>atendeai-perfil-kanban.sql</b> no SQL Editor para ativar o acesso por perfil.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Marque os perfis que podem ver este quadro. O perfil Master sempre vê todos.
      </p>
      <div className="flex gap-2">
        <Input placeholder="Buscar perfil…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Button variant="outline" size="sm" onClick={() => setSel(new Set(perfis.map((p) => String(p["id"]))))}>
          Marcar todos
        </Button>
        <Button variant="outline" size="sm" onClick={() => setSel(new Set())}>
          Limpar
        </Button>
      </div>
      <div className="divide-y rounded-md border">
        {lista.map((p) => {
          const id = String(p["id"]);
          return (
            <label key={id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50">
              <Checkbox
                checked={sel.has(id)}
                onCheckedChange={(v) =>
                  setSel((s) => {
                    const n = new Set(s);
                    if (v) n.add(id);
                    else n.delete(id);
                    return n;
                  })
                }
              />
              {String(p["descricao"] ?? "Sem nome")}
            </label>
          );
        })}
        {lista.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhum perfil encontrado.</p>}
      </div>
      {sel.size === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum perfil marcado = visível para todos os perfis.</p>
      )}
      <div className="flex justify-end">
        <Button onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar perfis"}
        </Button>
      </div>
    </div>
  );
}
