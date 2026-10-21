import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Layers, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { supabase } from "@/integrations/supabase/client";
import { verificarNumeroWhatsApp } from "@/lib/ofertas-acompanhamento.functions";
import { telefoneConsulta } from "@/lib/whatsapp-verificacao";
import { geocodificar } from "@/lib/geocodificacao";
import { idColumn } from "@/lib/crud";
import type { Row } from "@/lib/row";

/** Resultado de uma ação por registro: ok=true sucesso, ok=false falha/divergência. */
export type ResultadoLote = { ok: boolean; mensagem?: string };

export type AcaoLote = {
  label: string;
  icon?: ReactNode;
  destrutiva?: boolean;
  /** Texto de confirmação antes de executar. */
  confirmacao?: string;
  /** Pausa entre registros (ms), para APIs externas com limite. */
  intervalo?: number;
  executar: (row: Row) => Promise<ResultadoLote>;
};

type Props = {
  tabela: string;
  selecionados: Row[];
  totalFiltrado: number;
  rotulo: (row: Row) => string;
  onSelecionarTodos: () => void;
  onLimpar: () => void;
  acoes: AcaoLote[];
};

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function BarraAcoesLote({ tabela, selecionados, totalFiltrado, rotulo, onSelecionarTodos, onLimpar, acoes }: Props) {
  const qc = useQueryClient();
  const [exec, setExec] = useState<{ titulo: string; feitos: number; total: number; rodando: boolean; log: { nome: string; ok: boolean; mensagem?: string }[] } | null>(null);
  if (selecionados.length === 0) return null;

  async function rodar(a: AcaoLote) {
    if (a.confirmacao && !(await confirmar(a.confirmacao.replace("{n}", String(selecionados.length))))) return;
    const lista = [...selecionados];
    setExec({ titulo: a.label, feitos: 0, total: lista.length, rodando: true, log: [] });
    for (let i = 0; i < lista.length; i++) {
      const row = lista[i]!;
      let r: ResultadoLote;
      try { r = await a.executar(row); } catch (e) { r = { ok: false, mensagem: e instanceof Error ? e.message : "Erro" }; }
      setExec((p) => p && { ...p, feitos: i + 1, log: [...p.log, { nome: rotulo(row), ...r }] });
      if (a.intervalo && i < lista.length - 1) await espera(a.intervalo);
    }
    setExec((p) => p && { ...p, rodando: false });
    qc.invalidateQueries({ queryKey: ["table", tabela] });
  }

  const ok = exec?.log.filter((l) => l.ok).length ?? 0;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 p-2 text-sm">
        <span className="font-medium">{selecionados.length} selecionado(s)</span>
        {selecionados.length < totalFiltrado && (
          <Button variant="link" size="sm" onClick={onSelecionarTodos}>Selecionar todos os {totalFiltrado} filtrados</Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm"><Layers className="mr-1 h-4 w-4" />Ações em lote</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {acoes.map((a) => (
              <DropdownMenuItem key={a.label} className={a.destrutiva ? "text-destructive focus:text-destructive" : undefined} onClick={() => void rodar(a)}>
                {a.icon}{a.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="sm" onClick={onLimpar}><X className="mr-1 h-4 w-4" />Limpar</Button>
      </div>
      <Dialog open={!!exec} onOpenChange={(o) => { if (!o && !exec?.rodando) { setExec(null); onLimpar(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{exec?.titulo}</DialogTitle></DialogHeader>
          {exec && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {exec.rodando ? `Processando ${exec.feitos} de ${exec.total}…` : `Concluído: ${ok} com sucesso, ${exec.total - ok} com falha ou divergência.`}
              </p>
              <Progress value={(exec.feitos / Math.max(1, exec.total)) * 100} />
              <div className="max-h-72 space-y-1 overflow-y-auto text-xs">
                {exec.log.map((l, i) => (
                  <div key={i} className="flex justify-between gap-2 border-b border-border py-1">
                    <span className="truncate">{l.nome}</span>
                    <span className={l.ok ? "text-success" : "text-destructive"}>{l.mensagem ?? (l.ok ? "OK" : "Falha")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button disabled={exec?.rodando} onClick={() => { setExec(null); onLimpar(); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------- Ações reutilizáveis ---------- */

export function useAcoesComuns(tabela: string) {
  const consultarWpp = useServerFn(verificarNumeroWhatsApp);

  const atualizar = async (row: Row, valores: Record<string, unknown>): Promise<ResultadoLote> => {
    const k = idColumn(row);
    const { error } = await supabase.from(tabela as never).update(valores as never).eq(k, row[k] as never);
    return error ? { ok: false, mensagem: error.message } : { ok: true };
  };

  const verificarWhatsApp = (campo = "telefone") => async (row: Row): Promise<ResultadoLote> => {
    const tel = String(row[campo] ?? "");
    if (!telefoneConsulta(tel)) return { ok: false, mensagem: "Telefone inválido ou vazio" };
    const r = await consultarWpp({ data: { telefone: tel, atualizar: true } });
    if (r.status === "possui") return { ok: true, mensagem: "Possui WhatsApp" };
    if (r.status === "nao_possui") return { ok: false, mensagem: "Não possui WhatsApp" };
    return { ok: false, mensagem: r.mensagem ?? "Não foi possível verificar" };
  };

  const definirStatus = (ativo: boolean) => (row: Row) => atualizar(row, { status: ativo });

  const excluir = async (row: Row): Promise<ResultadoLote> => {
    const k = idColumn(row);
    const { error } = await supabase.from(tabela as never).delete().eq(k, row[k] as never);
    if (!error) return { ok: true, mensagem: "Excluído" };
    const fk = error.code === "23503" || /foreign key|viola/i.test(error.message);
    return { ok: false, mensagem: fk ? "Possui vínculos — inative" : error.message };
  };

  return { atualizar, verificarWhatsApp, definirStatus, excluir };
}

export async function consultarCnpjReceita(row: Row, atualizar: (row: Row, v: Record<string, unknown>) => Promise<ResultadoLote>): Promise<ResultadoLote> {
  const cnpj = String(row["documento"] ?? "").replace(/\D/g, "");
  if (cnpj.length !== 14) return { ok: false, mensagem: "Não é CNPJ" };
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  if (!res.ok) return { ok: false, mensagem: res.status === 429 ? "Limite da Receita, tente depois" : "Não encontrado na Receita" };
  const d = await res.json();
  const situacao = String(d.descricao_situacao_cadastral ?? "").toUpperCase();
  const r = await atualizar(row, {
    razao_social: d.razao_social || row["razao_social"],
    nome_fantasia: d.nome_fantasia || row["nome_fantasia"],
    situacao_cadastral: situacao,
    motivo_situacao_cadastral: d.descricao_motivo_situacao_cadastral || "",
    cnae_principal_codigo: d.cnae_fiscal != null ? String(d.cnae_fiscal) : row["cnae_principal_codigo"],
    cnae_principal_descricao: d.cnae_fiscal_descricao || row["cnae_principal_descricao"],
  });
  return r.ok ? { ok: situacao === "ATIVA", mensagem: situacao || "Atualizado" } : r;
}

export async function geolocalizarRegistro(row: Row, atualizar: (row: Row, v: Record<string, unknown>) => Promise<ResultadoLote>): Promise<ResultadoLote> {
  const s = (k: string) => String(row[k] ?? "");
  if (!s("cidade") && !s("cep")) return { ok: false, mensagem: "Sem endereço" };
  const c = await geocodificar({ endereco: s("endereco"), numero: s("numero"), bairro: s("bairro"), cidade: s("cidade"), uf: s("uf"), cep: s("cep") });
  if (!c) return { ok: false, mensagem: "Endereço não localizado" };
  const r = await atualizar(row, { latitude: c.latitude, longitude: c.longitude });
  return r.ok ? { ok: true, mensagem: `${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}` } : r;
}
