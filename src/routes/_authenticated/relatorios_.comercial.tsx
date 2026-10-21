import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useAudit } from "@/lib/audit";
import { useTableRows } from "@/lib/crud";
import { kanbanDoModuloOrcamentos } from "@/lib/orcamento-kanban";
import { formatBRL } from "@/lib/orcamentos";
import { valorOferta } from "@/lib/temperatura";
import { forecastPonderado, negocioEncerrado, negocioPerdido, percentualMeta, probabilidadeEtapa, resumoPerdas } from "@/lib/crm";
import type { Row } from "@/lib/row";

export const Route = createFileRoute("/_authenticated/relatorios_/comercial")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Painel Comercial — Atende.ai" },
      { name: "description", content: "Metas por vendedor, previsão de vendas ponderada e motivos de perda." },
      { property: "og:title", content: "Painel Comercial — Atende.ai" },
      { property: "og:description", content: "Metas por vendedor, previsão de vendas ponderada e motivos de perda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PainelComercial,
});

const ganha = (s: unknown) => /ativa|ganh|aprovad/.test(String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());
const mesDe = (v: unknown) => String(v ?? "").slice(0, 7);

function PainelComercial() {
  const perms = usePagePermissions("/relatorios");
  const { empresaId } = useAudit();
  const qc = useQueryClient();
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7));
  const { data: ofertasTodas = [] } = useTableRows("orcamentos");
  const { data: usuariosTodos = [] } = useTableRows("usuarios");
  const { data: etapas = [] } = useQuery({
    queryKey: ["crm-etapas-probabilidade"],
    queryFn: async () => {
      const k = await kanbanDoModuloOrcamentos();
      if (!k) return [] as Row[];
      const { data } = await supabase.from("kanban_etapas").select("*").eq("kanban_nome_id", k).order("ordem");
      return (data ?? []) as Row[];
    },
  });
  const [metas, setMetas] = useState<Record<string, string>>({});
  const [probs, setProbs] = useState<Record<string, string>>({});

  const mesmo = (r: Row) => empresaId === undefined || !r["empresa_id"] || String(r["empresa_id"]) === String(empresaId);
  const ofertas = ofertasTodas.filter(mesmo);
  const usuarios = usuariosTodos.filter(mesmo).sort((a, b) => String(a["nome"] ?? "").localeCompare(String(b["nome"] ?? ""), "pt-BR"));

  const dados = useMemo(() => {
    const abertas = ofertas.filter((o) => !negocioEncerrado(o["situacao"]));
    const idx = new Map(etapas.map((e, i) => [String(e["id"]), i]));
    const comProb = abertas.map((o) => {
      const i = idx.get(String(o["kanban_etapa_id"] ?? ""));
      const p = i === undefined ? 10 : probabilidadeEtapa(etapas[i], i, etapas.length);
      return { o, valor: valorOferta(o), probabilidade: p };
    });
    const doMes = (o: Row) => mesDe(o["atualizado_em"] ?? o["updated_at"] ?? o["dt_orcamento"]) === mes;
    const ganhasMes = ofertas.filter((o) => ganha(o["situacao"]) && doMes(o));
    const perdidasMes = ofertas.filter((o) => negocioPerdido(o["situacao"]) && doMes(o));
    return {
      pipeline: comProb.reduce((s, x) => s + x.valor, 0),
      forecast: forecastPonderado(comProb),
      ganhoMes: ganhasMes.reduce((s, o) => s + valorOferta(o), 0),
      ganhasMes,
      perdas: resumoPerdas(perdidasMes.map((o) => ({ motivo: (o["motivo_perda"] as string) ?? null, valor: valorOferta(o) }))),
      origens: resumoPerdas(ofertas.filter(doMes).map((o) => ({ motivo: (o["origem_lead"] as string) ?? "Não informada", valor: valorOferta(o) }))),
      porEtapa: etapas.map((e, i) => {
        const itens = comProb.filter((x) => String(x.o["kanban_etapa_id"] ?? "") === String(e["id"]));
        return { e, i, qtd: itens.length, valor: itens.reduce((s, x) => s + x.valor, 0), prob: probabilidadeEtapa(e, i, etapas.length) };
      }),
    };
  }, [ofertas, etapas, mes]);

  const salvar = useMutation({
    mutationFn: async () => {
      for (const [id, v] of Object.entries(metas)) {
        const { error } = await supabase.from("usuarios").update({ meta_mensal: Number(v.replace(/\./g, "").replace(",", ".")) || 0 } as never).eq("id", id);
        if (error) throw error;
      }
      for (const [id, v] of Object.entries(probs)) {
        const { error } = await supabase.from("kanban_etapas").update({ probabilidade: Math.max(0, Math.min(100, Number(v) || 0)) } as never).eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setMetas({}); setProbs({});
      void qc.invalidateQueries({ queryKey: ["table", "usuarios"] });
      void qc.invalidateQueries({ queryKey: ["crm-etapas-probabilidade"] });
      toast.success("Metas e probabilidades salvas.");
    },
    onError: () => toast.error("Não foi possível salvar. Rode o script atendeai-crm-metas.sql."),
  });

  if (!perms.loading && !perms.canRead) return <p className="text-muted-foreground">Sem acesso.</p>;
  const editando = Object.keys(metas).length + Object.keys(probs).length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild><Link to="/relatorios" aria-label="Voltar"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <h1 className="text-2xl font-bold text-foreground">Painel Comercial</h1>
        </div>
        <div className="flex items-center gap-2">
          <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="w-44" aria-label="Mês" />
          {perms.canUpdate && editando && (
            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}><Save className="mr-2 h-4 w-4" />Salvar</Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Pipeline em aberto", dados.pipeline],
          ["Previsão ponderada", dados.forecast],
          ["Vendido no mês", dados.ganhoMes],
        ].map(([l, v]) => (
          <div key={String(l)} className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">{l}</p>
            <p className="text-2xl font-semibold text-foreground">{formatBRL(Number(v))}</p>
          </div>
        ))}
      </div>

      <section className="rounded-lg border bg-card p-4 space-y-3">
        <h2 className="font-semibold">Metas por vendedor</h2>
        {usuarios.map((u) => {
          const id = String(u["id"]);
          const meta = Number(metas[id]?.replace(/\./g, "").replace(",", ".") ?? u["meta_mensal"] ?? 0) || 0;
          const vendido = dados.ganhasMes.filter((o) => String(o["usuario_id"] ?? "") === id).reduce((s, o) => s + valorOferta(o), 0);
          const pct = percentualMeta(vendido, meta);
          return (
            <div key={id} className="grid items-center gap-2 sm:grid-cols-[200px_160px_1fr_150px]">
              <span className="truncate text-sm">{String(u["nome"] ?? "—")}</span>
              <Input inputMode="decimal" disabled={!perms.canUpdate} placeholder="Meta R$"
                value={metas[id] ?? (u["meta_mensal"] ? String(u["meta_mensal"]).replace(".", ",") : "")}
                onChange={(e) => setMetas((m) => ({ ...m, [id]: e.target.value }))} />
              <Progress value={Math.min(100, pct)} />
              <span className="text-right text-sm text-muted-foreground">{formatBRL(vendido)} · {pct.toLocaleString("pt-BR")}%</span>
            </div>
          );
        })}
      </section>

      <section className="rounded-lg border bg-card p-4 space-y-2">
        <h2 className="font-semibold">Funil e probabilidade por etapa</h2>
        <p className="text-xs text-muted-foreground">A previsão multiplica o valor de cada Oferta pela chance de fechar da etapa onde ela está.</p>
        {dados.porEtapa.map(({ e, qtd, valor, prob }) => {
          const id = String(e["id"]);
          return (
            <div key={id} className="grid items-center gap-2 sm:grid-cols-[1fr_90px_160px_110px]">
              <span className="truncate text-sm">{String(e["descricao"] ?? "")}</span>
              <span className="text-sm text-muted-foreground">{qtd} oferta(s)</span>
              <span className="text-sm">{formatBRL(valor)}</span>
              <div className="flex items-center gap-1">
                <Input type="number" min={0} max={100} disabled={!perms.canUpdate} className="h-8"
                  value={probs[id] ?? String(prob)} onChange={(ev) => setProbs((p) => ({ ...p, [id]: ev.target.value }))} aria-label="Probabilidade" />
                <span className="text-sm">%</span>
              </div>
            </div>
          );
        })}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {[
          ["Motivos de perda no mês", dados.perdas, "Nenhuma oferta perdida no mês."],
          ["Origem dos negócios no mês", dados.origens, "Nenhuma oferta movimentada no mês."],
        ].map(([titulo, linhas, vazio]) => (
          <section key={String(titulo)} className="rounded-lg border bg-card p-4 space-y-2">
            <h2 className="font-semibold">{String(titulo)}</h2>
            {(linhas as ReturnType<typeof resumoPerdas>).length === 0 ? (
              <p className="text-sm text-muted-foreground">{String(vazio)}</p>
            ) : (linhas as ReturnType<typeof resumoPerdas>).map((p) => (
              <div key={p.motivo} className="flex justify-between gap-2 text-sm">
                <span className="truncate">{p.motivo}</span>
                <span className="text-muted-foreground">{p.qtd} · {formatBRL(p.valor)}</span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
