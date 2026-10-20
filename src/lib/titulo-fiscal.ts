import { num, round2 } from "@/lib/orcamentos";
import type { Row } from "@/lib/row";

/** Campos fiscais (NF-e de produtos / NFS-e de serviços) de um lançamento a receber. */
export type FiscalForm = { nfe_numero: string; nfe_serie: string; nfe_valor: string; nfse_numero: string; nfse_rps: string; nfse_valor: string };

const CHAVES = ["nfe_numero", "nfe_serie", "nfe_valor", "nfse_numero", "nfse_rps", "nfse_valor"] as const;

/** Só envia as colunas fiscais quando há algo preenchido (ou já havia), para não quebrar bancos sem o script. */
export function camposFiscais(v: FiscalForm, registro?: Row | null): Record<string, string | number | null> {
  const tinha = !!registro && CHAVES.some((k) => registro[k] != null && registro[k] !== "");
  const preenchido = CHAVES.some((k) => v[k].trim() !== "");
  if (!tinha && !preenchido) return {};
  const t = (s: string) => s.trim() || null;
  const n = (s: string) => (s.trim() ? round2(num(s)) : null);
  return { nfe_numero: t(v.nfe_numero), nfe_serie: t(v.nfe_serie), nfe_valor: n(v.nfe_valor),
    nfse_numero: t(v.nfse_numero), nfse_rps: t(v.nfse_rps), nfse_valor: n(v.nfse_valor) };
}

/** Selos exibidos na listagem, no padrão "NFS-e: 389 / RPS: 374". */
export function rotulosFiscais(t: Row): string[] {
  const out: string[] = [];
  if (t["nfe_numero"]) out.push(`NF-e: ${String(t["nfe_numero"])}${t["nfe_serie"] ? `-${String(t["nfe_serie"])}` : ""}`);
  if (t["nfse_numero"] || t["nfse_rps"]) out.push([t["nfse_numero"] ? `NFS-e: ${String(t["nfse_numero"])}` : "", t["nfse_rps"] ? `RPS: ${String(t["nfse_rps"])}` : ""].filter(Boolean).join(" / "));
  return out;
}
