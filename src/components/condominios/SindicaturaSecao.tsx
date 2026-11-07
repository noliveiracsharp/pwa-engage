import { useEffect, useMemo, useState } from "react";
import { Crown } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { PhoneInput } from "@/components/data-table/PhoneInput";
import { supabase } from "@/integrations/supabase/client";
import { rowId, useTableRows } from "@/lib/crud";
import { pick } from "@/lib/row";
import { MODALIDADES_SINDICO, diasParaFimMandato, normalizarSindicatura, validarSindicatura } from "@/lib/cond-sindicatura";
import { CampoData } from "./CampoData";
import { s, useCondRows } from "./cond-data";

const CAMPOS = ["modalidade", "empresa_id", "cond_unidade_id", "sindico_nome", "sindico_email", "sindico_celular", "inicio", "fim"] as const;
const alfa = <T extends { label: string }>(l: T[]) => [...l].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

/** Define quem é o síndico: morador (unidade) ou profissional (empresa PJ). */
export function SindicaturaSecao({ condominioId, podeEditar }: { condominioId: string; podeEditar: boolean }) {
  const qc = useQueryClient();
  const { data: linhas = [], error } = useCondRows("cond_sindicatura", "condominio_id", condominioId);
  const { data: unidades = [] } = useCondRows("cond_unidades", "condominio_id", condominioId);
  const { data: blocos = [] } = useCondRows("cond_blocos", "condominio_id", condominioId);
  const { data: parceiros = [] } = useTableRows("parceiros");
  const atual = linhas[0];
  const [v, setV] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setV(Object.fromEntries(CAMPOS.map((c) => [c, atual?.[c] == null ? "" : String(atual[c])])));
  }, [atual, condominioId]);

  const empresas = useMemo(() => {
    const todas = parceiros.filter((p) => String(rowId(p)) !== condominioId).map((p) => ({
      value: String(rowId(p)),
      label: String(pick<string>(p, ["titulo", "nome_fantasia", "nome", "razao_social"], "—")),
    }));
    return alfa(todas);
  }, [parceiros, condominioId]);
  const unidadeOpts = useMemo(() => alfa(unidades.map((u) => ({
    value: s(u["id"]),
    label: `${s(blocos.find((b) => s(b["id"]) === s(u["cond_bloco_id"]))?.["nome"])} — ${s(u["numero"])}`,
  }))), [unidades, blocos]);

  const set = (k: string, x: string) => setV((o) => ({ ...normalizarSindicatura({ ...o, [k]: x }) } as Record<string, string>));
  const dias = diasParaFimMandato(v["fim"], new Date().toISOString().slice(0, 10));

  async function salvar() {
    const erro = validarSindicatura(v);
    if (erro) { toast.error(erro); return; }
    setSalvando(true);
    const valores: Record<string, string | null> = { condominio_id: condominioId, updated_at: new Date().toISOString() };
    for (const c of CAMPOS) valores[c] = v[c]?.trim() || null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: e } = await (supabase as any).from("cond_sindicatura").upsert(valores, { onConflict: "condominio_id" }).select("id");
    setSalvando(false);
    if (e) { toast.error(/relation|schema cache/i.test(e.message) ? "Rode o script atendeai-condominios-sindicatura.sql no banco." : e.message); return; }
    if (!data?.length) { toast.error("Nada foi gravado: seu perfil não tem permissão para alterar este condomínio."); return; }
    toast.success("Síndico do condomínio salvo.");
    void qc.invalidateQueries({ queryKey: ["cond", "cond_sindicatura"] });
  }

  const tabelaFaltando = error && /relation|schema cache/i.test(String((error as { message?: string }).message));

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto flex items-center gap-2 font-semibold"><Crown className="size-4 text-primary" /> Sindicatura</h2>
        {dias != null && (dias < 0
          ? <Badge variant="destructive">Mandato vencido</Badge>
          : dias <= 60 && <Badge variant="outline">Mandato vence em {dias} dia(s)</Badge>)}
      </div>
      {tabelaFaltando && <p className="text-sm text-destructive">Rode o script atendeai-condominios-sindicatura.sql no banco para habilitar esta seção.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 sm:col-span-2">
          <Label className="mb-1.5 block">Modalidade do síndico</Label>
          <SearchSelect value={v["modalidade"] ?? ""} disabled={!podeEditar} placeholder="Selecione" options={alfa([...MODALIDADES_SINDICO])} onChange={(x) => set("modalidade", x)} />
        </div>
        {v["modalidade"] === "profissional" && (
          <div className="min-w-0 sm:col-span-2">
            <Label className="mb-1.5 block">Empresa de sindicatura profissional</Label>
            <SearchSelect value={v["empresa_id"] ?? ""} disabled={!podeEditar} allowClear placeholder="Selecione o parceiro (PJ)" options={empresas} onChange={(x) => set("empresa_id", x)} />
            <p className="mt-1 text-xs text-muted-foreground">Cadastre a empresa em Parceiros. Na ficha dela, a aba Condomínios mostra toda a carteira.</p>
          </div>
        )}
        {v["modalidade"] === "morador" && (
          <div className="min-w-0 sm:col-span-2">
            <Label className="mb-1.5 block">Unidade do síndico</Label>
            <SearchSelect value={v["cond_unidade_id"] ?? ""} disabled={!podeEditar} allowClear placeholder="Selecione a unidade" options={unidadeOpts} onChange={(x) => set("cond_unidade_id", x)} />
          </div>
        )}
        {v["modalidade"] && (
          <>
            <div className="min-w-0">
              <Label className="mb-1.5 block">{v["modalidade"] === "profissional" ? "Síndico responsável (preposto)" : "Nome do síndico"}</Label>
              <Input value={v["sindico_nome"] ?? ""} disabled={!podeEditar} onChange={(e) => set("sindico_nome", e.target.value)} />
            </div>
            <div className="min-w-0">
              <Label className="mb-1.5 block">E-mail</Label>
              <Input type="email" value={v["sindico_email"] ?? ""} disabled={!podeEditar} onChange={(e) => set("sindico_email", e.target.value)} />
            </div>
            <div className="min-w-0 sm:col-span-2">
              <Label className="mb-1.5 block">Celular</Label>
              {podeEditar ? <PhoneInput value={v["sindico_celular"] ?? ""} onChange={(x: string) => set("sindico_celular", x)} /> : <Input value={v["sindico_celular"] ?? ""} disabled />}
            </div>
            <div className="min-w-0">
              <Label className="mb-1.5 block">Início do mandato</Label>
              <CampoData value={v["inicio"] ?? ""} disabled={!podeEditar} onChange={(x: string) => set("inicio", x)} />
            </div>
            <div className="min-w-0">
              <Label className="mb-1.5 block">Fim do mandato</Label>
              <CampoData value={v["fim"] ?? ""} disabled={!podeEditar} onChange={(x: string) => set("fim", x)} />
            </div>
          </>
        )}
      </div>
      {podeEditar && (
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar síndico"}</Button>
        </div>
      )}
    </section>
  );
}
