import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { normalizarRamal, ramaisDuplicados } from "@/lib/interfone";
import type { Row } from "@/lib/row";
import { s } from "./cond-data";
import { AcaoIcone } from "./AcaoIcone";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
export const CATEGORIAS_RAMAL: Record<string, string> = {
  administracao: "Administração", emergencia: "Emergência e segurança", lazer: "Lazer e espaços", operacional: "Operacional", portaria: "Portaria",
};
const VAZIO = { id: "", nome: "", ramal: "", categoria: "operacional", cond_espaco_id: "", no_qrcode: true, ativo: true };

export function InterfoneRamais({ condominioId, canUpdate }: { condominioId: string; canUpdate: boolean }) {
  const qc = useQueryClient();
  const chave = ["cond", "interfone_ramais", condominioId];
  const q = useQuery({ queryKey: chave, queryFn: async () => { const r = await db.from("cond_interfone_ramais").select("*").eq("condominio_id", condominioId).order("nome"); if (r.error) throw r.error; return (r.data ?? []) as Row[]; } });
  const espQ = useQuery({ queryKey: ["cond", "espacos_sel", condominioId], queryFn: async () => { const r = await db.from("cond_espacos").select("id,nome").eq("condominio_id", condominioId); return (r.data ?? []) as Row[]; } });
  const [busca, setBusca] = useState("");
  const [f, setF] = useState<typeof VAZIO | null>(null);
  const [salvando, setSalvando] = useState(false);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (q.data ?? []).filter((r) => !t || s(r["nome"]).toLowerCase().includes(t) || s(r["ramal"]).includes(t));
  }, [q.data, busca]);
  const dup = ramaisDuplicados((q.data ?? []).map((r) => ({ ramal: s(r["ramal"]) })));
  const espacos = (espQ.data ?? []).map((e) => ({ value: s(e["id"]), label: s(e["nome"]) })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  const cats = Object.entries(CATEGORIAS_RAMAL).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  const salvar = async () => {
    if (!f) return;
    const ramal = normalizarRamal(f.ramal);
    if (f.nome.trim().length < 2) return toast.error("Informe o local do ramal.");
    if (!/^\*?\d{1,6}$/.test(ramal)) return toast.error("Ramal: até 6 números, com * opcional no início.");
    if ((q.data ?? []).some((r) => normalizarRamal(s(r["ramal"])) === ramal && s(r["id"]) !== f.id)) return toast.error(`O ramal ${ramal} já está cadastrado para outro local.`);
    setSalvando(true);
    const dados = { condominio_id: condominioId, nome: f.nome.trim(), ramal, categoria: f.categoria || "operacional", cond_espaco_id: f.cond_espaco_id || null, no_qrcode: f.no_qrcode, ativo: f.ativo };
    const { error } = f.id ? await db.from("cond_interfone_ramais").update(dados).eq("id", f.id) : await db.from("cond_interfone_ramais").insert(dados);
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Ramal salvo."); setF(null);
    void qc.invalidateQueries({ queryKey: chave });
  };
  const excluir = async (r: Row) => {
    if (!(await confirmar({ title: "Excluir ramal?", description: `${s(r["nome"])} · ${s(r["ramal"])}`, confirmText: "Excluir", destructive: true }))) return;
    const { error } = await db.from("cond_interfone_ramais").delete().eq("id", s(r["id"]));
    if (error) return toast.error(error.message);
    void qc.invalidateQueries({ queryKey: chave });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input aria-label="Buscar ramal por local ou número" placeholder="Buscar por local ou número" className="pl-8" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {canUpdate && <Button onClick={() => setF({ ...VAZIO })}><Plus className="size-4" /> Novo ramal</Button>}
      </div>
      {dup.length > 0 && <p role="alert" className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"><AlertTriangle className="size-4" /> Ramais repetidos: {dup.join(", ")}. Corrija para a discagem funcionar.</p>}
      <p className="text-xs text-muted-foreground">Quem digitar o ramal no teclado do QR Code chama direto a equipe responsável. Moradores também consultam esta lista.</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="p-2">Local</th><th className="p-2">Ramal</th><th className="p-2">Categoria</th><th className="p-2">No QR Code</th><th className="p-2 text-right"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>
            {lista.map((r) => (
              <tr key={s(r["id"])} className="border-t">
                <td className="p-2">{s(r["nome"])}{r["ativo"] === false && <Badge variant="outline" className="ml-2">Inativo</Badge>}</td>
                <td className="p-2 font-mono"><Phone className="mr-1 inline size-3.5 text-muted-foreground" aria-hidden />{s(r["ramal"])}</td>
                <td className="p-2">{CATEGORIAS_RAMAL[s(r["categoria"])] ?? s(r["categoria"])}</td>
                <td className="p-2">{r["no_qrcode"] === false ? "Não" : "Sim"}</td>
                <td className="p-2 text-right">
                  {canUpdate && <>
                    <AcaoIcone titulo="Editar ramal" onClick={() => setF({ id: s(r["id"]), nome: s(r["nome"]), ramal: s(r["ramal"]), categoria: s(r["categoria"]), cond_espaco_id: s(r["cond_espaco_id"]), no_qrcode: r["no_qrcode"] !== false, ativo: r["ativo"] !== false })}><Pencil className="size-4" /></AcaoIcone>
                    <AcaoIcone titulo="Excluir ramal" destrutivo onClick={() => void excluir(r)}><Trash2 className="size-4" /></AcaoIcone>
                  </>}
                </td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">{q.isLoading ? "Carregando…" : "Nenhum ramal cadastrado."}</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={!!f} onOpenChange={(o) => !o && setF(null)}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle>{f?.id ? "Editar ramal" : "Novo ramal"}</DialogTitle></DialogHeader>
          {f && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                <div className="space-y-1.5"><Label htmlFor="rm-nome">Local</Label><Input id="rm-nome" value={f.nome} maxLength={80} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Portaria social" /></div>
                <div className="space-y-1.5"><Label htmlFor="rm-ramal">Ramal</Label><Input id="rm-ramal" inputMode="numeric" className="font-mono" value={f.ramal} maxLength={7} onChange={(e) => setF({ ...f, ramal: e.target.value })} placeholder="*106" /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="rm-cat">Categoria</Label><SearchSelect id="rm-cat" allowClear={false} value={f.categoria} onChange={(v) => setF({ ...f, categoria: v || "operacional" })} options={cats} /></div>
              <div className="space-y-1.5"><Label htmlFor="rm-esp">Espaço (opcional)</Label><SearchSelect id="rm-esp" value={f.cond_espaco_id} onChange={(v) => setF({ ...f, cond_espaco_id: v })} options={espacos} placeholder="Nenhum" /></div>
              <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"><span>Mostrar como atalho no QR Code<span className="block text-xs text-muted-foreground">Se desligado, só funciona digitando o número.</span></span><Switch checked={f.no_qrcode} onCheckedChange={(c) => setF({ ...f, no_qrcode: c })} /></label>
              <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"><span>Ativo</span><Switch checked={f.ativo} onCheckedChange={(c) => setF({ ...f, ativo: c })} /></label>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setF(null)}>Cancelar</Button><Button disabled={salvando} onClick={() => void salvar()}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
