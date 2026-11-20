import { useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ProtocoloBadge } from "@/components/atendimentos/ProtocoloBadge";
import { text } from "@/lib/crud";
import type { Row } from "@/lib/row";
import { nomePessoa, telefonePessoa } from "@/lib/atendimentos";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  empresaId: string;
  modo: "encerrados" | "todos" | "historico";
  usuarioId: string;
  onEscolher: (row: Row) => void;
};

const TITULOS = { encerrados: "Atendimentos encerrados", todos: "Todos os atendimentos", historico: "Meu histórico" };

/** Busca sob demanda: nada é carregado até o usuário pesquisar. */
export function BuscaAtendimentosDialog({ open, onOpenChange, empresaId, modo, usuarioId, onEscolher }: Props) {
  const [termo, setTermo] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [res, setRes] = useState<Row[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  async function buscar() {
    setCarregando(true); setErro("");
    const { data, error } = await supabase.rpc("fn_atendimentos_buscar" as never, {
      p_empresa_id: empresaId || null, p_termo: termo.trim() || null,
      p_de: de || null, p_ate: ate || null,
      p_somente_encerrados: modo === "encerrados",
      p_usuario_id: modo === "historico" ? usuarioId || null : null,
      p_limite: 100,
    } as never);
    setCarregando(false);
    if (error) { setErro("Rode o script de busca no SQL Editor para habilitar esta pesquisa."); setRes([]); return; }
    setRes((data ?? []) as unknown as Row[]);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{TITULOS[modo]}</DialogTitle></DialogHeader>
        <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); void buscar(); }}>
          <div className="space-y-1">
            <Label htmlFor="busca-at">Nome, telefone ou protocolo</Label>
            <Input id="busca-at" value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Ex.: Maria ou 20261118-0010" autoFocus />
          </div>
          <div className="space-y-1"><Label htmlFor="busca-de">De</Label><Input id="busca-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="busca-ate">Até</Label><Input id="busca-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
          <Button type="submit" disabled={carregando}><Search className="mr-1 h-4 w-4" />{carregando ? "Buscando…" : "Buscar"}</Button>
        </form>
        <div className="max-h-[55vh] overflow-y-auto rounded-md border border-border">
          {erro && <p className="p-4 text-sm text-destructive">{erro}</p>}
          {res === null && !erro && <p className="p-6 text-center text-sm text-muted-foreground">Informe um filtro e clique em Buscar.</p>}
          {res && res.length === 0 && !erro && <p className="p-6 text-center text-sm text-muted-foreground">Nenhum atendimento encontrado.</p>}
          {res?.map((r) => {
            const p = r["_pessoa"] as Row | undefined;
            const d = text(r["created_at"]);
            return (
              <button key={text(r["id"])} type="button" onClick={() => { onEscolher(r); onOpenChange(false); }}
                className="flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left last:border-0 hover:bg-muted">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{nomePessoa(p)}</p>
                  <p className="truncate text-xs text-muted-foreground">{telefonePessoa(p)}</p>
                </div>
                <ProtocoloBadge protocolo={r["protocolo"]} />
                <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">{d ? new Date(d).toLocaleDateString("pt-BR") : ""}</span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
