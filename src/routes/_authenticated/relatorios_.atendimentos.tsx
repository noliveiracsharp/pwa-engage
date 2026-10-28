import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, MessageSquare, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RelatorioLista } from "@/components/relatorios/RelatorioLista";
import { rowId, text, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { A, M, dataDe, isCliente, isEncerrado, nomeEtapa, nomePessoa, telefonePessoa } from "@/lib/atendimentos";
import { hojeISO } from "@/lib/financeiro";
import { notaDe } from "@/components/atendimentos/Pesquisa";
import { usePagePermissions } from "@/hooks/usePagePermissions";

export const Route = createFileRoute("/_authenticated/relatorios_/atendimentos")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Relatório de Atendimentos — Atende.ai" },
      { name: "description", content: "Todos os chamados de atendimento com protocolo, cliente, atendente, situação, avaliação e conversa." },
      { property: "og:title", content: "Relatório de Atendimentos — Atende.ai" },
      { property: "og:description", content: "Chamados de atendimento com protocolo, avaliação e conversa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RelatorioAtendimentos,
});

const db = supabase as unknown as { from: (t: string) => any };
const fmt = (d: Date | null) => (d ? d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const abertura = (a: Row) => dataDe(a, ["created_at", "criado_em", "data_abertura"]);
function inicioMes(meses: number) { const d = new Date(); d.setMonth(d.getMonth() - (meses - 1), 1); return d.toISOString().slice(0, 10); }
const porNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, "pt-BR");

type Linha = { a: Row; id: string; protocolo: string; aberto: Date | null; ultima: Date | null; cliente: string; telefone: string; departamento: string; atendente: string; etapa: string; encerrado: boolean; nota: number };

