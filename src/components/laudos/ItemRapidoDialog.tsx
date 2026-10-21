import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTableRows } from "@/lib/crud";
import { pick } from "@/lib/row";
import { cn } from "@/lib/utils";

const NATUREZAS = [
  { value: "Produto", label: "Produto / peça" },
  { value: "Serviço", label: "Serviço" },
];

const db = (t: string) => supabase.from(t as never) as unknown as ReturnType<typeof supabase.from>;

/** Cadastro simplificado em campo: cria o item pendente e avisa Compras com uma tarefa. */
export function ItemRapidoDialog({ open, termo, laudoNumero, onOpenChange, onCriado }: {
  open: boolean; termo: string; laudoNumero?: string | undefined;
  onOpenChange: (o: boolean) => void;
  onCriado: (id: string, descricao: string) => void;
}) {
  const qc = useQueryClient();
  const { usuario } = useAuth();
  const me = String(pick(usuario, ["id"]) ?? "");
  const empresaId = String(pick(usuario, ["empresa_id", "id_empresa"]) ?? "");
  const { data: usuarios = [] } = useTableRows("usuarios", open);
  const { data: perfis = [] } = useTableRows("perfil", open);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("Produto");
  const [ref, setRef] = useState("");
  const [comprador, setComprador] = useState("");
  const [busy, setBusy] = useState(false);

  const opts = useMemo(() => {
    const perfilNome = new Map(perfis.map((p) => [String(p["id"]), String(p["descricao"] ?? "")]));
    return usuarios
      .filter((u) => String(u["id"]) !== me && u["ativo"] !== false)
      .map((u) => {
        const perfil = perfilNome.get(String(pick(u, ["perfil_id"]) ?? "")) ?? "";
        return { value: String(u["id"]), label: String(pick(u, ["nome"], "Usuário")), hint: perfil || undefined, compras: /compra|suprimento|almox/i.test(perfil) };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [usuarios, perfis, me]);

  useEffect(() => {
    if (!open) return;
    setNome(termo); setTipo("Produto"); setRef("");
  }, [open, termo]);
  useEffect(() => {
    if (open && !comprador) setComprador(opts.find((o) => o.compras)?.value ?? "");
  }, [open, opts, comprador]);

  const salvar = async () => {
    if (nome.trim().length < 3) return toast.error("Informe o nome da peça ou serviço.");
    if (!comprador) return toast.error("Escolha quem de Compras vai completar o cadastro.");
    setBusy(true);
    const descricao = nome.trim();
    const ins = await db("itens").insert({
      empresa_id: empresaId, descricao, tipo, ativo: true,
      pendente_compras: true, referencia_campo: ref.trim() || null, cadastrado_por_id: me || null,
    } as never).select("id").single();
    if (ins.error) {
      setBusy(false);
      return toast.error(/pendente_compras|referencia_campo|cadastrado_por_id/.test(ins.error.message)
        ? "Rode o script atendeai-item-rapido-compras.sql antes." : ins.error.message);
    }
    const id = String((ins.data as { id: string }).id);
    const t = await db("tarefas_usuarios").insert({
      empresa_id: empresaId, criado_por: me, responsavel_id: comprador, status: "aguardando",
      titulo: `Completar cadastro do item: ${descricao}`,
      descricao: [
        `Item cadastrado em campo pelo técnico${laudoNumero ? ` no laudo ${laudoNumero}` : ""}.`,
        `Natureza: ${tipo}.`, ref.trim() ? `Marca/modelo/referência: ${ref.trim()}.` : "",
        "Complete custo, fornecedor, preço de venda e dados fiscais em Produtos e Serviços.",
      ].filter(Boolean).join("\n"),
      data_solicitacao: new Date().toISOString().slice(0, 10), prioridade: "alta",
    } as never);
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["table", "itens"] });
    qc.invalidateQueries({ queryKey: ["table", "tarefas_usuarios"] });
    if (t.error) toast.warning("Item criado, mas não foi possível avisar Compras: " + t.error.message);
    else toast.success("Item criado e Compras avisado.");
    onCriado(id, descricao);
    onOpenChange(false);
    return undefined;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[70] flex max-h-[90vh] w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-md">
        <DialogHeader><DialogTitle>Novo item rápido</DialogTitle></DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
          <div className="space-y-1.5">
            <Label htmlFor="ir-nome">Nome da peça ou serviço</Label>
            <Input id="ir-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Mola hidráulica porta de vidro" />
          </div>
          <div className="space-y-1.5">
            <Label>Natureza</Label>
            <div className="grid grid-cols-2 gap-2">
              {NATUREZAS.map((n) => (
                <Button key={n.value} type="button" variant={tipo === n.value ? "default" : "outline"} className={cn("text-xs")} onClick={() => setTipo(n.value)}>{n.label}</Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ir-ref">Marca / modelo / referência (opcional)</Label>
            <Input id="ir-ref" value={ref} onChange={(e) => setRef(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Avisar em Compras</Label>
            <SearchSelect value={comprador} onChange={setComprador} options={opts} placeholder="Quem completa o cadastro" />
            <p className="text-muted-foreground text-xs">Essa pessoa recebe uma tarefa no chat para completar custo, fornecedor e dados fiscais.</p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar item</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
