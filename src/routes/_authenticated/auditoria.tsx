import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AuditoriaDetalhe, OperacaoBadge } from "@/components/auditoria/AuditoriaDetalhe";
import { type AuditoriaLog, auditoriaCsv, nomeTabela, resumoLog } from "@/lib/auditoria";

const db = supabase as any;

export const Route = createFileRoute("/_authenticated/auditoria")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Auditoria LGPD — Atende.ai" },
      { name: "description", content: "Trilha de auditoria: quem criou, alterou ou excluiu cada registro e quando." },
      { property: "og:title", content: "Auditoria LGPD — Atende.ai" },
      { property: "og:description", content: "Trilha de auditoria: quem criou, alterou ou excluiu cada registro e quando." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuditoriaPage,
});

const hoje = () => new Date().toISOString().slice(0, 10);
const diasAtras = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

function AuditoriaPage() {
  const [de, setDe] = useState(hoje());
  void diasAtras;
  const [ate, setAte] = useState(hoje());
  const [tabela, setTabela] = useState("todas");
  const [operacao, setOperacao] = useState("todas");
  const [usuario, setUsuario] = useState("todos");
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<AuditoriaLog | null>(null);

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["auditoria", "lista", de, ate, tabela, operacao],
    retry: 1,
    queryFn: async () => {
      let q = db.from("auditoria_logs").select("*")
        .gte("criado_em", `${de}T00:00:00`).lte("criado_em", `${ate}T23:59:59.999`)
        .order("criado_em", { ascending: false }).limit(2000);
      if (tabela !== "todas") q = q.eq("tabela", tabela);
      if (operacao !== "todas") q = q.eq("operacao", operacao);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AuditoriaLog[];
    },
  });

  const tabelas = useMemo(() => [...new Set(data.map((l) => l.tabela))], [data]);
  const usuarios = useMemo(
    () => [...new Map(data.filter((l) => l.usuario_id).map((l) => [l.usuario_id!, l.usuario_nome ?? l.usuario_email ?? l.usuario_id!])).entries()],
    [data],
  );

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return data.filter((l) => {
      if (usuario !== "todos" && l.usuario_id !== usuario) return false;
      if (!b) return true;
      return [l.usuario_nome, l.usuario_email, l.registro_id, nomeTabela(l.tabela), JSON.stringify(l.dados_novos ?? l.dados_anteriores)]
        .some((v) => String(v ?? "").toLowerCase().includes(b));
    });
  }, [data, usuario, busca]);

  const exportar = () => {
    const blob = new Blob([auditoriaCsv(filtrados)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `auditoria-${de}-a-${ate}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Auditoria (LGPD)</h1>
        <Button variant="outline" className="ml-auto gap-1" onClick={exportar} disabled={!filtrados.length}>
          <Download className="h-4 w-4" /> Exportar CSV
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div><Label>De</Label><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
        <div><Label>Até</Label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        <div>
          <Label>Módulo</Label>
          <Select value={tabela} onValueChange={setTabela}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todos</SelectItem>
              {(tabela !== "todas" && !tabelas.includes(tabela) ? [...tabelas, tabela] : tabelas).map((t) => (
                <SelectItem key={t} value={t}>{nomeTabela(t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Ação</Label>
          <Select value={operacao} onValueChange={setOperacao}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="INSERT">Criou</SelectItem>
              <SelectItem value="UPDATE">Alterou</SelectItem>
              <SelectItem value="DELETE">Excluiu</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Usuário</Label>
          <Select value={usuario} onValueChange={setUsuario}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {usuarios.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Pesquisar</Label><Input placeholder="Nome, e-mail, ID, conteúdo…" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
      </div>

      {error ? (
        <p className="text-sm text-muted-foreground">
          Não foi possível ler a auditoria. Verifique se o script de auditoria foi executado e se seu perfil tem acesso a esta tela.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/hora</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Módulo</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Detalhe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-muted-foreground">Carregando…</TableCell></TableRow>
              ) : filtrados.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-muted-foreground">Nenhuma ação no período.</TableCell></TableRow>
              ) : (
                filtrados.map((l) => (
                  <TableRow key={l.id} className="cursor-pointer" onClick={() => setSel(l)}>
                    <TableCell className="whitespace-nowrap">{new Date(l.criado_em).toLocaleString("pt-BR")}</TableCell>
                    <TableCell>{l.usuario_nome ?? "Sistema"}</TableCell>
                    <TableCell>{nomeTabela(l.tabela)}</TableCell>
                    <TableCell><OperacaoBadge op={l.operacao} /></TableCell>
                    <TableCell className="max-w-md truncate text-muted-foreground">{resumoLog(l)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
      {data.length >= 2000 && <p className="text-xs text-muted-foreground">Mostrando as 2.000 ações mais recentes; reduza o período para ver o restante.</p>}
      <AuditoriaDetalhe log={sel} onClose={() => setSel(null)} />
    </div>
  );
}
