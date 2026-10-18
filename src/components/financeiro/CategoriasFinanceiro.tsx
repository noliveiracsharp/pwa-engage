import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, Tags, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAudit } from "@/lib/audit";
import { CATEGORIAS_FINANCEIRO, type TipoTitulo } from "@/lib/financeiro";

export type Categoria = { id: string; nome: string; ativo: boolean; tipo: TipoTitulo };

const chave = (tipo: TipoTitulo, empresaId: unknown) => ["financeiro_categorias", tipo, String(empresaId ?? "")];

/** Categorias cadastradas da empresa. Sem o script rodado, cai nas categorias padrão. */
export function useCategoriasFinanceiro(tipo: TipoTitulo) {
  const { empresaId } = useAudit();
  const q = useQuery({
    queryKey: chave(tipo, empresaId),
    queryFn: async () => {
      let req = supabase.from("financeiro_categorias" as never).select("id,nome,ativo,tipo").eq("tipo", tipo);
      if (empresaId) req = req.eq("empresa_id", empresaId as never);
      const { data, error } = await req;
      if (error) return null;
      return ((data ?? []) as unknown as Categoria[]).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
  });
  const cadastro = q.data ?? null;
  const ativas = cadastro ? cadastro.filter((c) => c.ativo).map((c) => c.nome) : CATEGORIAS_FINANCEIRO[tipo];
  const todas = cadastro ? cadastro.map((c) => c.nome) : CATEGORIAS_FINANCEIRO[tipo];
  return { cadastro, ativas, todas, disponivel: cadastro !== null };
}

/** Gestão de categorias: adicionar, renomear (atualiza os lançamentos) e ativar/inativar. */
export function CategoriasDialog({ tipo, podeEditar, compacto }: { tipo: TipoTitulo; podeEditar: boolean; compacto?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [nova, setNova] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const qc = useQueryClient();
  const { empresaId } = useAudit();
  const { cadastro, disponivel } = useCategoriasFinanceiro(tipo);
  const recarregar = () => qc.invalidateQueries({ queryKey: chave(tipo, empresaId) });
  const existe = (n: string, ignorar?: string) =>
    (cadastro ?? []).some((c) => c.id !== ignorar && c.nome.trim().toLowerCase() === n.trim().toLowerCase());

  const adicionar = async () => {
    const n = nova.trim();
    if (!n) return;
    if (existe(n)) return void toast.error("Essa categoria já existe.");
    const { error } = await supabase.from("financeiro_categorias" as never).insert({ empresa_id: empresaId, tipo, nome: n } as never);
    if (error) return void toast.error("Não foi possível adicionar.");
    setNova(""); toast.success("Categoria adicionada."); recarregar();
  };

  const renomear = async (c: Categoria) => {
    const n = nome.trim();
    if (!n || n === c.nome) return setEditando(null);
    if (existe(n, c.id)) return void toast.error("Essa categoria já existe.");
    const { error } = await supabase.from("financeiro_categorias" as never).update({ nome: n } as never).eq("id", c.id);
    if (error) return void toast.error("Não foi possível renomear.");
    let upd = supabase.from("financeiro_titulos").update({ categoria: n } as never).eq("tipo", tipo).eq("categoria", c.nome);
    if (empresaId) upd = upd.eq("empresa_id", empresaId as never);
    await upd;
    setEditando(null); toast.success("Categoria renomeada nos lançamentos."); recarregar();
    qc.invalidateQueries({ queryKey: ["financeiro_titulos"] });
  };

  const alternar = async (c: Categoria, ativo: boolean) => {
    const { error } = await supabase.from("financeiro_categorias" as never).update({ ativo } as never).eq("id", c.id);
    if (error) return void toast.error("Não foi possível alterar.");
    recarregar();
  };

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        {compacto
          ? <Button type="button" variant="outline" size="icon" title="Cadastrar ou editar categorias" aria-label="Cadastrar ou editar categorias"><Plus className="h-4 w-4" /></Button>
          : <Button type="button" variant="outline"><Tags className="mr-2 h-4 w-4" />Categorias</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Categorias de contas a {tipo}</DialogTitle></DialogHeader>
        {!disponivel ? (
          <p className="text-sm text-muted-foreground">Rode o script de categorias do Financeiro no banco para gerenciar as categorias.</p>
        ) : (
          <div className="space-y-3">
            {podeEditar && (
              <div className="flex gap-2">
                <Input value={nova} placeholder="Nova categoria" onChange={(e) => setNova(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void adicionar()} />
                <Button type="button" onClick={adicionar}><Plus className="mr-1 h-4 w-4" />Adicionar</Button>
              </div>
            )}
            <div className="max-h-96 divide-y overflow-y-auto rounded-md border">
              {(cadastro ?? []).length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhuma categoria cadastrada.</p>}
              {(cadastro ?? []).map((c) => (
                <div key={c.id} className="flex items-center gap-2 p-2">
                  {editando === c.id ? (
                    <>
                      <Input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void renomear(c)} />
                      <Button type="button" size="icon" variant="ghost" title="Salvar" onClick={() => void renomear(c)}><Check className="h-4 w-4" /></Button>
                      <Button type="button" size="icon" variant="ghost" title="Cancelar" onClick={() => setEditando(null)}><X className="h-4 w-4" /></Button>
                    </>
                  ) : (
                    <>
                      <span className={`flex-1 text-sm ${c.ativo ? "" : "text-muted-foreground line-through"}`}>{c.nome}</span>
                      {podeEditar && (
                        <>
                          <Button type="button" size="icon" variant="ghost" title="Renomear" onClick={() => { setEditando(c.id); setNome(c.nome); }}><Pencil className="h-4 w-4" /></Button>
                          <Switch checked={c.ativo} title={c.ativo ? "Ativa" : "Inativa"} onCheckedChange={(x) => void alternar(c, x)} />
                        </>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Categorias inativas não aparecem em novos lançamentos, mas continuam nos já feitos.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
