import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { canalSugerido, rotuloCanal, type CanalEmail, type FinalidadeEmail } from "@/lib/email-canais";

export function useCanaisEmail(empresaId: string | null | undefined) {
  return useQuery({
    queryKey: ["email-canais", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas_email_canais" as never).select("*").eq("empresa_id", empresaId!);
      if (error) return [] as CanalEmail[]; // script ainda não rodado: usa o e-mail geral
      return ((data ?? []) as CanalEmail[]).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
  });
}

/** "Disparar de qual e-mail?" — some quando a empresa tem um canal só (ou nenhum). */
export function SeletorCanalEmail({ empresaId, finalidade, value, onChange }: {
  empresaId: string | null | undefined; finalidade: FinalidadeEmail; value: string; onChange: (id: string) => void;
}) {
  const { data: canais = [] } = useCanaisEmail(empresaId);
  const ativos = canais.filter((c) => c.ativo);
  useEffect(() => {
    if (!value && ativos.length) onChange(canalSugerido(ativos, finalidade)?.id ?? "");
  }, [value, ativos, finalidade, onChange]);
  if (ativos.length < 2) return null;
  return (
    <div className="space-y-1">
      <Label>Disparar de qual e-mail?</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Escolha o e-mail de envio" /></SelectTrigger>
        <SelectContent>
          {ativos.map((c) => <SelectItem key={c.id} value={c.id}>{rotuloCanal(c)}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
