import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { SearchSelect, type SearchOption } from "@/components/data-table/SearchSelect";
import { caminhoClassificacao, useClassificacoes } from "@/components/parceiros/ClassificacaoField";
import { rowId, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";

/** Verdadeiro quando a classificação (ou um ancestral) indica condomínio. */
export function ehCondominio(classificacoes: Row[], classificacaoId: string | undefined): boolean {
  if (!classificacaoId) return false;
  return /condom/i.test(caminhoClassificacao(classificacoes, classificacaoId));
}

type Props = {
  values: Record<string, string>;
  selfId?: string | undefined;
  disabled?: boolean;
  onChange: (key: string, value: string) => void;
};

/** Administradora, Facilities e tipo de gestão de um condomínio. */
export function GestaoCondominial({ values, selfId, disabled, onChange }: Props) {
  const { data: classificacoes = [] } = useClassificacoes();
  const { data: parceiros = [] } = useTableRows("parceiros");
  const { data: empresas = [] } = useTableRows("empresas");

  const montar = (padrao: RegExp): SearchOption[] => {
    const vistos = new Set<string>();
    const todas = [...empresas, ...parceiros]
      .filter((r) => {
        const id = String(rowId(r) ?? "");
        if (!id || id === selfId || vistos.has(id)) return false;
        vistos.add(id);
        return true;
      })
      .map((r) => ({
        value: String(rowId(r)),
        label: pick<string>(r, ["titulo", "nome_fantasia", "nome", "razao_social"], "—"),
        hint: caminhoClassificacao(classificacoes, r["classificacao_id"]) || undefined,
      }));
    const filtradas = todas.filter((o) => padrao.test(o.hint ?? "") || padrao.test(o.label));
    return (filtradas.length ? filtradas : todas).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  };

  const administradoras = useMemo(() => montar(/administr/i), [empresas, parceiros, classificacoes, selfId]);
  const facilities = useMemo(() => montar(/facilit|portaria|seguran/i), [empresas, parceiros, classificacoes, selfId]);
  const tipo = values["tipo_gestao"] || "administradora";

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="min-w-0 sm:col-span-2">
        <Label className="mb-1.5 block">Tipo de gestão</Label>
        <SearchSelect
          value={tipo}
          disabled={disabled}
          onChange={(v) => {
            onChange("tipo_gestao", v);
            if (v === "autogestao") onChange("administradora_id", "");
          }}
          options={[
            { value: "administradora", label: "Administradora terceirizada" },
            { value: "autogestao", label: "Autogestão (administração própria)" },
          ]}
        />
      </div>
      {tipo !== "autogestao" && (
        <div className="min-w-0">
          <Label className="mb-1.5 block">Administradora</Label>
          <SearchSelect value={values["administradora_id"] ?? ""} disabled={disabled} allowClear placeholder="Selecione a administradora" options={administradoras} onChange={(v) => onChange("administradora_id", v)} />
        </div>
      )}
      <div className="min-w-0">
        <Label className="mb-1.5 block">Facilities / Portaria</Label>
        <SearchSelect value={values["facilities_id"] ?? ""} disabled={disabled} allowClear placeholder="Selecione a empresa de facilities" options={facilities} onChange={(v) => onChange("facilities_id", v)} />
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-2">
        O financeiro do condomínio fica separado: contas, boletos e balancete são lançados no próprio condomínio.
      </p>
    </div>
  );
}
