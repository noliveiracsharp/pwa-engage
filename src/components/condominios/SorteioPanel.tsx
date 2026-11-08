import { useMemo, useState } from "react";
import { CheckCircle2, Shuffle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { confirmar } from "@/components/layout/DialogoGlobal";
import type { Row } from "@/lib/row";
import { novaSemente, sortearVagas, type ResultadoSorteio } from "@/lib/sorteio-vagas";
import { ordemNatural, s, useCondRows, useCondSalvar } from "./cond-data";
import { rotuloUnidade } from "./VagasPanel";

type Perms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };
const CRIT: Record<string, string> = { pcd: "Prioridade PCD", idoso: "Prioridade Idoso", geral: "Sorteio geral", sem_vaga: "Sem vaga (lista de espera)" };

/**
 * 1) Configurar rodada  2) Marcar participantes e prioridades  3) Sortear com semente  4) Homologar.
 * Vagas privativas nunca entram; unidades que já têm vaga privativa ficam de fora por padrão.
 */
export function SorteioPanel({ condominioId, blocos, unidades, perms }: { condominioId: string; blocos: Row[]; unidades: Row[]; perms: Perms }) {
  const qc = useQueryClient();
  const { data: vagas = [] } = useCondRows("cond_vagas", "condominio_id", condominioId);
  const { data: rodadas = [] } = useCondRows("cond_sorteios", "condominio_id", condominioId);
  const salvarRodada = useCondSalvar("cond_sorteios");
  const sorteaveis = vagas.filter((v) => s(v["modalidade_posse"]) === "sorteada" && v["status"] !== false);
  const comPrivativa = new Set(vagas.filter((v) => ["privativa", "escriturada"].includes(s(v["modalidade_posse"]))).map((v) => s(v["cond_unidade_id"])));
  const lista = useMemo(() => [...unidades].filter((u) => u["status"] !== false).sort((a, b) => ordemNatural(rotuloUnidade(a, blocos), rotuloUnidade(b, blocos))), [unidades, blocos]);

  const [nome, setNome] = useState(`Sorteio ${new Date().getFullYear()}`);
  const [ini, setIni] = useState("");
  const [fim, setFim] = useState("");
  const [part, setPart] = useState<Record<string, { on: boolean; pcd: boolean; idoso: boolean }>>({});
  const [res, setRes] = useState<{ semente: string; itens: ResultadoSorteio[] } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const st = (id: string) => part[id] ?? { on: !comPrivativa.has(id), pcd: false, idoso: false };
  const set = (id: string, k: "on" | "pcd" | "idoso", v: boolean) => { setPart({ ...part, [id]: { ...st(id), [k]: v } }); setRes(null); };
  const participantes = lista.filter((u) => st(s(u["id"])).on).map((u) => ({ unidadeId: s(u["id"]), pcd: st(s(u["id"])).pcd, idoso: st(s(u["id"])).idoso }));
  const vagaNome = (id: string | null) => s(vagas.find((v) => s(v["id"]) === id)?.["identificacao"]);
  const unidNome = (id: string) => rotuloUnidade(unidades.find((u) => s(u["id"]) === id), blocos);

  function sortear() {
    const semente = novaSemente();
    setRes({ semente, itens: sortearVagas(sorteaveis.map((v) => ({ id: s(v["id"]), pcd: v["is_pcd"] === true, idoso: v["is_idoso"] === true })), participantes, semente) });
  }

  async function homologar() {
    if (!res) return;
    if (!(await confirmar({ title: "Homologar resultado?", description: "As vagas sorteadas passam para as unidades e a rodada fica imutável (registro de auditoria).", confirmText: "Homologar" }))) return;
    setOcupado(true);
    try {
      // Libera as vagas sorteáveis e atribui conforme o resultado.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const ids = sorteaveis.map((v) => s(v["id"]));
      if (ids.length) { const r = await db.from("cond_vagas").update({ cond_unidade_id: null }).in("id", ids); if (r.error) throw r.error; }
      for (const it of res.itens.filter((x) => x.vagaId)) {
        const r = await db.from("cond_vagas").update({ cond_unidade_id: it.unidadeId, data_inicio_vigencia: ini || null, data_fim_vigencia: fim || null }).eq("id", it.vagaId);
        if (r.error) throw r.error;
      }
      await salvarRodada.mutateAsync({ valores: { condominio_id: condominioId, nome, semente: res.semente, vigencia_inicio: ini || null, vigencia_fim: fim || null, status: "homologado", homologado_em: new Date().toISOString(), resultado: res.itens.map((x) => ({ ...x, unidade: unidNome(x.unidadeId), vaga: vagaNome(x.vagaId) })) } });
      qc.invalidateQueries({ queryKey: ["cond", "cond_vagas"] });
      setRes(null); toast.success("Sorteio homologado.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível homologar."); }
    finally { setOcupado(false); }
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-3">
        <div><Label htmlFor="so-nome">1. Nome da rodada</Label><Input id="so-nome" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
        <div><Label htmlFor="so-ini">Vigência inicial</Label><Input id="so-ini" type="date" value={ini} onChange={(e) => setIni(e.target.value)} /></div>
        <div><Label htmlFor="so-fim">Vigência final</Label><Input id="so-fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} /></div>
        <p className="text-xs text-muted-foreground sm:col-span-3">
          {sorteaveis.length} vagas sorteáveis ({sorteaveis.filter((v) => v["is_pcd"]).length} PCD, {sorteaveis.filter((v) => v["is_idoso"]).length} Idoso) para {participantes.length} unidades. Vagas privativas não entram.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-3">
        <p className="mb-2 text-sm font-medium">2. Participantes e prioridades legais</p>
        <div className="grid max-h-80 gap-1 overflow-y-auto sm:grid-cols-2">
          {lista.map((u) => {
            const id = s(u["id"]); const x = st(id);
            return (
              <div key={id} className="flex items-center gap-3 rounded px-2 py-1 text-sm hover:bg-muted">
                <label className="flex flex-1 items-center gap-2"><Switch checked={x.on} onCheckedChange={(c) => set(id, "on", c)} /> {unidNome(id)}{comPrivativa.has(id) && <Badge variant="outline">Privativa</Badge>}</label>
                <label className="flex items-center gap-1 text-xs"><Switch disabled={!x.on} checked={x.pcd} onCheckedChange={(c) => set(id, "pcd", c)} /> PCD</label>
                <label className="flex items-center gap-1 text-xs"><Switch disabled={!x.on} checked={x.idoso} onCheckedChange={(c) => set(id, "idoso", c)} /> Idoso</label>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={!perms.canCreate || !participantes.length || !sorteaveis.length} onClick={sortear}><Shuffle className="size-4" /> 3. {res ? "Sortear novamente" : "Sortear"}</Button>
        {res && <Button variant="outline" disabled={!perms.canUpdate || ocupado || !nome.trim()} onClick={homologar}><CheckCircle2 className="size-4" /> 4. Homologar</Button>}
      </div>

      {res && (
        <div className="rounded-lg border bg-card p-3">
          <p className="mb-2 text-sm">Semente de auditoria: <span className="font-mono font-semibold">{res.semente}</span> — com a mesma semente e os mesmos participantes, o resultado é idêntico.</p>
          <ResultadoTabela itens={res.itens} unidNome={unidNome} vagaNome={vagaNome} />
        </div>
      )}

      {rodadas.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Rodadas homologadas</p>
          {[...rodadas].sort((a, b) => s(b["created_at"]).localeCompare(s(a["created_at"]))).map((r) => (
            <details key={s(r["id"])} className="rounded-lg border bg-card p-3 text-sm">
              <summary className="cursor-pointer">{s(r["nome"])} · {new Date(s(r["created_at"])).toLocaleDateString("pt-BR")} · semente <span className="font-mono">{s(r["semente"])}</span></summary>
              <ResultadoTabela itens={(r["resultado"] as ResultadoSorteio[]) ?? []} unidNome={(id) => s(((r["resultado"] as Row[]) ?? []).find((x) => x["unidadeId"] === id)?.["unidade"])} vagaNome={(id) => s(((r["resultado"] as Row[]) ?? []).find((x) => x["vagaId"] === id)?.["vaga"])} />
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function ResultadoTabela({ itens, unidNome, vagaNome }: { itens: ResultadoSorteio[]; unidNome: (id: string) => string; vagaNome: (id: string | null) => string }) {
  return (
    <table className="mt-2 w-full text-sm">
      <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1">#</th><th>Unidade</th><th>Vaga</th><th>Critério</th></tr></thead>
      <tbody>
        {itens.map((x) => (
          <tr key={x.unidadeId} className="border-b last:border-0">
            <td className="py-1">{x.ordem}</td><td>{unidNome(x.unidadeId)}</td><td className="font-semibold">{x.vagaId ? vagaNome(x.vagaId) : "—"}</td><td>{CRIT[x.criterio]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
