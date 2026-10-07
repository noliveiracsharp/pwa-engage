import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Calculator } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useComissaoConfig } from "@/hooks/useComissaoConfig";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useAudit } from "@/lib/audit";
import { calcMemoria, NATUREZAS_COMISSAO, type LinhaComissao } from "@/lib/comissoes";
import { formatBRL, formatPct } from "@/lib/orcamentos";
import { rowId, text } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";

type Props = {
  linhas: LinhaComissao[];
  orcamentoId?: string | undefined;
  vendedorId?: string | undefined;
  usuarios: Row[];
};

const NONE = "__none__";

export function OrcamentoComissoes({ linhas, orcamentoId, vendedorId, usuarios }: Props) {
  const perms = usePagePermissions("/comissoes");
  const { parametros, papeis, disponivel } = useComissaoConfig();
  const { empresaId } = useAudit();
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [benef, setBenef] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  const registradas = useQuery({
    queryKey: ["table", "orcamento_comissoes", orcamentoId],
    enabled: !!orcamentoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orcamento_comissoes")
        .select("papel_id, beneficiario_id")
        .eq("orcamento_id", orcamentoId as string);
      if (error) throw error;
      return (data ?? []) as Array<{ papel_id: string; beneficiario_id: string | null }>;
    },
  });
  useEffect(() => {
    const rs = registradas.data;
    if (!rs || rs.length === 0) return;
    const m: Record<string, string> = {};
    for (const r of rs) m[r.papel_id] = r.beneficiario_id ?? "";
    setBenef((b) => ({ ...m, ...b }));
  }, [registradas.data]);
  const temRegistro = (registradas.data?.length ?? 0) > 0;

  const memoria = useMemo(() => calcMemoria(linhas, parametros, papeis), [linhas, parametros, papeis]);

  if (perms.loading || !perms.canRead || !disponivel) return null;

  const papeisUsados = Array.from(new Map(memoria.flatMap((g) => g.comissoes).map((c) => [c.papel_id, c.nome])));
  const labelNat = (n: string) => NATUREZAS_COMISSAO.find((x) => x.value === n)?.label ?? n;
  const benefDe = (papelId: string, nome: string, mapa = benef) =>
    mapa[papelId] ?? (temRegistro ? "" : /vend|comerc/i.test(nome) && vendedorId ? vendedorId : "");

  const registrar = async (mapa = benef, silencioso = false) => {
    if (!orcamentoId) return;
    setSalvando(true);
    try {
      const { error: delErr } = await supabase
        .from("orcamento_comissoes")
        .delete()
        .eq("orcamento_id", orcamentoId)
        .neq("status", "paga");
      if (delErr) throw delErr;
      const rows = memoria.flatMap((g) =>
        g.comissoes
          .filter((c) => !!benefDe(c.papel_id, c.nome, mapa))
          .map((c) => ({
          empresa_id: empresaId,
          orcamento_id: orcamentoId,
          papel_id: c.papel_id,
          papel_nome: c.nome,
          natureza: g.natureza,
          beneficiario_id: benefDe(c.papel_id, c.nome, mapa),
          base_valor: g.base_valor,
          pct: c.pct,
          valor: c.valor,
          status: "prevista",
        })),
      );
      if (rows.length) {
        const { error } = await supabase.from("orcamento_comissoes").insert(rows as never);
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["table", "orcamento_comissoes"] });
      if (!silencioso) toast.success(rows.length ? "Comissões registradas como Previstas." : "Nenhum beneficiário informado — nenhuma comissão registrada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar as comissões.");
    } finally {
      setSalvando(false);
    }
  };

  const Linha = ({ label, valor, pct, forte, neg }: { label: string; valor: number; pct?: number; forte?: boolean; neg?: boolean }) => (
    <div className={cn("flex justify-between gap-2 py-0.5 text-sm", forte && "border-t pt-1.5 font-semibold")}>
      <span className="text-muted-foreground">
        {label}
        {pct !== undefined && <span className="ml-1 text-xs">({formatPct(pct)})</span>}
      </span>
      <span className={cn("tabular-nums", neg && "text-destructive")}>{neg ? "− " : ""}{formatBRL(valor)}</span>
    </div>
  );

  return (
    <Collapsible open={aberto} onOpenChange={setAberto} className="rounded-lg border">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-3 text-left font-semibold">
        <Calculator className="h-4 w-4" />
        Memória de Cálculo &amp; Comissões
        <ChevronDown className={cn("ml-auto h-4 w-4 transition-transform", aberto && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 px-4 pb-4">
        {memoria.length === 0 ? (
          <p className="text-muted-foreground text-sm">Adicione itens para ver a memória de cálculo.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {memoria.map((g) => (
              <div key={g.natureza} className="bg-muted/30 rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold">{labelNat(g.natureza)}</span>
                  <span className="text-muted-foreground text-xs">
                    {g.natureza === "recorrente" ? "Mensal" : "Pontual"} · base {g.base === "bruto" ? "venda" : "líquido"}
                  </span>
                </div>
                <Linha label="Venda" valor={g.venda} />
                <Linha label="Compra" valor={g.compra} neg />
                <Linha label="Imposto" pct={g.imposto_pct} valor={g.imposto} neg />
                <Linha label="Outros custos" pct={g.outros_pct} valor={g.outros} neg />
                <Linha label="Líquido sem comissão" valor={g.liquido} forte />
                {g.comissoes.map((c) => (
                  <Linha key={c.papel_id} label={c.nome} pct={c.pct} valor={c.valor} neg />
                ))}
                <Linha label="Resultado da empresa" valor={g.resultado} forte />
              </div>
            ))}
          </div>
        )}

        {papeis.length === 0 && (
          <p className="text-muted-foreground text-sm">Nenhum papel de comissão cadastrado. Configure em Comissões › Configuração.</p>
        )}

        {orcamentoId && papeisUsados.length > 0 && perms.canCreate && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium">Beneficiários</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {papeisUsados.map(([id, nome]) => (
                <div key={id} className="space-y-1">
                  <span className="text-muted-foreground text-xs">{nome}</span>
                  <Select value={benefDe(id, nome) || NONE} onValueChange={(v) => {
                      const novo = { ...benef, [id]: v === NONE ? "" : v };
                      setBenef(novo);
                      void registrar(novo, true);
                    }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Não informado</SelectItem>
                      {usuarios.map((u) => (
                        <SelectItem key={text(rowId(u))} value={text(rowId(u))}>{text(pick(u, ["nome", "email"]))}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => void registrar()} disabled={salvando}>
                {salvando ? "Registrando…" : "Registrar comissões"}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">Somente papéis com beneficiário informado geram comissão. A escolha é salva automaticamente; "Registrar" recalcula as comissões não pagas.</p>
          </div>
        )}
        {!orcamentoId && <p className="text-muted-foreground text-xs">Salve a oferta para registrar as comissões.</p>}
      </CollapsibleContent>
    </Collapsible>
  );
}
