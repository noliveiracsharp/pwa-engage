import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { chamarBanco } from "@/lib/banco-api";
import { formatBRL, num } from "@/lib/orcamentos";
import { rowId, text } from "@/lib/crud";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { ConciliacaoPainel } from "./ConciliacaoPainel";

type Transacao = { data: string; tipo: string; operacao: "C" | "D"; valor: number; descricao: string; titulo: string };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dataBR = (s: string) => (s ? s.split("-").reverse().join("/") : "—");

export function haQuanto(s: unknown) {
  if (!s) return "nunca consultado";
  const min = Math.round((Date.now() - new Date(String(s)).getTime()) / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h} h` : new Date(String(s)).toLocaleString("pt-BR");
}

/** Card de saldo em tempo real de uma conta com API ativa. */
export function SaldoCard({ conta, onAtualizado, onExtrato }: { conta: Row; onAtualizado: () => void; onExtrato: () => void }) {
  const [carregando, setCarregando] = useState(false);
  const atualizar = async () => {
    setCarregando(true);
    try { await chamarBanco("saldo", { conta_id: text(rowId(conta)) }); toast.success("Saldo atualizado com o banco."); onAtualizado(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setCarregando(false); }
  };
  const temSaldo = conta["saldo_consultado_em"] != null;
  return (
    <div className="bg-muted/40 space-y-1 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">Saldo disponível</span>
        <span className="text-muted-foreground text-xs">{haQuanto(conta["saldo_consultado_em"])}</span>
      </div>
      <p className={cn("text-xl font-bold", num(conta["saldo_atual"]) < 0 && "text-destructive")}>{temSaldo ? formatBRL(conta["saldo_atual"]) : "—"}</p>
      {temSaldo && (num(conta["saldo_limite"]) > 0 || num(conta["saldo_bloqueado"]) > 0) && (
        <p className="text-muted-foreground text-xs">Limite {formatBRL(conta["saldo_limite"])}{num(conta["saldo_bloqueado"]) > 0 ? ` • Bloqueado ${formatBRL(conta["saldo_bloqueado"])}` : ""}</p>
      )}
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={atualizar} disabled={carregando}>
          {carregando ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}Atualizar saldo
        </Button>
        <Button size="sm" variant="ghost" onClick={onExtrato}>Ver extrato</Button>
      </div>
    </div>
  );
}

/** Painel lateral com as movimentações (extrato) do período. */
export function ExtratoSheet({ conta, onClose }: { conta: Row; onClose: () => void }) {
  const hoje = new Date();
  const [inicio, setInicio] = useState(iso(new Date(hoje.getTime() - 29 * 86400000)));
  const [fim, setFim] = useState(iso(hoje));
  const [busca, setBusca] = useState("");
  const [lista, setLista] = useState<Transacao[] | null>(null);
  const [conciliar, setConciliar] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const consultar = async () => {
    setCarregando(true);
    try {
      const r = await chamarBanco<{ transacoes: Transacao[] }>("extrato", { conta_id: text(rowId(conta)), inicio, fim });
      setLista([...(r.transacoes ?? [])].sort((a, b) => b.data.localeCompare(a.data)));
    } catch (e) { toast.error((e as Error).message); }
    finally { setCarregando(false); }
  };

  const filtrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (lista ?? []).filter((t) => !q || `${t.descricao} ${t.titulo} ${t.tipo} ${t.valor}`.toLowerCase().includes(q));
  }, [lista, busca]);
  const entradas = filtrada.filter((t) => t.operacao === "C").reduce((s, t) => s + t.valor, 0);
  const saidas = filtrada.filter((t) => t.operacao === "D").reduce((s, t) => s + t.valor, 0);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-none lg:w-[60vw]">
        <SheetHeader>
          <SheetTitle>Extrato — {text(conta["descricao"])}</SheetTitle>
          <SheetDescription>Movimentações direto do banco (até 90 dias por consulta).</SheetDescription>
        </SheetHeader>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1"><Label>De</Label><Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
          <div className="space-y-1"><Label>Até</Label><Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} /></div>
          <Button onClick={consultar} disabled={carregando}>
            {carregando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}Consultar
          </Button>
        </div>
        {lista && (
          <>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-md border p-2"><p className="text-muted-foreground text-xs">Entradas</p><p className="text-success font-semibold">{formatBRL(entradas)}</p></div>
              <div className="rounded-md border p-2"><p className="text-muted-foreground text-xs">Saídas</p><p className="text-destructive font-semibold">{formatBRL(saidas)}</p></div>
              <div className="rounded-md border p-2"><p className="text-muted-foreground text-xs">Resultado</p><p className="font-semibold">{formatBRL(entradas - saidas)}</p></div>
            </div>
            <Button variant={conciliar ? "secondary" : "outline"} size="sm" className="self-start" onClick={() => setConciliar((v) => !v)}>
              {conciliar ? "Fechar conciliação" : "Conciliar com o financeiro"}
            </Button>
            {conciliar && <ConciliacaoPainel conta={conta} movs={lista} onFeito={() => setConciliar(false)} />}
            <div className="relative">
              <Search className="text-muted-foreground absolute left-2 top-2.5 h-4 w-4" />
              <Input className="pl-8" placeholder="Buscar por descrição, tipo ou valor..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            {!filtrada.length ? <p className="text-muted-foreground text-sm">Nenhuma movimentação no período.</p> : (
              <div className="divide-y rounded-md border">
                {filtrada.map((t, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 text-sm">
                    {t.operacao === "C" ? <ArrowDownLeft className="text-success h-4 w-4 shrink-0" /> : <ArrowUpRight className="text-destructive h-4 w-4 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{t.titulo || t.descricao || t.tipo}</p>
                      <p className="text-muted-foreground truncate text-xs">{dataBR(t.data)} • {t.tipo}{t.titulo && t.descricao ? ` • ${t.descricao}` : ""}</p>
                    </div>
                    <span className={cn("shrink-0 font-semibold", t.operacao === "C" ? "text-success" : "text-destructive")}>
                      {t.operacao === "D" ? "−" : "+"}{formatBRL(t.valor)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
