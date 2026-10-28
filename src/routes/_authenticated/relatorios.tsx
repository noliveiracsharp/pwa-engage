import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Download, Eye, Loader2, Lock, Pencil, Plus, Sparkles, Trash2, Users, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { montarRelatorioIa } from "@/lib/relatorio-ia.functions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTableRows, useDeleteRecord, useSaveRecord, rowId, matches } from "@/lib/crud";
import { useAudit } from "@/lib/audit";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { labelAmigavel, normalizarColunas } from "@/lib/orcamento-kanban";
import { pick, type Row } from "@/lib/row";
import { confirmar } from "@/components/layout/DialogoGlobal";

export const Route = createFileRoute("/_authenticated/relatorios")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Relatórios — Atende.ai" },
      {
        name: "description",
        content: "Crie, visualize e exporte relatórios dinâmicos de qualquer tabela do sistema.",
      },
      { property: "og:title", content: "Relatórios — Atende.ai" },
      {
        property: "og:description",
        content: "Crie, visualize e exporte relatórios dinâmicos de qualquer tabela do sistema.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RelatoriosPage,
});

type Filtro = { campo: string; operador: string; valor: string };
const OPERADORES = [
  { v: "eq", l: "Igual a" },
  { v: "neq", l: "Diferente de" },
  { v: "gt", l: "Maior que" },
  { v: "lt", l: "Menor que" },
  { v: "ilike", l: "Contém" },
];

function parseJson<T>(v: unknown, fb: T): T {
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fb;
    }
  }
  return (v as T) ?? fb;
}

function useColunas(tabela: string) {
  return useQuery({
    queryKey: ["rpc", "listar_colunas_tabela", tabela],
    enabled: Boolean(tabela),
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "listar_colunas_tabela" as never,
        { nome_tabela: tabela } as never,
      );
      if (error) throw error;
      return normalizarColunas(data);
    },
  });
}

function RelatoriosPage() {
  const perms = usePagePermissions("/relatorios");
  const [view, setView] = useState<{ mode: "list" | "edit" | "view"; row: Row | null; preset?: Row }>({
    mode: "list",
    row: null,
  });
  if (view.mode === "edit")
    return (
      <Builder
        original={view.row}
        preset={view.preset}
        readOnly={Boolean(view.row) && !perms.canUpdate}
        onClose={() => setView({ mode: "list", row: null })}
      />
    );
  if (view.mode === "view")
    return <Viewer rel={view.row!} onClose={() => setView({ mode: "list", row: null })} />;
  return (
    <Lista
      perms={perms}
      onNew={() => setView({ mode: "edit", row: null })}
      onIa={(preset) => setView({ mode: "edit", row: null, preset })}
      onEdit={(r) => setView({ mode: "edit", row: r })}
      onView={(r) => setView({ mode: "view", row: r })}
    />
  );
}

/** Público para todos com acesso à tela; privado só para quem criou. Relatórios antigos (sem dono) são públicos. */
export function relatorioVisivel(r: Row, usuarioId: string): boolean {
  if (String(r["visibilidade"] ?? "publico") !== "privado") return true;
  return String(r["usuario_id"] ?? "") === usuarioId;
}

function PedidoIa({ onPronto }: { onPronto: (preset: Row) => void }) {
  const { data: funcoes = [] } = useTableRows("funcoes");
  const montar = useServerFn(montarRelatorioIa);
  const [pedido, setPedido] = useState("");
  const [carregando, setCarregando] = useState(false);
  const gerar = async (): Promise<void> => {
    if (pedido.trim().length < 3) { toast.error("Descreva o relatório que você precisa."); return; }
    setCarregando(true);
    try {
      const tabelas = [...new Set(funcoes.filter((f) => f["status"] !== false).map((f) => pick<string>(f, ["tabela_base"])).filter(Boolean) as string[])];
      const catalogo: Record<string, string[]> = {};
      await Promise.all(
        tabelas.map(async (t) => {
          const { data } = await supabase.rpc("listar_colunas_tabela" as never, { nome_tabela: t } as never);
          const cols = normalizarColunas(data).map((c) => c.key);
          if (cols.length) catalogo[t] = cols;
        }),
      );
      const { data: s } = await supabase.auth.getSession();
      const r = await montar({ data: { pedido: pedido.trim(), token: s.session?.access_token ?? "", catalogo } });
      if (r.erro || !r.relatorio) { toast.error(r.erro ?? "Falha ao montar o relatório."); return; }
      onPronto({
        nome: r.relatorio.nome,
        descricao: r.relatorio.descricao,
        tabela_base: r.relatorio.tabela_base,
        colunas_selecionadas: r.relatorio.colunas,
        filtros: r.relatorio.filtros,
        visibilidade: "privado",
      });
    } finally {
      setCarregando(false);
    }
  };
  return (
    <section className="space-y-2 rounded-lg border border-border bg-card p-4">
      <Label htmlFor="pedido-ia" className="text-base font-semibold">O que você precisa?</Label>
      <div className="flex gap-2">
        <Textarea
          id="pedido-ia"
          rows={2}
          value={pedido}
          onChange={(e) => setPedido(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void gerar(); } }}
          placeholder="Ex.: atendimentos encerrados sem avaliação na última semana"
        />
        <Button onClick={gerar} disabled={carregando} className="h-auto shrink-0 px-4" aria-label="Montar com IA" title="Montar com IA">
          {carregando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">A IA monta o relatório; você confere, ajusta e salva como público ou privado.</p>
    </section>
  );
}

