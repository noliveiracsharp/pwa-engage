import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTableRows, rowId, text } from "@/lib/crud";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function DepartamentosDialog({ open, onOpenChange, empresaId }: { open: boolean; onOpenChange: (o: boolean) => void; empresaId: string }) {
  const qc = useQueryClient();
  const { data: lista = [] } = useTableRows("usuarios_departamentos", open);
  const [novo, setNovo] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["table", "usuarios_departamentos"] });

  async function adicionar() {
    const descricao = novo.trim();
    if (!descricao) return;
    const { error } = await supabase.from("usuarios_departamentos" as never).insert({ descricao, empresa_id: empresaId || null } as never);
    if (error) { toast.error(`Não foi possível salvar. ${error.message}`); return; }
    setNovo(""); refresh();
  }
  async function remover(id: string) {
    const { error } = await supabase.from("usuarios_departamentos" as never).delete().eq("id", id as never);
    if (error) { toast.error(`Não foi possível excluir. ${error.message}`); return; }
    refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Departamentos</DialogTitle>
          <DialogDescription>Departamentos disponíveis no cadastro de usuários.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input placeholder="Novo departamento" value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && adicionar()} />
          <Button onClick={adicionar}><Plus className="h-4 w-4" /></Button>
        </div>
        <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {lista.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nenhum departamento cadastrado.</li>}
          {[...lista].sort((a, b) => text(a["descricao"]).localeCompare(text(b["descricao"]), "pt-BR")).map((d) => (
            <li key={text(rowId(d))} className="flex items-center justify-between p-2 pl-3 text-sm">
              {text(d["descricao"])}
              <Button size="icon" variant="ghost" onClick={() => remover(text(rowId(d)))} aria-label="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
