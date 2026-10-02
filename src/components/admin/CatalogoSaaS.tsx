import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTableRows, useSaveRecord, rowId, text, matches } from "@/lib/crud";
import { formatBRL, num } from "@/lib/orcamentos";
import { type Row } from "@/lib/row";
import { normalizarColunas } from "@/lib/orcamento-kanban";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

type FieldDef = { key: string; label: string; type: "text" | "textarea" | "money" | "int" };

export type CatalogoConfig = {
  table: string;
  titulo: string;
  singular: string;
  fields: FieldDef[];
  resumo: (r: Row) => ReactNode;
  funcoesLiberadas?: boolean;
};

export const planosConfig: CatalogoConfig = {
  table: "planos_base",
  titulo: "Planos Base",
  singular: "plano",
  fields: [
    { key: "nome", label: "Nome do Plano", type: "text" },
    { key: "descricao", label: "Descrição", type: "textarea" },
    { key: "valor_mensal", label: "Valor Mensal (R$)", type: "money" },
    { key: "usuarios_inclusos", label: "Utilizadores Incluídos", type: "int" },
    { key: "valor_usuario_adicional", label: "Valor por Utilizador Adicional (R$)", type: "money" },
  ],
  resumo: (r) => (
    <>
      <div className="text-2xl font-bold text-foreground">{formatBRL(r["valor_mensal"])}<span className="text-sm font-normal text-muted-foreground">/mês</span></div>
      <div className="text-sm text-muted-foreground">{num(r["usuarios_inclusos"])} utilizadores incluídos</div>
      <div className="text-sm text-muted-foreground">+ {formatBRL(r["valor_usuario_adicional"])} por utilizador adicional</div>
    </>
  ),
};

export const modulosConfig: CatalogoConfig = {
  table: "modulos_adicionais",
  titulo: "Módulos Adicionais",
  singular: "módulo",
  fields: [
    { key: "nome", label: "Nome do Módulo", type: "text" },
    { key: "descricao", label: "Descrição", type: "textarea" },
    { key: "valor_mensal_fixo", label: "Valor Mensal Fixo (R$)", type: "money" },
  ],
  resumo: (r) => (
    <div className="text-2xl font-bold text-foreground">{formatBRL(r["valor_mensal_fixo"] ?? r["valor_mensal"])}<span className="text-sm font-normal text-muted-foreground">/mês</span></div>
  ),
  funcoesLiberadas: true,
};

const ativo = (r: Row) => r["status"] !== false && r["ativo"] !== false;

/** Colunas reais da tabela (via RPC); null se não for possível ler. */
async function colunasDaTabela(table: string): Promise<Set<string> | null> {
  try {
    const { data, error } = await supabase.rpc("listar_colunas_tabela" as never, { nome_tabela: table } as never);
    if (error) return null;
    const cols = normalizarColunas(data).map((c) => c.key);
    return cols.length ? new Set(cols) : null;
  } catch {
    return null;
  }
}

/** Nome da coluna de estado ativo/inativo. */
function colunaStatus(cols: Set<string> | null, sample?: Row | null): string | null {
  for (const k of ["status", "ativo"]) if (cols ? cols.has(k) : sample ? k in sample : k === "status") return k;
  return null;
}

/** Converte campos numéricos e remove chaves que não existem na tabela. */
function montarPayload(config: CatalogoConfig, values: Record<string, string>, status: boolean, cols: Set<string> | null, sample?: Row | null): Row {
  const payload: Row = {};
  for (const f of config.fields) {
    const raw = (values[f.key] ?? "").trim();
    if (f.type === "money" || f.type === "int") {
      const norm = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
      const n = raw === "" ? 0 : Number(norm.replace(/[^0-9.-]/g, ""));
      const val = Number.isFinite(n) ? n : 0;
      payload[f.key] = f.type === "int" ? Math.trunc(val) : val;
    } else {
      payload[f.key] = raw === "" ? null : raw;
    }
  }
  const sc = colunaStatus(cols, sample);
  if (sc) payload[sc] = status;
  if (cols) for (const k of Object.keys(payload)) if (!cols.has(k)) delete payload[k];
  return payload;
}

