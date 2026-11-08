import { AlertTriangle } from "lucide-react";
import { situacaoMandato } from "@/lib/cond-sindicatura";
import { s, useCondRows } from "./cond-data";

/** Banner no Painel quando o mandato do síndico está perto do fim ou já venceu. */
export function AlertaMandato({ condominioId }: { condominioId: string }) {
  const { data: linhas = [] } = useCondRows("cond_sindicatura", "condominio_id", condominioId);
  const atual = linhas[0];
  const ant = atual?.["alerta_dias"];
  const r = situacaoMandato(s(atual?.["fim"]) || null, new Date().toISOString().slice(0, 10), ant == null || ant === "" ? null : Number(ant));
  if (!r || r.situacao === "ok") return null;
  const fim = new Date(`${s(atual?.["fim"])}T12:00:00`).toLocaleDateString("pt-BR");
  const vencido = r.situacao === "vencido";
  return (
    <div role="alert" className={vencido ? "flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm" : "flex items-start gap-3 rounded-lg border border-warning/60 bg-warning/15 p-3 text-sm"}>
      <AlertTriangle className={vencido ? "mt-0.5 size-5 shrink-0 text-destructive" : "mt-0.5 size-5 shrink-0 text-warning"} />
      <p>
        {vencido
          ? <><strong>Mandato do síndico vencido</strong> desde {fim} ({Math.abs(r.dias)} dia(s)). Convoque a assembleia de eleição.</>
          : <><strong>Mandato do síndico encerra em {r.dias} dia(s)</strong> ({fim}). Agende a assembleia de eleição.</>}
      </p>
    </div>
  );
}
