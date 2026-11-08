import { useMemo, useState } from "react";
import { ParkingSquare, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { confirmar } from "@/components/layout/DialogoGlobal";
import type { Row } from "@/lib/row";
import { MODALIDADES_VAGA, ordemNatural, s, useCondRows, useCondSalvar } from "./cond-data";

type Perms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };

export function rotuloUnidade(u: Row | undefined, blocos: Row[]) {
  if (!u) return "";
  const b = blocos.find((x) => s(x["id"]) === s(u["cond_bloco_id"]));
  return `${b ? s(b["nome"]) + " · " : ""}${s(u["numero"])}`;
}

export function VagasPanel({ condominioId, blocos, unidades, perms }: { condominioId: string; blocos: Row[]; unidades: Row[]; perms: Perms }) {
  const { data: vagas = [] } = useCondRows("cond_vagas", "condominio_id", condominioId);
  const salvar = useCondSalvar("cond_vagas");
  const [busca, setBusca] = useState("");
  const [n, setN] = useState({ identificacao: "", piso_setor: "", modalidade_posse: "sorteada", cond_unidade_id: "" });
  const optUnid = useMemo(() => unidades.map((u) => ({ value: s(u["id"]), label: rotuloUnidade(u, blocos) })).sort((a, b) => ordemNatural(a.label, b.label)), [unidades, blocos]);
  const t = busca.trim().toLowerCase();
  const lista = vagas
    .filter((v) => !t || `${s(v["identificacao"])} ${s(v["piso_setor"])} ${rotuloUnidade(unidades.find((u) => s(u["id"]) === s(v["cond_unidade_id"])), blocos)}`.toLowerCase().includes(t))
    .sort((a, b) => ordemNatural(s(a["identificacao"]), s(b["identificacao"])));
  const total = (m: string) => vagas.filter((v) => s(v["modalidade_posse"]) === m || (m === "privativa" && s(v["modalidade_posse"]) === "escriturada")).length;
  const atualizar = (v: Row, valores: Row) => salvar.mutate({ id: s(v["id"]), valores });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto" />
        {MODALIDADES_VAGA.map((m) => <Badge key={m.value} variant="outline">{m.label.split(" (")[0]}: {total(m.value)}</Badge>)}
      </div>
      {perms.canCreate && (
        <div className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-5">
          <div><Label htmlFor="vg-id">Identificação</Label><Input id="vg-id" value={n.identificacao} onChange={(e) => setN({ ...n, identificacao: e.target.value.toUpperCase() })} placeholder="G1-015" /></div>
          <div><Label htmlFor="vg-piso">Piso / setor</Label><Input id="vg-piso" value={n.piso_setor} onChange={(e) => setN({ ...n, piso_setor: e.target.value })} /></div>
          <div><Label className="mb-1.5 block">Modalidade</Label><SearchSelect value={n.modalidade_posse} allowClear={false} options={MODALIDADES_VAGA} onChange={(x) => setN({ ...n, modalidade_posse: x })} /></div>
          <div><Label className="mb-1.5 block">Unidade</Label><SearchSelect value={n.cond_unidade_id} options={optUnid} onChange={(x) => setN({ ...n, cond_unidade_id: x })} placeholder="Livre" /></div>
          <div className="flex items-end"><Button className="w-full" disabled={!n.identificacao.trim() || salvar.isPending || (n.modalidade_posse === "privativa" && !n.cond_unidade_id)} onClick={async () => {
            await salvar.mutateAsync({ valores: { condominio_id: condominioId, identificacao: n.identificacao.trim(), piso_setor: n.piso_setor || null, modalidade_posse: n.modalidade_posse, cond_unidade_id: n.cond_unidade_id || null, participa_sorteio: n.modalidade_posse === "sorteada" } });
            setN({ ...n, identificacao: "" }); toast.success("Vaga criada.");
          }}><Plus className="size-4" /> Adicionar</Button></div>
          {n.modalidade_posse === "privativa" && !n.cond_unidade_id && <p className="text-xs text-muted-foreground sm:col-span-5">Vaga privativa pertence a uma unidade (escritura): escolha a unidade.</p>}
        </div>
      )}
      <div className="relative sm:w-72">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar vaga ou unidade" className="pl-8" aria-label="Buscar vaga" />
      </div>
      {lista.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma vaga.</p> : (
        <div className="space-y-2">
          {lista.map((v) => {
            const mod = s(v["modalidade_posse"]) === "escriturada" ? "privativa" : s(v["modalidade_posse"]);
            return (
              <div key={s(v["id"])} className="grid items-center gap-2 rounded-lg border bg-card p-3 text-sm lg:grid-cols-[8rem_1fr_1fr_auto]">
                <div className="font-semibold">{s(v["identificacao"])}<span className="block text-xs font-normal text-muted-foreground">{s(v["piso_setor"])}</span></div>
                <SearchSelect value={mod} disabled={!perms.canUpdate} allowClear={false} options={MODALIDADES_VAGA} onChange={(x) => atualizar(v, { modalidade_posse: x, participa_sorteio: x === "sorteada" })} />
                <SearchSelect value={s(v["cond_unidade_id"])} disabled={!perms.canUpdate} options={optUnid} placeholder="Livre" onChange={(x) => atualizar(v, { cond_unidade_id: x || null })} />
                <div className="flex flex-wrap items-center gap-3">
                  {(["is_pcd", "is_idoso", "is_coberta", "is_gaveta"] as const).map((k) => (
                    <label key={k} className="flex items-center gap-1 text-xs">
                      <Switch disabled={!perms.canUpdate} checked={v[k] === true} onCheckedChange={(c) => atualizar(v, { [k]: c })} />
                      {{ is_pcd: "PCD", is_idoso: "Idoso", is_coberta: "Coberta", is_gaveta: "Gaveta" }[k]}
                    </label>
                  ))}
                  {perms.canDelete && <Button size="icon" variant="ghost" className="size-8 text-destructive" aria-label={`Excluir vaga ${s(v["identificacao"])}`} onClick={async () => {
                    if (await confirmar({ title: `Excluir vaga ${s(v["identificacao"])}?`, destructive: true, confirmText: "Excluir" })) await salvar.mutateAsync({ id: s(v["id"]), excluir: true });
                  }}><Trash2 className="size-4" /></Button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
