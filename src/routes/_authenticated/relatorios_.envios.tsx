import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RelatorioLista } from "@/components/relatorios/RelatorioLista";
import { rowId, text, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { hojeISO } from "@/lib/financeiro";
import { useAudit } from "@/lib/audit";
import { usePagePermissions } from "@/hooks/usePagePermissions";

export const Route = createFileRoute("/_authenticated/relatorios_/envios")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Relatório de Envios e Leituras — Atende.ai" },
      { name: "description", content: "E-mails e mensagens de WhatsApp enviados a clientes e fornecedores, com entrega e leitura." },
      { property: "og:title", content: "Relatório de Envios e Leituras — Atende.ai" },
      { property: "og:description", content: "Envios por e-mail e WhatsApp com status de entrega e leitura." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RelatorioEnvios,
});

type Status = "lido" | "entregue" | "enviado" | "falhou" | "sem_rastreio";
type Envio = { id: string; quando: Date; canal: "email" | "whatsapp"; origem: string; destino: string; descricao: string; status: Status; lidoEm: Date | null; aberturas: number };

const db = supabase as unknown as { from: (t: string) => any };
const fmt = (d: Date | null) => (d ? d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const STATUS: Record<Status, { label: string; cls: string }> = {
  lido: { label: "Lido / aberto", cls: "bg-success/15 text-success" },
  entregue: { label: "Entregue", cls: "bg-primary/15 text-primary" },
  enviado: { label: "Enviado", cls: "bg-muted text-muted-foreground" },
  falhou: { label: "Falhou", cls: "bg-destructive/15 text-destructive" },
  sem_rastreio: { label: "Sem rastreio", cls: "bg-muted text-muted-foreground" },
};
const inicioMes = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

/** Lê uma tabela no período; tabela ausente (script não rodado) vira lista vazia. */
async function ler(tabela: string, campoData: string, empresaId: unknown, desde: string, ate: string, extra?: (q: any) => any): Promise<Row[]> {
  try {
    let q = db.from(tabela).select("*").gte(campoData, `${desde}T00:00:00`).lte(campoData, `${ate}T23:59:59`).order(campoData, { ascending: false }).limit(3000);
    if (empresaId) q = q.eq("empresa_id", empresaId);
    if (extra) q = extra(q);
    const { data, error } = await q;
    return error ? [] : ((data ?? []) as Row[]);
  } catch { return []; }
}

function RelatorioEnvios() {
  const perms = usePagePermissions("/relatorios/envios");
  const { empresaId } = useAudit();
  const { data: orcamentos = [] } = useTableRows("orcamentos");
  const [desde, setDesde] = useState(hojeISO());
  void inicioMes;
  const [ate, setAte] = useState(hojeISO());
  const [canal, setCanal] = useState("todos");
  const [status, setStatus] = useState("todos");
  const [busca, setBusca] = useState("");
  const [imprimir, setImprimir] = useState(false);

  const numeroOferta = useMemo(() => new Map(orcamentos.map((o) => [text(rowId(o)), text(o["numero"])])), [orcamentos]);

  const q = useQuery({
    queryKey: ["relatorio-envios", empresaId, desde, ate],
    retry: 1,
    queryFn: async () => {
      const [cobr, ofertas, msgs] = await Promise.all([
        ler("cobranca_envios", "enviado_em", empresaId, desde, ate),
        ler("orcamento_interacoes", "created_at", empresaId, desde, ate, (x) => x.in("tipo", ["email", "whatsapp", "falha_envio"])),
        // Mensagens enviadas pela equipe no WhatsApp (as recebidas não têm status de envio).
        ler("atendimentos_mensagem", "created_at", undefined, desde, ate, (x) => x.not("status_envio", "is", null)),
      ]);
      return { cobr, ofertas, msgs };
    },
  });

  const todos = useMemo<Envio[]>(() => {
    if (!q.data) return [];
    const out: Envio[] = [];
    for (const r of q.data.cobr) {
      const st = text(r["status"]);
      out.push({
        id: `c${text(r["id"])}`, quando: new Date(text(r["enviado_em"])), canal: text(r["canal"]) === "email" ? "email" : "whatsapp",
        origem: "Cobrança", destino: text(r["destino"]), descricao: `Aviso de cobrança (${text(r["etapa_dias"])} dias)`,
        status: st === "aberto" ? "lido" : st === "falhou" ? "falhou" : "enviado",
        lidoEm: r["aberto_em"] ? new Date(text(r["aberto_em"])) : null, aberturas: Number(r["aberturas"] ?? 0),
      });
    }
    for (const r of q.data.ofertas) {
      const num = numeroOferta.get(text(r["orcamento_id"]));
      out.push({
        id: `o${text(r["id"])}`, quando: new Date(text(r["created_at"])),
        canal: text(r["tipo"]) === "email" || /e-mail/i.test(text(r["descricao"]).slice(0, 40)) ? "email" : "whatsapp",
        origem: num ? `Oferta ${num}` : "Oferta", destino: text(r["descricao"]).replace(/^.*?para\s+/i, "").replace(/:.*$/, ""), descricao: text(r["descricao"]),
        status: text(r["tipo"]) === "falha_envio" ? "falhou" : "sem_rastreio", lidoEm: null, aberturas: 0,
      });
    }
    for (const r of q.data.msgs) {
      const st = text(r["status_envio"]);
      out.push({
        id: `m${text(r["id"])}`, quando: new Date(text(pick(r, ["created_at", "criado_em"]))), canal: "whatsapp",
        origem: "Atendimento", destino: text(pick(r, ["telefone", "destino", "numero"])) || "—",
        descricao: text(pick(r, ["mensagem", "conteudo", "texto", "body"])).slice(0, 140) || "Mídia",
        status: st === "lido" ? "lido" : st === "entregue" ? "entregue" : st === "falhou" || st === "erro" ? "falhou" : "enviado",
        lidoEm: null, aberturas: 0,
      });
    }
    return out.sort((a, b) => b.quando.getTime() - a.quando.getTime());
  }, [q.data, numeroOferta]);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return todos
      .filter((e) => canal === "todos" || e.canal === canal)
      .filter((e) => status === "todos" || e.status === status)
      .filter((e) => !t || `${e.origem} ${e.destino} ${e.descricao}`.toLowerCase().includes(t));
  }, [todos, canal, status, busca]);

  const conta = (s: Status) => lista.filter((e) => e.status === s).length;
  const rastreados = lista.filter((e) => e.status !== "sem_rastreio").length;
  const taxa = rastreados ? Math.round((conta("lido") / rastreados) * 100) : 0;
  const kpis: { label: string; valor: number; sub?: string }[] = [
    { label: "Envios", valor: lista.length },
    { label: "Lidos / abertos", valor: conta("lido"), ...(rastreados ? { sub: `${taxa}% dos rastreados` } : {}) },
    { label: "Entregues (não lidos)", valor: conta("entregue") },
    { label: "Falhas", valor: conta("falhou") },
  ];
  const filtrosTxt = [
    `Período ${new Date(desde + "T12:00").toLocaleDateString("pt-BR")} a ${new Date(ate + "T12:00").toLocaleDateString("pt-BR")}`,
    canal !== "todos" ? (canal === "email" ? "E-mail" : "WhatsApp") : "",
    status !== "todos" ? STATUS[status as Status].label : "",
  ].filter(Boolean);

  if (!perms.loading && !perms.canRead) return <p className="p-6 text-muted-foreground">Sem acesso.</p>;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild><Link to="/relatorios" aria-label="Voltar"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <h1 className="text-2xl font-bold text-foreground">Envios e Leituras</h1>
        </div>
        <Button onClick={() => setImprimir(true)}><Printer className="mr-1 h-4 w-4" /> Imprimir / PDF</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div><Label className="text-xs">De</Label><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
        <div><Label className="text-xs">Até</Label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        <div><Label className="text-xs">Canal</Label>
          <Select value={canal} onValueChange={setCanal}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="email">E-mail</SelectItem><SelectItem value="todos">Todos</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem></SelectContent></Select></div>
        <div><Label className="text-xs">Situação</Label>
          <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              {(Object.keys(STATUS) as Status[]).sort((a, b) => STATUS[a].label.localeCompare(STATUS[b].label, "pt-BR")).map((s) => <SelectItem key={s} value={s}>{STATUS[s].label}</SelectItem>)}
            </SelectContent></Select></div>
      </div>
      <Input placeholder="Pesquisar por destino, oferta ou mensagem…" value={busca} onChange={(e) => setBusca(e.target.value)} />

      <div className="grid gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="text-2xl font-bold text-foreground">{k.valor}</p>
            {k.sub && <p className="text-xs text-muted-foreground">{k.sub}</p>}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Leitura de e-mail é registrada nos avisos de cobrança; no WhatsApp, nas mensagens enviadas pela instância conectada. Envios de Oferta mostram data e destino.
      </p>

      {q.isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="overflow-auto rounded-lg border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Data</TableHead><TableHead>Canal</TableHead><TableHead>Origem</TableHead><TableHead>Destino</TableHead>
              <TableHead>Conteúdo</TableHead><TableHead>Situação</TableHead><TableHead>Lido em</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {lista.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhum envio no período.</TableCell></TableRow>}
              {lista.slice(0, 500).map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap">{fmt(e.quando)}</TableCell>
                  <TableCell>{e.canal === "email" ? "E-mail" : "WhatsApp"}</TableCell>
                  <TableCell>{e.origem}</TableCell>
                  <TableCell className="max-w-48 truncate">{e.destino || "—"}</TableCell>
                  <TableCell className="max-w-72 truncate text-muted-foreground">{e.descricao}</TableCell>
                  <TableCell><Badge variant="outline" className={`border-0 ${STATUS[e.status].cls}`}>{STATUS[e.status].label}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap">{fmt(e.lidoEm)}{e.aberturas > 1 ? ` (${e.aberturas}x)` : ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {imprimir && (
        <RelatorioLista
          titulo="Relatório de Envios e Leituras" rotulo="Envios" rows={lista} filtros={filtrosTxt} kpis={kpis}
          colunas={[
            { header: "Data", cell: (e) => fmt(e.quando) },
            { header: "Canal", cell: (e) => (e.canal === "email" ? "E-mail" : "WhatsApp") },
            { header: "Origem", cell: (e) => e.origem },
            { header: "Destino", cell: (e) => e.destino || "—" },
            { header: "Situação", cell: (e) => STATUS[e.status].label },
            { header: "Lido em", cell: (e) => fmt(e.lidoEm) },
          ]}
          chave={(e) => e.id} onClose={() => setImprimir(false)}
        />
      )}
    </div>
  );
}
