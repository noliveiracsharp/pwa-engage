import { useEffect, useState } from "react";
import { Briefcase, Building, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { GestaoCondominial } from "@/components/empresas/GestaoCondominial";
import { supabase } from "@/integrations/supabase/client";
import { rowId, useTableRows } from "@/lib/crud";
import { pick } from "@/lib/row";
import { PhoneInput } from "@/components/data-table/PhoneInput";
import { SindicaturaSecao } from "./SindicaturaSecao";
import { DiretoriaSecao } from "./DiretoriaSecao";

const CAMPOS = ["tipo_gestao", "administradora_id", "facilities_id", "cond_contato_administradora", "cond_contato_portaria", "cond_portaria_modalidade"] as const;

export const MODALIDADES_PORTARIA = [
  { value: "presencial", label: "Portaria presencial" },
  { value: "remota", label: "Portaria remota / virtual" },
  { value: "hibrida", label: "Híbrida" },
  { value: "sem", label: "Sem portaria" },
];

/** Vincula o condomínio à administradora e à empresa de facilities/portaria. */
export function GestaoTerceirosPanel({ condominioId, podeEditar }: { condominioId: string; podeEditar: boolean }) {
  const qc = useQueryClient();
  const { data: parceiros = [] } = useTableRows("parceiros");
  const atual = parceiros.find((p) => String(rowId(p)) === condominioId);
  const [v, setV] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const ini: Record<string, string> = {};
    for (const c of CAMPOS) ini[c] = atual?.[c] == null ? "" : String(atual[c]);
    setV(ini);
  }, [atual, condominioId]);

  const nome = (id: string) => {
    const r = parceiros.find((p) => String(rowId(p)) === id);
    return r ? String(pick<string>(r, ["titulo", "nome_fantasia", "nome", "razao_social"], "—")) : "Não definida";
  };

  async function salvar() {
    setSalvando(true);
    const valores: Record<string, string | null> = {};
    for (const c of CAMPOS) valores[c] = v[c] || null;
    if (valores["tipo_gestao"] === "autogestao") valores["administradora_id"] = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from("parceiros").update(valores).eq("id", condominioId).select("id");
    setSalvando(false);
    if (error) { toast.error(/column|schema cache/i.test(error.message) ? "Rode o script atendeai-condominios-gestao-parceiros.sql no banco." : error.message); return; }
    if (!data?.length) { toast.error("Nada foi gravado: seu perfil não tem permissão para alterar este condomínio."); return; }
    toast.success("Gestão do condomínio salva.");
    void qc.invalidateQueries({ queryKey: ["table", "parceiros"] });
    void qc.invalidateQueries({ queryKey: ["table", "empresas"] });
  }

  const set = (k: string, val: string) => setV((o) => ({ ...o, [k]: val }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Resumo icon={Briefcase} titulo="Tipo de gestão" valor={v["tipo_gestao"] === "autogestao" ? "Autogestão" : "Administradora terceirizada"} />
        <Resumo icon={Building} titulo="Administradora" valor={v["tipo_gestao"] === "autogestao" ? "—" : nome(v["administradora_id"] ?? "")} />
        <Resumo icon={ShieldCheck} titulo="Facilities / Portaria" valor={nome(v["facilities_id"] ?? "")} />
      </div>
      <section className="space-y-4 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">Administradora & Portaria</h2>
        <GestaoCondominial values={v} selfId={condominioId} disabled={!podeEditar} onChange={set} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <Label className="mb-1.5 block">Modalidade da portaria</Label>
            <SearchSelect value={v["cond_portaria_modalidade"] ?? ""} disabled={!podeEditar} allowClear placeholder="Selecione" options={[...MODALIDADES_PORTARIA].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))} onChange={(x) => set("cond_portaria_modalidade", x)} />
          </div>
          <div className="min-w-0">
            <Label className="mb-1.5 block">Telefone da portaria (emergência)</Label>
            {podeEditar ? <PhoneInput value={v["cond_contato_portaria"] ?? ""} onChange={(x: string) => set("cond_contato_portaria", x)} /> : <Input value={v["cond_contato_portaria"] ?? ""} disabled />}
          </div>
          <div className="min-w-0 sm:col-span-2">
            <Label className="mb-1.5 block">Contato na administradora (gerente de conta, e-mail)</Label>
            <Input value={v["cond_contato_administradora"] ?? ""} disabled={!podeEditar} onChange={(e) => set("cond_contato_administradora", e.target.value)} placeholder="Ex.: Ana Souza — ana@administradora.com.br" />
          </div>
        </div>
        {podeEditar && (
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
          </div>
        )}
      </section>
      <SindicaturaSecao condominioId={condominioId} podeEditar={podeEditar} />
      <DiretoriaSecao condominioId={condominioId} podeEditar={podeEditar} />
    </div>
  );
}

function Resumo({ icon: Icon, titulo, valor }: { icon: typeof Building; titulo: string; valor: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <Icon className="size-5 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className="truncate font-medium">{valor}</p>
      </div>
    </div>
  );
}
