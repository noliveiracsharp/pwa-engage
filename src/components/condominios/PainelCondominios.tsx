import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building, Building2, Car, DoorOpen, KeyRound, PawPrint, ParkingSquare, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { Row } from "@/lib/row";
import { s } from "./cond-data";

type Cond = { value: string; label: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

async function linhas(tabela: string, colunas: string): Promise<Row[]> {
  const { data, error } = await db.from(tabela).select(colunas);
  if (error) return [];
  return (data ?? []) as Row[];
}

function Kpi({ icone: I, rotulo, valor, sub }: { icone: typeof Building; rotulo: string; valor: number | string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><I className="size-4" /> {rotulo}</div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function PainelCondominios({ condominios, condId, podeConfigurar, onAbrir }: { condominios: Cond[]; condId: string; podeConfigurar: boolean; onAbrir: (id: string) => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["cond", "painel"],
    queryFn: async () => {
      const [blocos, unidades, vinculos, vagas, veiculos, pets, config] = await Promise.all([
        linhas("cond_blocos", "id,condominio_id"),
        linhas("cond_unidades", "id,condominio_id,ocupacao"),
        linhas("cond_unidades_vinculos", "id,cond_unidade_id,usuario_id,is_residente"),
        linhas("cond_vagas", "id,condominio_id,cond_unidade_id"),
        linhas("cond_unidades_veiculos", "id,cond_unidade_id"),
        linhas("cond_unidades_pets", "id,cond_unidade_id"),
        linhas("cond_config", "condominio_id,morador_edita_dados"),
      ]);
      return { blocos, unidades, vinculos, vagas, veiculos, pets, config };
    },
  });
  const d = data ?? { blocos: [], unidades: [], vinculos: [], vagas: [], veiculos: [], pets: [], config: [] };
  const ids = new Set(condominios.map((c) => c.value));
  const unidades = d.unidades.filter((u) => ids.has(s(u["condominio_id"])));
  const condDaUnidade = new Map(unidades.map((u) => [s(u["id"]), s(u["condominio_id"])]));
  const daUnid = (rs: Row[]) => rs.filter((r) => condDaUnidade.has(s(r["cond_unidade_id"])));
  const vinculos = daUnid(d.vinculos);
  const pessoas = new Set(vinculos.map((v) => s(v["usuario_id"]))).size;
  const alugadas = unidades.filter((u) => s(u["ocupacao"]) === "alugada").length;
  const vagas = d.vagas.filter((v) => ids.has(s(v["condominio_id"])));
  const ocupadas = vagas.filter((v) => v["cond_unidade_id"]).length;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  const porCond = condominios.map((c) => {
    const us = unidades.filter((u) => s(u["condominio_id"]) === c.value);
    const set = new Set(us.map((u) => s(u["id"])));
    return {
      ...c,
      blocos: d.blocos.filter((b) => s(b["condominio_id"]) === c.value).length,
      unidades: us.length,
      alugadas: us.filter((u) => s(u["ocupacao"]) === "alugada").length,
      moradores: new Set(vinculos.filter((v) => set.has(s(v["cond_unidade_id"]))).map((v) => s(v["usuario_id"]))).size,
      edita: d.config.find((x) => s(x["condominio_id"]) === c.value)?.["morador_edita_dados"] === true,
    };
  }).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  async function alternar(id: string, v: boolean) {
    const { error } = await db.from("cond_config").upsert({ condominio_id: id, morador_edita_dados: v, updated_at: new Date().toISOString() });
    if (error) { toast.error(error.message); return; }
    toast.success(v ? "Moradores podem alterar os próprios dados." : "Somente a administração altera os dados.");
    await qc.invalidateQueries({ queryKey: ["cond", "painel"] });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icone={Building2} rotulo="Condomínios" valor={condominios.length} />
        <Kpi icone={DoorOpen} rotulo="Unidades" valor={unidades.length} sub={`${d.blocos.filter((b) => ids.has(s(b["condominio_id"]))).length} blocos/torres`} />
        <Kpi icone={Users} rotulo="Pessoas cadastradas" valor={pessoas} sub={`${vinculos.filter((v) => v["is_residente"] === true).length} residentes`} />
        <Kpi icone={KeyRound} rotulo="Unidades alugadas" valor={alugadas} sub={`${pct(alugadas, unidades.length)} do total`} />
        <Kpi icone={ParkingSquare} rotulo="Vagas" valor={vagas.length} sub={`${pct(ocupadas, vagas.length)} vinculadas`} />
        <Kpi icone={Car} rotulo="Veículos" valor={daUnid(d.veiculos).length} />
        <Kpi icone={PawPrint} rotulo="Pets" valor={daUnid(d.pets).length} />
        <Kpi icone={Users} rotulo="Média por unidade" valor={unidades.length ? (vinculos.length / unidades.length).toFixed(1) : "—"} sub="pessoas vinculadas" />
      </div>

      <section className="rounded-lg border bg-card">
        <h2 className="border-b p-3 font-semibold">Condomínios instalados</h2>
        {porCond.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Nenhum condomínio (classifique em Clientes e Fornecedores).</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr className="border-b">
                <th className="p-3">Condomínio</th><th className="p-3 text-right">Blocos</th><th className="p-3 text-right">Unidades</th>
                <th className="p-3 text-right">Alugadas</th><th className="p-3 text-right">Pessoas</th><th className="p-3">Morador altera os próprios dados</th>
              </tr></thead>
              <tbody>
                {porCond.map((c) => (
                  <tr key={c.value} className={`border-b last:border-0 ${c.value === condId ? "bg-primary/5" : ""}`}>
                    <td className="p-3"><button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => onAbrir(c.value)}>{c.label}</button></td>
                    <td className="p-3 text-right tabular-nums">{c.blocos}</td>
                    <td className="p-3 text-right tabular-nums">{c.unidades}</td>
                    <td className="p-3 text-right tabular-nums">{c.alugadas}</td>
                    <td className="p-3 text-right tabular-nums">{c.moradores}</td>
                    <td className="p-3"><div className="flex items-center gap-2">
                      <Switch id={`ed-${c.value}`} disabled={!podeConfigurar} checked={c.edita} onCheckedChange={(v) => alternar(c.value, v)} />
                      <Label htmlFor={`ed-${c.value}`} className="font-normal">{c.edita ? "Permitido" : "Só a administração"}</Label>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
