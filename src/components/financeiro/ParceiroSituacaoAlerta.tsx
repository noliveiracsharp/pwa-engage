import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { rowId, text, type Row } from "@/lib/row";

const digitos = (s: string) => s.replace(/\D/g, "");

/** Situação problemática do parceiro: inativo no sistema ou Receita diferente de ATIVA. */
export function problemaParceiro(p: Row | undefined): string | null {
  if (!p) return null;
  const sit = text(p["situacao_cadastral"]).toUpperCase();
  if (sit && sit !== "ATIVA") return `situação ${sit} na Receita Federal`;
  if (p["status"] === false) return "cadastro inativo no sistema";
  return null;
}

export function ParceiroSituacaoAlerta({ parceiro, papel }: { parceiro: Row | undefined; papel: string }) {
  const qc = useQueryClient();
  const [consultando, setConsultando] = useState(false);
  const [atualizado, setAtualizado] = useState<string | null>(null);
  const problema = problemaParceiro(parceiro);
  if (!parceiro || (!problema && !atualizado)) return null;
  const doc = digitos(text(parceiro["documento"] ?? parceiro["cnpj_cpf"]));
  const sit = text(parceiro["situacao_cadastral"]).toUpperCase();
  const grave = /BAIXADA|INAPTA|NULA/.test(sit);
  const motivo = text(parceiro["motivo_situacao_cadastral"]);

  const consultar = async () => {
    if (doc.length !== 14) return void toast.error("Só é possível consultar a Receita para CNPJ.");
    setConsultando(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`);
      if (!res.ok) return void toast.error("Não foi possível consultar a Receita Federal agora.");
      const d = await res.json();
      const nova = String(d.descricao_situacao_cadastral ?? "").toUpperCase();
      const novoMotivo = String(d.descricao_motivo_situacao_cadastral ?? "");
      if (nova === sit && novoMotivo === motivo) return void toast.info(`A situação na Receita continua ${nova || "sem informação"}.`);
      const { error } = await supabase.from("parceiros")
        .update({ situacao_cadastral: nova || null, motivo_situacao_cadastral: novoMotivo || null } as never)
        .eq("id", text(rowId(parceiro)));
      if (error) return void toast.error(error.message);
      await qc.invalidateQueries({ queryKey: ["table", "parceiros"] });
      setAtualizado(nova);
      if (nova === "ATIVA") toast.success("Situação atualizada para ATIVA no cadastro.");
      else toast.warning(`Situação atualizada no cadastro: ${nova}.`);
    } finally { setConsultando(false); }
  };

  if (!problema && atualizado) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm sm:col-span-2">
        <CheckCircle2 className="h-4 w-4 text-success" />Situação na Receita atualizada para {atualizado}.
      </div>
    );
  }
  return (
    <div className={`flex flex-wrap items-start gap-3 rounded-lg border p-3 text-sm sm:col-span-2 ${grave ? "border-destructive/40 bg-destructive/10" : "border-warning/40 bg-warning/10"}`}>
      <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${grave ? "text-destructive" : "text-warning"}`} />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Atenção: {papel} com {problema}.</p>
        {motivo && !/sem motivo/i.test(motivo) && <p className="text-muted-foreground">Motivo: {motivo}</p>}
      </div>
      {doc.length === 14 && (
        <Button type="button" size="sm" variant="outline" disabled={consultando} onClick={() => void consultar()}>
          {consultando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}Consultar Receita
        </Button>
      )}
    </div>
  );
}