function Lista({
  perms,
  onNew,
  onIa,
  onEdit,
  onView,
}: {
  perms: { canCreate: boolean; canUpdate: boolean; canDelete: boolean };
  onNew: () => void;
  onIa: (preset: Row) => void;
  onEdit: (r: Row) => void;
  onView: (r: Row) => void;
}) {
  const { usuario } = useAuth();
  const meuId = String(usuario?.["id"] ?? "");
  const { data = [], isLoading } = useTableRows("relatorios");
  const del = useDeleteRecord("relatorios");
  const [busca, setBusca] = useState("");
  const rows = data.filter((r) =>
    relatorioVisivel(r, meuId) && matches(`${r["nome"] ?? ""} ${r["descricao"] ?? ""} ${r["tabela_base"] ?? ""}`, busca),
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
        <div className="flex flex-wrap gap-2">
          {perms.canCreate && (
            <Button variant="outline" onClick={onNew}>
              <Plus className="mr-1 h-4 w-4" /> Montar manualmente
            </Button>
          )}
        </div>
      </div>
      {perms.canCreate && <PedidoIa onPronto={onIa} />}
      <Input
        placeholder="Pesquisar…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="max-w-sm"
      />

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Tabela</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  Nenhum relatório salvo.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={String(rowId(r))}>
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {r["visibilidade"] === "privado"
                      ? <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Privado" />
                      : <Users className="h-3.5 w-3.5 text-muted-foreground" aria-label="Público" />}
                    {String(r["nome"] ?? "")}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {String(r["descricao"] ?? "")}
                </TableCell>
                <TableCell>{String(r["tabela_base"] ?? "")}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onView(r)}>
                      <Eye className="mr-1 h-4 w-4" />
                      Visualizar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onEdit(r)}>
                      <Pencil className="mr-1 h-4 w-4" />
                      {perms.canUpdate ? "Editar" : "Ver"}
                    </Button>
                    {perms.canDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => await confirmar("Excluir este relatório?") && del.mutate(r)}
                      >
                        <Trash2 className="mr-1 h-4 w-4 text-destructive" />
                        Excluir
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Builder({
  original,
  preset,
  readOnly,
  onClose,
}: {
  original: Row | null;
  preset?: Row | undefined;
  readOnly: boolean;
  onClose: () => void;
}) {
  const { usuario } = useAuth();
  const meuId = String(usuario?.["id"] ?? "");
  const base = original ?? preset ?? null;
  const { data: funcoes = [] } = useTableRows("funcoes");
  const save = useSaveRecord("relatorios");
  const { stamp } = useAudit();
  const [nome, setNome] = useState(String(base?.["nome"] ?? ""));
  const [descricao, setDescricao] = useState(String(base?.["descricao"] ?? ""));
  const [tabela, setTabela] = useState(String(base?.["tabela_base"] ?? ""));
  const inicial = parseJson<string[]>(base?.["colunas_selecionadas"], []);
  const [cols, setCols] = useState<string[]>(inicial.filter((c) => !c.includes("(")));
  const [joins, setJoins] = useState(inicial.filter((c) => c.includes("(")).join(", "));
  const [filtros, setFiltros] = useState<Filtro[]>(parseJson<Filtro[]>(base?.["filtros"], []));
  const [publico, setPublico] = useState(String(base?.["visibilidade"] ?? "publico") !== "privado");
  // Só o dono altera a visibilidade de um relatório já salvo.
  const dono = !original || !original["usuario_id"] || String(original["usuario_id"]) === meuId;
  const { data: colunas = [], isFetching, error } = useColunas(tabela);

  const tabelas = useMemo(() => {
    const set = new Set<string>();
    for (const f of funcoes) {
      const t = pick<string>(f, ["tabela_base"]);
      const ativo = f["status"] ?? f["ativo"];
      if (t && ativo !== false) set.add(t);
    }
    return [...set].sort();
  }, [funcoes]);

  const submit = () => {
    if (!nome.trim() || !tabela) {
      toast.error("Informe nome e tabela base.");
      return;
    }
    const joinList = joins
      .split(/,(?![^()]*\))/)
      .map((s) => s.trim())
      .filter(Boolean);
    const values = stamp(
      {
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        tabela_base: tabela,
        colunas_selecionadas: [...cols, ...joinList],
        filtros: filtros.filter((f) => f.campo && f.operador),
        visibilidade: publico ? "publico" : "privado",
        ...(!original || !original["usuario_id"] ? { usuario_id: meuId || null } : {}),
      },
      !original,
    );
    delete values["alterado_por"];
    save.mutate({ values, original }, { onSuccess: onClose });
  };

  const setFiltro = (i: number, patch: Partial<Filtro>) =>
    setFiltros((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold text-foreground">
          {original ? "Editar relatório" : "Novo relatório"}
        </h1>
      </div>
      <fieldset disabled={readOnly} className="space-y-6">
        <section className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tabela base</Label>
            <Select
              value={tabela}
              onValueChange={(v) => {
                setTabela(v);
                setCols([]);
                setFiltros([]);
              }}
              disabled={readOnly}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {tabelas.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Descrição</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} />
          </div>
          <div className="flex items-center gap-3 md:col-span-2">
            <Switch id="rel-publico" checked={publico} onCheckedChange={setPublico} disabled={readOnly || !dono} />
            <Label htmlFor="rel-publico">
              {publico ? "Público — todos com acesso a Relatórios podem ver" : "Privado — somente você vê"}
            </Label>
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">Colunas</h2>
          {!tabela && (
            <p className="text-sm text-muted-foreground">
              Escolha a tabela base para ver as colunas.
            </p>
          )}
          {isFetching && <p className="text-sm text-muted-foreground">Carregando colunas…</p>}
          {error && (
            <p className="text-sm text-destructive">
              Não foi possível ler as colunas desta tabela.
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {colunas.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={cols.includes(c.key)}
                  disabled={readOnly}
                  onCheckedChange={(v) =>
                    setCols((p) => (v ? [...p, c.key] : p.filter((k) => k !== c.key)))
                  }
                />
                {labelAmigavel(c.key)}{" "}
                <span className="text-xs text-muted-foreground">{c.tipo}</span>
              </label>
            ))}
          </div>
          <div className="space-y-1.5 pt-2">
            <Label>Relacionamentos (avançado)</Label>
            <Input
              placeholder="parceiros(razao_social), usuarios(nome)"
              value={joins}
              onChange={(e) => setJoins(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Separe por vírgula. Formato: tabela(coluna1, coluna2).
            </p>
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Filtros fixos</h2>
            {!readOnly && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!tabela}
                onClick={() => setFiltros((f) => [...f, { campo: "", operador: "eq", valor: "" }])}
              >
                <Plus className="mr-1 h-4 w-4" />
                Adicionar Filtro
              </Button>
            )}
          </div>
          {filtros.length === 0 && <p className="text-sm text-muted-foreground">Nenhum filtro.</p>}
          {filtros.map((f, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <Select
                value={f.campo}
                onValueChange={(v) => setFiltro(i, { campo: v })}
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Campo" />
                </SelectTrigger>
                <SelectContent>
                  {colunas.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {labelAmigavel(c.key)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={f.operador}
                onValueChange={(v) => setFiltro(i, { operador: v })}
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERADORES.map((o) => (
                    <SelectItem key={o.v} value={o.v}>
                      {o.l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Valor"
                value={f.valor}
                onChange={(e) => setFiltro(i, { valor: e.target.value })}
              />
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remover filtro"
                  onClick={() => setFiltros((fs) => fs.filter((_, j) => j !== i))}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </section>
      </fieldset>
      <div className="sticky bottom-0 flex justify-end gap-2 bg-background py-3">
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        {!readOnly && (
          <Button onClick={submit} disabled={save.isPending}>
            Salvar
          </Button>
        )}
      </div>
    </div>
  );
}

function flatten(obj: Row, prefix = "", out: Row = {}): Row {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v as Row, key, out);
    else
      out[key] = Array.isArray(v)
        ? v.map((x) => (x && typeof x === "object" ? JSON.stringify(x) : x)).join(", ")
        : v;
  }
  return out;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  return s;
}

function Viewer({ rel, onClose }: { rel: Row; onClose: () => void }) {
  const tabela = String(rel["tabela_base"] ?? "");
  const colsSel = parseJson<string[]>(rel["colunas_selecionadas"], []);
  const filtros = parseJson<Filtro[]>(rel["filtros"], []);
  const { data: colunas = [] } = useColunas(tabela);
  const dateCol = useMemo(() => {
    const datas = colunas.filter((c) => /date|timestamp/i.test(c.tipo));
    return (
      (
        datas.find((c) => c.key.startsWith("dt_")) ??
        datas.find((c) => c.key !== "updated_at") ??
        datas[0]
      )?.key ?? ""
    );
  }, [colunas]);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const {
    data = [],
    isFetching,
    error,
  } = useQuery({
    queryKey: ["table", tabela, "relatorio", String(rowId(rel)), de, ate, dateCol],
    enabled: Boolean(tabela),
    queryFn: async () => {
      let q = supabase
        .from(tabela as never)
        .select(colsSel.length ? colsSel.join(",") : "*") as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      for (const f of filtros) {
        if (!f.campo) continue;
        if (f.operador === "ilike") q = q.ilike(f.campo, `%${f.valor}%`);
        else if (["eq", "neq", "gt", "lt"].includes(f.operador))
          q = q[f.operador](f.campo, f.valor);
      }
      if (dateCol && de) q = q.gte(dateCol, de);
      if (dateCol && ate)
        q = q.lte(
          dateCol,
          /timestamp/i.test(colunas.find((c) => c.key === dateCol)?.tipo ?? "")
            ? `${ate}T23:59:59`
            : ate,
        );
      const { data, error } = await q.limit(5000);
      if (error) throw error;
      return ((data ?? []) as Row[]).map((r) => flatten(r));
    },
  });

  useEffect(() => {
    if (error) toast.error((error as Error).message);
  }, [error]);
  const headers = useMemo(() => [...new Set(data.flatMap((r) => Object.keys(r)))], [data]);

  const exportar = () => {
    const esc = (v: unknown) => `"${fmt(v).replace(/"/g, '""')}"`;
    const csv = [
      headers.map(esc).join(";"),
      ...data.map((r) => headers.map((h) => esc(r[h])).join(";")),
    ].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${String(rel["nome"] ?? "relatorio").replace(/[^\w-]+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{String(rel["nome"] ?? "")}</h1>
            {rel["descricao"] ? (
              <p className="text-sm text-muted-foreground">{String(rel["descricao"])}</p>
            ) : null}
          </div>
        </div>
        <Button onClick={exportar} disabled={!data.length}>
          <Download className="mr-1 h-4 w-4" />
          Exportar CSV
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
        <div className="space-y-1">
          <Label>Data inicial</Label>
          <Input
            type="date"
            value={de}
            onChange={(e) => setDe(e.target.value)}
            disabled={!dateCol}
          />
        </div>
        <div className="space-y-1">
          <Label>Data final</Label>
          <Input
            type="date"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
            disabled={!dateCol}
          />
        </div>
        <p className="pb-2 text-xs text-muted-foreground">
          {dateCol
            ? `Período aplicado em "${labelAmigavel(dateCol)}"`
            : "Tabela sem coluna de data"}{" "}
          · {data.length} registro(s)
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((h) => (
                <TableHead key={h} className="whitespace-nowrap">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isFetching && (
              <TableRow>
                <TableCell
                  colSpan={headers.length || 1}
                  className="py-10 text-center text-muted-foreground"
                >
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isFetching && data.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={headers.length || 1}
                  className="py-10 text-center text-muted-foreground"
                >
                  {error ? "Erro ao consultar." : "Nenhum registro encontrado."}
                </TableCell>
              </TableRow>
            )}
            {!isFetching &&
              data.map((r, i) => (
                <TableRow key={i}>
                  {headers.map((h) => (
                    <TableCell key={h} className="whitespace-nowrap">
                      {fmt(r[h])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
