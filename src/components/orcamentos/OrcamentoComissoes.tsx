import { tx } from "@/lib/i18n-termos";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Calculator } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useComissaoConfig } from "@/hooks/useComissaoConfig";
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
  /** Soma só das comissões com beneficiário informado (para a memória de cálculo). */
  onTotalChange?: (total: number) => void;
  /** Pode escolher beneficiários (permissão da aba Financeiro & Comissões da Oferta). */
  podeEditar?: boolean;
};

const NONE = "__none__";
/** Marca um papel do tipo fundo/reserva como ligado nesta oferta. */
const FUNDO = "__fundo__";

export function OrcamentoComissoes({ linhas, orcamentoId, vendedorId, usuarios, onTotalChange, podeEditar = true }: Props) {
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
        .select("*")
        .eq("orcamento_id", orcamentoId as string);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ papel_id: string; beneficiario_id: string | null }>;
    },
  });
  useEffect(() => {
    const rs = registradas.data;
    if (!rs || rs.length === 0) return;
    const m: Record<string, string> = {};
    const fundos = new Set(papeis.filter((p) => p.tipo === "fundo").map((p) => p.id));
    for (const r of rs) m[r.papel_id] = r.beneficiario_id ?? (fundos.has(r.papel_id) ? FUNDO : "");
    setBenef((b) => ({ ...m, ...b }));
  }, [registradas.data, papeis]);
  const temRegistro = (registradas.data?.length ?? 0) > 0;

  const memoria = useMemo(() => calcMemoria(linhas, parametros, papeis), [linhas, parametros, papeis]);

  const benefCalc = (papelId: string, nome: string) =>
    benef[papelId] ?? (temRegistro ? "" : /vend|comerc/i.test(nome) && vendedorId ? vendedorId : "");
  const totalInformado = disponivel
    ? Math.round(memoria.flatMap((g) => g.comissoes).filter((c) => !!benefCalc(c.papel_id, c.nome)).reduce((s, c) => s + c.valor, 0) * 100) / 100
    : 0;
  useEffect(() => {
    onTotalChange?.(totalInformado);
  }, [totalInformado, onTotalChange]);

  if (!disponivel) return null;

  const papeisUsados = Array.from(new Map(memoria.flatMap((g) => g.comissoes).map((c) => [c.papel_id, c.nome])));
  const labelNat = (n: string) => NATUREZAS_COMISSAO.find((x) => x.value === n)?.label ?? n;
  const papelPorId = new Map(papeis.map((p) => [p.id, p]));
  const pessoas = papeisUsados.filter(([id]) => papelPorId.get(id)?.tipo !== "fundo");
  const fundos = papeisUsados.filter(([id]) => papelPorId.get(id)?.tipo === "fundo");
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
          ...(papelPorId.get(c.papel_id)?.tipo === "fundo"
            ? { beneficiario_id: null, conta_bancaria_id: papelPorId.get(c.papel_id)?.conta_bancaria_id ?? null }
            : { beneficiario_id: benefDe(c.papel_id, c.nome, mapa) }),
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
        {tx("Memória de Cálculo & Comissões")}
        <ChevronDown className={cn("ml-auto h-4 w-4 transition-transform", aberto && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 px-4 pb-4">
        {memoria.length === 0 ? (
          <p className="text-muted-foreground text-sm">{tx("Adicione itens para ver a memória de cálculo.")}</p>
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
                <Linha label={tx("Venda")} valor={g.venda} />
                <Linha label={tx("Compra")} valor={g.compra} neg />
                <Linha label={tx("Imposto")} pct={g.imposto_pct} valor={g.imposto} neg />
                <Linha label={tx("Outros custos")} pct={g.outros_pct} valor={g.outros} neg />
                <Linha label={tx("Líquido sem comissão")} valor={g.liquido} forte />
                {g.comissoes.map((c) => (
                  <Linha key={c.papel_id} label={c.nome} pct={c.pct} valor={c.valor} neg />
                ))}
                <Linha label={tx("Resultado da empresa")} valor={g.resultado} forte />
              </div>
            ))}
          </div>
        )}

        {papeis.length === 0 && (
          <p className="text-muted-foreground text-sm">{tx("Nenhum papel de comissão cadastrado. Configure em Comissões › Configuração.")}</p>
        )}

        {orcamentoId && papeisUsados.length > 0 && podeEditar && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium">{tx("Beneficiários da equipe")}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {pessoas.map(([id, nome]) => (
                <div key={id} className="space-y-1">
                  <span className="text-muted-foreground text-xs">{nome}</span>
                  <Select value={benefDe(id, nome) || NONE} onValueChange={(v) => {
                      const novo = { ...benef, [id]: v === NONE ? "" : v };
                      setBenef(novo);
                      void registrar(novo, true);
                    }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{tx("Não informado")}</SelectItem>
                      {usuarios.map((u) => (
                        <SelectItem key={text(rowId(u))} value={text(rowId(u))}>{text(pick(u, ["nome", "email"]))}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {fundos.length > 0 && (
              <>
                <p className="pt-2 text-sm font-medium">{tx("Fundos & reservas da empresa")}</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {fundos.map(([id, nome]) => (
                    <label key={id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                      <span>{nome}{!papelPorId.get(id)?.conta_bancaria_id && <span className="block text-xs text-muted-foreground">{tx("Sem conta de aplicação definida")}</span>}</span>
                      <Switch checked={benefDe(id, nome) === FUNDO} onCheckedChange={(v) => {
                        const novo = { ...benef, [id]: v ? FUNDO : "" };
                        setBenef(novo);
                        void registrar(novo, true);
                      }} />
                    </label>
                  ))}
                </div>
              </>
            )}
            <div className="flex justify-end">
              <Button size="sm" onClick={() => void registrar()} disabled={salvando}>
                {salvando ? "Registrando…" : "Registrar comissões"}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">Somente papéis com beneficiário informado (ou fundo ligado) geram comissão. Ao pagar um fundo, o aporte entra no Contas a Pagar na conta de aplicação. A escolha é salva automaticamente; "Registrar" recalcula as comissões não pagas.</p>
          </div>
        )}
        {!orcamentoId && <p className="text-muted-foreground text-xs">{tx("Salve a oferta para registrar as comissões.")}</p>}
      </CollapsibleContent>
    </Collapsible>
  );
}