function RelatorioAtendimentos() {
  const perms = usePagePermissions("/relatorios/atendimentos");
  const { data: atendimentos = [], isLoading } = useTableRows("atendimentos");
  const { data: pessoas = [] } = useTableRows("pessoas");
  const { data: usuarios = [] } = useTableRows("usuarios");
  const { data: kanbans = [] } = useTableRows("kanban_nome");
  const { data: etapas = [] } = useTableRows("kanban_etapas");
  const [desde, setDesde] = useState(inicioMes(1));
  const [ate, setAte] = useState(hojeISO());
  const [dep, setDep] = useState("todos");
  const [atd, setAtd] = useState("todos");
  const [sit, setSit] = useState("todos");
  const [nota, setNota] = useState("todos");
  const [busca, setBusca] = useState("");
  const [conversa, setConversa] = useState<Linha | null>(null);
  const [imprimir, setImprimir] = useState(false);

  const mapa = (rows: Row[], keys: string[]) => new Map(rows.map((r) => [text(rowId(r)), text(pick(r, keys))]));
  const pessoasMap = useMemo(() => new Map(pessoas.map((p) => [text(rowId(p)), p])), [pessoas]);
  const usuNome = useMemo(() => mapa(usuarios, ["nome", "name", "email"]), [usuarios]);
  const depNome = useMemo(() => mapa(kanbans, ["nome", "descricao", "titulo"]), [kanbans]);

  const todas = useMemo<Linha[]>(() => atendimentos.map((a) => {
    const p = pessoasMap.get(text(pick(a, A.pessoa)));
    return {
      a, id: text(rowId(a)), protocolo: text(pick(a, ["protocolo"])) || "—",
      aberto: abertura(a), ultima: dataDe(a, A.data),
      cliente: nomePessoa(p), telefone: telefonePessoa(p),
      departamento: depNome.get(text(pick(a, A.kanban))) || "—",
      atendente: usuNome.get(text(pick(a, A.responsavel))) || "—",
      etapa: nomeEtapa(a, etapas) || "—", encerrado: isEncerrado(a, etapas), nota: notaDe(a),
    };
  }), [atendimentos, pessoasMap, usuNome, depNome, etapas]);

  const lista = useMemo(() => {
    const ini = new Date(`${desde}T00:00`), fim = new Date(`${ate}T23:59:59`);
    const t = busca.trim().toLowerCase();
    return todas
      .filter((l) => !l.aberto || (l.aberto >= ini && l.aberto <= fim))
      .filter((l) => dep === "todos" || text(pick(l.a, A.kanban)) === dep)
      .filter((l) => atd === "todos" || text(pick(l.a, A.responsavel)) === atd)
      .filter((l) => sit === "todos" || (sit === "encerrados" ? l.encerrado : !l.encerrado))
      .filter((l) => nota === "todos" || (nota === "sem" ? l.encerrado && !l.nota : String(l.nota) === nota))
      .filter((l) => !t || `${l.protocolo} ${l.cliente} ${l.telefone} ${l.atendente}`.toLowerCase().includes(t))
      .sort((x, y) => (y.aberto?.getTime() ?? 0) - (x.aberto?.getTime() ?? 0));
  }, [todas, desde, ate, dep, atd, sit, nota, busca]);

  const enc = lista.filter((l) => l.encerrado);
  const avaliados = enc.filter((l) => l.nota > 0);
  const media = avaliados.length ? avaliados.reduce((s, l) => s + l.nota, 0) / avaliados.length : 0;
  const deps = kanbans.map((k) => ({ id: text(rowId(k)), nome: depNome.get(text(rowId(k))) || "—" })).sort(porNome);
  const atds = usuarios.map((u) => ({ id: text(rowId(u)), nome: usuNome.get(text(rowId(u))) || "—" })).sort(porNome);
  const filtrosTxt = [
    `Período ${new Date(desde + "T12:00").toLocaleDateString("pt-BR")} a ${new Date(ate + "T12:00").toLocaleDateString("pt-BR")}`,
    dep !== "todos" ? `Departamento: ${depNome.get(dep)}` : "",
    atd !== "todos" ? `Atendente: ${usuNome.get(atd)}` : "",
    sit !== "todos" ? (sit === "encerrados" ? "Encerrados" : "Em aberto") : "",
  ].filter(Boolean);

  if (!perms.loading && !perms.canRead) return <p className="p-6 text-muted-foreground">Sem acesso.</p>;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild><Link to="/relatorios" aria-label="Voltar"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <h1 className="text-2xl font-bold text-foreground">Relatório de Atendimentos</h1>
        </div>
        <Button onClick={() => setImprimir(true)}><Printer className="mr-1 h-4 w-4" /> Imprimir / PDF</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div><Label className="text-xs">De</Label><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
        <div><Label className="text-xs">Até</Label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        <div><Label className="text-xs">Departamento</Label>
          <Select value={dep} onValueChange={setDep}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todos">Todos</SelectItem>{deps.map((d) => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}</SelectContent></Select></div>
        <div><Label className="text-xs">Atendente</Label>
          <Select value={atd} onValueChange={setAtd}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todos">Todos</SelectItem>{atds.map((d) => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}</SelectContent></Select></div>
        <div><Label className="text-xs">Situação</Label>
          <Select value={sit} onValueChange={setSit}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="abertos">Em aberto</SelectItem><SelectItem value="encerrados">Encerrados</SelectItem><SelectItem value="todos">Todos</SelectItem></SelectContent></Select></div>
        <div><Label className="text-xs">Avaliação</Label>
          <Select value={nota} onValueChange={setNota}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              <SelectItem value="sem">Sem avaliação</SelectItem>
              {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n} estrela(s)</SelectItem>)}
            </SelectContent></Select></div>
      </div>
      <Input placeholder="Pesquisar por protocolo, cliente, telefone ou atendente…" value={busca} onChange={(e) => setBusca(e.target.value)} />

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { l: "Chamados", v: String(lista.length) },
          { l: "Em aberto", v: String(lista.length - enc.length) },
          { l: "Encerrados", v: String(enc.length) },
          { l: "Avaliação média", v: avaliados.length ? `${media.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} / 5 (${avaliados.length})` : "—" },
        ].map((k) => (
          <div key={k.l} className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">{k.l}</p><p className="text-xl font-semibold text-foreground">{k.v}</p></div>
        ))}
      </div>

      <div className="overflow-auto rounded-lg border">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Protocolo</TableHead><TableHead>Abertura</TableHead><TableHead>Cliente</TableHead><TableHead>Departamento</TableHead>
            <TableHead>Atendente</TableHead><TableHead>Situação</TableHead><TableHead>Avaliação</TableHead><TableHead className="text-right">Conversa</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={8} className="text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></TableCell></TableRow>}
            {!isLoading && !lista.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Nenhum chamado no período.</TableCell></TableRow>}
            {lista.map((l) => (
              <TableRow key={l.id} className="cursor-pointer" onClick={() => setConversa(l)}>
                <TableCell className="font-medium">{l.protocolo}</TableCell>
                <TableCell>{fmt(l.aberto)}</TableCell>
                <TableCell><span className="block">{l.cliente}</span><span className="text-xs text-muted-foreground">{l.telefone}</span></TableCell>
                <TableCell>{l.departamento}</TableCell>
                <TableCell>{l.atendente}</TableCell>
                <TableCell><Badge variant={l.encerrado ? "secondary" : "outline"}>{l.encerrado ? "Encerrado" : l.etapa}</Badge></TableCell>
                <TableCell>{l.nota ? "★".repeat(l.nota) : l.encerrado ? <span className="text-xs text-muted-foreground">Aguardando</span> : "—"}</TableCell>
                <TableCell className="text-right"><Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setConversa(l); }}><MessageSquare className="mr-1 h-4 w-4" /> Ver conversa</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {conversa && <ConversaDialog linha={conversa} usuNome={usuNome} onClose={() => setConversa(null)} />}
      {imprimir && (
        <RelatorioLista
          titulo="Relatório de Atendimentos" rotulo="Atendimentos" rows={lista} filtros={filtrosTxt}
          kpis={[
            { label: "Chamados", valor: lista.length },
            { label: "Em aberto", valor: lista.length - enc.length },
            { label: "Encerrados", valor: enc.length },
            { label: "Avaliação média", valor: avaliados.length ? media.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—", sub: `${avaliados.length} avaliação(ões)` },
          ]}
          colunas={[
            { header: "Protocolo", cell: (l) => l.protocolo },
            { header: "Abertura", cell: (l) => fmt(l.aberto) },
            { header: "Cliente", cell: (l) => `${l.cliente}${l.telefone ? ` • ${l.telefone}` : ""}` },
            { header: "Departamento", cell: (l) => l.departamento },
            { header: "Atendente", cell: (l) => l.atendente },
            { header: "Situação", cell: (l) => (l.encerrado ? "Encerrado" : l.etapa) },
            { header: "Nota", cell: (l) => (l.nota ? `${l.nota}/5` : "—"), right: true },
          ]}
          chave={(l) => l.id} onClose={() => setImprimir(false)}
        />
      )}
    </div>
  );
}

