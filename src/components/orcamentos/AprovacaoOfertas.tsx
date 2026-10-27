import { tx } from "@/lib/i18n-termos";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, ShieldCheck, Star, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { perguntar } from "@/components/layout/DialogoGlobal";
import { supabase } from "@/integrations/supabase/client";
import { useAudit } from "@/lib/audit";
import { rowId } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { aprovadoresDe, REGRAS_QUORUM, type RegraQuorum, type VotoAprovacao } from "@/lib/aprovacao-compras";
import { ehAprovadorOferta, situacaoOferta, type ConfigAprovacaoOferta, type DadosOferta, type SituacaoOferta } from "@/lib/aprovacao-ofertas";

const SQL_MSG = "Rode o script atendeai-workflow-ofertas.sql no banco.";
const faltaTabela = (m: string) => /ofertas_workflow|orcamento_aprovacoes|aprovacao_status|does not exist|schema cache/i.test(m);

function paraConfig(r: Row | null): ConfigAprovacaoOferta | null {
  if (!r) return null;
  let ad = r["aprovadores_adicionais"];
  if (typeof ad === "string") { try { ad = JSON.parse(ad); } catch { ad = []; } }
  return {
    ativo: r["ativo"] === true,
    aprovadorPrincipalId: r["aprovador_principal_id"] ? String(r["aprovador_principal_id"]) : null,
    aprovadoresAdicionais: Array.isArray(ad) ? ad.map(String) : [],
    regra: String(r["regra_quorum"] ?? "principal") as RegraQuorum,
    valorMinimo: Number(r["valor_minimo"] ?? 0) || 0,
    margemMinima: Number(r["margem_minima"] ?? 0) || 0,
    descontoMaximo: Number(r["desconto_maximo"] ?? 0) || 0,
  };
}

export function useConfigAprovacaoOferta() {
  const { empresaId } = useAudit();
  return useQuery({
    queryKey: ["ofertas-workflow", empresaId],
    enabled: empresaId != null,
    queryFn: async () => {
      const { data, error } = await supabase.from("ofertas_workflow_config" as never).select("*").eq("empresa_id", empresaId as never).maybeSingle();
      if (error) return null;
      return paraConfig(data as Row | null);
    },
  });
}

function useUsuarios() {
  const { empresaId } = useAudit();
  return useQuery({
    queryKey: ["ofertas-workflow", "usuarios", empresaId],
    queryFn: async () => {
      let q: any = supabase.from("usuarios").select("*");
      if (empresaId != null) q = q.eq("empresa_id", empresaId);
      const { data } = await q.limit(1000);
      return ((data ?? []) as Row[])
        .filter((u) => u["status"] !== false)
        .sort((a, b) => nomeUsuario(a).localeCompare(nomeUsuario(b), "pt-BR"));
    },
  });
}
const nomeUsuario = (u: Row | undefined) => String(pick(u ?? {}, ["nome", "email"]) ?? "Usuário");

const VAZIO: ConfigAprovacaoOferta = { ativo: false, aprovadorPrincipalId: null, aprovadoresAdicionais: [], regra: "principal", valorMinimo: 0, margemMinima: 0, descontoMaximo: 0 };

export function ConfigAprovacaoOfertaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { empresaId } = useAudit();
  const { data: atual } = useConfigAprovacaoOferta();
  const { data: usuarios = [] } = useUsuarios();
  const [cfg, setCfg] = useState<ConfigAprovacaoOferta | null>(null);
  const [salvando, setSalvando] = useState(false);
  const v = cfg ?? atual ?? VAZIO;
  const set = (p: Partial<ConfigAprovacaoOferta>) => setCfg({ ...v, ...p });
  const opts = useMemo(() => usuarios.map((u) => ({ value: String(rowId(u)), label: nomeUsuario(u), keywords: [String(u["email"] ?? "")] })), [usuarios]);
  const byId = new Map(usuarios.map((u) => [String(rowId(u)), u]));

  const salvar = async () => {
    if (v.ativo && !v.aprovadorPrincipalId) return void toast.error(tx("Escolha o aprovador principal."));
    setSalvando(true);
    const { error } = await supabase.from("ofertas_workflow_config" as never).upsert({
      empresa_id: empresaId, ativo: v.ativo, aprovador_principal_id: v.aprovadorPrincipalId,
      aprovadores_adicionais: v.aprovadoresAdicionais.filter((a) => a !== v.aprovadorPrincipalId),
      regra_quorum: v.regra, valor_minimo: v.valorMinimo, margem_minima: v.margemMinima, desconto_maximo: v.descontoMaximo,
    } as never, { onConflict: "empresa_id" });
    setSalvando(false);
    if (error) return void toast.error(faltaTabela(error.message) ? SQL_MSG : error.message);
    await qc.invalidateQueries({ queryKey: ["ofertas-workflow"] });
    toast.success(tx("Workflow de aprovação de ofertas salvo."));
    setCfg(null);
    onOpenChange(false);
  };

  const num = (id: string, label: string, val: number, on: (n: number) => void, dica: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" min={0} step="0.01" value={val} onChange={(e) => on(Number(e.target.value) || 0)} />
      <p className="text-xs text-muted-foreground">{dica}</p>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setCfg(null); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{tx("Workflow de aprovação de ofertas")}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium">{tx("Exigir aprovação de gestor")}</p>
              <p className="text-xs text-muted-foreground">{tx("Ofertas montadas por aprovadores são aprovadas direto.")}</p>
            </div>
            <Switch checked={v.ativo} onCheckedChange={(c) => set({ ativo: c })} />
          </div>
          {v.ativo && (
            <>
              <div className="space-y-1.5">
                <Label>{tx("Aprovador principal (sempre aprova)")}</Label>
                <SearchSelect value={v.aprovadorPrincipalId ?? ""} onChange={(x) => set({ aprovadorPrincipalId: x || null })} options={opts} placeholder={tx("Selecione...")} />
              </div>
              <div className="space-y-1.5">
                <Label>{tx("Aprovadores adicionais (gestores)")}</Label>
                <SearchSelect value="" onChange={(x) => x && set({ aprovadoresAdicionais: [...new Set([...v.aprovadoresAdicionais, x])] })}
                  options={opts.filter((o) => o.value !== v.aprovadorPrincipalId && !v.aprovadoresAdicionais.includes(o.value))} placeholder={tx("Adicionar aprovador...")} />
                <div className="flex flex-wrap gap-1.5">
                  {v.aprovadoresAdicionais.filter((a) => a !== v.aprovadorPrincipalId).map((a) => (
                    <span key={a} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                      {nomeUsuario(byId.get(a))}
                      <button type="button" aria-label={tx("Remover")} onClick={() => set({ aprovadoresAdicionais: v.aprovadoresAdicionais.filter((x) => x !== a) })}><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{tx("Regra de aprovação")}</Label>
                <SearchSelect value={v.regra} onChange={(x) => x && set({ regra: x as RegraQuorum })} options={REGRAS_QUORUM} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {num("wfo-val", "Valor a partir de (R$)", v.valorMinimo, (n) => set({ valorMinimo: n }), "0 = não usa.")}
                {num("wfo-mar", "Margem abaixo de (%)", v.margemMinima, (n) => set({ margemMinima: n }), "0 = não usa.")}
                {num("wfo-des", "Desconto acima de (%)", v.descontoMaximo, (n) => set({ descontoMaximo: n }), "0 = não usa.")}
              </div>
              <p className="text-xs text-muted-foreground">{tx("Com os três em 0, toda oferta de vendedor passa por aprovação.")}</p>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tx("Cancelar")}</Button>
          <Button onClick={() => void salvar()} disabled={salvando}>{tx("Salvar")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ROTULO: Record<SituacaoOferta, { t: string; cls: string }> = {
  dispensada: { t: "Aprovação dispensada", cls: "bg-secondary text-secondary-foreground" },
  pendente: { t: "Aguardando aprovação", cls: "bg-warning/15 text-warning" },
  aprovada: { t: "Aprovada", cls: "bg-success/15 text-success" },
  rejeitada: { t: "Rejeitada", cls: "bg-destructive/15 text-destructive" },
  sem_configuracao: { t: "Defina o aprovador principal", cls: "bg-destructive/15 text-destructive" },
};

/** Gestor/Master enxerga dados estratégicos mesmo sem permissão específica. */
export function useEhAprovadorOferta() {
  const { usuarioId } = useAudit();
  const { data: cfg = null } = useConfigAprovacaoOferta();
  return ehAprovadorOferta(cfg, usuarioId != null ? String(usuarioId) : null);
}

/** Painel de aprovação dentro da Oferta; grava a situação em orcamentos.aprovacao_status. */
export function PainelAprovacaoOferta({ orcamentoId, dados, statusAtual }: { orcamentoId: string; dados: DadosOferta; statusAtual: unknown }) {
  const qc = useQueryClient();
  const { usuarioId, empresaId } = useAudit();
  const { data: cfg = null, isSuccess: cfgOk } = useConfigAprovacaoOferta();
  const { data: usuarios = [] } = useUsuarios();
  const { data: votosRows = [], isSuccess: votosOk } = useQuery({
    queryKey: ["ofertas-workflow", "votos", orcamentoId],
    enabled: Boolean(orcamentoId),
    queryFn: async () => {
      const { data, error } = await supabase.from("orcamento_aprovacoes" as never).select("*").eq("orcamento_id", orcamentoId as never).order("created_at", { ascending: true });
      return error ? [] : ((data ?? []) as Row[]);
    },
  });
  const votos: VotoAprovacao[] = votosRows.map((r) => ({ usuarioId: String(r["usuario_id"]), status: r["status"] === "rejeitado" ? "rejeitado" : "aprovado", justificativa: r["justificativa"] as string | null, em: String(r["created_at"] ?? "") }));
  const sit = situacaoOferta(cfg, dados, votos);
  useEffect(() => {
    if (!cfgOk || !votosOk || String(statusAtual ?? "") === sit) return;
    void supabase.from("orcamentos").update({ aprovacao_status: sit } as never).eq("id", orcamentoId as never).then(({ error }) => {
      if (!error) void qc.invalidateQueries({ queryKey: ["table", "orcamentos"] });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgOk, votosOk, sit, orcamentoId]);
  const uid = String(usuarioId ?? "");
  const lista = cfg ? aprovadoresDe(cfg) : [];
  const souAprovador = lista.includes(uid);
  const byId = new Map(usuarios.map((u) => [String(rowId(u)), u]));

  const votar = async (status: "aprovado" | "rejeitado") => {
    let justificativa: string | null = null;
    if (status === "rejeitado") {
      justificativa = await perguntar({ title: "Rejeitar oferta", description: "Informe a justificativa para o vendedor (obrigatória).", required: true, multiline: true });
      if (!justificativa?.trim()) return;
    }
    const { error } = await supabase.from("orcamento_aprovacoes" as never).insert({ empresa_id: empresaId, orcamento_id: orcamentoId, usuario_id: uid, status, justificativa } as never);
    if (error) return void toast.error(faltaTabela(error.message) ? SQL_MSG : error.message);
    await qc.invalidateQueries({ queryKey: ["ofertas-workflow", "votos", orcamentoId] });
    toast.success(status === "aprovado" ? "Oferta aprovada por você." : "Oferta rejeitada.");
  };

  if (sit === "dispensada") return null;
  return (
    <section className="space-y-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-primary" />{tx("Aprovação da oferta")}</h3>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", ROTULO[sit].cls)}>{ROTULO[sit].t}</span>
      </div>
      {sit !== "aprovada" && <p className="text-xs text-muted-foreground">{tx("Proposta, minuta e ativação ficam bloqueadas até a aprovação.")}</p>}
      <div className="space-y-1.5">
        {lista.map((a) => {
          const v = [...votos].reverse().find((x) => x.usuarioId === a);
          return (
            <div key={a} className="flex items-center gap-2 text-sm">
              {v?.status === "aprovado" ? <CheckCircle2 className="h-4 w-4 text-success" /> : v?.status === "rejeitado" ? <XCircle className="h-4 w-4 text-destructive" /> : <Clock className="h-4 w-4 text-muted-foreground" />}
              <span className="flex-1">{nomeUsuario(byId.get(a))}{a === cfg?.aprovadorPrincipalId && <Star className="ml-1 inline h-3 w-3 text-warning" aria-label={tx("Principal")} />}</span>
              <span className="text-xs text-muted-foreground">{v?.em ? new Date(v.em).toLocaleString("pt-BR") : "Pendente"}</span>
            </div>
          );
        })}
      </div>
      {votos.filter((v) => v.justificativa).map((v, i) => (
        <p key={i} className="rounded bg-muted p-2 text-xs text-muted-foreground"><b>{nomeUsuario(byId.get(v.usuarioId))}:</b> {v.justificativa}</p>
      ))}
      {souAprovador && (sit === "pendente" || sit === "rejeitada") && (
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={() => void votar("aprovado")}><CheckCircle2 className="mr-1 h-4 w-4" />{tx("Aprovar")}</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void votar("rejeitado")}><XCircle className="mr-1 h-4 w-4" />{tx("Rejeitar")}</Button>
        </div>
      )}
    </section>
  );
}
