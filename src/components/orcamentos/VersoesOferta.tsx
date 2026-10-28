import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, GitCompare, History, Plus, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { compararVersoes, rotuloVersao, type Snapshot } from "@/lib/oferta-versoes";
import type { Row } from "@/lib/row";
import { OrcamentoDocumento } from "./OrcamentoDocumento";
import { rowId, useTableRows } from "@/lib/crud";
import { pick } from "@/lib/row";
import { useAuth } from "@/hooks/useAuth";

const brl = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Props = {
  orcamentoId: string;
  versaoAtual: number;
  /** Estado salvo atual (para comparar com revisões antigas). */
  atual: Snapshot;
  itens: Row[];
  readOnly?: boolean;
  assinada?: boolean;
  /** Há alterações não salvas no formulário. */
  sujo: () => boolean;
  onRestaurar: (s: Snapshot) => void;
  onNovaVersao: (v: number) => void;
  empresa?: Row | null;
  cliente?: Row;
};

/** Badge da revisão atual + histórico com comparação e restauração. */
export function VersoesOferta({ orcamentoId, versaoAtual, atual, itens, readOnly, assinada, sujo, onRestaurar, onNovaVersao, empresa, cliente }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [comparar, setComparar] = useState<Row | null>(null);
  const [ver, setVer] = useState<Row | null>(null);
  const aberto = !!ver;
  const { data: empresas = [] } = useTableRows("empresas", aberto);
  const { data: parceiros = [] } = useTableRows("parceiros", aberto);
  const { data: usuarios = [] } = useTableRows("usuarios", aberto);
  const { data: unidades = [] } = useTableRows("unidade_medida", aberto);
  const { data: marcas = [] } = useTableRows("itens_marcas", aberto);
  const { empresa: empresaAuth } = useAuth();
  const achar = (rows: Row[], id: unknown) => (id ? rows.find((r) => String(rowId(r) ?? "") === String(id)) : undefined);
  const key = ["orcamento_versoes", orcamentoId];
  const nomeItem = (id: string) => String(itens.find((i) => String(i["id"]) === id)?.["descricao"] ?? itens.find((i) => String(i["id"]) === id)?.["nome"] ?? "Item");

  const { data: versoes = [], error } = useQuery({
    queryKey: key,
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("orcamento_versoes" as never).select("*").eq("orcamento_id", orcamentoId).order("versao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const nova = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("oferta_nova_versao" as never, { _orc: orcamentoId, _motivo: motivo } as never);
      if (error) throw error;
      return Number(data);
    },
    onSuccess: (v) => {
      setMotivo("");
      toast.success(`${rotuloVersao(v - 1)} congelada. Agora você está editando a ${rotuloVersao(v)}.`);
      onNovaVersao(v);
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["orcamento_interacoes", orcamentoId] });
    },
    onError: (e: unknown) => {
      const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? "");
      toast.error(/oferta_nova_versao|does not exist|schema cache/i.test(m) ? "Rode o script atendeai-oferta-versoes.sql antes." : m || "Não foi possível criar a revisão.");
    },
  });

  const criar = async () => {
    const aviso = sujo() ? " Atenção: alterações ainda não salvas em tela não entram nesta revisão." : "";
    if (await confirmar({ title: `Congelar a ${rotuloVersao(versaoAtual)}?`, description: `A ${rotuloVersao(versaoAtual)} fica guardada como está gravada e você passa a editar a ${rotuloVersao(versaoAtual + 1)}.${aviso}`, confirmText: "Criar nova revisão" })) nova.mutate();
  };

  const restaurar = async (v: Row) => {
    if (!(await confirmar({ title: `Restaurar a ${rotuloVersao(v["versao"])}?`, description: "Os itens e valores dessa revisão voltam para o formulário. Confira e clique em Salvar para aplicar.", confirmText: "Restaurar" }))) return;
    onRestaurar(v["snapshot"] as Snapshot);
    setOpen(false);
    toast.info("Revisão carregada no formulário. Clique em Salvar para aplicar.");
  };

  const diff = comparar ? compararVersoes(comparar["snapshot"] as Snapshot, atual, nomeItem) : null;
  const semScript = error && /orcamento_versoes|does not exist|schema cache/i.test(String((error as { message?: string }).message ?? ""));

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-7 gap-1" onClick={() => setOpen(true)}>
        <History className="h-3.5 w-3.5" /> {rotuloVersao(versaoAtual)}
      </Button>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setComparar(null); }}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Revisões da Oferta</DialogTitle>
            <DialogDescription>Você está editando a {rotuloVersao(versaoAtual)}. As revisões anteriores ficam congeladas para consulta.</DialogDescription>
          </DialogHeader>

          {semScript && <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">Rode o script atendeai-oferta-versoes.sql no SQL Editor para usar as revisões.</p>}

          {!readOnly && !assinada && (
            <div className="space-y-2 rounded-lg border p-3">
              <Label>Motivo da nova revisão (opcional)</Label>
              <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: cliente pediu 5% de desconto e retirada do item 3" />
              <div className="flex justify-end">
                <Button size="sm" onClick={criar} disabled={nova.isPending}><Plus className="mr-1 h-4 w-4" /> {nova.isPending ? "Congelando…" : `Congelar ${rotuloVersao(versaoAtual)} e abrir ${rotuloVersao(versaoAtual + 1)}`}</Button>
              </div>
            </div>
          )}
          {assinada && <p className="text-sm text-muted-foreground">Oferta assinada: novas revisões estão bloqueadas.</p>}

          <div className="space-y-2">
            {versoes.length === 0 && !semScript && <p className="text-sm text-muted-foreground">Nenhuma revisão anterior ainda.</p>}
            {versoes.map((v) => (
              <div key={String(v["id"])} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{rotuloVersao(v["versao"])}</Badge>
                  <span className="text-sm font-medium">{brl(v["total_liquido"])}{Number(v["total_recorrente"]) > 0 ? ` + ${brl(v["total_recorrente"])}/mês` : ""}</span>
                  <span className="text-xs text-muted-foreground">{String(v["qtd_itens"] ?? 0)} itens · margem {Number(v["margem_pct"] ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
                  <div className="ml-auto flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setVer(v)}><Eye className="mr-1 h-4 w-4" /> Visualizar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setComparar(comparar?.["id"] === v["id"] ? null : v)}><GitCompare className="mr-1 h-4 w-4" /> Comparar</Button>
                    {!readOnly && !assinada && <Button size="sm" variant="ghost" onClick={() => void restaurar(v)}><RotateCcw className="mr-1 h-4 w-4" /> Restaurar</Button>}
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(String(v["created_at"])).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  {v["criado_por_nome"] ? ` · ${String(v["criado_por_nome"])}` : ""}
                  {v["motivo"] ? ` — ${String(v["motivo"])}` : ""}
                </p>
                {comparar?.["id"] === v["id"] && diff && (
                  <div className="mt-3 space-y-2 rounded-md bg-muted/50 p-3 text-sm">
                    <p className="font-medium">{rotuloVersao(v["versao"])} → {rotuloVersao(versaoAtual)} (salva)</p>
                    {diff.igual && <p className="text-muted-foreground">Sem diferenças.</p>}
                    {diff.itens.map((d) => (
                      <p key={d.chave + d.tipo}>
                        <span className={d.tipo === "removido" ? "text-destructive" : "text-primary"}>{d.tipo === "adicionado" ? "+ Adicionado" : d.tipo === "removido" ? "− Removido" : "~ Alterado"}</span>{" "}
                        {d.nome}
                        {d.tipo === "alterado" && ` (qtd ${Number(d.antes?.quantidade ?? 0)} → ${Number(d.depois?.quantidade ?? 0)}, unit. ${brl(d.antes?.valor_unitario)} → ${brl(d.depois?.valor_unitario)})`}
                      </p>
                    ))}
                    {diff.campos.map((c) => (
                      <p key={c.campo}>{c.rotulo}: {c.campo === "margem_pct" ? `${c.antes.toFixed(1)}% → ${c.depois.toFixed(1)}%` : `${brl(c.antes)} → ${brl(c.depois)}`} <span className={c.delta < 0 ? "text-destructive" : "text-primary"}>({c.delta > 0 ? "+" : ""}{c.campo === "margem_pct" ? `${c.delta.toFixed(1)} p.p.` : brl(c.delta)})</span></p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!ver} onOpenChange={(o) => !o && setVer(null)}>
        <DialogContent className="max-h-[92vh] w-[96vw] max-w-4xl overflow-y-auto p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>{ver ? `${rotuloVersao(ver["versao"])} (congelada)` : ""}</DialogTitle>
            <DialogDescription>Somente consulta — esta revisão não pode ser alterada.</DialogDescription>
          </DialogHeader>
          {ver && (() => {
            const s = (ver["snapshot"] ?? {}) as Partial<Snapshot>;
            const orc = { ...(s.orcamento ?? {}), versao_atual: ver["versao"] } as Row;
            const linhas = ((s.itens ?? []) as Row[]).map((l, i) => ({ id: `snap-${i}`, ordem: i, ...l }));
            const emp = achar(empresas, orc["empresa_id"]) ?? empresa ?? (empresaAuth as Row | null | undefined);
            const cli = achar(parceiros, pick(orc, ["parceiro_id", "parceiros_id"])) ?? cliente;
            const vend = achar(usuarios, pick(orc, ["usuario_id", "vendedor_id"]));
            return <OrcamentoDocumento orcamento={orc} linhas={linhas} empresa={emp} cliente={cli} vendedor={vend} itens={itens} unidades={unidades} marcas={marcas} />;
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}