function ConversaDialog({ linha, usuNome, onClose }: { linha: Linha; usuNome: Map<string, string>; onClose: () => void }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["relatorio-conversa", linha.id],
    queryFn: async () => {
      const { data, error } = await db.from("atendimentos_mensagem").select("*").eq("atendimento_id", linha.id).order("id", { ascending: true }).limit(2000);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader><DialogTitle>Protocolo {linha.protocolo} — {linha.cliente}</DialogTitle></DialogHeader>
        <div className="max-h-[70vh] space-y-2 overflow-y-auto rounded-md bg-muted/40 p-3">
          {isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin" />}
          {!isLoading && !data.length && <p className="text-center text-sm text-muted-foreground">Sem mensagens neste chamado.</p>}
          {data.map((m) => {
            const cli = isCliente(m);
            const interna = (pick(m, M.interna) as unknown) === true;
            const midia = text(pick(m, M.midia));
            return (
              <div key={text(rowId(m))} className={`flex ${cli ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${interna ? "border border-dashed border-warning bg-warning/10" : cli ? "bg-card" : "bg-primary/10"}`}>
                  <p className="mb-0.5 text-[11px] text-muted-foreground">
                    {cli ? linha.cliente : usuNome.get(text(pick(m, M.usuario))) || "Atendimento"}{interna ? " • nota interna" : ""} • {fmt(dataDe(m, M.data))}
                  </p>
                  {text(pick(m, M.texto)) && <p className="whitespace-pre-wrap text-foreground">{text(pick(m, M.texto))}</p>}
                  {midia && <a href={midia} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Abrir anexo</a>}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
