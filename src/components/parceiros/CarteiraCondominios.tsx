import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { rowId, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { diasParaFimMandato, papeisNaCarteira, type PapelCarteira } from "@/lib/cond-sindicatura";

const ROTULO: Record<PapelCarteira, string> = { administradora: "Administradora", facilities: "Facilities / Portaria", sindicatura: "Síndico profissional" };
const br = (iso: unknown) => (iso ? new Date(`${String(iso)}T12:00:00`).toLocaleDateString("pt-BR") : "");

/** Carteira unificada: todos os condomínios em que o parceiro atua. */
export function CarteiraCondominios({ parceiroId }: { parceiroId: string }) {
  const { data: parceiros = [] } = useTableRows("parceiros");
  const { data: sind = [] } = useQuery({
    queryKey: ["cond", "cond_sindicatura", "empresa_id", parceiroId],
    queryFn: async (): Promise<Row[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("cond_sindicatura").select("*").eq("empresa_id", parceiroId);
      if (error) return [];
      return (data ?? []) as Row[];
    },
  });
  const hoje = new Date().toISOString().slice(0, 10);

  const linhas = useMemo(() => parceiros.map((c) => {
    const id = String(rowId(c));
    const sc = sind.find((x) => String(x["condominio_id"]) === id);
    const papeis = papeisNaCarteira(parceiroId, { administradora_id: c["administradora_id"] as string, facilities_id: c["facilities_id"] as string }, sc ? String(sc["empresa_id"]) : null);
    return { id, nome: String(pick<string>(c, ["titulo", "nome_fantasia", "nome", "razao_social"], "—")), papeis, sc };
  }).filter((l) => l.papeis.length).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")), [parceiros, sind, parceiroId]);

  if (!linhas.length) return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Este parceiro ainda não atua em nenhum condomínio.</div>;

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{linhas.length} condomínio(s) na carteira.</p>
      <ul className="divide-y rounded-lg border">
        {linhas.map((l) => {
          const dias = diasParaFimMandato(l.sc?.["fim"] as string | undefined, hoje);
          return (
            <li key={l.id} className="flex flex-wrap items-center gap-3 p-3">
              <Building2 className="size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{l.nome}</p>
                {l.sc && <p className="truncate text-xs text-muted-foreground">Síndico: {String(l.sc["sindico_nome"] ?? "")}{l.sc["inicio"] || l.sc["fim"] ? ` · Mandato ${br(l.sc["inicio"])} a ${br(l.sc["fim"]) || "—"}` : ""}</p>}
              </div>
              {l.papeis.map((p) => <Badge key={p} variant="secondary">{ROTULO[p]}</Badge>)}
              {dias != null && dias < 0 && <Badge variant="destructive">Mandato vencido</Badge>}
              {dias != null && dias >= 0 && dias <= 60 && <Badge variant="outline">Vence em {dias} dia(s)</Badge>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
