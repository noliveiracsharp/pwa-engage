import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { rowId, text, matches } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { formatBRL, num, toISODate } from "@/lib/orcamentos";
import { formatCpfCnpj } from "@/lib/input-masks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ESTADOS = [
  { value: "ativa", label: "Ativa", cls: "bg-success text-success-foreground" },
  { value: "trial", label: "Trial", cls: "bg-primary text-primary-foreground" },
  { value: "inadimplente", label: "Inadimplente", cls: "bg-warning text-warning-foreground" },
  { value: "cancelada", label: "Cancelada", cls: "bg-destructive text-destructive-foreground" },
];

async function all(table: string): Promise<Row[]> {
  const { data, error } = await supabase.from(table).select("*");
  if (error) throw error;
  return (data ?? []) as Row[];
}

function EstadoBadge({ value }: { value: unknown }) {
  const e = ESTADOS.find((x) => x.value === text(value).toLowerCase());
  if (!e) return <Badge variant="secondary">Sem assinatura</Badge>;
  return <Badge className={e.cls}>{e.label}</Badge>;
}

export function GestaoClientes() {
  const { isMaster } = useAuth();
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Row | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-clientes"],
    enabled: isMaster,
    queryFn: async () => {
      const [empresas, assinaturas, planos, usuarios] = await Promise.all([
        all("empresas"),
        all("empresas_assinaturas"),
        all("planos_base"),
        all("usuarios").catch(() => [] as Row[]),
      ]);
      return { empresas, assinaturas, planos, usuarios };
    },
  });

  const linhas = useMemo(() => {
    if (!data) return [];
    const planoById = new Map(data.planos.map((p) => [text(rowId(p)), p]));
    return data.empresas
      .map((e) => {
        const eid = text(rowId(e));
        const ass = data.assinaturas.find((a) => text(a["empresa_id"]) === eid) ?? null;
        const plano = ass ? planoById.get(text(ass["plano_base_id"])) ?? null : null;
        return { empresa: e, ass, plano };
      })
      .filter(({ empresa }) =>
        ["razao_social", "nome_fantasia", "cnpj", "cpf_cnpj"].some((k) => matches(empresa[k], busca)),
      )
      .sort((a, b) => text(a.empresa["razao_social"]).localeCompare(text(b.empresa["razao_social"]), "pt-BR"));
  }, [data, busca]);

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
        <h1 className="text-2xl font-bold text-foreground">Gestão de Clientes</h1>
        <p className="text-sm text-muted-foreground">Todas as empresas do sistema e as suas assinaturas.</p>
      </div>
      <Input placeholder="Buscar por razão social ou CNPJ…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-sm" />
      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Razão Social</TableHead>
              <TableHead>CNPJ/CPF</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Plano Atual</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="text-muted-foreground">Carregando…</TableCell></TableRow>
            )}
            {!isLoading && linhas.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-muted-foreground">Nenhuma empresa encontrada.</TableCell></TableRow>
            )}
            {linhas.map(({ empresa, ass, plano }) => (
              <TableRow key={text(rowId(empresa))}>
                <TableCell className="font-medium">{text(pick(empresa, ["razao_social", "nome_fantasia", "nome"])) || "—"}</TableCell>
                <TableCell>{formatCpfCnpj(text(pick(empresa, ["cnpj", "cpf_cnpj", "documento"]))) || "—"}</TableCell>
                <TableCell>{text(pick(empresa, ["telefone", "celular", "whatsapp"])) || "—"}</TableCell>
                <TableCell>{plano ? text(plano["nome"]) : "—"}</TableCell>
                <TableCell><EstadoBadge value={ass?.["status"]} /></TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setSel(empresa)}>
                    <CreditCard className="mr-1 h-4 w-4" /> Gerir Assinatura
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {data && (
        <AssinaturaSheet
          empresa={sel}
          onClose={() => setSel(null)}
          planos={data.planos}
          assinatura={sel ? data.assinaturas.find((a) => text(a["empresa_id"]) === text(rowId(sel))) ?? null : null}
          usuariosAtivos={sel ? data.usuarios.filter((u) => text(u["empresa_id"]) === text(rowId(sel)) && u["status"] !== false).length : 0}
        />
      )}
    </div>
  );
}

