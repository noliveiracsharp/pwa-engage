import { useMemo, useState } from "react";
import { Crown, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { PhoneInput } from "@/components/data-table/PhoneInput";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { rowId, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { CARGOS, VINCULOS, ehDiretoria, rotuloCargo, validarMembro, vigente, vinculoPadrao } from "@/lib/cond-equipe";
import { CampoData } from "./CampoData";
import { s, useCondRows, useCondSalvar } from "./cond-data";

type P = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };
const alfa = <T extends { label: string }>(l: readonly T[]) => [...l].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
const CAMPOS = ["nome", "email", "celular", "cpf", "cargo", "vinculo", "empresa_id", "cond_unidade_id", "turno", "inicio", "fim", "observacoes"] as const;

export function EquipePanel({ condominioId, blocos, unidades, perms }: { condominioId: string; blocos: Row[]; unidades: Row[]; perms: P }) {
  const { data: equipe = [], isLoading } = useCondRows("cond_equipe", "condominio_id", condominioId);
  const salvar = useCondSalvar("cond_equipe");
  const { data: parceiros = [] } = useTableRows("parceiros");
  const [edit, setEdit] = useState<Row | null>(null);
  const hoje = new Date().toISOString().slice(0, 10);

  const cond = parceiros.find((p) => String(rowId(p)) === condominioId);
  const empresaOpts = useMemo(() => alfa(parceiros.filter((p) => String(rowId(p)) !== condominioId).map((p) => ({ value: String(rowId(p)), label: String(pick<string>(p, ["titulo", "nome_fantasia", "nome", "razao_social"], "—")) }))), [parceiros, condominioId]);
  const unidadeOpts = useMemo(() => alfa(unidades.map((u) => ({ value: s(u["id"]), label: `${s(blocos.find((b) => s(b["id"]) === s(u["cond_bloco_id"]))?.["nome"])} — ${s(u["numero"])}` }))), [unidades, blocos]);
  const nomeEmpresa = (id: string) => empresaOpts.find((o) => o.value === id)?.label;

  const ordem = (r: Row) => CARGOS.findIndex((c) => c.value === s(r["cargo"]));
  const diretoria = equipe.filter((r) => ehDiretoria(s(r["cargo"]))).sort((a, b) => ordem(a) - ordem(b));
  const operacao = equipe.filter((r) => !ehDiretoria(s(r["cargo"]))).sort((a, b) => ordem(a) - ordem(b) || s(a["nome"]).localeCompare(s(b["nome"]), "pt-BR"));

  async function excluir(r: Row) {
    if (!(await confirmar({ title: `Remover ${s(r["nome"])} da equipe?`, destructive: true, confirmText: "Remover" }))) return;
    await salvar.mutateAsync({ id: s(r["id"]), excluir: true });
    toast.success("Removido da equipe.");
  }

  const empresaDoMembro = (r: Row) => {
    const v = s(r["vinculo"]);
    if (v === "administradora") return nomeEmpresa(s(cond?.["administradora_id"]));
    if (v === "facilities") return nomeEmpresa(s(cond?.["facilities_id"]));
    if (v === "morador") return unidadeOpts.find((o) => o.value === s(r["cond_unidade_id"]))?.label;
    return nomeEmpresa(s(r["empresa_id"]));
  };

  const Lista = ({ titulo, itens, icon: Icon }: { titulo: string; itens: Row[]; icon: typeof Users }) => (
    <section className="space-y-2 rounded-lg border bg-card p-4">
      <h3 className="flex items-center gap-2 font-semibold"><Icon className="size-4" /> {titulo} <span className="text-sm font-normal text-muted-foreground">({itens.length})</span></h3>
      {itens.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Ninguém cadastrado.</p> : (
        <ul className="divide-y">
          {itens.map((r) => {
            const ok = vigente({ status: r["status"] !== false, inicio: s(r["inicio"]) || null, fim: s(r["fim"]) || null }, hoje);
            return (
              <li key={s(r["id"])} className="flex flex-wrap items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">{s(r["nome"])} <Badge variant="secondary">{rotuloCargo(s(r["cargo"]))}</Badge>{!ok && <Badge variant="outline">Fora de vigência</Badge>}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[VINCULOS.find((v) => v.value === s(r["vinculo"]))?.label, empresaDoMembro(r), s(r["turno"]), s(r["celular"])].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {perms.canUpdate && <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setEdit(r)}><Pencil className="size-4" /></Button>}
                {perms.canDelete && <Button size="icon" variant="ghost" className="text-destructive" aria-label="Remover" onClick={() => excluir(r)}><Trash2 className="size-4" /></Button>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="mr-auto flex items-center gap-2 text-lg font-semibold"><Users className="size-5" /> Equipe & Diretoria</h2>
        {perms.canCreate && <Button size="sm" onClick={() => setEdit({})}><Plus className="size-4" /> Adicionar</Button>}
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Lista titulo="Corpo diretivo" itens={diretoria} icon={Crown} />
          <Lista titulo="Equipe operacional" itens={operacao} icon={Users} />
        </div>
      )}
      {edit && (
        <MembroDialog
          inicial={edit}
          empresaOpts={empresaOpts}
          unidadeOpts={unidadeOpts}
          onClose={() => setEdit(null)}
          onSalvar={async (valores) => {
            const id = s(edit["id"]);
            await salvar.mutateAsync(id ? { id, valores } : { valores: { ...valores, condominio_id: condominioId } });
            toast.success("Equipe atualizada.");
            setEdit(null);
          }}
        />
      )}
    </div>
  );
}

function MembroDialog({ inicial, empresaOpts, unidadeOpts, onClose, onSalvar }: {
  inicial: Row; empresaOpts: { value: string; label: string }[]; unidadeOpts: { value: string; label: string }[];
  onClose: () => void; onSalvar: (v: Row) => Promise<void>;
}) {
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(CAMPOS.map((c) => [c, inicial[c] == null ? "" : String(inicial[c])])));
  const [ativo, setAtivo] = useState(inicial["status"] !== false);
  const [salvando, setSalvando] = useState(false);
  const set = (k: string, x: string) => setV((o) => ({ ...o, [k]: x }));

  async function ok() {
    const erro = validarMembro(v);
    if (erro) { toast.error(erro); return; }
    setSalvando(true);
    const valores: Row = { status: ativo };
    for (const c of CAMPOS) valores[c] = v[c]?.trim() ? v[c]!.trim() : null;
    if (!valores["vinculo"]) valores["vinculo"] = "proprio";
    try { await onSalvar(valores); } finally { setSalvando(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{inicial["id"] ? "Editar membro da equipe" : "Adicionar à equipe"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label className="mb-1.5 block">Nome *</Label><Input value={v["nome"]} onChange={(e) => set("nome", e.target.value)} /></div>
          <div className="min-w-0"><Label className="mb-1.5 block">Cargo *</Label>
            <SearchSelect value={v["cargo"] ?? ""} allowClear={false} placeholder="Selecione" options={alfa(CARGOS)} onChange={(x) => setV((o) => ({ ...o, cargo: x, vinculo: o["vinculo"] && inicial["id"] ? o["vinculo"]! : vinculoPadrao(x) }))} />
          </div>
          <div className="min-w-0"><Label className="mb-1.5 block">Vínculo</Label>
            <SearchSelect value={v["vinculo"] ?? ""} allowClear={false} placeholder="Selecione" options={alfa(VINCULOS)} onChange={(x) => set("vinculo", x)} />
          </div>
          {v["vinculo"] === "morador" && (
            <div className="min-w-0 sm:col-span-2"><Label className="mb-1.5 block">Unidade *</Label>
              <SearchSelect value={v["cond_unidade_id"] ?? ""} placeholder="Selecione a unidade" options={unidadeOpts} onChange={(x) => set("cond_unidade_id", x)} />
            </div>
          )}
          {(v["vinculo"] === "terceiro" || v["vinculo"] === "proprio") && (
            <div className="min-w-0 sm:col-span-2"><Label className="mb-1.5 block">Empresa {v["vinculo"] === "terceiro" ? "*" : "(opcional)"}</Label>
              <SearchSelect value={v["empresa_id"] ?? ""} placeholder="Selecione a empresa" options={empresaOpts} onChange={(x) => set("empresa_id", x)} />
            </div>
          )}
          {(v["vinculo"] === "administradora" || v["vinculo"] === "facilities") && (
            <p className="text-xs text-muted-foreground sm:col-span-2">A empresa vem de Gestão & Terceiros deste condomínio.</p>
          )}
          <div><Label className="mb-1.5 block">E-mail</Label><Input type="email" value={v["email"]} onChange={(e) => set("email", e.target.value)} /></div>
          <div><Label className="mb-1.5 block">Celular</Label><PhoneInput value={v["celular"] ?? ""} onChange={(x) => set("celular", x)} /></div>
          <div><Label className="mb-1.5 block">CPF</Label><Input value={v["cpf"]} inputMode="numeric" onChange={(e) => set("cpf", mascaraCpf(e.target.value))} placeholder="000.000.000-00" /></div>
          <div><Label className="mb-1.5 block">Turno / horário</Label><Input value={v["turno"]} onChange={(e) => set("turno", e.target.value)} placeholder="Ex.: 12x36 diurno" /></div>
          <div><Label className="mb-1.5 block">Início (mandato/contrato)</Label><CampoData value={v["inicio"] ?? ""} onChange={(x) => set("inicio", x)} inicio={2000} /></div>
          <div><Label className="mb-1.5 block">Fim</Label><CampoData value={v["fim"] ?? ""} onChange={(x) => set("fim", x)} inicio={2000} /></div>
          <div className="sm:col-span-2"><Label className="mb-1.5 block">Observações</Label><Textarea value={v["observacoes"]} onChange={(e) => set("observacoes", e.target.value)} rows={2} /></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={ativo} onCheckedChange={setAtivo} /> Ativo</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={ok} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function mascaraCpf(x: string) {
  const d = x.replace(/\D/g, "").slice(0, 11);
  return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}
