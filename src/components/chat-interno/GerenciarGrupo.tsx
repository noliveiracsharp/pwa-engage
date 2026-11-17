import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, LogOut, Pencil, Search, Trash2, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const nomeDe = (u: Row | undefined) => String(pick(u ?? {}, ["nome"], "Usuário"));
const iniciais = (n: string) => n.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "U";
const ordenar = (a: Row, b: Row) => nomeDe(a).localeCompare(nomeDe(b), "pt-BR");

/** Administração dos participantes de um grupo do Chat da equipe. */
export function GerenciarGrupo({ open, onOpenChange, canal, me, meuNome, usuarios, onSaiu }: {
  open: boolean; onOpenChange: (v: boolean) => void; canal: Row; me: string; meuNome: string; usuarios: Row[]; onSaiu: () => void;
}) {
  const qc = useQueryClient();
  const canalId = String(canal["id"]);
  const empresaId = String(canal["empresa_id"] ?? "");
  const [nome, setNome] = useState(String(canal["nome"] ?? ""));
  const [editandoNome, setEditandoNome] = useState(false);
  const [adicionando, setAdicionando] = useState(false);
  const [busca, setBusca] = useState("");
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const key = ["chat-grupo-membros", canalId];

  const { data: membrosIds = [], isLoading } = useQuery({
    queryKey: key, enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("chat_interno_participantes").select("usuario_id").eq("canal_id", canalId);
      if (error) throw error;
      return ((data ?? []) as Row[]).map((r) => String(r["usuario_id"]));
    },
  });

  const porId = useMemo(() => new Map(usuarios.map((u) => [String(u["id"]), u])), [usuarios]);
  const membros = useMemo(() => membrosIds.filter((id) => id !== me).map((id) => porId.get(id) ?? { id, nome: "Usuário" }).sort(ordenar), [membrosIds, porId, me]);
  const disponiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return usuarios.filter((u) => !membrosIds.includes(String(u["id"])) && (!t || nomeDe(u).toLowerCase().includes(t))).sort(ordenar);
  }, [usuarios, membrosIds, busca]);

  const atualizar = () => { void qc.invalidateQueries({ queryKey: key }); void qc.invalidateQueries({ queryKey: ["chat-interno-grupos"] }); void qc.invalidateQueries({ queryKey: ["tarefas-grupos"] }); };
  const aviso = async (msg: string) => { await supabase.from("chat_interno_mensagens").insert({ empresa_id: empresaId, canal_id: canalId, remetente_id: me, mensagem: msg, anexos: [], lida_por: [me] }); void qc.invalidateQueries({ queryKey: ["chat-interno-msgs"] }); };

  const adicionar = async () => {
    if (!escolhidos.size) return;
    setOcupado(true);
    const { error } = await supabase.from("chat_interno_participantes").insert([...escolhidos].map((u) => ({ canal_id: canalId, usuario_id: u })));
    setOcupado(false);
    if (error) { toast.error("Não foi possível adicionar: " + error.message); return; }
    await aviso(`👥 ${meuNome} adicionou ${[...escolhidos].map((id) => nomeDe(porId.get(id))).join(", ")} ao grupo.`);
    toast.success(escolhidos.size === 1 ? "Pessoa adicionada." : `${escolhidos.size} pessoas adicionadas.`);
    setEscolhidos(new Set()); setBusca(""); setAdicionando(false); atualizar();
  };

  const remover = async (u: Row) => {
    const n = nomeDe(u);
    if (!(await confirmar({ title: "Remover do grupo", description: `${n} deixará de ver as mensagens deste grupo.`, confirmText: "Remover", variant: "destructive" } as never))) return;
    const { error } = await supabase.from("chat_interno_participantes").delete().eq("canal_id", canalId).eq("usuario_id", String(u["id"]));
    if (error) { toast.error("Não foi possível remover: " + error.message); return; }
    await aviso(`👥 ${meuNome} removeu ${n} do grupo.`);
    toast.success(`${n} foi removido(a).`); atualizar();
  };

  const renomear = async () => {
    const n = nome.trim();
    if (!n) { toast.error("Informe o nome do grupo."); return; }
    const { error } = await supabase.from("chat_interno_canais").update({ nome: n }).eq("id", canalId);
    if (error) { toast.error(error.message); return; }
    canal["nome"] = n;
    setEditandoNome(false); toast.success("Nome atualizado."); atualizar();
  };

  const sair = async () => {
    if (!(await confirmar({ title: "Sair do grupo", description: "Você deixará de receber as mensagens deste grupo.", confirmText: "Sair", variant: "destructive" } as never))) return;
    await aviso(`👥 ${meuNome} saiu do grupo.`);
    const { error } = await supabase.from("chat_interno_participantes").delete().eq("canal_id", canalId).eq("usuario_id", me);
    if (error) { toast.error(error.message); return; }
    onOpenChange(false); atualizar(); onSaiu();
  };

  const excluir = async () => {
    if (!(await confirmar({ title: "Excluir grupo", description: "O grupo e todas as mensagens serão apagados para todos. Esta ação não pode ser desfeita.", confirmText: "Excluir", variant: "destructive" } as never))) return;
    await supabase.from("chat_interno_mensagens").delete().eq("canal_id", canalId);
    await supabase.from("chat_interno_participantes").delete().eq("canal_id", canalId).neq("usuario_id", me);
    const { error } = await supabase.from("chat_interno_canais").delete().eq("id", canalId);
    if (error) { toast.error("Não foi possível excluir: " + error.message); return; }
    toast.success("Grupo excluído."); onOpenChange(false); atualizar(); onSaiu();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setAdicionando(false); setEditandoNome(false); setEscolhidos(new Set()); } }}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-3 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Participantes do grupo</DialogTitle>
          <DialogDescription>Adicione ou remova pessoas. Quem sair deixa de ver as mensagens.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          {editandoNome ? (
            <>
              <Input aria-label="Nome do grupo" value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void renomear(); }} autoFocus />
              <Button size="sm" onClick={() => void renomear()}>Salvar</Button>
            </>
          ) : (
            <>
              <p className="min-w-0 flex-1 truncate font-semibold">{String(canal["nome"] ?? "Grupo")}</p>
              <Button size="sm" variant="ghost" onClick={() => setEditandoNome(true)} aria-label="Renomear grupo"><Pencil className="mr-1 h-4 w-4" /> Renomear</Button>
            </>
          )}
        </div>

        {adicionando ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input className="pl-8" placeholder="Buscar pessoa..." aria-label="Buscar pessoa" value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
            </div>
            <ScrollArea className="h-64 rounded-md border border-border">
              <div className="p-1" role="listbox" aria-multiselectable="true" aria-label="Pessoas disponíveis">
                {disponiveis.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Todos já estão no grupo.</p>}
                {disponiveis.map((u) => {
                  const id = String(u["id"]); const on = escolhidos.has(id);
                  return (
                    <button key={id} type="button" role="option" aria-selected={on}
                      onClick={() => setEscolhidos((s) => { const n = new Set(s); if (on) n.delete(id); else n.add(id); return n; })}
                      className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on && "bg-accent")}>
                      <Avatar className="h-7 w-7"><AvatarImage src={String(pick(u, ["foto"], ""))} alt="" /><AvatarFallback className="text-[10px]">{iniciais(nomeDe(u))}</AvatarFallback></Avatar>
                      <span className="flex-1 truncate">{nomeDe(u)}</span>
                      {on && <Check className="h-4 w-4 text-primary" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setAdicionando(false); setEscolhidos(new Set()); }}>Cancelar</Button>
              <Button size="sm" disabled={!escolhidos.size || ocupado} onClick={() => void adicionar()}>
                {ocupado && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Adicionar{escolhidos.size ? ` (${escolhidos.size})` : ""}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={() => setAdicionando(true)}><UserPlus className="mr-1 h-4 w-4" /> Adicionar pessoas</Button>
            <p className="text-xs text-muted-foreground">{membros.length + 1} participante(s)</p>
            <ScrollArea className="h-64 rounded-md border border-border">
              <ul className="p-1">
                <li className="flex items-center gap-2 rounded px-2 py-1.5 text-sm">
                  <Avatar className="h-7 w-7"><AvatarFallback className="text-[10px]">{iniciais(meuNome)}</AvatarFallback></Avatar>
                  <span className="flex-1 truncate">{meuNome} <span className="text-muted-foreground">(você)</span></span>
                </li>
                {isLoading && <li className="py-4 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" /></li>}
                {membros.map((u) => (
                  <li key={String(u["id"])} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
                    <Avatar className="h-7 w-7"><AvatarImage src={String(pick(u, ["foto"], ""))} alt="" /><AvatarFallback className="text-[10px]">{iniciais(nomeDe(u))}</AvatarFallback></Avatar>
                    <span className="flex-1 truncate">{nomeDe(u)}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => void remover(u)} aria-label={`Remover ${nomeDe(u)}`} title="Remover do grupo">
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
            <div className="flex justify-between gap-2 border-t border-border pt-3">
              <Button variant="ghost" size="sm" onClick={() => void sair()}><LogOut className="mr-1 h-4 w-4" /> Sair do grupo</Button>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void excluir()}><Trash2 className="mr-1 h-4 w-4" /> Excluir grupo</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
