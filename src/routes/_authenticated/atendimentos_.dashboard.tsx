import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Clock, MessageSquare, ShieldCheck, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { rowId, text, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { A, dataDe, isEncerrado } from "@/lib/atendimentos";
import { notaDe } from "@/components/atendimentos/Pesquisa";
import { lerJornada, statusSla, duracaoCurta } from "@/lib/sla-etapa";
import { agruparPor, calcularMetricas, type ItemMetrica, type Metricas } from "@/lib/atendimentos-dashboard";
import { hojeISO } from "@/lib/financeiro";

export const Route = createFileRoute("/_authenticated/atendimentos_/dashboard")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Dashboard de Atendimentos — Atende.ai" },
      { name: "description", content: "Nota média, tempo médio e cumprimento de SLA por atendente e departamento." },
      { property: "og:title", content: "Dashboard de Atendimentos — Atende.ai" },
      { property: "og:description", content: "Indicadores gerenciais do atendimento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardAtendimentos,
});

const inicioMes = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const tempo = (m: number | null) => (m === null ? "—" : duracaoCurta(Math.round(m)));
const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(0)}%`);

function DashboardAtendimentos() {
  const { isMaster } = useAuth();
  const perm = usePagePermissions("/atendimentos/gerencial");
  const { data: atendimentos = [] } = useTableRows("atendimentos");
  const { data: usuarios = [] } = useTableRows("usuarios");
  const { data: kanbans = [] } = useTableRows("kanban_nome");
  const { data: etapas = [] } = useTableRows("kanban_etapas");
  const [desde, setDesde] = useState(inicioMes());
  const [ate, setAte] = useState(hojeISO());

  const itens = useMemo<ItemMetrica[]>(() => {
    const ini = new Date(`${desde}T00:00`), fim = new Date(`${ate}T23:59:59`);
    const usu = new Map(usuarios.map((u) => [text(rowId(u)), text(pick(u, ["nome", "email"]))]));
    const kb = new Map(kanbans.map((k) => [text(rowId(k)), k]));
    const et = new Map(etapas.map((e) => [text(rowId(e)), e]));
    return atendimentos.flatMap((a: Row) => {
      const aberto = dataDe(a, ["created_at", "criado_em", "data_abertura"]);
      if (aberto && (aberto < ini || aberto > fim)) return [];
      const enc = isEncerrado(a, etapas);
      const fimAt = enc ? dataDe(a, ["encerrado_em", "data_encerramento", "finalizado_em", "updated_at"]) : null;
      const k = kb.get(text(pick(a, A.kanban)));
      const e = et.get(text(pick(a, A.etapa)));
      const sla = !enc && e ? statusSla(a["etapa_desde"] ?? a["updated_at"] ?? a["created_at"], e["sla_horas"], new Date(), lerJornada(k?.["jornada"])).estado : null;
      return [{
        atendente: usu.get(text(pick(a, A.responsavel))) || "Sem atendente",
        departamento: text(pick(k, ["nome", "descricao"])) || "—",
        nota: notaDe(a), encerrado: enc, sla,
        duracaoMin: aberto && fimAt ? (fimAt.getTime() - aberto.getTime()) / 60000 : null,
      }];
    });
  }, [atendimentos, usuarios, kanbans, etapas, desde, ate]);

  if (!perm.isLoading && !perm.canRead && !isMaster) {
    return <p className="p-6 text-sm text-muted-foreground">Este painel é exclusivo do perfil gerencial.</p>;
  }
  const geral = calcularMetricas(itens);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Voltar"><Link to="/atendimentos"><ArrowLeft className="h-5 w-5" /></Link></Button>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Dashboard de Atendimentos</h1>
            <p className="text-sm text-muted-foreground">Conversas abertas no período escolhido.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="space-y-1"><Label htmlFor="d1">Data inicial</Label><Input id="d1" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="d2">Data final</Label><Input id="d2" type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icone={MessageSquare} titulo="Atendimentos" valor={String(geral.total)} sub={`${geral.encerrados} encerrados`} />
        <Kpi icone={Star} titulo="Nota média" valor={geral.avaliados ? geral.mediaNota.toFixed(1) : "—"} sub={`${geral.avaliados} avaliações`} />
        <Kpi icone={Clock} titulo="Tempo médio" valor={tempo(geral.tempoMedioMin)} sub="da abertura ao encerramento" />
        <Kpi icone={ShieldCheck} titulo="SLA cumprido" valor={pct(geral.pctSla)} sub={`${geral.slaCumprido} de ${geral.comSla} em aberto com SLA`} />
      </div>
      <Tabela titulo="Por atendente" linhas={agruparPor(itens, "atendente")} />
      <Tabela titulo="Por departamento" linhas={agruparPor(itens, "departamento")} />
    </div>
  );
}

function Kpi({ icone: I, titulo, valor, sub }: { icone: typeof Star; titulo: string; valor: string; sub: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><I className="h-4 w-4" aria-hidden /> {titulo}</div>
      <p className="mt-1 text-2xl font-semibold text-foreground">{valor}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function Tabela({ titulo, linhas }: { titulo: string; linhas: ({ nome: string } & Metricas)[] }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <h2 className="border-b border-border px-4 py-3 font-semibold text-foreground">{titulo}</h2>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Nome</TableHead><TableHead className="text-right">Atendimentos</TableHead><TableHead className="text-right">Encerrados</TableHead>
          <TableHead className="text-right">Nota média</TableHead><TableHead className="text-right">Tempo médio</TableHead><TableHead className="text-right">SLA cumprido</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {linhas.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sem dados no período.</TableCell></TableRow>}
          {linhas.map((l) => (
            <TableRow key={l.nome}>
              <TableCell className="font-medium">{l.nome}</TableCell>
              <TableCell className="text-right">{l.total}</TableCell>
              <TableCell className="text-right">{l.encerrados}</TableCell>
              <TableCell className="text-right">{l.avaliados ? `${l.mediaNota.toFixed(1)} ★ (${l.avaliados})` : "—"}</TableCell>
              <TableCell className="text-right">{tempo(l.tempoMedioMin)}</TableCell>
              <TableCell className="text-right">{pct(l.pctSla)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