function AssinaturaSheet({ empresa, onClose, planos, assinatura, usuariosAtivos: usuariosAtivos0 }: {
  empresa: Row | null; onClose: () => void; planos: Row[]; assinatura: Row | null; usuariosAtivos: number;
}) {
  const usuariosAtivosContados = usuariosAtivos0;
  const queryClient = useQueryClient();
  const [planoId, setPlanoId] = useState("");
  const [estado, setEstado] = useState("trial");
  const [venc, setVenc] = useState("");
  const [saving, setSaving] = useState(false);
  const assId = assinatura ? text(rowId(assinatura)) : "";

  useEffect(() => {
    if (!empresa) return;
    setPlanoId(text(assinatura?.["plano_base_id"]));
    setEstado(text(assinatura?.["status"]) || "trial");
    setVenc(toISODate(assinatura?.["dt_vencimento"]));
  }, [empresa, assinatura]);

  const { data: modulos = [] } = useQuery({ queryKey: ["admin-modulos"], enabled: Boolean(empresa), queryFn: () => all("modulos_adicionais") });
  const { data: contratados = [] } = useQuery({
    queryKey: ["admin-ass-modulos", assId],
    enabled: Boolean(assId),
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas_assinaturas_modulos").select("*").eq("assinatura_id", assId);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  // Estado local dos switches: a soma reage imediatamente ao ligar/desligar.
  const [ativos, setAtivos] = useState<Set<string>>(new Set());
  useEffect(() => {
    setAtivos(new Set(contratados.map((c) => text(c["modulo_id"]))));
  }, [contratados]);
  const valorModulo = (m: Row) => num(m["valor_mensal_fixo"] ?? m["valor_mensal"]);

  const plano = planos.find((p) => text(rowId(p)) === planoId);
  const usuariosAtivos = assinatura?.["qtd_usuarios_ativos"] != null ? num(assinatura["qtd_usuarios_ativos"]) : usuariosAtivosContados;
  const limite = plano ? num(plano["usuarios_inclusos"]) : 0;
  const pct = limite > 0 ? Math.min(100, (usuariosAtivos / limite) * 100) : 0;
  const usuariosExtras = plano ? Math.max(0, usuariosAtivos - limite) : 0;
  const valorExtras = usuariosExtras > 0 ? usuariosExtras * num(plano?.["valor_usuario_adicional"]) : 0;
  const somaModulos = modulos
    .filter((m) => ativos.has(text(rowId(m))))
    .reduce((s, m) => s + valorModulo(m), 0);
  const mensal = num(plano?.["valor_mensal"]) + valorExtras + somaModulos;

  async function salvar() {
    if (!empresa) return;
    setSaving(true);
    try {
      const payload: Row = { plano_base_id: planoId || null, status: estado, dt_vencimento: venc || null };
      if (assId) {
        const { error } = await supabase.from("empresas_assinaturas").update(payload).eq("id", assId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("empresas_assinaturas").insert({ ...payload, empresa_id: rowId(empresa) });
        if (error) throw error;
      }
      await queryClient.invalidateQueries({ queryKey: ["admin-clientes"] });
      toast.success("Assinatura salva.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleModulo(moduloId: string, on: boolean) {
    if (!assId) { toast.error("Salve o plano vigente antes de contratar módulos."); return; }
    const anterior = new Set(ativos);
    setAtivos((s) => { const n = new Set(s); if (on) n.add(moduloId); else n.delete(moduloId); return n; });
    const { error } = on
      ? await supabase.from("empresas_assinaturas_modulos").insert({ assinatura_id: assId, modulo_id: moduloId })
      : await supabase.from("empresas_assinaturas_modulos").delete().eq("assinatura_id", assId).eq("modulo_id", moduloId);
    if (error) { console.error(error); setAtivos(anterior); toast.error(`Não foi possível alterar o módulo: ${error.message}`); return; }
    queryClient.invalidateQueries({ queryKey: ["admin-ass-modulos", assId] });
  }

  return (
    <Sheet open={Boolean(empresa)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>Gerir Assinatura</SheetTitle>
          <SheetDescription>{text(pick(empresa ?? {}, ["razao_social", "nome_fantasia", "nome"]))}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          <section className="space-y-3">
            <h3 className="font-semibold text-foreground">Plano Vigente</h3>
            <div className="space-y-1.5">
              <Label>Plano</Label>
              <Select value={planoId} onValueChange={setPlanoId}>
                <SelectTrigger><SelectValue placeholder="Selecione o plano" /></SelectTrigger>
                <SelectContent>
                  {planos.filter((p) => p["status"] !== false || text(rowId(p)) === planoId).map((p) => (
                    <SelectItem key={text(rowId(p))} value={text(rowId(p))}>
                      {text(p["nome"])} — {formatBRL(p["valor_mensal"])}/mês
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Select value={estado} onValueChange={setEstado}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ESTADOS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Data de Vencimento</Label>
                <Input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} />
              </div>
            </div>
          </section>

          <section className="space-y-2 rounded-md border border-border p-3">
            <h3 className="font-semibold text-foreground">Métricas</h3>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Utilizadores ativos</span>
              <span className="text-lg font-bold text-foreground">{usuariosAtivos} / {plano ? limite : "—"}</span>
            </div>
            <Progress value={pct} />
            {usuariosExtras > 0 ? (
              <p className="text-xs text-warning">
                {usuariosExtras} acima do limite (+{formatBRL(valorExtras)}/mês)
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{plano ? `${Math.max(0, limite - usuariosAtivos)} vaga(s) disponível(is) no plano.` : "Selecione um plano."}</p>
            )}
            <div className="flex justify-between border-t border-border pt-2 text-sm">
              <span className="text-muted-foreground">Mensalidade estimada</span>
              <span className="font-semibold text-foreground">{formatBRL(mensal)}</span>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-foreground">Módulos Contratados</h3>
            {!assId && <p className="text-xs text-muted-foreground">Salve o plano vigente para poder contratar módulos.</p>}
            <div className="space-y-1 rounded-md border border-border p-2">
              {modulos.length === 0 && <p className="p-2 text-sm text-muted-foreground">Nenhum módulo registado.</p>}
              {modulos.map((m) => {
                const id = text(rowId(m));
                return (
                  <label key={id} className="flex items-center gap-3 rounded px-2 py-2 hover:bg-muted">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">{text(m["nome"])}</div>
                      <div className="text-xs text-muted-foreground">{formatBRL(valorModulo(m))}/mês</div>
                    </div>
                    <Switch checked={ativos.has(id)} disabled={!assId} onCheckedChange={(v) => toggleModulo(id, v)} />
                  </label>
                );
              })}
            </div>
          </section>
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
