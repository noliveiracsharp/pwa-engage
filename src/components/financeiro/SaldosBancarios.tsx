import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Landmark, Loader2, RefreshCw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { chamarBanco } from "@/lib/banco-api";
import { rowId, text, useTableRows } from "@/lib/crud";
import { formatBRL } from "@/lib/orcamentos";
import { contasDaEmpresa, saldoConsultado, somarSaldos } from "@/lib/saldos-bancarios";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { haQuanto } from "./SaldoExtrato";

export function SaldosBancarios() {
  const { empresa } = useAuth();
  const empresaId = empresa ? text(rowId(empresa)) : "";
  const qc = useQueryClient();
  const { data = [], isLoading, isError, refetch } = useTableRows("financeiro_contas_bancarias", !!empresaId);
  const contas = contasDaEmpresa(data, empresaId);
  const integradas = contas.filter((c) => c["ativo"] !== false && c["api_ativo"] === true && !!c["provedor_api"]);
  const soma = somarSaldos(contas);
  const [ocupadas, setOcupadas] = useState<string[]>([]);
  const [falhas, setFalhas] = useState<Record<string, string>>({});
  const emAndamento = useRef(new Set<string>());

  const atualizar = async (lista: Row[]) => {
    const alvos = lista.filter((c) => !emAndamento.current.has(text(rowId(c))));
    if (!alvos.length) return;
    for (const c of alvos) emAndamento.current.add(text(rowId(c)));
    setOcupadas([...emAndamento.current]);
    await Promise.all(alvos.map(async (conta) => {
      const id = text(rowId(conta));
      try {
        await chamarBanco("saldo", { conta_id: id });
        setFalhas((prev) => { const next = { ...prev }; delete next[id]; return next; });
      } catch (e) {
        const mensagem = e instanceof Error ? e.message : "Não foi possível atualizar o saldo.";
        setFalhas((prev) => ({ ...prev, [id]: mensagem }));
        toast.error(`${text(conta["descricao"])}: ${mensagem}`);
      } finally {
        emAndamento.current.delete(id);
        setOcupadas([...emAndamento.current]);
      }
    }));
    await qc.invalidateQueries({ queryKey: ["table", "financeiro_contas_bancarias"] });
  };

  if (isLoading) return <p className="text-muted-foreground text-xs" role="status">Carregando saldos bancários…</p>;
  if (isError) return <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-destructive">Não foi possível carregar os saldos.</span><Button size="sm" variant="outline" onClick={() => void refetch()}>Tentar novamente</Button></div>;
  if (!contas.length) return null;
  return (
    <section aria-label="Saldos bancários" className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-muted-foreground flex items-center gap-2 text-xs font-semibold"><Landmark className="h-4 w-4" />Saldos bancários • última consulta</h2>
        {!!integradas.length && <Button size="sm" variant="outline" disabled={ocupadas.length > 0} onClick={() => void atualizar(integradas)}>
          {ocupadas.length ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Atualizar saldos
        </Button>}
      </div>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {contas.length > 1 && <div className="bg-primary/5 border-primary/30 min-w-0 rounded-md border p-3">
          <p className="text-primary flex items-center gap-2 text-xs font-semibold"><Wallet className="h-4 w-4 shrink-0" />{soma.pendentes ? "Total parcial dos bancos" : "Total dos bancos"}</p>
          <p className={cn("mt-1 break-words text-lg font-bold tabular-nums", (soma.total ?? 0) < 0 && "text-destructive")}>{soma.total === null ? "—" : formatBRL(soma.total)}</p>
          <p className="text-muted-foreground text-xs">{soma.consultadas} de {contas.length} contas com saldo{soma.pendentes ? ` • ${soma.pendentes} sem consulta` : ""}</p>
        </div>}
        {contas.map((c) => {
          const id = text(rowId(c));
          const saldo = saldoConsultado(c);
          const podeConsultar = integradas.some((i) => text(rowId(i)) === id);
          return <div key={id} className="bg-card min-w-0 rounded-md border p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 break-words text-xs font-semibold">{text(c["descricao"]) || "Conta bancária"}{c["ativo"] === false ? " • Inativa" : ""}</p>
              {podeConsultar && <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" aria-label={`Atualizar saldo de ${text(c["descricao"])}`} title="Atualizar saldo" disabled={ocupadas.includes(id)} onClick={() => void atualizar([c])}>
                {ocupadas.includes(id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>}
            </div>
            <p className={cn("mt-1 break-words text-lg font-semibold tabular-nums", (saldo ?? 0) < 0 && "text-destructive")}>{saldo === null ? "—" : formatBRL(saldo)}</p>
            <p className="text-muted-foreground text-xs">{saldo === null ? "Saldo não consultado" : haQuanto(c["saldo_consultado_em"])}{!podeConsultar ? " • Sem integração ativa" : ""}</p>
            {falhas[id] && <p role="status" className="text-destructive mt-1 break-words text-xs">Atualização falhou; última consulta preservada.</p>}
          </div>;
        })}
      </div>
    </section>
  );
}