export function CatalogoSaaS({ config, aba }: { config: CatalogoConfig; aba: "planos" | "modulos" }) {
  const { isMaster } = useAuth();
  const { data: rows = [], isLoading } = useTableRows(config.table, isMaster);
  const save = useSaveRecord(config.table);
  const [busca, setBusca] = useState("");
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<Row | null>(null);

  const lista = useMemo(
    () => rows.filter((r) => matches(r["nome"], busca) || matches(r["descricao"], busca))
      .sort((a, b) => text(a["nome"]).localeCompare(text(b["nome"]), "pt-BR")),
    [rows, busca],
  );

  if (!isMaster) {
    return (
      <div className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
        <ShieldAlert className="h-10 w-10" />
        <p>Área exclusiva do utilizador Master.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Catálogo SaaS</h1>
        <p className="text-sm text-muted-foreground">Planos e módulos comercializados pelo ERP.</p>
      </div>
      <div className="flex gap-1 border-b border-border">
        {([["planos", "/admin/planos", "Planos Base"], ["modulos", "/admin/modulos", "Módulos Adicionais"]] as const).map(([k, to, label]) => (
          <Link key={k} to={to}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${aba === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {label}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-sm" />
        <Button className="ml-auto" onClick={() => { setRecord(null); setOpen(true); }}>
          <Plus className="mr-1 h-4 w-4" /> Novo {config.singular}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum {config.singular} registado.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((r) => (
            <Card key={text(rowId(r))} className={ativo(r) ? "" : "opacity-60"}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg">{text(r["nome"]) || "—"}</CardTitle>
                  <Badge variant={ativo(r) ? "default" : "secondary"}>{ativo(r) ? "Ativo" : "Inativo"}</Badge>
                </div>
                {r["descricao"] ? <p className="text-sm text-muted-foreground">{text(r["descricao"])}</p> : null}
              </CardHeader>
              <CardContent className="space-y-1">{config.resumo(r)}</CardContent>
              <CardFooter className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Switch checked={ativo(r)} onCheckedChange={async (v) => {
                    const sc = colunaStatus(await colunasDaTabela(config.table), r) ?? "status";
                    save.mutate({ values: { [sc]: v }, original: r });
                  }} />
                  {ativo(r) ? "Ativo" : "Inativo"}
                </label>
                <Button variant="outline" size="sm" onClick={() => { setRecord(r); setOpen(true); }}>
                  <Pencil className="mr-1 h-4 w-4" /> Editar
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <CatalogoSheet open={open} onOpenChange={setOpen} config={config} record={record} />
    </div>
  );
}

function CatalogoSheet({ open, onOpenChange, config, record }: { open: boolean; onOpenChange: (o: boolean) => void; config: CatalogoConfig; record: Row | null }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState(true);
  const [funcSel, setFuncSel] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const moduloId = record ? text(rowId(record)) : "";

  const { data: funcoes = [] } = useTableRows("funcoes", Boolean(config.funcoesLiberadas && open));
  const { data: vinculos } = useQuery({
    queryKey: ["table", "modulos_funcoes", moduloId],
    enabled: Boolean(config.funcoesLiberadas && open && moduloId),
    queryFn: async () => {
      const { data, error } = await supabase.from("modulos_funcoes").select("*").eq("modulo_id", moduloId);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  useEffect(() => {
    if (!open) return;
    const v: Record<string, string> = {};
    for (const f of config.fields) v[f.key] = record?.[f.key] == null ? "" : text(record[f.key]);
    setValues(v);
    setStatus(record ? ativo(record) : true);
  }, [open, record, config]);

  useEffect(() => {
    setFuncSel(new Set((vinculos ?? []).map((v) => text(v["funcao_id"]))));
  }, [vinculos, open]);

  const funcoesOrdenadas = useMemo(
    () => [...funcoes].filter((f) => f["status"] !== false)
      .sort((a, b) => text(a["descricao"]).localeCompare(text(b["descricao"]), "pt-BR")),
    [funcoes],
  );

  async function salvar() {
    if (!values["nome"]?.trim()) { toast.error("Informe o nome."); return; }
    setSaving(true);
    try {
      const cols = await colunasDaTabela(config.table);
      const payload = montarPayload(config, values, status, cols, record);
      if (!payload["nome"]) { toast.error("Informe o nome."); return; }
      let id = moduloId;
      if (record) {
        const { error } = await supabase.from(config.table).update(payload).eq("id", moduloId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from(config.table).insert(payload).select().single();
        if (error) throw error;
        id = text(rowId(data as Row));
      }
      if (config.funcoesLiberadas && id) {
        const atuais = new Set((vinculos ?? []).map((v) => text(v["funcao_id"])));
        const remover = [...atuais].filter((f) => !funcSel.has(f));
        const incluir = [...funcSel].filter((f) => !atuais.has(f));
        if (remover.length) {
          const { error } = await supabase.from("modulos_funcoes").delete().eq("modulo_id", id).in("funcao_id", remover);
          if (error) throw error;
        }
        if (incluir.length) {
          const { error } = await supabase.from("modulos_funcoes").insert(incluir.map((funcao_id) => ({ modulo_id: id, funcao_id })));
          if (error) throw error;
        }
        queryClient.invalidateQueries({ queryKey: ["table", "modulos_funcoes"] });
      }
      queryClient.invalidateQueries({ queryKey: ["table", config.table] });
      toast.success("Registro salvo com sucesso.");
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
      toast.error(msg ? `Não foi possível salvar: ${msg}` : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>{record ? "Editar" : "Novo"} {config.singular}</SheetTitle>
          <SheetDescription>{config.titulo}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {config.fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label>{f.label}</Label>
              {f.type === "textarea" ? (
                <Textarea value={values[f.key] ?? ""} onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))} />
              ) : (
                <Input
                  type={f.type === "text" ? "text" : "number"}
                  step={f.type === "money" ? "0.01" : "1"}
                  min={f.type === "text" ? undefined : 0}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                />
              )}
            </div>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={status} onCheckedChange={setStatus} /> Ativo
          </label>

          {config.funcoesLiberadas && (
            <div className="space-y-2 border-t border-border pt-4">
              <h3 className="font-semibold text-foreground">Funções Libertadas</h3>
              <p className="text-xs text-muted-foreground">Marque as funções do sistema incluídas neste módulo.</p>
              <div className="max-h-80 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {funcoesOrdenadas.map((f) => {
                  const id = text(rowId(f));
                  return (
                    <label key={id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                      <Checkbox
                        checked={funcSel.has(id)}
                        onCheckedChange={(v) => setFuncSel((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n; })}
                      />
                      <span className="flex-1">{text(f["descricao"])}</span>
                      {f["path"] ? <span className="text-xs text-muted-foreground">{text(f["path"])}</span> : null}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
